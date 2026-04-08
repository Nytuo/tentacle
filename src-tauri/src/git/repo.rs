use crate::git::GitState;
use git2::Repository;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub head_branch: Option<String>,
    pub is_bare: bool,
    pub is_empty: bool,
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
        git2::RepositoryState::Clean => "clean".to_string(),
        git2::RepositoryState::Merge => "merge".to_string(),
        git2::RepositoryState::Revert | git2::RepositoryState::RevertSequence => {
            "revert".to_string()
        }
        git2::RepositoryState::CherryPick | git2::RepositoryState::CherryPickSequence => {
            "cherry-pick".to_string()
        }
        git2::RepositoryState::Bisect => "bisect".to_string(),
        git2::RepositoryState::Rebase
        | git2::RepositoryState::RebaseInteractive
        | git2::RepositoryState::RebaseMerge => "rebase".to_string(),
        _ => "unknown".to_string(),
    }
}

#[tauri::command]
pub fn open_repo(path: String, state: State<'_, GitState>) -> Result<RepoInfo, String> {
    let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

    let head_branch = repo.head().ok().and_then(|h| {
        if h.is_branch() {
            h.shorthand().map(|s| s.to_string())
        } else {
            
            h.target().map(|oid| format!("{:.8}", oid))
        }
    });

    let name = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let info = RepoInfo {
        path: path.clone(),
        name,
        head_branch,
        is_bare: repo.is_bare(),
        is_empty: repo.is_empty().unwrap_or(true),
        state: repo_state_to_string(repo.state()),
    };

    *state.repo.lock().unwrap() = Some(repo);
    *state.repo_path.lock().unwrap() = Some(path);

    Ok(info)
}

#[tauri::command]
pub fn init_repo(path: String, state: State<'_, GitState>) -> Result<RepoInfo, String> {
    let repo = Repository::init(&path).map_err(|e| e.message().to_string())?;

    let name = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let info = RepoInfo {
        path: path.clone(),
        name,
        head_branch: None,
        is_bare: false,
        is_empty: true,
        state: "clean".to_string(),
    };

    *state.repo.lock().unwrap() = Some(repo);
    *state.repo_path.lock().unwrap() = Some(path);

    Ok(info)
}

#[tauri::command]
pub fn clone_repo(
    url: String,
    path: String,
    state: State<'_, GitState>,
) -> Result<RepoInfo, String> {
    let repo = Repository::clone(&url, &path).map_err(|e| e.message().to_string())?;

    let head_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let name = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let info = RepoInfo {
        path: path.clone(),
        name,
        head_branch,
        is_bare: false,
        is_empty: false,
        state: "clean".to_string(),
    };

    *state.repo.lock().unwrap() = Some(repo);
    *state.repo_path.lock().unwrap() = Some(path);

    Ok(info)
}

#[tauri::command]
pub fn get_repo_info(state: State<'_, GitState>) -> Result<RepoInfo, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;
    let path_lock = state.repo_path.lock().unwrap();
    let path = path_lock.as_ref().ok_or("No repository path")?.clone();

    let head_branch = repo.head().ok().and_then(|h| {
        if h.is_branch() {
            h.shorthand().map(|s| s.to_string())
        } else {
            h.target().map(|oid| format!("{:.8}", oid))
        }
    });

    let name = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    Ok(RepoInfo {
        path,
        name,
        head_branch,
        is_bare: repo.is_bare(),
        is_empty: repo.is_empty().unwrap_or(true),
        state: repo_state_to_string(repo.state()),
    })
}

fn build_tree(base: &Path, rel: &str) -> Vec<FileEntry> {
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
                if name.starts_with('.') {
                    return None; 
                }
                let path = if rel.is_empty() {
                    name.clone()
                } else {
                    format!("{}/{}", rel, name)
                };
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                Some((name, path, is_dir))
            })
            .collect(),
    };

    
    let mut entries: Vec<FileEntry> = raw
        .into_par_iter()
        .map(|(name, path, is_dir)| {
            let children = if is_dir {
                Some(build_tree(base, &path))
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
pub fn get_file_tree(state: State<'_, GitState>) -> Result<Vec<FileEntry>, String> {
    let path_lock = state.repo_path.lock().unwrap();
    let path = path_lock.as_ref().ok_or("No repository open")?;
    Ok(build_tree(Path::new(path), ""))
}

#[tauri::command]
pub fn get_file_content(file_path: String, state: State<'_, GitState>) -> Result<String, String> {
    let path_lock = state.repo_path.lock().unwrap();
    let repo_path = path_lock.as_ref().ok_or("No repository open")?;
    let full_path = Path::new(repo_path).join(&file_path);
    std::fs::read_to_string(&full_path).map_err(|e| e.to_string())
}
