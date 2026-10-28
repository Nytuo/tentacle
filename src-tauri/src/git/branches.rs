use crate::git::advanced::OpResult;
use crate::git::{git_err, with_repo, with_repo_async, GitState};
use git2::{BranchType, Repository};
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

    pub tip_summary: Option<String>,
    pub tip_time: Option<i64>,
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
pub async fn get_branches(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<BranchInfo>, String> {
    with_repo_async(&state, &repo_path, |repo| {
        let mut branches = Vec::new();
        let head_name = repo
            .head()
            .ok()
            .filter(|h| h.is_branch())
            .and_then(|h| h.shorthand().map(|s| s.to_string()));

        for branch_result in repo.branches(None).map_err(git_err)? {
            let (branch, branch_type) = branch_result.map_err(git_err)?;
            let name = branch.name().map_err(git_err)?.unwrap_or("").to_string();
            let is_remote = branch_type == BranchType::Remote;

            let upstream = branch
                .upstream()
                .ok()
                .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()));

            let target_oid = branch.get().target();
            let (tip_summary, tip_time) = match target_oid.and_then(|o| repo.find_commit(o).ok()) {
                Some(c) => (
                    c.summary().map(|s| s.to_string()),
                    Some(c.author().when().seconds()),
                ),
                None => (None, None),
            };

            let (ahead, behind) = match (target_oid, branch.upstream().ok()) {
                (Some(local), Some(up)) => match up.get().target() {
                    Some(remote) => repo
                        .graph_ahead_behind(local, remote)
                        .map(|(a, b)| (Some(a), Some(b)))
                        .unwrap_or((None, None)),
                    None => (None, None),
                },
                _ => (None, None),
            };

            branches.push(BranchInfo {
                is_head: !is_remote && head_name.as_deref() == Some(&name),
                name,
                is_remote,
                upstream,
                ahead,
                behind,
                target_oid: target_oid.map(|o| o.to_string()),
                tip_summary,
                tip_time,
            });
        }

        branches.sort_by(|a, b| {
            b.is_head
                .cmp(&a.is_head)
                .then(a.is_remote.cmp(&b.is_remote))
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(branches)
    })
    .await
}

#[tauri::command]
pub fn create_branch(
    repo_path: String,
    name: String,
    start_point: Option<String>,
    checkout: Option<bool>,
    state: State<'_, GitState>,
) -> Result<BranchInfo, String> {
    with_repo(&state, &repo_path, |repo| {
        let commit = match &start_point {
            Some(sp) => repo
                .revparse_single(sp)
                .map_err(git_err)?
                .peel_to_commit()
                .map_err(git_err)?,
            None => repo
                .head()
                .map_err(git_err)?
                .peel_to_commit()
                .map_err(git_err)?,
        };

        let tip_summary = commit.summary().map(|s| s.to_string());
        let tip_time = Some(commit.author().when().seconds());

        let branch = repo.branch(&name, &commit, false).map_err(git_err)?;
        let target_oid = branch.get().target().map(|o| o.to_string());

        if checkout.unwrap_or(false) {
            checkout_ref(repo, &format!("refs/heads/{name}"))?;
        }

        Ok(BranchInfo {
            is_head: checkout.unwrap_or(false),
            name,
            is_remote: false,
            upstream: None,
            ahead: None,
            behind: None,
            target_oid,
            tip_summary,
            tip_time,
        })
    })
}

#[tauri::command]
pub fn delete_branch(
    repo_path: String,
    name: String,
    force: Option<bool>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let mut branch = repo
            .find_branch(&name, BranchType::Local)
            .map_err(git_err)?;

        if branch.is_head() {
            return Err(format!("Cannot delete {name}: it is the current branch"));
        }

        if !force.unwrap_or(false) {
            if let (Some(tip), Ok(head)) = (branch.get().target(), repo.head()) {
                if let Some(head_oid) = head.target() {
                    let merged =
                        repo.graph_descendant_of(head_oid, tip).unwrap_or(false) || tip == head_oid;
                    if !merged {
                        return Err(format!(
                            "{name} has commits that are not merged into the current branch. \
                             Delete it anyway to discard them."
                        ));
                    }
                }
            }
        }

        branch.delete().map_err(git_err)
    })
}

