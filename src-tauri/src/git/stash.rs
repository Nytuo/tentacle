use crate::git::GitState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StashEntry {
    pub index: usize,
    pub message: String,
    pub oid: String,
}

#[tauri::command]
pub fn get_stashes(state: State<'_, GitState>) -> Result<Vec<StashEntry>, String> {
    let mut repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_mut().ok_or("No repository open")?;

    let mut stashes = Vec::new();
    repo.stash_foreach(|index, message, oid| {
        stashes.push(StashEntry {
            index,
            message: message.to_string(),
            oid: oid.to_string(),
        });
        true
    })
    .map_err(|e| e.message().to_string())?;

    Ok(stashes)
}

#[tauri::command]
pub fn create_stash(
    message: Option<String>,
    include_untracked: bool,
    state: State<'_, GitState>,
) -> Result<String, String> {
    let mut repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_mut().ok_or("No repository open")?;

    let sig = repo.signature().map_err(|e| e.message().to_string())?;
    let msg = message.as_deref();
    let mut flags = git2::StashFlags::DEFAULT;
    if include_untracked {
        flags |= git2::StashFlags::INCLUDE_UNTRACKED;
    }

    let oid = repo
        .stash_save(&sig, msg.unwrap_or("WIP"), Some(flags))
        .map_err(|e| e.message().to_string())?;

    Ok(oid.to_string())
}

#[tauri::command]
pub fn apply_stash(index: usize, drop: bool, state: State<'_, GitState>) -> Result<(), String> {
    let mut repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_mut().ok_or("No repository open")?;

    repo.stash_apply(index, None)
        .map_err(|e| e.message().to_string())?;

    if drop {
        repo.stash_drop(index)
            .map_err(|e| e.message().to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn drop_stash(index: usize, state: State<'_, GitState>) -> Result<(), String> {
    let mut repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_mut().ok_or("No repository open")?;

    repo.stash_drop(index).map_err(|e| e.message().to_string())
}
