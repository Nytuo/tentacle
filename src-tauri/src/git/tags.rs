use crate::git::{git_err, with_repo, GitState};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagInfo {
    pub name: String,

    pub oid: String,
    pub message: Option<String>,
    pub tagger: Option<String>,
    pub tag_time: Option<i64>,
    pub is_annotated: bool,
}

#[tauri::command]
pub fn get_tags(repo_path: String, state: State<'_, GitState>) -> Result<Vec<TagInfo>, String> {
    with_repo(&state, &repo_path, |repo| {
        let mut tags = Vec::new();

        repo.tag_foreach(|oid, name_bytes| {
            let name = String::from_utf8_lossy(name_bytes)
                .trim_start_matches("refs/tags/")
                .to_string();

            if let Ok(obj) = repo.find_object(oid, None) {
                match obj.peel_to_tag() {
                    Ok(tag) => {
                        let target = tag
                            .target()
                            .ok()
                            .and_then(|o| o.peel_to_commit().ok())
                            .map(|c| c.id())
                            .unwrap_or_else(|| tag.target_id());
                        tags.push(TagInfo {
                            name,
                            oid: target.to_string(),
                            message: tag.message().map(|m| m.trim().to_string()),
                            tagger: tag.tagger().and_then(|t| t.name().map(|n| n.to_string())),
                            tag_time: tag.tagger().map(|t| t.when().seconds()),
                            is_annotated: true,
                        });
                    }
                    Err(_) => {
                        let time = obj
                            .peel_to_commit()
                            .ok()
                            .map(|c| c.author().when().seconds());
                        tags.push(TagInfo {
                            name,
                            oid: oid.to_string(),
                            message: None,
                            tagger: None,
                            tag_time: time,
                            is_annotated: false,
                        });
                    }
                }
            }
            true
        })
        .map_err(git_err)?;

        tags.sort_by(|a, b| {
            b.tag_time
                .cmp(&a.tag_time)
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(tags)
    })
}

#[tauri::command]
pub fn create_tag(
    repo_path: String,
    name: String,
    oid: Option<String>,
    message: Option<String>,
    force: Option<bool>,
    state: State<'_, GitState>,
) -> Result<String, String> {
    with_repo(&state, &repo_path, |repo| {
        let target = match &oid {
            Some(o) => repo.revparse_single(o).map_err(git_err)?,
            None => repo
                .head()
                .map_err(git_err)?
                .peel(git2::ObjectType::Commit)
                .map_err(git_err)?,
        };
        let force = force.unwrap_or(false);

        let tag_oid = match &message {
            Some(msg) if !msg.trim().is_empty() => {
                let sig = repo.signature().map_err(|_| {
                    "An annotated tag needs user.name and user.email in your Git config."
                        .to_string()
                })?;
                repo.tag(&name, &target, &sig, msg, force)
                    .map_err(git_err)?
            }
            _ => repo
                .tag_lightweight(&name, &target, force)
                .map_err(git_err)?,
        };

        Ok(tag_oid.to_string())
    })
}

#[tauri::command]
pub fn delete_tag(
    repo_path: String,
    name: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        repo.tag_delete(&name).map_err(git_err)
    })
}
