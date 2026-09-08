use crate::git::{git_err, with_repo, GitState};
use git2::Repository;
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
        "conflicted"
    } else if status.is_index_new() {
        "added"
    } else if status.is_index_modified() {
        "modified"
    } else if status.is_index_deleted() {
        "deleted"
    } else if status.is_index_renamed() {
        "renamed"
    } else if status.is_wt_new() {
        "untracked"
    } else if status.is_wt_modified() {
        "modified"
    } else if status.is_wt_deleted() {
        "deleted"
    } else if status.is_wt_renamed() {
        "renamed"
    } else {
        "unknown"
    }
    .to_string()
}

pub fn status_of(repo: &Repository) -> Result<StatusResult, String> {
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_unmodified(false);

    let statuses = repo.statuses(Some(&mut opts)).map_err(git_err)?;

    let mut entries = Vec::new();
    let (mut staged, mut unstaged, mut untracked, mut conflicted) = (0, 0, 0, 0);

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        if status.is_conflicted() {
            conflicted += 1;
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
            staged += 1;
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
            unstaged += 1;
            entries.push(StatusEntry {
                path: path.clone(),
                status: status_to_string(status),
                is_staged: false,
            });
        }

        if status.is_wt_new() {
            untracked += 1;
            entries.push(StatusEntry {
                path,
                status: "untracked".to_string(),
                is_staged: false,
            });
        }
    }

    Ok(StatusResult {
        entries,
        staged_count: staged,
        unstaged_count: unstaged,
        untracked_count: untracked,
        conflicted_count: conflicted,
    })
}

#[tauri::command]
pub async fn get_status(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<StatusResult, String> {
    crate::git::with_repo_async(&state, &repo_path, status_of).await
}

pub fn stage_path(repo: &Repository, file_path: &str) -> Result<(), String> {
    let mut index = repo.index().map_err(git_err)?;
    let workdir = repo
        .workdir()
        .ok_or("Bare repository has no working tree")?;

    if workdir.join(file_path).exists() {
        index.add_path(Path::new(file_path)).map_err(git_err)?;
    } else {
        index.remove_path(Path::new(file_path)).map_err(git_err)?;
    }
    index.write().map_err(git_err)
}

#[tauri::command]
pub fn stage_file(
    repo_path: String,
    file_path: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| stage_path(repo, &file_path))
}

#[tauri::command]
pub fn stage_files(
    repo_path: String,
    file_paths: Vec<String>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let mut index = repo.index().map_err(git_err)?;
        let workdir = repo
            .workdir()
            .ok_or("Bare repository has no working tree")?;
        for file_path in &file_paths {
            if workdir.join(file_path).exists() {
                index.add_path(Path::new(file_path)).map_err(git_err)?;
            } else {
                index.remove_path(Path::new(file_path)).map_err(git_err)?;
            }
        }
        index.write().map_err(git_err)
    })
}

pub fn unstage_path(repo: &Repository, file_path: &str) -> Result<(), String> {
    let Ok(head) = repo.head() else {
        let mut index = repo.index().map_err(git_err)?;
        index.remove_path(Path::new(file_path)).map_err(git_err)?;
        return index.write().map_err(git_err);
    };

    let head_commit = head.peel_to_commit().map_err(git_err)?;

    repo.reset_default(Some(head_commit.as_object()), [file_path])
        .map_err(git_err)
}

#[tauri::command]
pub fn unstage_file(
    repo_path: String,
    file_path: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| unstage_path(repo, &file_path))
}

#[tauri::command]
pub fn unstage_files(
    repo_path: String,
    file_paths: Vec<String>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let Ok(head) = repo.head() else {
            let mut index = repo.index().map_err(git_err)?;
            for p in &file_paths {
                index.remove_path(Path::new(p)).map_err(git_err)?;
            }
            return index.write().map_err(git_err);
        };
        let head_commit = head.peel_to_commit().map_err(git_err)?;
        repo.reset_default(Some(head_commit.as_object()), file_paths.iter())
            .map_err(git_err)
    })
}

#[tauri::command]
pub async fn stage_all(repo_path: String, state: State<'_, GitState>) -> Result<(), String> {
    crate::git::with_repo_async(&state, &repo_path, |repo| {
        let mut index = repo.index().map_err(git_err)?;
        index
            .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .map_err(git_err)?;

        index.update_all(["*"].iter(), None).map_err(git_err)?;
        index.write().map_err(git_err)
    })
    .await
}

#[tauri::command]
pub fn unstage_all(repo_path: String, state: State<'_, GitState>) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let Ok(head) = repo.head() else {
            let mut index = repo.index().map_err(git_err)?;
            index.clear().map_err(git_err)?;
            return index.write().map_err(git_err);
        };
        let obj = head.peel(git2::ObjectType::Commit).map_err(git_err)?;
        repo.reset(&obj, git2::ResetType::Mixed, None)
            .map_err(git_err)
    })
}

#[tauri::command]
pub fn discard_file(
    repo_path: String,
    file_path: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let workdir = repo
            .workdir()
            .ok_or("Bare repository has no working tree")?;

        let untracked = repo
            .status_file(Path::new(&file_path))
            .map(|s| s.is_wt_new())
            .unwrap_or(false);
        if untracked {
            let full = workdir.join(&file_path);
            return std::fs::remove_file(&full)
                .map_err(|e| format!("Cannot delete {file_path}: {e}"));
        }

        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.path(&file_path).force().remove_untracked(false);
        repo.checkout_head(Some(&mut checkout)).map_err(git_err)
    })
}

#[tauri::command]
pub fn discard_all(
    repo_path: String,
    include_untracked: bool,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.force();
        if include_untracked {
            checkout.remove_untracked(true);
        }
        repo.checkout_head(Some(&mut checkout)).map_err(git_err)
    })
}
