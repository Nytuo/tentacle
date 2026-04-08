use crate::git::GitState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RebaseProgress {
    pub current: usize,
    pub total: usize,
    pub current_commit: Option<String>,
}



#[tauri::command]
pub fn rebase_onto(onto_branch: String, state: State<'_, GitState>) -> Result<String, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let onto_ref = repo
        .revparse_single(&onto_branch)
        .map_err(|e| e.message().to_string())?;
    let onto_annotated = repo
        .find_annotated_commit(onto_ref.id())
        .map_err(|e| e.message().to_string())?;

    let mut rebase = repo
        .rebase(None, None, Some(&onto_annotated), None)
        .map_err(|e| e.message().to_string())?;

    let sig = repo.signature().map_err(|e| e.message().to_string())?;

    while rebase.next().is_some() {
        rebase
            .commit(None, &sig, None)
            .map_err(|e| e.message().to_string())?;
    }

    rebase
        .finish(Some(&sig))
        .map_err(|e| e.message().to_string())?;

    Ok("Rebase completed successfully".to_string())
}

#[tauri::command]
pub fn abort_rebase(state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let mut rebase = repo
        .open_rebase(None)
        .map_err(|e| e.message().to_string())?;
    rebase.abort().map_err(|e| e.message().to_string())
}

#[tauri::command]
pub fn continue_rebase(state: State<'_, GitState>) -> Result<String, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let sig = repo.signature().map_err(|e| e.message().to_string())?;
    let mut rebase = repo
        .open_rebase(None)
        .map_err(|e| e.message().to_string())?;

    rebase
        .commit(None, &sig, None)
        .map_err(|e| e.message().to_string())?;

    while rebase.next().is_some() {
        let index = repo.index().map_err(|e| e.message().to_string())?;
        if index.has_conflicts() {
            return Ok("Conflicts detected - resolve and continue".to_string());
        }
        rebase
            .commit(None, &sig, None)
            .map_err(|e| e.message().to_string())?;
    }

    rebase
        .finish(Some(&sig))
        .map_err(|e| e.message().to_string())?;
    Ok("Rebase completed".to_string())
}

#[tauri::command]
pub fn cherry_pick(oid: String, state: State<'_, GitState>) -> Result<String, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let oid = git2::Oid::from_str(&oid).map_err(|e| e.message().to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;

    repo.cherrypick(&commit, None)
        .map_err(|e| e.message().to_string())?;

    let index = repo.index().map_err(|e| e.message().to_string())?;
    if index.has_conflicts() {
        return Ok("Cherry-pick has conflicts - resolve them".to_string());
    }

    
    let sig = repo.signature().map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| e.message().to_string())?;
    let head = repo.head().map_err(|e| e.message().to_string())?;
    let parent = head.peel_to_commit().map_err(|e| e.message().to_string())?;

    let msg = commit.message().unwrap_or("Cherry-picked commit");
    repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &[&parent])
        .map_err(|e| e.message().to_string())?;

    repo.cleanup_state().map_err(|e| e.message().to_string())?;

    Ok("Cherry-pick successful".to_string())
}

#[tauri::command]
pub fn revert_commit(oid: String, state: State<'_, GitState>) -> Result<String, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let oid = git2::Oid::from_str(&oid).map_err(|e| e.message().to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;

    repo.revert(&commit, None)
        .map_err(|e| e.message().to_string())?;

    let index = repo.index().map_err(|e| e.message().to_string())?;
    if index.has_conflicts() {
        return Ok("Revert has conflicts - resolve them".to_string());
    }

    
    let sig = repo.signature().map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| e.message().to_string())?;
    let head = repo.head().map_err(|e| e.message().to_string())?;
    let parent = head.peel_to_commit().map_err(|e| e.message().to_string())?;

    let msg = format!("Revert \"{}\"", commit.summary().unwrap_or(""));
    repo.commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent])
        .map_err(|e| e.message().to_string())?;

    repo.cleanup_state().map_err(|e| e.message().to_string())?;

    Ok("Revert successful".to_string())
}

#[tauri::command]
pub fn reset_to_commit(
    oid: String,
    mode: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let oid = git2::Oid::from_str(&oid).map_err(|e| e.message().to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
    let obj = commit.as_object();

    let reset_type = match mode.as_str() {
        "soft" => git2::ResetType::Soft,
        "mixed" => git2::ResetType::Mixed,
        "hard" => git2::ResetType::Hard,
        _ => return Err("Invalid reset mode. Use 'soft', 'mixed', or 'hard'".to_string()),
    };

    repo.reset(obj, reset_type, None)
        .map_err(|e| e.message().to_string())
}


#[tauri::command]
pub fn fetch_remote(
    remote_name: Option<String>,
    state: State<'_, GitState>,
) -> Result<String, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let remote_name = remote_name.unwrap_or_else(|| "origin".to_string());
    let mut remote = repo
        .find_remote(&remote_name)
        .map_err(|e| e.message().to_string())?;

    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(|_url, username, _allowed| {
        git2::Cred::ssh_key_from_agent(username.unwrap_or("git"))
    });

    let mut fetch_opts = git2::FetchOptions::new();
    fetch_opts.remote_callbacks(callbacks);

    remote
        .fetch::<&str>(&[], Some(&mut fetch_opts), None)
        .map_err(|e| e.message().to_string())?;

    Ok(format!("Fetched from {}", remote_name))
}


