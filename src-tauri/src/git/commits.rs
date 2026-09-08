use crate::git::{git_err, with_repo, with_repo_async, with_repo_mut, GitState};
use git2::Repository;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RefInfo {
    pub name: String,

    pub kind: String,

    pub remote: Option<String>,

    pub is_head: bool,
}

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
    pub refs: Vec<RefInfo>,

    #[serde(default)]
    pub signature: String,
}

#[derive(Debug, Deserialize, Default, Clone)]
pub struct CommitQuery {
    #[serde(default)]
    pub max_count: Option<usize>,

    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub author: Option<String>,

    #[serde(default)]
    pub path: Option<String>,

    #[serde(default)]
    pub since: Option<i64>,
    #[serde(default)]
    pub until: Option<i64>,

    #[serde(default)]
    pub branch: Option<String>,
}

fn ref_rank(r: &RefInfo) -> u8 {
    if r.is_head {
        return 0;
    }
    match r.kind.as_str() {
        "local" => 1,
        "remote" => 2,
        _ => 3,
    }
}

fn build_ref_map(repo: &Repository) -> HashMap<String, Vec<RefInfo>> {
    let mut map: HashMap<String, Vec<RefInfo>> = HashMap::new();
    let Ok(references) = repo.references() else {
        return map;
    };

    let head_branch = repo
        .head()
        .ok()
        .filter(|h| h.is_branch())
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let remotes: Vec<String> = repo
        .remotes()
        .map(|r| r.iter().flatten().map(|s| s.to_string()).collect())
        .unwrap_or_default();

    for reference in references.flatten() {
        let Some(shorthand) = reference.shorthand().map(|s| s.to_string()) else {
            continue;
        };
        let full = reference.name().unwrap_or("").to_string();

        if full.ends_with("/HEAD") {
            continue;
        }

        let (kind, remote) = if reference.is_tag() || full.starts_with("refs/tags/") {
            ("tag", None)
        } else if reference.is_remote() || full.starts_with("refs/remotes/") {
            let owner = remotes
                .iter()
                .find(|r| shorthand.starts_with(&format!("{r}/")))
                .cloned();
            ("remote", owner)
        } else if reference.is_branch() {
            ("local", None)
        } else {
            continue;
        };

        let target = reference
            .peel_to_commit()
            .map(|c| c.id())
            .ok()
            .or_else(|| reference.target());

        if let Some(target) = target {
            map.entry(target.to_string()).or_default().push(RefInfo {
                is_head: kind == "local" && head_branch.as_deref() == Some(&shorthand),
                name: shorthand,
                kind: kind.to_string(),
                remote,
            });
        }
    }

    for refs in map.values_mut() {
        refs.sort_by(|a, b| {
            ref_rank(a)
                .cmp(&ref_rank(b))
                .then_with(|| a.name.cmp(&b.name))
        });
    }
    map
}

fn signature_state(repo: &Repository, oid: git2::Oid) -> String {
    match repo.extract_signature(&oid, None) {
        Ok(_) => "unknown".to_string(),
        Err(_) => "none".to_string(),
    }
}

fn to_info(repo: &Repository, commit: &git2::Commit, refs: Vec<RefInfo>) -> CommitInfo {
    let author = commit.author();
    let committer = commit.committer();
    CommitInfo {
        oid: commit.id().to_string(),
        short_oid: format!("{:.7}", commit.id()),
        message: commit.message().unwrap_or("").to_string(),
        summary: commit.summary().unwrap_or("").to_string(),
        author_name: author.name().unwrap_or("").to_string(),
        author_email: author.email().unwrap_or("").to_string(),
        author_time: author.when().seconds(),
        committer_name: committer.name().unwrap_or("").to_string(),
        committer_email: committer.email().unwrap_or("").to_string(),
        committer_time: committer.when().seconds(),
        parent_oids: commit.parent_ids().map(|id| id.to_string()).collect(),
        is_merge: commit.parent_count() > 1,
        refs,
        signature: signature_state(repo, commit.id()),
    }
}

fn touches_path(repo: &Repository, commit: &git2::Commit, path: &str) -> bool {
    let Ok(tree) = commit.tree() else {
        return false;
    };
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

    let mut opts = git2::DiffOptions::new();
    opts.pathspec(path);
    repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
        .map(|d| d.deltas().len() > 0)
        .unwrap_or(false)
}

