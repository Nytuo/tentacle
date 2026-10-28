use crate::git::{git_err, with_repo, GitState};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IgnoreFile {
    pub path: String,
    pub content: String,
    pub exists: bool,
}

fn resolve(repo: &git2::Repository, name: &str) -> Result<PathBuf, String> {
    if !matches!(name, ".gitignore" | ".gitattributes" | ".git/info/exclude") {
        return Err(format!("{name} is not an ignore file"));
    }
    let workdir = repo
        .workdir()
        .ok_or("Bare repository has no working tree")?;
    Ok(workdir.join(name))
}

#[tauri::command]
pub fn read_ignore_file(
    repo_path: String,
    name: String,
    state: State<'_, GitState>,
) -> Result<IgnoreFile, String> {
    with_repo(&state, &repo_path, |repo| {
        let full = resolve(repo, &name)?;
        let exists = full.exists();
        let content = if exists {
            std::fs::read_to_string(&full).map_err(|e| format!("Cannot read {name}: {e}"))?
        } else {
            String::new()
        };
        Ok(IgnoreFile {
            path: name,
            content,
            exists,
        })
    })
}

#[tauri::command]
pub fn write_ignore_file(
    repo_path: String,
    name: String,
    content: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let full = resolve(repo, &name)?;
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create {name}: {e}"))?;
        }
        std::fs::write(&full, content).map_err(|e| format!("Cannot write {name}: {e}"))
    })
}

#[tauri::command]
pub fn add_ignore_pattern(
    repo_path: String,
    pattern: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let full = resolve(repo, ".gitignore")?;
        let existing = std::fs::read_to_string(&full).unwrap_or_default();

        if existing.lines().any(|l| l.trim() == pattern.trim()) {
            return Ok(());
        }

        let mut out = existing;
        if !out.is_empty() && !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str(pattern.trim());
        out.push('\n');

        std::fs::write(&full, out).map_err(|e| format!("Cannot write .gitignore: {e}"))
    })
}

#[tauri::command]
pub fn is_ignored(
    repo_path: String,
    path: String,
    state: State<'_, GitState>,
) -> Result<bool, String> {
    with_repo(&state, &repo_path, |repo| {
        repo.is_path_ignored(&path).map_err(git_err)
    })
}
