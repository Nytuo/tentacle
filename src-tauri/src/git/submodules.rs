use crate::git::{git_err, with_repo, with_repo_async, GitState};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubmoduleInfo {
    pub name: String,
    pub path: String,
    pub url: Option<String>,

    pub head_oid: Option<String>,

    pub workdir_oid: Option<String>,
    pub initialized: bool,

    pub modified: bool,
}

#[tauri::command]
pub fn get_submodules(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<SubmoduleInfo>, String> {
    with_repo(&state, &repo_path, |repo| {
        let mut out = Vec::new();
        for sm in repo.submodules().map_err(git_err)? {
            let head_oid = sm.head_id().map(|o| o.to_string());
            let workdir_oid = sm.workdir_id().map(|o| o.to_string());
            out.push(SubmoduleInfo {
                name: sm.name().unwrap_or("").to_string(),
                path: sm.path().to_string_lossy().to_string(),
                url: sm.url().map(|u| u.to_string()),
                modified: match (&head_oid, &workdir_oid) {
                    (Some(a), Some(b)) => a != b,
                    _ => false,
                },
                initialized: workdir_oid.is_some(),
                head_oid,
                workdir_oid,
            });
        }
        out.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(out)
    })
}

#[tauri::command]
pub async fn update_submodules(
    repo_path: String,
    init: Option<bool>,
    state: State<'_, GitState>,
) -> Result<String, String> {
    crate::git::with_repo_mut_async(&state, &repo_path, move |repo| {
        let init = init.unwrap_or(true);
        let mut count = 0;
        for mut sm in repo.submodules().map_err(git_err)? {
            let mut opts = git2::SubmoduleUpdateOptions::new();
            let mut fetch = git2::FetchOptions::new();
            let url = sm.url().unwrap_or_default().to_string();
            fetch.remote_callbacks(crate::git::credentials::callbacks_for(&url));
            opts.fetch(fetch);
            sm.update(init, Some(&mut opts)).map_err(git_err)?;
            count += 1;
        }
        Ok(format!("Updated {count} submodule(s)"))
    })
    .await
}

#[tauri::command]
pub async fn add_submodule(
    repo_path: String,
    url: String,
    path: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    crate::git::with_repo_async(&state, &repo_path, move |repo| {
        let mut sm = repo
            .submodule(&url, std::path::Path::new(&path), true)
            .map_err(git_err)?;

        let mut opts = git2::SubmoduleUpdateOptions::new();
        let mut fetch = git2::FetchOptions::new();
        fetch.remote_callbacks(crate::git::credentials::callbacks_for(&url));
        opts.fetch(fetch);
        sm.clone(Some(&mut opts)).map_err(git_err)?;
        sm.add_finalize().map_err(git_err)
    })
    .await
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorktreeInfo {
    pub name: String,
    pub path: String,

    pub branch: Option<String>,
    pub head_oid: Option<String>,
    pub is_locked: bool,
    pub is_prunable: bool,
    pub is_dirty: bool,
}

#[tauri::command]
pub fn get_worktrees(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<WorktreeInfo>, String> {
    with_repo(&state, &repo_path, |repo| {
        let names = repo.worktrees().map_err(git_err)?;
        let mut out = Vec::new();

        for name in names.iter().flatten() {
            let Ok(wt) = repo.find_worktree(name) else {
                continue;
            };
            let path = wt.path().to_string_lossy().to_string();

            let (branch, head_oid, is_dirty) = match git2::Repository::open(&path) {
                Ok(wt_repo) => {
                    let b = wt_repo
                        .head()
                        .ok()
                        .and_then(|h| h.shorthand().map(|s| s.to_string()));
                    let h_oid = wt_repo
                        .head()
                        .ok()
                        .and_then(|h| h.target().map(|t| t.to_string()));
                    let mut opts = git2::StatusOptions::new();
                    opts.include_untracked(true);
                    let dirty = wt_repo
                        .statuses(Some(&mut opts))
                        .map(|s| !s.is_empty())
                        .unwrap_or(false);
                    (b, h_oid, dirty)
                }
                Err(_) => (None, None, false),
            };

            out.push(WorktreeInfo {
                name: name.to_string(),
                is_locked: matches!(wt.is_locked(), Ok(git2::WorktreeLockStatus::Locked(_))),
                is_prunable: !std::path::Path::new(&path).exists(),
                is_dirty,
                head_oid,
                path,
                branch,
            });
        }
        Ok(out)
    })
}

#[tauri::command]
pub fn add_worktree(
    repo_path: String,
    name: String,
    path: String,
    branch: Option<String>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let mut opts = git2::WorktreeAddOptions::new();

        let reference;
        if let Some(branch) = &branch {
            reference = repo
                .find_branch(branch, git2::BranchType::Local)
                .map_err(|e| format!("No local branch '{branch}': {}", e.message()))?
                .into_reference();
            opts.reference(Some(&reference));
        }

        repo.worktree(&name, std::path::Path::new(&path), Some(&opts))
            .map_err(git_err)?;
        Ok(())
    })
}

#[tauri::command]
pub fn remove_worktree(
    repo_path: String,
    name: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let wt = repo.find_worktree(&name).map_err(git_err)?;
        let mut opts = git2::WorktreePruneOptions::new();
        opts.valid(true).working_tree(true);
        wt.prune(Some(&mut opts)).map_err(git_err)
    })
}

