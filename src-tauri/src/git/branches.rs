use crate::git::GitState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub ahead: Option<usize>,
    pub behind: Option<usize>,
    pub target_oid: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MergeStatus {
    
    pub source_branch: String,
    
    pub target_branch: String,
    
    pub status: String,
    
    pub ahead: usize,
    
    pub behind: usize,
}

#[tauri::command]
pub fn get_branches(state: State<'_, GitState>) -> Result<Vec<BranchInfo>, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let mut branches = Vec::new();

    let head_name = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    for branch_result in repo.branches(None).map_err(|e| e.message().to_string())? {
        let (branch, branch_type) = branch_result.map_err(|e| e.message().to_string())?;
        let name = branch
            .name()
            .map_err(|e| e.message().to_string())?
            .unwrap_or("")
            .to_string();
        let is_remote = branch_type == git2::BranchType::Remote;
        let is_head = head_name.as_deref() == Some(&name);

        let upstream = branch
            .upstream()
            .ok()
            .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()));

        let target_oid = branch.get().target().map(|o| o.to_string());

        let (ahead, behind) = if let (Some(local_oid), Ok(upstream_branch)) =
            (branch.get().target(), branch.upstream())
        {
            if let Some(remote_oid) = upstream_branch.get().target() {
                repo.graph_ahead_behind(local_oid, remote_oid)
                    .ok()
                    .map(|(a, b)| (Some(a), Some(b)))
                    .unwrap_or((None, None))
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        branches.push(BranchInfo {
            name,
            is_head,
            is_remote,
            upstream,
            ahead,
            behind,
            target_oid,
        });
    }

    
    branches.sort_by(|a, b| {
        if a.is_head != b.is_head {
            return if a.is_head {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }
        if a.is_remote != b.is_remote {
            return if a.is_remote {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Less
            };
        }
        a.name.cmp(&b.name)
    });

    Ok(branches)
}

#[tauri::command]
pub fn create_branch(
    name: String,
    start_point: Option<String>,
    state: State<'_, GitState>,
) -> Result<BranchInfo, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let commit = if let Some(ref sp) = start_point {
        let obj = repo
            .revparse_single(sp)
            .map_err(|e| e.message().to_string())?;
        obj.peel_to_commit().map_err(|e| e.message().to_string())?
    } else {
        let head = repo.head().map_err(|e| e.message().to_string())?;
        head.peel_to_commit().map_err(|e| e.message().to_string())?
    };

    let branch = repo
        .branch(&name, &commit, false)
        .map_err(|e| e.message().to_string())?;
    let target_oid = branch.get().target().map(|o| o.to_string());

    Ok(BranchInfo {
        name,
        is_head: false,
        is_remote: false,
        upstream: None,
        ahead: None,
        behind: None,
        target_oid,
    })
}

#[tauri::command]
pub fn delete_branch(name: String, state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let mut branch = repo
        .find_branch(&name, git2::BranchType::Local)
        .map_err(|e| e.message().to_string())?;
    branch.delete().map_err(|e| e.message().to_string())
}