#[tauri::command]
pub fn rename_branch(
    repo_path: String,
    old_name: String,
    new_name: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let mut branch = repo
            .find_branch(&old_name, BranchType::Local)
            .map_err(git_err)?;
        branch.rename(&new_name, false).map_err(git_err)?;
        Ok(())
    })
}

fn checkout_ref(repo: &Repository, refname: &str) -> Result<(), String> {
    let obj = repo.revparse_single(refname).map_err(git_err)?;
    let mut opts = git2::build::CheckoutBuilder::new();

    opts.safe();
    repo.checkout_tree(&obj, Some(&mut opts)).map_err(|e| {
        format!(
            "Cannot switch: {}. Commit or stash your changes first.",
            e.message()
        )
    })?;
    repo.set_head(refname).map_err(git_err)
}

#[tauri::command]
pub async fn checkout_branch(
    repo_path: String,
    name: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo_async(&state, &repo_path, move |repo| {
        if let Some(short) = name.strip_prefix("origin/").or_else(|| {
            repo.find_branch(&name, BranchType::Remote)
                .ok()
                .and_then(|_| name.split_once('/').map(|(_, rest)| rest))
        }) {
            if repo.find_branch(&name, BranchType::Remote).is_ok()
                && repo.find_branch(short, BranchType::Local).is_err()
            {
                let remote = repo
                    .find_branch(&name, BranchType::Remote)
                    .map_err(git_err)?;
                let commit = remote.get().peel_to_commit().map_err(git_err)?;
                let mut local = repo.branch(short, &commit, false).map_err(git_err)?;
                local.set_upstream(Some(&name)).map_err(git_err)?;
                return checkout_ref(repo, &format!("refs/heads/{short}"));
            }
            if repo.find_branch(short, BranchType::Local).is_ok() {
                return checkout_ref(repo, &format!("refs/heads/{short}"));
            }
        }

        checkout_ref(repo, &format!("refs/heads/{name}"))
    })
    .await
}

#[tauri::command]
pub async fn checkout_commit(
    repo_path: String,
    oid: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let oid = git2::Oid::from_str(&oid).map_err(git_err)?;
        let commit = repo.find_commit(oid).map_err(git_err)?;
        let mut opts = git2::build::CheckoutBuilder::new();
        opts.safe();
        repo.checkout_tree(commit.as_object(), Some(&mut opts))
            .map_err(|e| {
                format!(
                    "Cannot check out {}: {}. Commit or stash your changes first.",
                    &oid.to_string()[..7],
                    e.message()
                )
            })?;
        repo.set_head_detached(oid).map_err(git_err)
    })
    .await
}

#[tauri::command]
pub fn set_upstream(
    repo_path: String,
    branch: String,
    upstream: Option<String>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let mut local = repo
            .find_branch(&branch, BranchType::Local)
            .map_err(git_err)?;
        local.set_upstream(upstream.as_deref()).map_err(git_err)
    })
}

