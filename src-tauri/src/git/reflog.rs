use crate::git::{git_err, with_repo, GitState};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReflogEntry {
    pub index: usize,
    pub oid: String,
    pub short_oid: String,

    pub old_oid: Option<String>,
    pub message: String,
    pub committer: String,
    pub time: i64,

    pub summary: Option<String>,
}

#[tauri::command]
pub fn get_reflog(
    repo_path: String,
    reference: Option<String>,
    max_count: Option<usize>,
    state: State<'_, GitState>,
) -> Result<Vec<ReflogEntry>, String> {
    with_repo(&state, &repo_path, |repo| {
        let refname = reference.unwrap_or_else(|| "HEAD".to_string());
        let reflog = repo
            .reflog(&refname)
            .map_err(|e| format!("No reflog for {refname}: {}", e.message()))?;

        let max = max_count.unwrap_or(200);
        let mut entries = Vec::new();

        for (index, entry) in reflog.iter().enumerate().take(max) {
            let oid = entry.id_new();
            let old = entry.id_old();
            entries.push(ReflogEntry {
                index,
                short_oid: format!("{:.7}", oid),
                oid: oid.to_string(),
                old_oid: if old.is_zero() {
                    None
                } else {
                    Some(old.to_string())
                },
                message: entry.message().unwrap_or("").to_string(),
                committer: entry.committer().name().unwrap_or("").to_string(),
                time: entry.committer().when().seconds(),
                summary: repo
                    .find_commit(oid)
                    .ok()
                    .and_then(|c| c.summary().map(|s| s.to_string())),
            });
        }

        Ok(entries)
    })
}

#[tauri::command]
pub fn restore_from_reflog(
    repo_path: String,
    oid: String,
    hard: bool,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let target = git2::Oid::from_str(&oid).map_err(git_err)?;
        let commit = repo.find_commit(target).map_err(git_err)?;
        let mode = if hard {
            git2::ResetType::Hard
        } else {
            git2::ResetType::Mixed
        };
        repo.reset(commit.as_object(), mode, None).map_err(git_err)
    })
}