fn matches(commit: &git2::Commit, query: &CommitQuery, repo: &Repository) -> bool {
    if let Some(since) = query.since {
        if commit.author().when().seconds() < since {
            return false;
        }
    }
    if let Some(until) = query.until {
        if commit.author().when().seconds() > until {
            return false;
        }
    }
    if let Some(author) = &query.author {
        let needle = author.to_lowercase();
        let a = commit.author();
        let name = a.name().unwrap_or("").to_lowercase();
        let email = a.email().unwrap_or("").to_lowercase();
        if !name.contains(&needle) && !email.contains(&needle) {
            return false;
        }
    }
    if let Some(text) = &query.text {
        let needle = text.to_lowercase();
        let hit = commit
            .message()
            .unwrap_or("")
            .to_lowercase()
            .contains(&needle)
            || commit.id().to_string().starts_with(&needle)
            || commit
                .author()
                .name()
                .unwrap_or("")
                .to_lowercase()
                .contains(&needle);
        if !hit {
            return false;
        }
    }
    if let Some(path) = &query.path {
        if !touches_path(repo, commit, path) {
            return false;
        }
    }
    true
}

pub fn walk_commits(repo: &Repository, query: &CommitQuery) -> Result<Vec<CommitInfo>, String> {
    let max = query.max_count.unwrap_or(500);

    let mut revwalk = repo.revwalk().map_err(git_err)?;
    revwalk
        .set_sorting(git2::Sort::TIME | git2::Sort::TOPOLOGICAL)
        .map_err(git_err)?;

    match &query.branch {
        Some(branch) => {
            let oid = repo
                .revparse_single(branch)
                .map_err(|e| format!("Cannot resolve '{branch}': {}", e.message()))?
                .peel_to_commit()
                .map_err(git_err)?
                .id();
            revwalk.push(oid).map_err(git_err)?;
        }
        None => {
            let tips: Vec<git2::Oid> = repo
                .references()
                .map_err(git_err)?
                .filter_map(|r| r.ok())
                .filter(|r| {
                    r.is_branch()
                        || r.name()
                            .map(|n| n.starts_with("refs/remotes/"))
                            .unwrap_or(false)
                })
                .filter_map(|r| r.peel_to_commit().ok().map(|c| c.id()))
                .collect();

            if tips.is_empty() {
                if let Ok(head) = repo.head() {
                    if let Some(oid) = head.target() {
                        let _ = revwalk.push(oid);
                    }
                }
            } else {
                for oid in tips {
                    let _ = revwalk.push(oid);
                }
            }
        }
    }

    let ref_map = build_ref_map(repo);
    let filtering = query.text.is_some()
        || query.author.is_some()
        || query.path.is_some()
        || query.since.is_some()
        || query.until.is_some();

    let mut commits = Vec::new();
    for oid in revwalk {
        if commits.len() >= max {
            break;
        }
        let Ok(oid) = oid else { continue };
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        if filtering && !matches(&commit, query, repo) {
            continue;
        }
        let refs = ref_map.get(&oid.to_string()).cloned().unwrap_or_default();
        commits.push(to_info(repo, &commit, refs));
    }

    Ok(commits)
}

#[tauri::command]
pub async fn get_commits(
    repo_path: String,
    query: Option<CommitQuery>,
    state: State<'_, GitState>,
) -> Result<Vec<CommitInfo>, String> {
    let query = query.unwrap_or_default();
    with_repo_async(&state, &repo_path, move |repo| walk_commits(repo, &query)).await
}