#[tauri::command]
pub fn push_remote(
    remote_name: Option<String>,
    branch: Option<String>,
    state: State<'_, GitState>,
) -> Result<String, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let remote_name = remote_name.unwrap_or_else(|| "origin".to_string());
    let branch_name = branch.unwrap_or_else(|| {
        repo.head()
            .ok()
            .and_then(|h| h.shorthand().map(|s| s.to_string()))
            .unwrap_or_else(|| "main".to_string())
    });

    let mut remote = repo
        .find_remote(&remote_name)
        .map_err(|e| e.message().to_string())?;

    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(|_url, username, _allowed| {
        git2::Cred::ssh_key_from_agent(username.unwrap_or("git"))
    });

    let mut push_opts = git2::PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);
    remote
        .push(&[&refspec], Some(&mut push_opts))
        .map_err(|e| e.message().to_string())?;

    Ok(format!("Pushed {} to {}", branch_name, remote_name))
}


#[tauri::command]
pub fn pull_remote(
    remote_name: Option<String>,
    state: State<'_, GitState>,
) -> Result<String, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let remote_name_str = remote_name.unwrap_or_else(|| "origin".to_string());
    let mut remote = repo
        .find_remote(&remote_name_str)
        .map_err(|e| e.message().to_string())?;

    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(|_url, username, _allowed| {
        git2::Cred::ssh_key_from_agent(username.unwrap_or("git"))
    });

    let mut fetch_opts = git2::FetchOptions::new();
    fetch_opts.remote_callbacks(callbacks);

    let branch_name = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "main".to_string());

    remote
        .fetch(&[&branch_name], Some(&mut fetch_opts), None)
        .map_err(|e| e.message().to_string())?;

    
    let fetch_head = repo
        .find_reference("FETCH_HEAD")
        .map_err(|e| e.message().to_string())?;
    let fetch_commit_oid = fetch_head.target().ok_or("FETCH_HEAD has no target")?;
    let annotated = repo
        .find_annotated_commit(fetch_commit_oid)
        .map_err(|e| e.message().to_string())?;

    let (analysis, _) = repo
        .merge_analysis(&[&annotated])
        .map_err(|e| e.message().to_string())?;

    if analysis.is_up_to_date() {
        return Ok("Already up to date".to_string());
    }

    if analysis.is_fast_forward() {
        let mut reference = repo.head().map_err(|e| e.message().to_string())?;
        reference
            .set_target(fetch_commit_oid, "Pull: fast-forward")
            .map_err(|e| e.message().to_string())?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .map_err(|e| e.message().to_string())?;
        return Ok("Fast-forward pull".to_string());
    }

    repo.merge(&[&annotated], None, None)
        .map_err(|e| e.message().to_string())?;

    let index = repo.index().map_err(|e| e.message().to_string())?;
    if index.has_conflicts() {
        return Ok("Pull has conflicts - resolve and commit".to_string());
    }

    
    let sig = repo.signature().map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| e.message().to_string())?;
    let head_commit = repo
        .head()
        .map_err(|e| e.message().to_string())?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;
    let fetch_commit = repo
        .find_commit(fetch_commit_oid)
        .map_err(|e| e.message().to_string())?;

    let msg = format!(
        "Merge remote-tracking branch '{}/{}'",
        remote_name_str, branch_name
    );
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &msg,
        &tree,
        &[&head_commit, &fetch_commit],
    )
    .map_err(|e| e.message().to_string())?;

    repo.cleanup_state().map_err(|e| e.message().to_string())?;
    Ok("Pull completed with merge".to_string())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
    pub push_url: Option<String>,
}

#[tauri::command]
pub fn get_remotes(state: State<'_, GitState>) -> Result<Vec<RemoteInfo>, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let remote_names = repo.remotes().map_err(|e| e.message().to_string())?;
    let mut remotes = Vec::new();

    for name in remote_names.iter().flatten() {
        if let Ok(remote) = repo.find_remote(name) {
            remotes.push(RemoteInfo {
                name: name.to_string(),
                url: remote.url().unwrap_or("").to_string(),
                push_url: remote.pushurl().map(|s| s.to_string()),
            });
        }
    }

    Ok(remotes)
}

#[tauri::command]
pub fn add_remote(name: String, url: String, state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    repo.remote(&name, &url)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_remote(name: String, state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    repo.remote_delete(&name)
        .map_err(|e| e.message().to_string())
}