#[tauri::command]
pub fn lock_worktree(
    repo_path: String,
    name: String,
    reason: Option<String>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let wt = repo.find_worktree(&name).map_err(git_err)?;
        wt.lock(reason.as_deref()).map_err(git_err)
    })
}

#[tauri::command]
pub fn unlock_worktree(
    repo_path: String,
    name: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let wt = repo.find_worktree(&name).map_err(git_err)?;
        wt.unlock().map_err(git_err)
    })
}

#[tauri::command]
pub fn prune_worktrees(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<u32, String> {
    with_repo(&state, &repo_path, |repo| {
        let names = repo.worktrees().map_err(git_err)?;
        let mut count = 0;
        for name in names.iter().flatten() {
            if let Ok(wt) = repo.find_worktree(name) {
                let mut check_opts = git2::WorktreePruneOptions::new();
                if wt.is_prunable(Some(&mut check_opts)).unwrap_or(false) || !wt.path().exists() {
                    let mut opts = git2::WorktreePruneOptions::new();
                    opts.valid(true).working_tree(true);
                    if wt.prune(Some(&mut opts)).is_ok() {
                        count += 1;
                    }
                }
            }
        }
        Ok(count)
    })
}

#[tauri::command]
pub async fn init_submodule(
    repo_path: String,
    path: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    crate::git::with_repo_mut_async(&state, &repo_path, move |repo| {
        let mut sm = repo.find_submodule(&path).map_err(git_err)?;
        sm.init(false).map_err(git_err)
    })
    .await
}

#[tauri::command]
pub async fn sync_submodule(
    repo_path: String,
    path: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    crate::git::with_repo_mut_async(&state, &repo_path, move |repo| {
        let mut sm = repo.find_submodule(&path).map_err(git_err)?;
        sm.sync().map_err(git_err)
    })
    .await
}

#[tauri::command]
pub async fn deinit_submodule(
    repo_path: String,
    path: String,
) -> Result<(), String> {
    let res = std::process::Command::new("git")
        .current_dir(&repo_path)
        .args(["submodule", "deinit", "-f", "--", &path])
        .output();
    match res {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => Err(String::from_utf8_lossy(&out.stderr).to_string()),
        Err(e) => Err(format!("Failed to run git submodule deinit: {e}")),
    }
}

#[tauri::command]
pub fn open_in_editor(
    path: String,
    editor: Option<String>,
) -> Result<(), String> {
    let ed = editor.as_deref().unwrap_or("code");
    let cmd = match ed {
        "cursor" => "cursor",
        "zed" => "zed",
        "subl" => "subl",
        _ => "code",
    };
    std::process::Command::new(cmd)
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not launch {cmd}: {e}. Ensure it is in your PATH."))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LfsStatus {
    pub installed: bool,

    pub enabled: bool,

    pub tracked_patterns: Vec<String>,
}

#[tauri::command]
pub async fn get_lfs_status(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<LfsStatus, String> {
    with_repo_async(&state, &repo_path, |repo| {
        let installed = std::process::Command::new("git-lfs")
            .arg("version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        let workdir = repo
            .workdir()
            .ok_or("Bare repository has no working tree")?;
        let attributes =
            std::fs::read_to_string(workdir.join(".gitattributes")).unwrap_or_default();

        let tracked_patterns: Vec<String> = attributes
            .lines()
            .filter(|l| l.contains("filter=lfs"))
            .filter_map(|l| l.split_whitespace().next().map(|s| s.to_string()))
            .collect();

        Ok(LfsStatus {
            installed,
            enabled: !tracked_patterns.is_empty(),
            tracked_patterns,
        })
    })
    .await
}