#[tauri::command]
pub async fn get_file_history(
    repo_path: String,
    file_path: String,
    max_count: Option<usize>,
    state: State<'_, GitState>,
) -> Result<Vec<CommitInfo>, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let max = max_count.unwrap_or(200);
        let mut revwalk = repo.revwalk().map_err(git_err)?;
        revwalk
            .set_sorting(git2::Sort::TIME | git2::Sort::TOPOLOGICAL)
            .map_err(git_err)?;
        revwalk.push_head().map_err(git_err)?;

        let ref_map = build_ref_map(repo);

        let mut current_path = file_path.clone();
        let mut out = Vec::new();

        for oid in revwalk {
            if out.len() >= max {
                break;
            }
            let Ok(oid) = oid else { continue };
            let Ok(commit) = repo.find_commit(oid) else {
                continue;
            };
            let Ok(tree) = commit.tree() else { continue };
            let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

            let mut opts = git2::DiffOptions::new();
            opts.pathspec(&current_path);
            let Ok(mut diff) =
                repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
            else {
                continue;
            };

            let mut find_opts = git2::DiffFindOptions::new();
            find_opts.renames(true);
            let _ = diff.find_similar(Some(&mut find_opts));

            if diff.deltas().len() == 0 {
                continue;
            }

            if let Some(delta) = diff.deltas().next() {
                if delta.status() == git2::Delta::Renamed {
                    if let Some(old) = delta.old_file().path() {
                        current_path = old.to_string_lossy().to_string();
                    }
                }
            }

            let refs = ref_map.get(&oid.to_string()).cloned().unwrap_or_default();
            out.push(to_info(repo, &commit, refs));
        }

        Ok(out)
    })
    .await
}

#[tauri::command]
pub fn get_commit_details(
    repo_path: String,
    oid: String,
    state: State<'_, GitState>,
) -> Result<CommitInfo, String> {
    with_repo(&state, &repo_path, |repo| {
        if oid == "WIP" {
            let head_oid = repo
                .head()
                .ok()
                .and_then(|h| h.target())
                .map(|o| o.to_string())
                .unwrap_or_default();
            let now = chrono::Utc::now().timestamp();
            return Ok(CommitInfo {
                oid: "WIP".to_string(),
                short_oid: "WIP".to_string(),
                message: "Working directory changes (staged and unstaged)".to_string(),
                summary: "Work in Progress".to_string(),
                author_name: "You".to_string(),
                author_email: String::new(),
                author_time: now,
                committer_name: "You".to_string(),
                committer_email: String::new(),
                committer_time: now,
                parent_oids: if head_oid.is_empty() {
                    vec![]
                } else {
                    vec![head_oid]
                },
                is_merge: false,
                refs: vec![],
                signature: "none".to_string(),
            });
        }

        let obj = repo
            .revparse_single(&oid)
            .map_err(|e| format!("Cannot find commit {oid}: {}", e.message()))?;
        let commit = obj.peel_to_commit().map_err(git_err)?;
        let ref_map = build_ref_map(repo);
        let refs = ref_map
            .get(&commit.id().to_string())
            .cloned()
            .unwrap_or_default();
        Ok(to_info(repo, &commit, refs))
    })
}

#[derive(Debug, Deserialize, Default)]
pub struct CommitOptions {
    #[serde(default)]
    pub amend: bool,

    #[serde(default)]
    pub sign_off: bool,

    #[serde(default)]
    pub allow_empty: bool,
}

fn with_sign_off(message: &str, sig: &git2::Signature) -> String {
    let trailer = format!(
        "Signed-off-by: {} <{}>",
        sig.name().unwrap_or(""),
        sig.email().unwrap_or("")
    );
    if message.contains(&trailer) {
        return message.to_string();
    }
    let body = message.trim_end();

    let last_para_is_trailers = body
        .lines()
        .last()
        .map(|l| l.contains(": ") && !l.starts_with(' '))
        .unwrap_or(false);
    if last_para_is_trailers {
        format!("{body}\n{trailer}\n")
    } else {
        format!("{body}\n\n{trailer}\n")
    }
}

