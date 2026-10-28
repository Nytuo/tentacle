use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoChanged {
    pub repo_path: String,

    pub scope: String,
}

const DEBOUNCE: Duration = Duration::from_millis(400);

#[derive(Default)]
pub struct WatcherState {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self::default()
    }
}

fn is_noise(path: &Path) -> bool {
    let s = path.to_string_lossy();
    s.ends_with(".lock")
        || s.contains("/.git/objects/")
        || s.contains("/.git/logs/")
        || s.contains("/.git/COMMIT_EDITMSG")
        || s.contains("/.git/FETCH_HEAD")
        || s.contains("/.git/modules/")
}

fn scope_of(paths: &[PathBuf]) -> &'static str {
    if paths.iter().any(|p| p.to_string_lossy().contains("/.git/")) {
        "index"
    } else {
        "worktree"
    }
}

#[tauri::command]
pub fn watch_repo(
    repo_path: String,
    app: tauri::AppHandle,
    watchers: State<'_, WatcherState>,
) -> Result<(), String> {
    let mut map = watchers.watchers.lock().unwrap();
    if map.contains_key(&repo_path) {
        return Ok(());
    }

    let (tx, rx) = mpsc::channel::<Event>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            let _ = tx.send(event);
        }
    })
    .map_err(|e| format!("Cannot start watching {repo_path}: {e}"))?;

    watcher
        .watch(Path::new(&repo_path), RecursiveMode::Recursive)
        .map_err(|e| format!("Cannot watch {repo_path}: {e}"))?;

    let emit_path = repo_path.clone();
    std::thread::spawn(move || {
        let mut pending: Option<(&'static str, Instant)> = None;
        loop {
            match rx.recv_timeout(DEBOUNCE) {
                Ok(event) => {
                    if matches!(event.kind, EventKind::Access(_)) {
                        continue;
                    }
                    let paths: Vec<PathBuf> =
                        event.paths.into_iter().filter(|p| !is_noise(p)).collect();
                    if paths.is_empty() {
                        continue;
                    }
                    let scope = scope_of(&paths);

                    let scope = match pending {
                        Some(("index", _)) => "index",
                        _ => scope,
                    };
                    pending = Some((scope, Instant::now()));
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if let Some((scope, at)) = pending {
                        if at.elapsed() >= DEBOUNCE {
                            let _ = app.emit(
                                "git://changed",
                                RepoChanged {
                                    repo_path: emit_path.clone(),
                                    scope: scope.to_string(),
                                },
                            );
                            pending = None;
                        }
                    }
                }

                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    map.insert(repo_path, watcher);
    Ok(())
}

#[tauri::command]
pub fn unwatch_repo(repo_path: String, watchers: State<'_, WatcherState>) {
    watchers.watchers.lock().unwrap().remove(&repo_path);
}

pub type SharedWatchers = Arc<WatcherState>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_internal_churn_is_filtered_out() {
        assert!(is_noise(Path::new("/r/.git/index.lock")));
        assert!(is_noise(Path::new("/r/.git/objects/ab/cdef")));
        assert!(is_noise(Path::new("/r/.git/logs/HEAD")));
        assert!(!is_noise(Path::new("/r/.git/HEAD")));
        assert!(!is_noise(Path::new("/r/src/main.rs")));
    }

    #[test]
    fn scope_distinguishes_metadata_from_working_tree() {
        assert_eq!(scope_of(&[PathBuf::from("/r/.git/HEAD")]), "index");
        assert_eq!(scope_of(&[PathBuf::from("/r/src/a.rs")]), "worktree");
    }
}
