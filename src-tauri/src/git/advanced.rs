use crate::git::credentials;
use crate::git::{git_err, with_repo, with_repo_async, with_repo_mut_async, GitState};
use git2::{Repository, RepositoryState};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpResult {
    pub status: String,
    pub message: String,
    #[serde(default)]
    pub conflicted_files: Vec<String>,
}

impl OpResult {
    pub(crate) fn ok(message: impl Into<String>) -> Self {
        Self {
            status: "ok".into(),
            message: message.into(),
            conflicted_files: vec![],
        }
    }
    pub(crate) fn of(status: &str, message: impl Into<String>) -> Self {
        Self {
            status: status.into(),
            message: message.into(),
            conflicted_files: vec![],
        }
    }
    pub(crate) fn conflicts(message: impl Into<String>, files: Vec<String>) -> Self {
        Self {
            status: "conflicts".into(),
            message: message.into(),
            conflicted_files: files,
        }
    }
}

fn conflicted_paths(repo: &Repository) -> Vec<String> {
    let Ok(index) = repo.index() else {
        return vec![];
    };
    let Ok(conflicts) = index.conflicts() else {
        return vec![];
    };
    conflicts
        .flatten()
        .filter_map(|c| {
            c.our
                .or(c.their)
                .or(c.ancestor)
                .and_then(|e| String::from_utf8(e.path).ok())
        })
        .collect()
}

fn signature(repo: &Repository) -> Result<git2::Signature<'static>, String> {
    repo.signature().map_err(|_| {
        "No commit identity configured. Set user.name and user.email in your Git config."
            .to_string()
    })
}

#[tauri::command]
pub async fn rebase_onto(
    repo_path: String,
    onto_branch: String,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_mut_async(&state, &repo_path, move |repo| {
        let onto = repo.revparse_single(&onto_branch).map_err(git_err)?;
        let onto = repo.find_annotated_commit(onto.id()).map_err(git_err)?;
        let sig = signature(repo)?;

        let mut rebase = repo
            .rebase(None, None, Some(&onto), None)
            .map_err(git_err)?;
        drive_rebase(repo, &mut rebase, &sig)
    })
    .await
}

fn drive_rebase(
    repo: &Repository,
    rebase: &mut git2::Rebase<'_>,
    sig: &git2::Signature<'_>,
) -> Result<OpResult, String> {
    while let Some(op) = rebase.next() {
        op.map_err(git_err)?;

        let index = repo.index().map_err(git_err)?;
        if index.has_conflicts() {
            return Ok(OpResult::conflicts(
                "Rebase stopped on conflicts. Resolve them, then continue or abort.",
                conflicted_paths(repo),
            ));
        }

        match rebase.commit(None, sig, None) {
            Ok(_) => {}

            Err(e) if e.code() == git2::ErrorCode::Applied => continue,
            Err(e) => return Err(git_err(e)),
        }
    }

    rebase.finish(Some(sig)).map_err(git_err)?;
    Ok(OpResult::ok("Rebase completed"))
}

#[tauri::command]
pub async fn continue_rebase(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_mut_async(&state, &repo_path, move |repo| {
        let sig = signature(repo)?;
        let mut rebase = repo
            .open_rebase(None)
            .map_err(|_| "No rebase in progress".to_string())?;

        let index = repo.index().map_err(git_err)?;
        if index.has_conflicts() {
            return Ok(OpResult::conflicts(
                "There are still unresolved conflicts.",
                conflicted_paths(repo),
            ));
        }
        match rebase.commit(None, &sig, None) {
            Ok(_) => {}
            Err(e) if e.code() == git2::ErrorCode::Applied => {}

            Err(e) if e.code() == git2::ErrorCode::UnbornBranch => {}
            Err(e) => return Err(git_err(e)),
        }

        drive_rebase(repo, &mut rebase, &sig)
    })
    .await
}