#[tauri::command]
pub fn rename_branch(
    old_name: String,
    new_name: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let mut branch = repo
        .find_branch(&old_name, git2::BranchType::Local)
        .map_err(|e| e.message().to_string())?;
    branch
        .rename(&new_name, false)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub fn checkout_branch(name: String, state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let obj = repo
        .revparse_single(&format!("refs/heads/{}", name))
        .map_err(|e| e.message().to_string())?;
    repo.checkout_tree(&obj, None)
        .map_err(|e| e.message().to_string())?;
    repo.set_head(&format!("refs/heads/{}", name))
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub fn checkout_commit(oid: String, state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let oid = git2::Oid::from_str(&oid).map_err(|e| e.message().to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
    let obj = commit.as_object();
    repo.checkout_tree(obj, None)
        .map_err(|e| e.message().to_string())?;
    repo.set_head_detached(oid)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub fn merge_branch(branch_name: String, state: State<'_, GitState>) -> Result<String, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let annotated = repo
        .find_branch(&branch_name, git2::BranchType::Local)
        .map_err(|e| e.message().to_string())?;
    let reference = annotated.get();
    let commit_oid = reference.target().ok_or("Branch has no target")?;
    let annotated_commit = repo
        .find_annotated_commit(commit_oid)
        .map_err(|e| e.message().to_string())?;

    let (analysis, _) = repo
        .merge_analysis(&[&annotated_commit])
        .map_err(|e| e.message().to_string())?;

    if analysis.is_up_to_date() {
        return Ok("Already up to date".to_string());
    }

    if analysis.is_fast_forward() {
        let mut reference = repo.head().map_err(|e| e.message().to_string())?;
        reference
            .set_target(commit_oid, "Fast-forward merge")
            .map_err(|e| e.message().to_string())?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .map_err(|e| e.message().to_string())?;
        return Ok("Fast-forward".to_string());
    }

    
    repo.merge(&[&annotated_commit], None, None)
        .map_err(|e| e.message().to_string())?;

    
    let index = repo.index().map_err(|e| e.message().to_string())?;
    if index.has_conflicts() {
        return Ok("Conflicts detected - resolve them and commit".to_string());
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
    let merge_commit = repo
        .find_commit(commit_oid)
        .map_err(|e| e.message().to_string())?;

    let message = format!("Merge branch '{}'", branch_name);
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &message,
        &tree,
        &[&head_commit, &merge_commit],
    )
    .map_err(|e| e.message().to_string())?;

    repo.cleanup_state().map_err(|e| e.message().to_string())?;

    Ok("Merged successfully".to_string())
}





#[tauri::command]
pub fn check_merge_status(
    target_branch: String,
    state: State<'_, GitState>,
) -> Result<MergeStatus, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let head = repo.head().map_err(|e| e.message().to_string())?;
    let source_branch = head.shorthand().unwrap_or("HEAD").to_string();

    
    let target_branch = if target_branch.is_empty() {
        let from_remote = repo
            .find_reference("refs/remotes/origin/HEAD")
            .ok()
            .and_then(|r| r.resolve().ok())
            .and_then(|r| {
                r.shorthand()
                    .map(|s| s.trim_start_matches("origin/").to_string())
            });
        if let Some(b) = from_remote {
            b
        } else if repo.find_branch("main", git2::BranchType::Local).is_ok() {
            "main".to_string()
        } else if repo.find_branch("master", git2::BranchType::Local).is_ok() {
            "master".to_string()
        } else {
            return Err("Could not determine default branch".to_string());
        }
    } else {
        target_branch
    };

    
    if source_branch == target_branch {
        return Ok(MergeStatus {
            source_branch,
            target_branch,
            status: "up_to_date".to_string(),
            ahead: 0,
            behind: 0,
        });
    }

    
    let target_obj = repo
        .revparse_single(&format!("refs/heads/{}", target_branch))
        .or_else(|_| repo.revparse_single(&target_branch))
        .map_err(|e| {
            format!(
                "Target branch '{}' not found: {}",
                target_branch,
                e.message()
            )
        })?;
    let target_commit = target_obj
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;
    let target_oid = target_commit.id();

    
    let head_commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;
    let head_oid = head_commit.id();

    
    let (ahead, behind) = repo
        .graph_ahead_behind(head_oid, target_oid)
        .unwrap_or((0, 0));

    
    let target_annotated = repo
        .find_annotated_commit(target_oid)
        .map_err(|e| e.message().to_string())?;
    let (analysis, _) = repo
        .merge_analysis(&[&target_annotated])
        .map_err(|e| e.message().to_string())?;

    if analysis.is_up_to_date() {
        return Ok(MergeStatus {
            source_branch,
            target_branch,
            status: "up_to_date".to_string(),
            ahead,
            behind,
        });
    }

    if analysis.is_fast_forward() {
        return Ok(MergeStatus {
            source_branch,
            target_branch,
            status: "fast_forward".to_string(),
            ahead,
            behind,
        });
    }

    
    let source_tree = head_commit.tree().map_err(|e| e.message().to_string())?;
    let target_tree = target_commit.tree().map_err(|e| e.message().to_string())?;

    let base_oid = repo
        .merge_base(head_oid, target_oid)
        .map_err(|e| e.message().to_string())?;
    let base_commit = repo
        .find_commit(base_oid)
        .map_err(|e| e.message().to_string())?;
    let base_tree = base_commit.tree().map_err(|e| e.message().to_string())?;

    let index = repo
        .merge_trees(&base_tree, &source_tree, &target_tree, None)
        .map_err(|e| e.message().to_string())?;

    let status = if index.has_conflicts() {
        "conflicts".to_string()
    } else {
        "ok".to_string()
    };

    Ok(MergeStatus {
        source_branch,
        target_branch,
        status,
        ahead,
        behind,
    })
}