#[tauri::command]
pub async fn merge_branch(
    repo_path: String,
    branch_name: String,
    no_ff: Option<bool>,
    state: State<'_, GitState>,
) -> Result<OpResult, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let target_oid = repo
            .revparse_single(&branch_name)
            .map_err(|e| format!("Cannot resolve '{branch_name}': {}", e.message()))?
            .peel_to_commit()
            .map_err(git_err)?
            .id();

        let annotated = repo.find_annotated_commit(target_oid).map_err(git_err)?;
        let (analysis, _) = repo.merge_analysis(&[&annotated]).map_err(git_err)?;

        if analysis.is_up_to_date() {
            return Ok(OpResult::of("up-to-date", "Already up to date"));
        }

        if analysis.is_fast_forward() && !no_ff.unwrap_or(false) {
            let head = repo.head().map_err(git_err)?;
            let refname = head.name().ok_or("HEAD has no name")?.to_string();
            let mut reference = repo.find_reference(&refname).map_err(git_err)?;
            reference
                .set_target(target_oid, "merge: fast-forward")
                .map_err(git_err)?;
            repo.set_head(&refname).map_err(git_err)?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
                .map_err(git_err)?;
            return Ok(OpResult::of("fast-forward", "Fast-forwarded"));
        }

        repo.merge(&[&annotated], None, None).map_err(git_err)?;

        let index = repo.index().map_err(git_err)?;
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
                "Merge has conflicts — resolve them, then commit.",
                files,
            ));
        }

        let sig = repo.signature().map_err(git_err)?;
        let mut index = repo.index().map_err(git_err)?;
        let tree = repo
            .find_tree(index.write_tree().map_err(git_err)?)
            .map_err(git_err)?;
        let head_commit = repo
            .head()
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?;
        let merge_commit = repo.find_commit(target_oid).map_err(git_err)?;

        let message = format!("Merge '{branch_name}'");
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &message,
            &tree,
            &[&head_commit, &merge_commit],
        )
        .map_err(git_err)?;
        repo.cleanup_state().map_err(git_err)?;

        Ok(OpResult::of("merged", format!("Merged {branch_name}")))
    })
    .await
}

#[tauri::command]
pub async fn check_merge_status(
    repo_path: String,
    target_branch: String,
    state: State<'_, GitState>,
) -> Result<MergeStatus, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let head = repo.head().map_err(git_err)?;
        let source_branch = head.shorthand().unwrap_or("HEAD").to_string();

        let target_branch = if target_branch.is_empty() {
            default_branch(repo)?
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

        let target_commit = repo
            .revparse_single(&format!("refs/heads/{target_branch}"))
            .or_else(|_| repo.revparse_single(&target_branch))
            .map_err(|e| format!("Target branch '{target_branch}' not found: {}", e.message()))?
            .peel_to_commit()
            .map_err(git_err)?;
        let target_oid = target_commit.id();

        let head_commit = head.peel_to_commit().map_err(git_err)?;
        let head_oid = head_commit.id();

        let (ahead, behind) = repo
            .graph_ahead_behind(head_oid, target_oid)
            .unwrap_or((0, 0));

        let annotated = repo.find_annotated_commit(target_oid).map_err(git_err)?;
        let (analysis, _) = repo.merge_analysis(&[&annotated]).map_err(git_err)?;

        let status = if analysis.is_up_to_date() {
            "up_to_date".to_string()
        } else if analysis.is_fast_forward() {
            "fast_forward".to_string()
        } else {
            let base = repo.merge_base(head_oid, target_oid).map_err(git_err)?;
            let base_tree = repo
                .find_commit(base)
                .map_err(git_err)?
                .tree()
                .map_err(git_err)?;
            let index = repo
                .merge_trees(
                    &base_tree,
                    &head_commit.tree().map_err(git_err)?,
                    &target_commit.tree().map_err(git_err)?,
                    None,
                )
                .map_err(git_err)?;
            if index.has_conflicts() {
                "conflicts".to_string()
            } else {
                "ok".to_string()
            }
        };

        Ok(MergeStatus {
            source_branch,
            target_branch,
            status,
            ahead,
            behind,
        })
    })
    .await
}

pub fn default_branch(repo: &Repository) -> Result<String, String> {
    if let Some(name) = repo
        .find_reference("refs/remotes/origin/HEAD")
        .ok()
        .and_then(|r| r.resolve().ok())
        .and_then(|r| {
            r.shorthand()
                .map(|s| s.trim_start_matches("origin/").to_string())
        })
    {
        return Ok(name);
    }
    for candidate in ["main", "master", "trunk", "develop"] {
        if repo.find_branch(candidate, BranchType::Local).is_ok() {
            return Ok(candidate.to_string());
        }
    }
    Err("Could not determine the default branch".to_string())
}

#[tauri::command]
pub fn get_default_branch(repo_path: String, state: State<'_, GitState>) -> Result<String, String> {
    with_repo(&state, &repo_path, default_branch)
}