#[tauri::command]
pub async fn abort_rebase(repo_path: String, state: State<'_, GitState>) -> Result<(), String> {
    with_repo_mut_async(&state, &repo_path, |repo| {
        let mut rebase = repo
            .open_rebase(None)
            .map_err(|_| "No rebase in progress".to_string())?;
        rebase.abort().map_err(git_err)
    })
    .await
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RebaseStep {
    pub oid: String,

    pub action: String,

    #[serde(default)]
    pub message: Option<String>,
}

#[tauri::command]
pub async fn rebase_interactive(
    repo_path: String,
    onto: String,
    steps: Vec<RebaseStep>,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let sig = signature(repo)?;
        let onto_commit = repo
            .revparse_single(&onto)
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?;

        let original_head = repo.head().map_err(git_err)?;
        let branch_ref = original_head
            .name()
            .ok_or("Cannot rebase a detached HEAD interactively")?
            .to_string();

        let mut head = onto_commit;

        let mut pending: Vec<String> = Vec::new();

        for step in &steps {
            if step.action == "drop" {
                continue;
            }
            let commit = repo
                .revparse_single(&step.oid)
                .map_err(git_err)?
                .peel_to_commit()
                .map_err(git_err)?;

            let opts = git2::MergeOptions::new();
            let mut index = repo
                .cherrypick_commit(&commit, &head, 0, Some(&opts))
                .map_err(git_err)?;

            if index.has_conflicts() {
                let files = index
                    .conflicts()
                    .map(|c| {
                        c.flatten()
                            .filter_map(|c| {
                                c.our
                                    .or(c.their)
                                    .or(c.ancestor)
                                    .and_then(|e| String::from_utf8(e.path).ok())
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                return Ok(OpResult::conflicts(
                    format!(
                        "Cannot replay {} cleanly — it conflicts with the commits before it. \
                         Nothing was changed. Resolve the overlap first, for example by \
                         rebasing onto the base without reordering.",
                        &step.oid[..7.min(step.oid.len())]
                    ),
                    files,
                ));
            }

            let tree_oid = index.write_tree_to(repo).map_err(git_err)?;
            let tree = repo.find_tree(tree_oid).map_err(git_err)?;
            let original = commit.message().unwrap_or("").to_string();

            match step.action.as_str() {
                "squash" | "fixup" => {
                    let mut message = head.message().unwrap_or("").to_string();
                    if step.action == "squash" {
                        message = match &step.message {
                            Some(m) => m.clone(),
                            None => format!("{}\n\n{}", message.trim_end(), original.trim()),
                        };
                    }
                    let parent = head.parent(0).ok();
                    let parents: Vec<&git2::Commit> = parent.iter().collect();
                    let oid = repo
                        .commit(None, &commit.author(), &sig, &message, &tree, &parents)
                        .map_err(git_err)?;
                    head = repo.find_commit(oid).map_err(git_err)?;
                }
                action => {
                    let mut message = match (action, &step.message) {
                        ("reword", Some(m)) => m.clone(),
                        _ => original,
                    };
                    if !pending.is_empty() {
                        message = format!("{}\n\n{}", message.trim_end(), pending.join("\n\n"));
                        pending.clear();
                    }
                    let oid = repo
                        .commit(None, &commit.author(), &sig, &message, &tree, &[&head])
                        .map_err(git_err)?;
                    head = repo.find_commit(oid).map_err(git_err)?;
                }
            }
        }

        repo.reference(&branch_ref, head.id(), true, "interactive rebase")
            .map_err(git_err)?;
        repo.set_head(&branch_ref).map_err(git_err)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .map_err(git_err)?;

        Ok(OpResult::ok(format!(
            "Rebased {} commits onto {}",
            steps.iter().filter(|s| s.action != "drop").count(),
            onto
        )))
    })
    .await
}

#[tauri::command]
pub async fn cherry_pick(
    repo_path: String,
    oid: String,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let oid = git2::Oid::from_str(&oid).map_err(git_err)?;
        let commit = repo.find_commit(oid).map_err(git_err)?;

        repo.cherrypick(&commit, None).map_err(git_err)?;

        let index = repo.index().map_err(git_err)?;
        if index.has_conflicts() {
            return Ok(OpResult::conflicts(
                "Cherry-pick has conflicts — resolve them, then commit.",
                conflicted_paths(repo),
            ));
        }

        let sig = signature(repo)?;
        let mut index = repo.index().map_err(git_err)?;
        let tree = repo
            .find_tree(index.write_tree().map_err(git_err)?)
            .map_err(git_err)?;
        let parent = repo
            .head()
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?;
        let msg = commit.message().unwrap_or("Cherry-picked commit");

        repo.commit(Some("HEAD"), &commit.author(), &sig, msg, &tree, &[&parent])
            .map_err(git_err)?;
        repo.cleanup_state().map_err(git_err)?;
        Ok(OpResult::ok("Cherry-pick applied"))
    })
    .await
}

#[tauri::command]
pub async fn revert_commit(
    repo_path: String,
    oid: String,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let oid = git2::Oid::from_str(&oid).map_err(git_err)?;
        let commit = repo.find_commit(oid).map_err(git_err)?;

        repo.revert(&commit, None).map_err(git_err)?;

        let index = repo.index().map_err(git_err)?;
        if index.has_conflicts() {
            return Ok(OpResult::conflicts(
                "Revert has conflicts — resolve them, then commit.",
                conflicted_paths(repo),
            ));
        }

        let sig = signature(repo)?;
        let mut index = repo.index().map_err(git_err)?;
        let tree = repo
            .find_tree(index.write_tree().map_err(git_err)?)
            .map_err(git_err)?;
        let parent = repo
            .head()
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?;
        let msg = format!(
            "Revert \"{}\"\n\nThis reverts commit {}.\n",
            commit.summary().unwrap_or(""),
            commit.id()
        );

        repo.commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent])
            .map_err(git_err)?;
        repo.cleanup_state().map_err(git_err)?;
        Ok(OpResult::ok("Revert committed"))
    })
    .await
}

