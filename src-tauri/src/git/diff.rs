use crate::git::{git_err, with_repo, with_repo_async, GitState};
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
            if let Ok(Some(patch)) = git2::Patch::from_diff(diff, delta_idx) {
                {
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

fn default_opts() -> git2::DiffOptions {
    let mut opts = git2::DiffOptions::new();
    opts.context_lines(3).indent_heuristic(true);
    opts
}

fn find_renames(diff: &mut git2::Diff) {
    let mut find = git2::DiffFindOptions::new();
    find.renames(true).copies(true);
    let _ = diff.find_similar(Some(&mut find));
}

#[tauri::command]
pub async fn get_working_diff(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<DiffFile>, String> {
    with_repo_async(&state, &repo_path, |repo| {
        let mut opts = default_opts();

        opts.include_untracked(true).recurse_untracked_dirs(true);
        let mut diff = repo
            .diff_index_to_workdir(None, Some(&mut opts))
            .map_err(git_err)?;
        find_renames(&mut diff);
        Ok(parse_diff(&diff))
    })
    .await
}

#[tauri::command]
pub async fn get_staged_diff(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<DiffFile>, String> {
    with_repo_async(&state, &repo_path, |repo| {
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        let mut opts = default_opts();
        let mut diff = repo
            .diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
            .map_err(git_err)?;
        find_renames(&mut diff);
        Ok(parse_diff(&diff))
    })
    .await
}

#[tauri::command]
pub async fn get_commit_diff(
    repo_path: String,
    oid: String,
    state: State<'_, GitState>,
) -> Result<Vec<DiffFile>, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        if oid == "WIP" {
            let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
            let mut opts = default_opts();
            opts.include_untracked(true).recurse_untracked_dirs(true);
            let mut diff = repo
                .diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts))
                .map_err(git_err)?;
            find_renames(&mut diff);
            return Ok(parse_diff(&diff));
        }

        let commit = repo
            .revparse_single(&oid)
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?;
        let tree = commit.tree().map_err(git_err)?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

        let mut opts = default_opts();
        let mut diff = repo
            .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
            .map_err(git_err)?;
        find_renames(&mut diff);
        Ok(parse_diff(&diff))
    })
    .await
}

#[tauri::command]
pub async fn get_range_diff(
    repo_path: String,
    from: String,
    to: String,
    state: State<'_, GitState>,
) -> Result<Vec<DiffFile>, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let from_tree = repo
            .revparse_single(&from)
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?
            .tree()
            .map_err(git_err)?;
        let to_tree = repo
            .revparse_single(&to)
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?
            .tree()
            .map_err(git_err)?;

        let mut opts = default_opts();
        let mut diff = repo
            .diff_tree_to_tree(Some(&from_tree), Some(&to_tree), Some(&mut opts))
            .map_err(git_err)?;
        find_renames(&mut diff);
        Ok(parse_diff(&diff))
    })
    .await
}

#[tauri::command]
pub fn get_conflict_files(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<String>, String> {
    with_repo(&state, &repo_path, |repo| {
        let index = repo.index().map_err(git_err)?;
        let mut conflicts = Vec::new();
        if let Ok(iter) = index.conflicts() {
            for conflict in iter.flatten() {
                if let Some(entry) = conflict.our.as_ref().or(conflict.their.as_ref()) {
                    conflicts.push(String::from_utf8_lossy(&entry.path).to_string());
                }
            }
        }
        Ok(conflicts)
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConflictFileData {
    pub path: String,
    pub base_content: Option<String>,
    pub current_content: Option<String>,
    pub incoming_content: Option<String>,
    pub is_binary: bool,

    pub merged_content: Option<String>,
}

fn blob_to_string(repo: &git2::Repository, oid: git2::Oid) -> Option<String> {
    let blob = repo.find_blob(oid).ok()?;
    if blob.is_binary() {
        return None;
    }
    Some(String::from_utf8_lossy(blob.content()).to_string())
}

#[tauri::command]
pub fn get_conflict_diff(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<ConflictFileData>, String> {
    with_repo(&state, &repo_path, |repo| {
        let index = repo.index().map_err(git_err)?;
        let workdir = repo.workdir();
        let mut result = Vec::new();

        if let Ok(iter) = index.conflicts() {
            for conflict in iter.flatten() {
                let path = conflict
                    .our
                    .as_ref()
                    .or(conflict.their.as_ref())
                    .or(conflict.ancestor.as_ref())
                    .map(|e| String::from_utf8_lossy(&e.path).to_string())
                    .unwrap_or_default();

                let is_binary = [conflict.our.as_ref(), conflict.their.as_ref()]
                    .into_iter()
                    .flatten()
                    .any(|e| repo.find_blob(e.id).map(|b| b.is_binary()).unwrap_or(false));

                result.push(ConflictFileData {
                    base_content: conflict
                        .ancestor
                        .as_ref()
                        .and_then(|e| blob_to_string(repo, e.id)),
                    current_content: conflict
                        .our
                        .as_ref()
                        .and_then(|e| blob_to_string(repo, e.id)),
                    incoming_content: conflict
                        .their
                        .as_ref()
                        .and_then(|e| blob_to_string(repo, e.id)),
                    merged_content: workdir
                        .map(|w| w.join(&path))
                        .and_then(|p| std::fs::read_to_string(p).ok()),
                    path,
                    is_binary,
                });
            }
        }
        Ok(result)
    })
}

fn write_resolution(repo: &git2::Repository, file_path: &str, content: &str) -> Result<(), String> {
    let workdir = repo
        .workdir()
        .ok_or("Bare repository has no working tree")?;
    std::fs::write(workdir.join(file_path), content.as_bytes())
        .map_err(|e| format!("Cannot write {file_path}: {e}"))?;

    let mut index = repo.index().map_err(git_err)?;

    index.add_path(Path::new(file_path)).map_err(git_err)?;
    index.write().map_err(git_err)
}

#[tauri::command]
pub fn resolve_conflict_file(
    repo_path: String,
    file_path: String,
    resolved_content: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        write_resolution(repo, &file_path, &resolved_content)
    })
}

#[tauri::command]
pub fn resolve_conflict_with_side(
    repo_path: String,
    file_path: String,
    side: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let index = repo.index().map_err(git_err)?;
        let mut chosen: Option<String> = None;

        if let Ok(iter) = index.conflicts() {
            for conflict in iter.flatten() {
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
                            return Err(
                                "Invalid side. Use 'current', 'incoming', or 'base'".to_string()
                            )
                        }
                    };
                    chosen = entry.and_then(|e| blob_to_string(repo, e.id));
                    break;
                }
            }
        }

        let content =
            chosen.ok_or_else(|| format!("Could not read the '{side}' side of '{file_path}'"))?;
        drop(index);
        write_resolution(repo, &file_path, &content)
    })
}

