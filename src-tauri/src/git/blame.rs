use crate::git::{git_err, with_repo_async, GitState};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BlameLine {
    pub line_no: usize,
    pub content: String,
    pub oid: String,
    pub short_oid: String,
    pub author_name: String,
    pub author_time: i64,
    pub summary: String,

    pub starts_block: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BlameResult {
    pub path: String,
    pub lines: Vec<BlameLine>,
}

#[tauri::command]
pub async fn get_blame(
    repo_path: String,
    file_path: String,
    oid: Option<String>,
    state: State<'_, GitState>,
) -> Result<BlameResult, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let mut opts = git2::BlameOptions::new();
        opts.track_copies_same_file(true)
            .track_copies_same_commit_moves(true);

        let content = match &oid {
            Some(rev) => {
                let commit = repo
                    .revparse_single(rev)
                    .map_err(git_err)?
                    .peel_to_commit()
                    .map_err(git_err)?;
                opts.newest_commit(commit.id());
                let entry = commit
                    .tree()
                    .map_err(git_err)?
                    .get_path(Path::new(&file_path))
                    .map_err(|_| format!("{file_path} does not exist at {rev}"))?;
                entry
                    .to_object(repo)
                    .map_err(git_err)?
                    .peel_to_blob()
                    .map_err(git_err)?
                    .content()
                    .to_vec()
            }
            None => {
                let workdir = repo
                    .workdir()
                    .ok_or("Bare repository has no working tree")?;
                std::fs::read(workdir.join(&file_path))
                    .map_err(|e| format!("Cannot read {file_path}: {e}"))?
            }
        };

        if content.contains(&0u8) {
            return Err("Cannot blame a binary file".to_string());
        }

        let blame = repo
            .blame_file(Path::new(&file_path), Some(&mut opts))
            .map_err(git_err)?;

        let text = String::from_utf8_lossy(&content);
        let mut lines = Vec::new();
        let mut previous_oid = String::new();

        for (idx, line) in text.lines().enumerate() {
            let line_no = idx + 1;
            let Some(hunk) = blame.get_line(line_no) else {
                continue;
            };
            let commit_oid = hunk.final_commit_id();
            let commit = repo.find_commit(commit_oid).ok();

            let oid_str = commit_oid.to_string();
            let starts_block = oid_str != previous_oid;
            previous_oid = oid_str.clone();

            lines.push(BlameLine {
                line_no,
                content: line.to_string(),
                short_oid: format!("{:.7}", commit_oid),
                oid: oid_str,
                author_name: hunk
                    .final_signature()
                    .name()
                    .unwrap_or("Unknown")
                    .to_string(),
                author_time: commit
                    .as_ref()
                    .map(|c| c.author().when().seconds())
                    .unwrap_or(0),
                summary: commit
                    .as_ref()
                    .and_then(|c| c.summary().map(|s| s.to_string()))
                    .unwrap_or_default(),
                starts_block,
            });
        }

        Ok(BlameResult {
            path: file_path,
            lines,
        })
    })
    .await
}
