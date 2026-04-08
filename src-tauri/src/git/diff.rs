use crate::git::GitState;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffFile {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub status: String,
    pub hunks: Vec<DiffHunk>,
    pub binary: bool,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffHunk {
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffLine {
    pub origin: String,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

fn delta_status(status: git2::Delta) -> String {
    match status {
        git2::Delta::Added => "added".to_string(),
        git2::Delta::Deleted => "deleted".to_string(),
        git2::Delta::Modified => "modified".to_string(),
        git2::Delta::Renamed => "renamed".to_string(),
        git2::Delta::Copied => "copied".to_string(),
        git2::Delta::Typechange => "typechange".to_string(),
        _ => "unknown".to_string(),
    }
}

fn parse_diff(diff: &git2::Diff) -> Vec<DiffFile> {
    let mut files: Vec<DiffFile> = Vec::new();

    for (delta_idx, delta) in diff.deltas().enumerate() {
        let old_path = delta
            .old_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());
        let new_path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());
        let binary = delta.old_file().is_binary() || delta.new_file().is_binary();
        let status = delta_status(delta.status());

        let mut hunks = Vec::new();
        let mut additions = 0usize;
        let mut deletions = 0usize;

        if !binary {
            if let Ok(patch) = git2::Patch::from_diff(diff, delta_idx) {
                if let Some(patch) = patch {
                    for hunk_idx in 0..patch.num_hunks() {
                        if let Ok((hunk, _)) = patch.hunk(hunk_idx) {
                            let mut lines = Vec::new();
                            for line_idx in 0..patch.num_lines_in_hunk(hunk_idx).unwrap_or(0) {
                                if let Ok(line) = patch.line_in_hunk(hunk_idx, line_idx) {
                                    let origin = match line.origin() {
                                        '+' => {
                                            additions += 1;
                                            "+".to_string()
                                        }
                                        '-' => {
                                            deletions += 1;
                                            "-".to_string()
                                        }
                                        ' ' => " ".to_string(),
                                        _ => " ".to_string(),
                                    };
                                    lines.push(DiffLine {
                                        origin,
                                        content: String::from_utf8_lossy(line.content())
                                            .to_string(),
                                        old_lineno: line.old_lineno(),
                                        new_lineno: line.new_lineno(),
                                    });
                                }
                            }
                            hunks.push(DiffHunk {
                                header: String::from_utf8_lossy(hunk.header()).to_string(),
                                old_start: hunk.old_start(),
                                old_lines: hunk.old_lines(),
                                new_start: hunk.new_start(),
                                new_lines: hunk.new_lines(),
                                lines,
                            });
                        }
                    }
                }
            }
        }

        files.push(DiffFile {
            old_path,
            new_path,
            status,
            hunks,
            binary,
            additions,
            deletions,
        });
    }

    files
}

#[tauri::command]
pub fn get_working_diff(state: State<'_, GitState>) -> Result<Vec<DiffFile>, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let diff = repo
        .diff_index_to_workdir(None, None)
        .map_err(|e| e.message().to_string())?;
    Ok(parse_diff(&diff))
}

#[tauri::command]
pub fn get_staged_diff(state: State<'_, GitState>) -> Result<Vec<DiffFile>, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());

    let diff = repo
        .diff_tree_to_index(head_tree.as_ref(), None, None)
        .map_err(|e| e.message().to_string())?;
    Ok(parse_diff(&diff))
}

#[tauri::command]
pub fn get_commit_diff(oid: String, state: State<'_, GitState>) -> Result<Vec<DiffFile>, String> {
    if oid == "WIP" {
        let repo_lock = state.repo.lock().unwrap();
        let repo = repo_lock.as_ref().ok_or("No repository open")?;
        
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        let mut opts = git2::DiffOptions::new();
        opts.include_untracked(true);
        let diff = repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts))
            .map_err(|e| e.message().to_string())?;
            
        return Ok(parse_diff(&diff));
    }

    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let oid = git2::Oid::from_str(&oid).map_err(|e| e.message().to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
    let tree = commit.tree().map_err(|e| e.message().to_string())?;

    
    let parent_tree = if commit.parent_count() > 0 {
        commit.parent(0).ok().and_then(|p| p.tree().ok())
    } else {
        None
    };

    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(|e| e.message().to_string())?;
    Ok(parse_diff(&diff))
}

