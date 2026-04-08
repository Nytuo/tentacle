use crate::git::GitState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommitInfo {
    pub oid: String,
    pub short_oid: String,
    pub message: String,
    pub summary: String,
    pub author_name: String,
    pub author_email: String,
    pub author_time: i64,
    pub committer_name: String,
    pub committer_email: String,
    pub committer_time: i64,
    pub parent_oids: Vec<String>,
    pub is_merge: bool,
    pub refs: Vec<String>,
}

#[tauri::command]
pub fn get_commits(
    max_count: Option<usize>,
    state: State<'_, GitState>,
) -> Result<Vec<CommitInfo>, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let max = max_count.unwrap_or(500);

    let mut revwalk = repo.revwalk().map_err(|e| e.message().to_string())?;
    revwalk
        .set_sorting(git2::Sort::TIME | git2::Sort::TOPOLOGICAL)
        .map_err(|e| e.message().to_string())?;

    
    let refs: Vec<_> = repo
        .references()
        .map_err(|e| e.message().to_string())?
        .filter_map(|r| r.ok())
        .filter(|r| {
            r.is_branch()
                || r.name()
                    .map(|n| n.starts_with("refs/remotes/"))
                    .unwrap_or(false)
        })
        .filter_map(|r| r.target())
        .collect();

    if refs.is_empty() {
        
        if let Ok(head) = repo.head() {
            if let Some(oid) = head.target() {
                let _ = revwalk.push(oid);
            }
        }
    } else {
        for oid in &refs {
            let _ = revwalk.push(*oid);
        }
    }

    
    let mut ref_map: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    if let Ok(references) = repo.references() {
        for reference in references.flatten() {
            if let (Some(name), Some(target)) = (reference.shorthand(), reference.target()) {
                ref_map
                    .entry(target.to_string())
                    .or_default()
                    .push(name.to_string());
            }
        }
    }

    let mut commits = Vec::new();
    for oid in revwalk.take(max) {
        let oid = oid.map_err(|e| e.message().to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;

        let parent_oids: Vec<String> = commit.parent_ids().map(|id| id.to_string()).collect();

        let refs_for_commit = ref_map.get(&oid.to_string()).cloned().unwrap_or_default();

        commits.push(CommitInfo {
            oid: oid.to_string(),
            short_oid: format!("{:.7}", oid),
            message: commit.message().unwrap_or("").to_string(),
            summary: commit.summary().unwrap_or("").to_string(),
            author_name: commit.author().name().unwrap_or("").to_string(),
            author_email: commit.author().email().unwrap_or("").to_string(),
            author_time: commit.author().when().seconds(),
            committer_name: commit.committer().name().unwrap_or("").to_string(),
            committer_email: commit.committer().email().unwrap_or("").to_string(),
            committer_time: commit.committer().when().seconds(),
            parent_oids,
            is_merge: commit.parent_count() > 1,
            refs: refs_for_commit,
        });
    }

    Ok(commits)
}

#[tauri::command]
pub fn get_commit_details(oid: String, state: State<'_, GitState>) -> Result<CommitInfo, String> {
    if oid == "WIP" {
        let repo_lock = state.repo.lock().unwrap();
        let repo = repo_lock.as_ref().ok_or("No repository open")?;
        let head_oid = repo.head().ok().and_then(|h| h.target()).map(|o| o.to_string()).unwrap_or_default();
        let now = chrono::Utc::now().timestamp();
        return Ok(CommitInfo {
            oid: "WIP".to_string(),
            short_oid: "WIP".to_string(),
            message: "Working directory changes (staged and unstaged)".to_string(),
            summary: "Work in Progress".to_string(),
            author_name: "You".to_string(),
            author_email: "".to_string(),
            author_time: now,
            committer_name: "You".to_string(),
            committer_email: "".to_string(),
            committer_time: now,
            parent_oids: vec![head_oid],
            is_merge: false,
            refs: vec![],
        });
    }

    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let oid =
        git2::Oid::from_str(&oid).map_err(|e| format!("Invalid OID '{}': {}", oid, e.message()))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|e| format!("Cannot find commit {}: {}", oid, e.message()))?;

    let parent_oids: Vec<String> = commit.parent_ids().map(|id| id.to_string()).collect();

    let author = commit.author();
    let committer = commit.committer();
    let info = CommitInfo {
        oid: oid.to_string(),
        short_oid: format!("{:.7}", oid),
        message: commit.message().unwrap_or("").to_string(),
        summary: commit.summary().unwrap_or("").to_string(),
        author_name: author.name().unwrap_or("").to_string(),
        author_email: author.email().unwrap_or("").to_string(),
        author_time: author.when().seconds(),
        committer_name: committer.name().unwrap_or("").to_string(),
        committer_email: committer.email().unwrap_or("").to_string(),
        committer_time: committer.when().seconds(),
        parent_oids,
        is_merge: commit.parent_count() > 1,
        refs: vec![],
    };
    Ok(info)
}

#[tauri::command]
pub fn create_commit(message: String, state: State<'_, GitState>) -> Result<String, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let sig = repo.signature().map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| e.message().to_string())?;

    let parent = if let Ok(head) = repo.head() {
        Some(head.peel_to_commit().map_err(|e| e.message().to_string())?)
    } else {
        None
    };

    let parents: Vec<&git2::Commit> = parent.as_ref().map(|p| vec![p]).unwrap_or_default();

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.message().to_string())?;

    Ok(oid.to_string())
}

#[tauri::command]
pub fn amend_commit(message: Option<String>, state: State<'_, GitState>) -> Result<String, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let head = repo.head().map_err(|e| e.message().to_string())?;
    let commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;

    let sig = repo.signature().map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| e.message().to_string())?;

    let msg = message.unwrap_or_else(|| commit.message().unwrap_or("").to_string());

    let oid = commit
        .amend(
            Some("HEAD"),
            Some(&sig),
            Some(&sig),
            None,
            Some(&msg),
            Some(&tree),
        )
        .map_err(|e| e.message().to_string())?;

    Ok(oid.to_string())
}
