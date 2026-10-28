use crate::git::credentials;
use crate::git::{git_err, with_repo, GitState};
use git2::Repository;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{Emitter, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub head_branch: Option<String>,
    pub is_bare: bool,
    pub is_empty: bool,
    pub is_detached: bool,
    pub state: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

fn repo_state_to_string(state: git2::RepositoryState) -> String {
    match state {
        git2::RepositoryState::Clean => "clean",
        git2::RepositoryState::Merge => "merge",
        git2::RepositoryState::Revert | git2::RepositoryState::RevertSequence => "revert",
        git2::RepositoryState::CherryPick | git2::RepositoryState::CherryPickSequence => {
            "cherry-pick"
        }
        git2::RepositoryState::Bisect => "bisect",
        git2::RepositoryState::Rebase
        | git2::RepositoryState::RebaseInteractive
        | git2::RepositoryState::RebaseMerge => "rebase",
        git2::RepositoryState::ApplyMailbox | git2::RepositoryState::ApplyMailboxOrRebase => {
            "apply-mailbox"
        }
    }
    .to_string()
}

fn describe(repo: &Repository, path: &str) -> RepoInfo {
    let head = repo.head().ok();
    let is_detached = repo.head_detached().unwrap_or(false);
    let head_branch = head.and_then(|h| {
        if h.is_branch() {
            h.shorthand().map(|s| s.to_string())
        } else {
            h.target().map(|oid| format!("{:.8}", oid))
        }
    });

    RepoInfo {
        path: path.to_string(),
        name: Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        head_branch,
        is_bare: repo.is_bare(),
        is_empty: repo.is_empty().unwrap_or(true),
        is_detached,
        state: repo_state_to_string(repo.state()),
    }
}

fn canonical_root(repo: &Repository, fallback: &str) -> String {
    repo.workdir()
        .unwrap_or_else(|| repo.path())
        .canonicalize()
        .map(|p| p.to_string_lossy().trim_end_matches('/').to_string())
        .unwrap_or_else(|_| fallback.to_string())
}

#[tauri::command]
pub async fn open_repo(path: String, state: State<'_, GitState>) -> Result<RepoInfo, String> {
    let opened = tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::discover(&path)
            .map_err(|e| format!("{} is not a Git repository: {}", path, e.message()))?;
        let root = canonical_root(&repo, &path);
        let info = describe(&repo, &root);
        Ok::<_, String>((root, repo, info))
    })
    .await
    .map_err(|e| format!("Worker thread failed: {e}"))??;

    let (root, repo, info) = opened;
    state.insert(&root, repo);
    Ok(info)
}

#[tauri::command]
pub async fn init_repo(path: String, state: State<'_, GitState>) -> Result<RepoInfo, String> {
    let opened = tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::init(&path).map_err(git_err)?;
        let root = canonical_root(&repo, &path);
        let info = describe(&repo, &root);
        Ok::<_, String>((root, repo, info))
    })
    .await
    .map_err(|e| format!("Worker thread failed: {e}"))??;

    let (root, repo, info) = opened;
    state.insert(&root, repo);
    Ok(info)
}

#[tauri::command]
pub async fn clone_repo(
    url: String,
    path: String,
    app: tauri::AppHandle,
    state: State<'_, GitState>,
) -> Result<RepoInfo, String> {
    let clone_url = url.clone();
    let opened = tauri::async_runtime::spawn_blocking(move || {
        let mut cb = credentials::callbacks_for(&clone_url);
        let emitter = app.clone();
        credentials::with_progress(&mut cb, move |p| {
            let _ = emitter.emit("git://progress", p);
        });

        let mut fetch_opts = git2::FetchOptions::new();
        fetch_opts.remote_callbacks(cb);

        let repo = git2::build::RepoBuilder::new()
            .fetch_options(fetch_opts)
            .clone(&clone_url, Path::new(&path))
            .map_err(git_err)?;

        let root = canonical_root(&repo, &path);
        let info = describe(&repo, &root);
        Ok::<_, String>((root, repo, info))
    })
    .await
    .map_err(|e| format!("Worker thread failed: {e}"))??;

    let (root, repo, info) = opened;
    state.insert(&root, repo);
    Ok(info)
}

#[tauri::command]
pub fn get_repo_info(repo_path: String, state: State<'_, GitState>) -> Result<RepoInfo, String> {
    with_repo(&state, &repo_path, |repo| Ok(describe(repo, &repo_path)))
}

#[tauri::command]
pub fn close_repo(repo_path: String, state: State<'_, GitState>) {
    state.close(&repo_path);
}

fn build_tree(repo: &Repository, base: &Path, rel: &str) -> Vec<FileEntry> {
    let full = if rel.is_empty() {
        base.to_path_buf()
    } else {
        base.join(rel)
    };

    let raw: Vec<(String, String, bool)> = match std::fs::read_dir(&full) {
        Err(_) => return Vec::new(),
        Ok(rd) => rd
            .flatten()
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().to_string();
                if name == ".git" {
                    return None;
                }
                let path = if rel.is_empty() {
                    name.clone()
                } else {
                    format!("{}/{}", rel, name)
                };
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                if repo.is_path_ignored(&path).unwrap_or(false) {
                    return None;
                }
                Some((name, path, is_dir))
            })
            .collect(),
    };

    let mut entries: Vec<FileEntry> = raw
        .into_iter()
        .map(|(name, path, is_dir)| {
            let children = if is_dir {
                Some(build_tree(repo, base, &path))
            } else {
                None
            };
            FileEntry {
                path,
                name,
                is_dir,
                children,
            }
        })
        .collect();

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    entries
}

#[tauri::command]
pub async fn get_file_tree(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<FileEntry>, String> {
    crate::git::with_repo_async(&state, &repo_path, move |repo| {
        let workdir = repo
            .workdir()
            .ok_or("Bare repository has no working tree")?;
        Ok(build_tree(repo, workdir, ""))
    })
    .await
}

#[tauri::command]
pub async fn get_file_content(
    repo_path: String,
    file_path: String,
    state: State<'_, GitState>,
) -> Result<String, String> {
    crate::git::with_repo_async(&state, &repo_path, move |repo| {
        let workdir = repo
            .workdir()
            .ok_or("Bare repository has no working tree")?;

        let full = workdir.join(&file_path);
        let canonical = full
            .canonicalize()
            .map_err(|e| format!("Cannot read {file_path}: {e}"))?;
        let root = workdir
            .canonicalize()
            .map_err(|e| format!("Cannot resolve repository root: {e}"))?;
        if !canonical.starts_with(&root) {
            return Err("Path escapes the repository".to_string());
        }
        std::fs::read_to_string(&canonical).map_err(|e| format!("Cannot read {file_path}: {e}"))
    })
    .await
}

#[tauri::command]
pub async fn get_file_at_commit(
    repo_path: String,
    file_path: String,
    oid: String,
    state: State<'_, GitState>,
) -> Result<String, String> {
    crate::git::with_repo_async(&state, &repo_path, move |repo| {
        let obj = repo.revparse_single(&oid).map_err(git_err)?;
        let commit = obj.peel_to_commit().map_err(git_err)?;
        let tree = commit.tree().map_err(git_err)?;
        let entry = tree
            .get_path(Path::new(&file_path))
            .map_err(|_| format!("{file_path} does not exist at {oid}"))?;
        let blob = entry
            .to_object(repo)
            .map_err(git_err)?
            .peel_to_blob()
            .map_err(git_err)?;
        Ok(String::from_utf8_lossy(blob.content()).to_string())
    })
    .await
}