#[tauri::command]
pub fn get_conflict_files(state: State<'_, GitState>) -> Result<Vec<String>, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let index = repo.index().map_err(|e| e.message().to_string())?;
    let mut conflicts = Vec::new();

    if let Ok(conflict_iter) = index.conflicts() {
        for conflict in conflict_iter.flatten() {
            if let Some(our) = &conflict.our {
                conflicts.push(String::from_utf8_lossy(&our.path).to_string());
            } else if let Some(their) = &conflict.their {
                conflicts.push(String::from_utf8_lossy(&their.path).to_string());
            }
        }
    }

    Ok(conflicts)
}



#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConflictFileData {
    pub path: String,
    
    pub base_content: Option<String>,
    
    pub current_content: Option<String>,
    
    pub incoming_content: Option<String>,
    
    pub is_binary: bool,
}

fn blob_to_string(repo: &git2::Repository, oid: git2::Oid) -> Option<String> {
    let blob = repo.find_blob(oid).ok()?;
    if blob.is_binary() {
        return None;
    }
    Some(String::from_utf8_lossy(blob.content()).to_string())
}


#[tauri::command]
pub fn get_conflict_diff(state: State<'_, GitState>) -> Result<Vec<ConflictFileData>, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let index = repo.index().map_err(|e| e.message().to_string())?;
    let mut result = Vec::new();

    if let Ok(conflict_iter) = index.conflicts() {
        for conflict in conflict_iter.flatten() {
            let path = conflict
                .our
                .as_ref()
                .or(conflict.their.as_ref())
                .or(conflict.ancestor.as_ref())
                .map(|e| String::from_utf8_lossy(&e.path).to_string())
                .unwrap_or_default();

            let base_content = conflict
                .ancestor
                .as_ref()
                .and_then(|e| blob_to_string(repo, e.id));
            let current_content = conflict
                .our
                .as_ref()
                .and_then(|e| blob_to_string(repo, e.id));
            let incoming_content = conflict
                .their
                .as_ref()
                .and_then(|e| blob_to_string(repo, e.id));

            let is_binary = conflict
                .our
                .as_ref()
                .and_then(|e| repo.find_blob(e.id).ok())
                .map(|b| b.is_binary())
                .unwrap_or(false)
                || conflict
                    .their
                    .as_ref()
                    .and_then(|e| repo.find_blob(e.id).ok())
                    .map(|b| b.is_binary())
                    .unwrap_or(false);

            result.push(ConflictFileData {
                path,
                base_content,
                current_content,
                incoming_content,
                is_binary,
            });
        }
    }

    Ok(result)
}


#[tauri::command]
pub fn resolve_conflict_file(
    file_path: String,
    resolved_content: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let workdir = repo
        .workdir()
        .ok_or("Bare repository — no working directory")?;
    let full_path = workdir.join(&file_path);

    
    std::fs::write(&full_path, resolved_content.as_bytes())
        .map_err(|e| format!("Failed to write resolved file: {}", e))?;

    
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    index
        .add_path(Path::new(&file_path))
        .map_err(|e| e.message().to_string())?;
    index.write().map_err(|e| e.message().to_string())?;

    Ok(())
}


#[tauri::command]
pub fn resolve_conflict_with_side(
    file_path: String,
    side: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let index = repo.index().map_err(|e| e.message().to_string())?;
    let mut chosen_content: Option<String> = None;

    if let Ok(conflict_iter) = index.conflicts() {
        for conflict in conflict_iter.flatten() {
            let cpath = conflict
                .our
                .as_ref()
                .or(conflict.their.as_ref())
                .or(conflict.ancestor.as_ref())
                .map(|e| String::from_utf8_lossy(&e.path).to_string())
                .unwrap_or_default();

            if cpath == file_path {
                let entry = match side.as_str() {
                    "current" => conflict.our.as_ref(),
                    "incoming" => conflict.their.as_ref(),
                    "base" => conflict.ancestor.as_ref(),
                    _ => {
                        return Err("Invalid side. Use 'current', 'incoming', or 'base'".to_string())
                    }
                };
                chosen_content = entry.and_then(|e| blob_to_string(repo, e.id));
                break;
            }
        }
    }

    let content = chosen_content.ok_or(format!(
        "Could not read '{}' side for '{}'",
        side, file_path
    ))?;

    
    drop(index);
    drop(repo_lock);

    
    resolve_conflict_file(file_path, content, state)
}