#[tauri::command]
pub fn resolve_conflict_hunks(
    repo_path: String,
    file_path: String,
    choices: Vec<String>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let workdir = repo
            .workdir()
            .ok_or("Bare repository has no working tree")?;
        let merged = std::fs::read_to_string(workdir.join(&file_path))
            .map_err(|e| format!("Cannot read {file_path}: {e}"))?;
        let resolved = apply_conflict_choices(&merged, &choices)?;
        write_resolution(repo, &file_path, &resolved)
    })
}

fn apply_conflict_choices(merged: &str, choices: &[String]) -> Result<String, String> {
    let mut out = String::with_capacity(merged.len());
    let mut region = 0usize;
    let mut lines = merged.lines().peekable();

    while let Some(line) = lines.next() {
        if !line.starts_with("<<<<<<<") {
            out.push_str(line);
            out.push('\n');
            continue;
        }

        enum Section {
            Ours,
            Base,
            Theirs,
        }
        let mut ours = Vec::new();
        let mut theirs = Vec::new();
        let mut section = Section::Ours;
        let mut closed = false;

        for line in lines.by_ref() {
            if line.starts_with(">>>>>>>") {
                closed = true;
                break;
            } else if line.starts_with("=======") {
                section = Section::Theirs;
            } else if line.starts_with("|||||||") {
                section = Section::Base;
            } else {
                match section {
                    Section::Ours => ours.push(line),
                    Section::Theirs => theirs.push(line),
                    Section::Base => {}
                }
            }
        }

        if !closed {
            return Err("Unterminated conflict marker in file".to_string());
        }

        let choice = choices.get(region).map(|s| s.as_str()).unwrap_or("current");
        region += 1;

        let picked: Vec<&str> = match choice {
            "incoming" => theirs,
            "both" => ours.into_iter().chain(theirs).collect(),
            _ => ours,
        };
        for line in picked {
            out.push_str(line);
            out.push('\n');
        }
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::apply_conflict_choices;

    const MERGED: &str = "top\n<<<<<<< HEAD\nmine\n=======\nyours\n>>>>>>> other\nbottom\n";

    fn choose(choice: &str) -> String {
        apply_conflict_choices(MERGED, &[choice.to_string()]).unwrap()
    }

    #[test]
    fn keeps_the_chosen_side_and_drops_the_markers() {
        assert_eq!(choose("current"), "top\nmine\nbottom\n");
        assert_eq!(choose("incoming"), "top\nyours\nbottom\n");
        assert_eq!(choose("both"), "top\nmine\nyours\nbottom\n");
    }

    #[test]
    fn each_region_is_chosen_independently() {
        let two =
            "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\nmid\n<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> x\n";
        let out = apply_conflict_choices(two, &["current".into(), "incoming".into()]).unwrap();
        assert_eq!(out, "a\nmid\nd\n");
    }

    #[test]
    fn a_diff3_base_section_is_discarded() {
        let d3 = "<<<<<<< HEAD\nmine\n||||||| base\norig\n=======\nyours\n>>>>>>> x\n";
        assert_eq!(
            apply_conflict_choices(d3, &["current".into()]).unwrap(),
            "mine\n"
        );
    }

    #[test]
    fn an_unterminated_marker_is_an_error_not_a_silent_truncation() {
        assert!(apply_conflict_choices("<<<<<<< HEAD\nmine\n", &["current".into()]).is_err());
    }
}
