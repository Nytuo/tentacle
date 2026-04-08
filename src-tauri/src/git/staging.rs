use crate::git::GitState;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StatusEntry {
    pub path: String,
    pub status: String,
    pub is_staged: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StatusResult {
    pub entries: Vec<StatusEntry>,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub untracked_count: usize,
    pub conflicted_count: usize,
}

fn status_to_string(status: git2::Status) -> String {
    if status.is_conflicted() {
        "conflicted".to_string()
    } else if status.is_index_new() {
        "added".to_string()
    } else if status.is_index_modified() {
        "modified".to_string()
    } else if status.is_index_deleted() {
        "deleted".to_string()
    } else if status.is_index_renamed() {
        "renamed".to_string()
    } else if status.is_wt_new() {
        "untracked".to_string()
    } else if status.is_wt_modified() {
        "modified".to_string()
    } else if status.is_wt_deleted() {
        "deleted".to_string()
    } else if status.is_wt_renamed() {
        "renamed".to_string()
    } else {
        "unknown".to_string()
    }
}

#[tauri::command]
pub fn get_status(state: State<'_, GitState>) -> Result<StatusResult, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_unmodified(false);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    let mut entries = Vec::new();
    let mut staged_count = 0;
    let mut unstaged_count = 0;
    let mut untracked_count = 0;
    let mut conflicted_count = 0;

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        if status.is_conflicted() {
            conflicted_count += 1;
            entries.push(StatusEntry {
                path,
                status: "conflicted".to_string(),
                is_staged: false,
            });
            continue;
        }

        
        if status.intersects(
            git2::Status::INDEX_NEW
                | git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_DELETED
                | git2::Status::INDEX_RENAMED
                | git2::Status::INDEX_TYPECHANGE,
        ) {
            staged_count += 1;
            entries.push(StatusEntry {
                path: path.clone(),
                status: status_to_string(status),
                is_staged: true,
            });
        }

        
        if status.intersects(
            git2::Status::WT_MODIFIED
                | git2::Status::WT_DELETED
                | git2::Status::WT_RENAMED
                | git2::Status::WT_TYPECHANGE,
        ) {
            unstaged_count += 1;
            entries.push(StatusEntry {
                path: path.clone(),
                status: status_to_string(status),
                is_staged: false,
            });
        }

        
        if status.is_wt_new() {
            untracked_count += 1;
            entries.push(StatusEntry {
                path,
                status: "untracked".to_string(),
                is_staged: false,
            });
        }
    }

    Ok(StatusResult {
        entries,
        staged_count,
        unstaged_count,
        untracked_count,
        conflicted_count,
    })
}

#[tauri::command]
pub fn stage_file(file_path: String, state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;

    let repo_path = repo.workdir().ok_or("No working directory")?;
    let full_path = repo_path.join(&file_path);

    if full_path.exists() {
        index
            .add_path(Path::new(&file_path))
            .map_err(|e| e.message().to_string())?;
    } else {
        index
            .remove_path(Path::new(&file_path))
            .map_err(|e| e.message().to_string())?;
    }

    index.write().map_err(|e| e.message().to_string())
}

#[tauri::command]
pub fn unstage_file(file_path: String, state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let head = repo.head().map_err(|e| e.message().to_string())?;
    let head_commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;
    let head_tree = head_commit.tree().map_err(|e| e.message().to_string())?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;

    if let Ok(entry) = head_tree.get_path(Path::new(&file_path)) {
        
        let obj = entry.to_object(repo).map_err(|e| e.message().to_string())?;
        let blob = obj.as_blob().ok_or("Not a blob")?;
        index
            .add_frombuffer(
                &git2::IndexEntry {
                    ctime: git2::IndexTime::new(0, 0),
                    mtime: git2::IndexTime::new(0, 0),
                    dev: 0,
                    ino: 0,
                    mode: entry.filemode() as u32,
                    uid: 0,
                    gid: 0,
                    file_size: blob.content().len() as u32,
                    id: entry.id(),
                    flags: 0,
                    flags_extended: 0,
                    path: file_path.as_bytes().to_vec(),
                },
                blob.content(),
            )
            .map_err(|e| e.message().to_string())?;
    } else {
        
        index
            .remove_path(Path::new(&file_path))
            .map_err(|e| e.message().to_string())?;
    }

    index.write().map_err(|e| e.message().to_string())
}

#[tauri::command]
pub fn stage_all(state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| e.message().to_string())?;
    index.write().map_err(|e| e.message().to_string())
}

#[tauri::command]
pub fn unstage_all(state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    if let Ok(head) = repo.head() {
        let obj = head
            .peel(git2::ObjectType::Commit)
            .map_err(|e| e.message().to_string())?;
        repo.reset(&obj, git2::ResetType::Mixed, None)
            .map_err(|e| e.message().to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn discard_file(file_path: String, state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.path(&file_path).force();

    repo.checkout_head(Some(&mut checkout))
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
pub fn discard_all(state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.force();

    repo.checkout_head(Some(&mut checkout))
        .map_err(|e| e.message().to_string())
}
