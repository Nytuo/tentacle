use crate::git::GitState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagInfo {
    pub name: String,
    pub oid: String,
    pub message: Option<String>,
    pub tagger: Option<String>,
    pub is_annotated: bool,
}

#[tauri::command]
pub fn get_tags(state: State<'_, GitState>) -> Result<Vec<TagInfo>, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let mut tags = Vec::new();

    repo.tag_foreach(|oid, name_bytes| {
        let name = String::from_utf8_lossy(name_bytes)
            .trim_start_matches("refs/tags/")
            .to_string();

        if let Ok(obj) = repo.find_object(oid, None) {
            if let Ok(tag) = obj.peel_to_tag() {
                tags.push(TagInfo {
                    name: name.clone(),
                    oid: tag.target_id().to_string(),
                    message: tag.message().map(|m| m.to_string()),
                    tagger: tag.tagger().and_then(|t| t.name().map(|n| n.to_string())),
                    is_annotated: true,
                });
            } else {
                tags.push(TagInfo {
                    name,
                    oid: oid.to_string(),
                    message: None,
                    tagger: None,
                    is_annotated: false,
                });
            }
        }
        true
    })
    .map_err(|e| e.message().to_string())?;

    tags.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(tags)
}

#[tauri::command]
pub fn create_tag(
    name: String,
    message: Option<String>,
    target_oid: Option<String>,
    state: State<'_, GitState>,
) -> Result<String, String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    let target = if let Some(ref oid_str) = target_oid {
        let oid = git2::Oid::from_str(oid_str).map_err(|e| e.message().to_string())?;
        repo.find_object(oid, None)
            .map_err(|e| e.message().to_string())?
    } else {
        let head = repo.head().map_err(|e| e.message().to_string())?;
        head.peel(git2::ObjectType::Commit)
            .map_err(|e| e.message().to_string())?
    };

    if let Some(msg) = message {
        let sig = repo.signature().map_err(|e| e.message().to_string())?;
        let oid = repo
            .tag(&name, &target, &sig, &msg, false)
            .map_err(|e| e.message().to_string())?;
        Ok(oid.to_string())
    } else {
        repo.tag_lightweight(&name, &target, false)
            .map_err(|e| e.message().to_string())?;
        Ok(target.id().to_string())
    }
}

#[tauri::command]
pub fn delete_tag(name: String, state: State<'_, GitState>) -> Result<(), String> {
    let repo_lock = state.repo.lock().unwrap();
    let repo = repo_lock.as_ref().ok_or("No repository open")?;

    repo.tag_delete(&name).map_err(|e| e.message().to_string())
}