#[tauri::command]
pub fn reset_to_commit(
    repo_path: String,
    oid: String,
    mode: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let oid = git2::Oid::from_str(&oid).map_err(git_err)?;
        let commit = repo.find_commit(oid).map_err(git_err)?;

        let reset_type = match mode.as_str() {
            "soft" => git2::ResetType::Soft,
            "mixed" => git2::ResetType::Mixed,
            "hard" => git2::ResetType::Hard,
            _ => return Err("Invalid reset mode. Use 'soft', 'mixed', or 'hard'".to_string()),
        };

        repo.reset(commit.as_object(), reset_type, None)
            .map_err(git_err)
    })
}

#[tauri::command]
pub async fn abort_operation(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_mut_async(&state, &repo_path, |repo| {
        match repo.state() {
            RepositoryState::Clean => return Ok(OpResult::ok("Nothing to abort")),
            RepositoryState::Rebase
            | RepositoryState::RebaseInteractive
            | RepositoryState::RebaseMerge => {
                let mut rebase = repo.open_rebase(None).map_err(git_err)?;
                rebase.abort().map_err(git_err)?;
                return Ok(OpResult::ok("Rebase aborted"));
            }
            _ => {}
        }

        let head = repo
            .head()
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?;
        repo.reset(head.as_object(), git2::ResetType::Hard, None)
            .map_err(git_err)?;
        repo.cleanup_state().map_err(git_err)?;
        Ok(OpResult::ok("Operation aborted"))
    })
    .await
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
    pub push_url: Option<String>,
}

fn network_callbacks(app: &tauri::AppHandle, url: &str) -> git2::RemoteCallbacks<'static> {
    let mut cb = credentials::callbacks_for(url);
    let emitter = app.clone();
    credentials::with_progress(&mut cb, move |p| {
        let _ = emitter.emit("git://progress", p);
    });
    cb
}

#[tauri::command]
pub async fn fetch_remote(
    repo_path: String,
    remote_name: Option<String>,
    prune: Option<bool>,
    app: tauri::AppHandle,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let name = remote_name.unwrap_or_else(|| "origin".to_string());
        let mut remote = repo.find_remote(&name).map_err(git_err)?;
        let url = remote.url().unwrap_or_default().to_string();

        let mut opts = git2::FetchOptions::new();
        opts.remote_callbacks(network_callbacks(&app, &url));
        opts.download_tags(git2::AutotagOption::All);
        if prune.unwrap_or(true) {
            opts.prune(git2::FetchPrune::On);
        }

        remote
            .fetch::<&str>(&[], Some(&mut opts), None)
            .map_err(git_err)?;

        Ok(OpResult::ok(format!("Fetched from {name}")))
    })
    .await
}

