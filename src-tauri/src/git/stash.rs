use crate::git::{git_err, with_repo_mut, GitState};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StashEntry {
    pub index: usize,
    pub message: String,
    pub oid: String,

    pub time: Option<i64>,
}

#[tauri::command]
pub fn get_stashes(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<StashEntry>, String> {
    with_repo_mut(&state, &repo_path, |repo| {
        let mut raw = Vec::new();
        repo.stash_foreach(|index, message, oid| {
            raw.push((index, message.to_string(), *oid));
            true
        })
        .map_err(git_err)?;

        Ok(raw
            .into_iter()
            .map(|(index, message, oid)| StashEntry {
                index,
                message,
                time: repo.find_commit(oid).ok().map(|c| c.time().seconds()),
                oid: oid.to_string(),
            })
            .collect())
    })
}

#[tauri::command]
pub fn create_stash(
    repo_path: String,
    message: Option<String>,
    include_untracked: bool,
    keep_index: Option<bool>,
    state: State<'_, GitState>,
) -> Result<String, String> {
    with_repo_mut(&state, &repo_path, |repo| {
        let sig = repo.signature().map_err(|_| {
            "Stashing needs user.name and user.email in your Git config.".to_string()
        })?;

        let mut flags = git2::StashFlags::DEFAULT;
        if include_untracked {
            flags |= git2::StashFlags::INCLUDE_UNTRACKED;
        }
        if keep_index.unwrap_or(false) {
            flags |= git2::StashFlags::KEEP_INDEX;
        }

        let msg = message.unwrap_or_else(|| "WIP".to_string());
        let oid = repo
            .stash_save(&sig, &msg, Some(flags))
            .map_err(|e| match e.code() {
                git2::ErrorCode::NotFound => "There is nothing to stash".to_string(),
                _ => git_err(e),
            })?;
        Ok(oid.to_string())
    })
}

#[tauri::command]
pub fn apply_stash(
    repo_path: String,
    index: usize,
    drop: bool,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo_mut(&state, &repo_path, |repo| {
        repo.stash_apply(index, None).map_err(git_err)?;

        if drop {
            repo.stash_drop(index).map_err(git_err)?;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn drop_stash(
    repo_path: String,
    index: usize,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo_mut(&state, &repo_path, |repo| {
        repo.stash_drop(index).map_err(git_err)
    })
}

#[tauri::command]
pub fn stash_to_branch(
    repo_path: String,
    index: usize,
    branch: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo_mut(&state, &repo_path, |repo| {
        let mut oid = None;
        repo.stash_foreach(|i, _, o| {
            if i == index {
                oid = Some(*o);
            }
            true
        })
        .map_err(git_err)?;
        let oid = oid.ok_or("No such stash")?;

        let base_oid = {
            let stash_commit = repo.find_commit(oid).map_err(git_err)?;
            stash_commit.parent_id(0).map_err(git_err)?
        };
        {
            let base = repo.find_commit(base_oid).map_err(git_err)?;
            repo.branch(&branch, &base, false).map_err(git_err)?;
        }

        let refname = format!("refs/heads/{branch}");
        {
            let obj = repo.revparse_single(&refname).map_err(git_err)?;
            repo.checkout_tree(&obj, None).map_err(git_err)?;
        }
        repo.set_head(&refname).map_err(git_err)?;

        repo.stash_apply(index, None).map_err(git_err)?;
        repo.stash_drop(index).map_err(git_err)
    })
}
