pub mod advanced;
pub mod blame;
pub mod branches;
pub mod commits;
pub mod credentials;
pub mod diff;
pub mod graph;
pub mod hunks;
pub mod ignore;
pub mod reflog;
pub mod repo;
pub mod staging;
pub mod stash;
pub mod submodules;
pub mod tags;
pub mod watcher;

use git2::Repository;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub type RepoHandle = Arc<Mutex<Repository>>;

#[derive(Default)]
pub struct GitState {
    repos: Mutex<HashMap<String, RepoHandle>>,
}

impl GitState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&self, path: &str, repo: Repository) -> RepoHandle {
        let handle = Arc::new(Mutex::new(repo));
        self.repos
            .lock()
            .unwrap()
            .insert(path.to_string(), handle.clone());
        handle
    }

    pub fn handle(&self, path: &str) -> Result<RepoHandle, String> {
        if let Some(handle) = self.repos.lock().unwrap().get(path) {
            return Ok(handle.clone());
        }
        let repo = Repository::open(path)
            .map_err(|e| format!("Cannot open repository at {}: {}", path, e.message()))?;
        Ok(self.insert(path, repo))
    }

    pub fn close(&self, path: &str) {
        self.repos.lock().unwrap().remove(path);
    }

    pub fn open_paths(&self) -> Vec<String> {
        self.repos.lock().unwrap().keys().cloned().collect()
    }
}

pub fn with_repo<T>(
    state: &GitState,
    path: &str,
    f: impl FnOnce(&Repository) -> Result<T, String>,
) -> Result<T, String> {
    let handle = state.handle(path)?;
    let repo = handle.lock().map_err(|_| "Repository lock poisoned")?;
    f(&repo)
}

pub fn with_repo_mut<T>(
    state: &GitState,
    path: &str,
    f: impl FnOnce(&mut Repository) -> Result<T, String>,
) -> Result<T, String> {
    let handle = state.handle(path)?;
    let mut repo = handle.lock().map_err(|_| "Repository lock poisoned")?;
    f(&mut repo)
}

pub async fn with_repo_async<T, F>(state: &GitState, path: &str, f: F) -> Result<T, String>
where
    F: FnOnce(&Repository) -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let handle = state.handle(path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let repo = handle.lock().map_err(|_| "Repository lock poisoned")?;
        f(&repo)
    })
    .await
    .map_err(|e| format!("Worker thread failed: {e}"))?
}

pub async fn with_repo_mut_async<T, F>(state: &GitState, path: &str, f: F) -> Result<T, String>
where
    F: FnOnce(&mut Repository) -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let handle = state.handle(path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut repo = handle.lock().map_err(|_| "Repository lock poisoned")?;
        f(&mut repo)
    })
    .await
    .map_err(|e| format!("Worker thread failed: {e}"))?
}

pub fn git_err(e: git2::Error) -> String {
    e.message().to_string()
}