#[tauri::command]
pub async fn fetch_all(
    repo_path: String,
    app: tauri::AppHandle,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let names: Vec<String> = repo
            .remotes()
            .map_err(git_err)?
            .iter()
            .flatten()
            .map(|s| s.to_string())
            .collect();

        for name in &names {
            let mut remote = repo.find_remote(name).map_err(git_err)?;
            let url = remote.url().unwrap_or_default().to_string();
            let mut opts = git2::FetchOptions::new();
            opts.remote_callbacks(network_callbacks(&app, &url));
            opts.download_tags(git2::AutotagOption::All);
            opts.prune(git2::FetchPrune::On);
            remote
                .fetch::<&str>(&[], Some(&mut opts), None)
                .map_err(git_err)?;
        }

        Ok(OpResult::ok(format!("Fetched {} remote(s)", names.len())))
    })
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn push_remote(
    repo_path: String,
    remote_name: Option<String>,
    branch: Option<String>,
    force: Option<bool>,
    set_upstream: Option<bool>,
    push_tags: Option<bool>,
    app: tauri::AppHandle,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let remote_name = remote_name.unwrap_or_else(|| "origin".to_string());
        let branch_name = match branch {
            Some(b) => b,
            None => repo
                .head()
                .ok()
                .filter(|h| h.is_branch())
                .and_then(|h| h.shorthand().map(String::from))
                .ok_or("HEAD is detached — check out a branch before pushing")?,
        };

        let mut remote = repo.find_remote(&remote_name).map_err(git_err)?;
        let url = remote
            .pushurl()
            .or_else(|| remote.url())
            .unwrap_or_default()
            .to_string();

        let lead = if force.unwrap_or(false) { "+" } else { "" };
        let mut refspecs = vec![format!(
            "{lead}refs/heads/{branch_name}:refs/heads/{branch_name}"
        )];
        if push_tags.unwrap_or(false) {
            refspecs.push("refs/tags/*:refs/tags/*".to_string());
        }

        let mut opts = git2::PushOptions::new();
        opts.remote_callbacks(network_callbacks(&app, &url));

        let specs: Vec<&str> = refspecs.iter().map(|s| s.as_str()).collect();
        remote.push(&specs, Some(&mut opts)).map_err(git_err)?;

        if set_upstream.unwrap_or(false) {
            let mut local = repo
                .find_branch(&branch_name, git2::BranchType::Local)
                .map_err(git_err)?;
            local
                .set_upstream(Some(&format!("{remote_name}/{branch_name}")))
                .map_err(git_err)?;
        }

        Ok(OpResult::ok(format!(
            "Pushed {branch_name} to {remote_name}"
        )))
    })
    .await
}

#[tauri::command]
pub async fn delete_remote_branch(
    repo_path: String,
    remote_name: String,
    branch: String,
    app: tauri::AppHandle,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let mut remote = repo.find_remote(&remote_name).map_err(git_err)?;
        let url = remote
            .pushurl()
            .or_else(|| remote.url())
            .unwrap_or_default()
            .to_string();

        let mut opts = git2::PushOptions::new();
        opts.remote_callbacks(network_callbacks(&app, &url));
        let refspec = format!(":refs/heads/{branch}");
        remote
            .push(&[refspec.as_str()], Some(&mut opts))
            .map_err(git_err)?;

        Ok(OpResult::ok(format!("Deleted {remote_name}/{branch}")))
    })
    .await
}

#[tauri::command]
pub async fn push_tag(
    repo_path: String,
    remote_name: Option<String>,
    tag: String,
    app: tauri::AppHandle,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let remote_name = remote_name.unwrap_or_else(|| "origin".to_string());
        let mut remote = repo.find_remote(&remote_name).map_err(git_err)?;
        let url = remote
            .pushurl()
            .or_else(|| remote.url())
            .unwrap_or_default()
            .to_string();

        let mut opts = git2::PushOptions::new();
        opts.remote_callbacks(network_callbacks(&app, &url));
        let refspec = format!("refs/tags/{tag}:refs/tags/{tag}");
        remote
            .push(&[refspec.as_str()], Some(&mut opts))
            .map_err(git_err)?;

        Ok(OpResult::ok(format!("Pushed tag {tag}")))
    })
    .await
}

