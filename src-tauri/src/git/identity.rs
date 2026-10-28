use crate::git::{git_err, with_repo, GitState};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IdentityField {
    pub value: Option<String>,
    pub scope: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Identity {
    pub name: IdentityField,
    pub email: IdentityField,
}

fn field(repo: &git2::Repository, key: &str) -> Result<IdentityField, String> {
    let mut config = repo.config().map_err(git_err)?;
    let local = config
        .open_level(git2::ConfigLevel::Local)
        .ok()
        .and_then(|c| c.get_string(key).ok());
    if let Some(value) = local {
        return Ok(IdentityField { value: Some(value), scope: "repository".into() });
    }
    match config.snapshot().map_err(git_err)?.get_string(key) {
        Ok(value) => Ok(IdentityField { value: Some(value), scope: "global".into() }),
        Err(_) => Ok(IdentityField { value: None, scope: "unset".into() }),
    }
}

pub fn identity_of(repo: &git2::Repository) -> Result<Identity, String> {
    Ok(Identity {
        name: field(repo, "user.name")?,
        email: field(repo, "user.email")?,
    })
}

#[tauri::command]
pub fn get_identity(repo_path: String, state: State<'_, GitState>) -> Result<Identity, String> {
    with_repo(&state, &repo_path, identity_of)
}

pub fn set_identity_in(
    repo: &git2::Repository,
    name: Option<&str>,
    email: Option<&str>,
) -> Result<(), String> {
    let mut local = repo
        .config()
        .map_err(git_err)?
        .open_level(git2::ConfigLevel::Local)
        .map_err(git_err)?;
    for (key, value) in [("user.name", name), ("user.email", email)] {
        match value.map(str::trim) {
            None => {}
            Some("") => match local.remove(key) {
                Ok(()) => {}
                Err(e) if e.code() == git2::ErrorCode::NotFound => {}
                Err(e) => return Err(git_err(e)),
            },
            Some(v) => local.set_str(key, v).map_err(git_err)?,
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_identity(
    repo_path: String,
    name: Option<String>,
    email: Option<String>,
    state: State<'_, GitState>,
) -> Result<Identity, String> {
    with_repo(&state, &repo_path, |repo| {
        set_identity_in(repo, name.as_deref(), email.as_deref())?;
        identity_of(repo)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_repository_identity_overrides_and_can_be_cleared() {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();

        set_identity_in(&repo, Some("Work Name"), Some("me@work.example")).unwrap();
        let id = identity_of(&repo).unwrap();
        assert_eq!(id.email.value.as_deref(), Some("me@work.example"));
        assert_eq!(id.email.scope, "repository");

        set_identity_in(&repo, None, Some("")).unwrap();
        let id = identity_of(&repo).unwrap();
        assert_ne!(id.email.scope, "repository");
        assert_eq!(id.name.scope, "repository", "an untouched field is left alone");
    }
}