#[tauri::command]
pub fn create_commit(
    repo_path: String,
    message: String,
    options: Option<CommitOptions>,
    state: State<'_, GitState>,
) -> Result<String, String> {
    let options = options.unwrap_or_default();

    with_repo_mut(&state, &repo_path, |repo| {
        if message.trim().is_empty() {
            return Err("A commit message is required".to_string());
        }

        let sig = repo.signature().map_err(|_| {
            "No commit identity configured. Set user.name and user.email in your Git config."
                .to_string()
        })?;
        let message = if options.sign_off {
            with_sign_off(&message, &sig)
        } else {
            message.clone()
        };

        let mut merge_heads = Vec::new();
        let _ = repo.mergehead_foreach(|oid| {
            merge_heads.push(*oid);
            true
        });

        let mut index = repo.index().map_err(git_err)?;
        if index.has_conflicts() {
            return Err("Resolve all conflicts before committing".to_string());
        }
        let tree = repo
            .find_tree(index.write_tree().map_err(git_err)?)
            .map_err(git_err)?;

        if options.amend {
            let head = repo.head().map_err(git_err)?;
            let commit = head.peel_to_commit().map_err(git_err)?;
            let oid = commit
                .amend(
                    Some("HEAD"),
                    None,
                    Some(&sig),
                    None,
                    Some(&message),
                    Some(&tree),
                )
                .map_err(git_err)?;
            return Ok(oid.to_string());
        }

        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());

        if !options.allow_empty {
            if let Some(p) = &parent {
                if p.tree_id() == tree.id() && repo.state() == git2::RepositoryState::Clean {
                    return Err("Nothing staged to commit".to_string());
                }
            }
        }

        let merge_commits: Vec<git2::Commit> = merge_heads
            .iter()
            .filter_map(|oid| repo.find_commit(*oid).ok())
            .collect();

        let mut parents: Vec<&git2::Commit> = parent.iter().collect();
        parents.extend(merge_commits.iter());

        let oid = repo
            .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
            .map_err(git_err)?;

        if !merge_commits.is_empty() {
            repo.cleanup_state().map_err(git_err)?;
        }
        Ok(oid.to_string())
    })
}

#[tauri::command]
pub fn amend_commit(
    repo_path: String,
    message: Option<String>,
    state: State<'_, GitState>,
) -> Result<String, String> {
    with_repo(&state, &repo_path, |repo| {
        let head = repo.head().map_err(git_err)?;
        let commit = head.peel_to_commit().map_err(git_err)?;
        let sig = repo.signature().map_err(git_err)?;
        let mut index = repo.index().map_err(git_err)?;
        let tree = repo
            .find_tree(index.write_tree().map_err(git_err)?)
            .map_err(git_err)?;
        let msg = message.unwrap_or_else(|| commit.message().unwrap_or("").to_string());

        let oid = commit
            .amend(
                Some("HEAD"),
                None,
                Some(&sig),
                None,
                Some(&msg),
                Some(&tree),
            )
            .map_err(git_err)?;
        Ok(oid.to_string())
    })
}

#[tauri::command]
pub fn get_head_message(repo_path: String, state: State<'_, GitState>) -> Result<String, String> {
    with_repo(&state, &repo_path, |repo| {
        let head = repo.head().map_err(git_err)?;
        let commit = head.peel_to_commit().map_err(git_err)?;
        Ok(commit.message().unwrap_or("").to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::{ref_rank, with_sign_off, RefInfo};

    fn r(name: &str, kind: &str, is_head: bool) -> RefInfo {
        RefInfo {
            name: name.into(),
            kind: kind.into(),
            remote: None,
            is_head,
        }
    }

    #[test]
    fn refs_order_head_then_local_then_remote_then_tags() {
        let mut refs = [
            r("v1.0", "tag", false),
            r("origin/main", "remote", false),
            r("feature", "local", false),
            r("main", "local", true),
        ];
        refs.sort_by_key(ref_rank);

        let order: Vec<&str> = refs.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(order, ["main", "feature", "origin/main", "v1.0"]);
    }

    fn sig() -> git2::Signature<'static> {
        git2::Signature::now("Ada", "ada@example.com").unwrap()
    }

    #[test]
    fn sign_off_separates_a_plain_message_with_a_blank_line() {
        let out = with_sign_off("Fix the thing", &sig());
        assert_eq!(
            out,
            "Fix the thing\n\nSigned-off-by: Ada <ada@example.com>\n"
        );
    }

    #[test]
    fn sign_off_joins_an_existing_trailer_block() {
        let out = with_sign_off("Fix\n\nCo-authored-by: B <b@x.com>", &sig());
        assert_eq!(
            out,
            "Fix\n\nCo-authored-by: B <b@x.com>\nSigned-off-by: Ada <ada@example.com>\n"
        );
    }

    #[test]
    fn sign_off_is_not_added_twice() {
        let once = with_sign_off("Fix", &sig());
        assert_eq!(with_sign_off(&once, &sig()), once);
    }
}