#[tauri::command]
pub async fn pull_remote(
    repo_path: String,
    remote_name: Option<String>,
    rebase: Option<bool>,
    app: tauri::AppHandle,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_mut_async(&state, &repo_path, move |repo| {
        let head = repo.head().map_err(git_err)?;
        if !head.is_branch() {
            return Err("HEAD is detached — check out a branch before pulling".to_string());
        }
        let branch_name = head
            .shorthand()
            .ok_or("Cannot determine current branch")?
            .to_string();

        let local = repo
            .find_branch(&branch_name, git2::BranchType::Local)
            .map_err(git_err)?;

        let upstream = local.upstream().ok();
        let (remote_name, upstream_ref) = match &upstream {
            Some(up) => {
                let full = up
                    .get()
                    .name()
                    .ok_or("Upstream reference has no name")?
                    .to_string();
                let remote = repo
                    .branch_remote_name(&full)
                    .map_err(|_| format!("No remote configured for {branch_name}"))?
                    .as_str()
                    .unwrap_or("origin")
                    .to_string();
                (remote, full)
            }
            None => {
                let remote = remote_name.clone().unwrap_or_else(|| "origin".to_string());
                (
                    remote.clone(),
                    format!("refs/remotes/{remote}/{branch_name}"),
                )
            }
        };

        {
            let mut remote = repo.find_remote(&remote_name).map_err(git_err)?;
            let url = remote.url().unwrap_or_default().to_string();
            let mut opts = git2::FetchOptions::new();
            opts.remote_callbacks(network_callbacks(&app, &url));
            opts.download_tags(git2::AutotagOption::All);
            remote
                .fetch::<&str>(&[], Some(&mut opts), None)
                .map_err(git_err)?;
        }

        let upstream_oid = repo
            .find_reference(&upstream_ref)
            .map_err(|_| format!("{upstream_ref} does not exist — has the branch been pushed?"))?
            .target()
            .ok_or("Upstream reference has no target")?;

        let annotated = repo.find_annotated_commit(upstream_oid).map_err(git_err)?;
        let (analysis, _) = repo.merge_analysis(&[&annotated]).map_err(git_err)?;

        if analysis.is_up_to_date() {
            return Ok(OpResult::of("up-to-date", "Already up to date"));
        }

        if analysis.is_fast_forward() {
            let mut reference = repo
                .find_reference(&format!("refs/heads/{branch_name}"))
                .map_err(git_err)?;
            reference
                .set_target(upstream_oid, "pull: fast-forward")
                .map_err(git_err)?;
            repo.set_head(&format!("refs/heads/{branch_name}"))
                .map_err(git_err)?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
                .map_err(git_err)?;
            return Ok(OpResult::of("fast-forward", "Fast-forwarded to upstream"));
        }

        if rebase.unwrap_or(false) {
            let sig = signature(repo)?;
            let mut rb = repo
                .rebase(None, None, Some(&annotated), None)
                .map_err(git_err)?;
            return drive_rebase(repo, &mut rb, &sig);
        }

        repo.merge(&[&annotated], None, None).map_err(git_err)?;

        let index = repo.index().map_err(git_err)?;
        if index.has_conflicts() {
            return Ok(OpResult::conflicts(
                "Pull produced conflicts — resolve them, then commit the merge.",
                conflicted_paths(repo),
            ));
        }

        let sig = signature(repo)?;
        let mut index = repo.index().map_err(git_err)?;
        let tree = repo
            .find_tree(index.write_tree().map_err(git_err)?)
            .map_err(git_err)?;
        let head_commit = repo
            .head()
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?;
        let upstream_commit = repo.find_commit(upstream_oid).map_err(git_err)?;

        let msg = format!("Merge branch '{branch_name}' of {remote_name}");
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &msg,
            &tree,
            &[&head_commit, &upstream_commit],
        )
        .map_err(git_err)?;
        repo.cleanup_state().map_err(git_err)?;

        Ok(OpResult::of("merged", "Pulled and merged"))
    })
    .await
}

#[tauri::command]
pub fn get_remotes(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<RemoteInfo>, String> {
    with_repo(&state, &repo_path, |repo| {
        let names = repo.remotes().map_err(git_err)?;
        let mut remotes = Vec::new();
        for name in names.iter().flatten() {
            if let Ok(remote) = repo.find_remote(name) {
                remotes.push(RemoteInfo {
                    name: name.to_string(),
                    url: remote.url().unwrap_or("").to_string(),
                    push_url: remote.pushurl().map(|s| s.to_string()),
                });
            }
        }
        Ok(remotes)
    })
}

#[tauri::command]
pub fn add_remote(
    repo_path: String,
    name: String,
    url: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        repo.remote(&name, &url).map_err(git_err)?;
        Ok(())
    })
}

#[tauri::command]
pub fn remove_remote(
    repo_path: String,
    name: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        repo.remote_delete(&name).map_err(git_err)
    })
}

#[tauri::command]
pub fn rename_remote(
    repo_path: String,
    old_name: String,
    new_name: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        repo.remote_rename(&old_name, &new_name).map_err(git_err)?;
        Ok(())
    })
}

#[tauri::command]
pub fn set_remote_url(
    repo_path: String,
    name: String,
    url: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        repo.remote_set_url(&name, &url).map_err(git_err)
    })
}
