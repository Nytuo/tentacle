use crate::secrets;
use git2::{Cred, CredentialType, RemoteCallbacks};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct TransferProgress {
    pub received_objects: usize,
    pub total_objects: usize,
    pub indexed_objects: usize,
    pub received_bytes: usize,

    pub stage: String,
}

pub fn host_of(url: &str) -> Option<String> {
    if let Some(rest) = url.split("://").nth(1) {
        let authority = rest.split('/').next()?;

        let host = authority.rsplit('@').next()?;
        return Some(host.split(':').next()?.to_string());
    }

    let colon = url.find(':')?;
    if url[..colon].contains('/') {
        return None;
    }
    let authority = &url[..colon];
    let host = authority.rsplit('@').next()?;
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

fn ssh_key_candidates() -> Vec<PathBuf> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let ssh = home.join(".ssh");
    ["id_ed25519", "id_ecdsa", "id_rsa", "id_dsa"]
        .iter()
        .map(|n| ssh.join(n))
        .filter(|p| p.exists())
        .collect()
}

fn credential_helper(url: &str) -> Option<(String, String)> {
    let config = git2::Config::open_default().ok()?;
    let mut helper = git2::CredentialHelper::new(url);
    helper.config(&config);
    helper.execute()
}

#[derive(Default)]
struct Attempts {
    agent: bool,
    keys: usize,
    token: bool,
    helper: bool,
    default: bool,
}

pub fn callbacks_for(url: &str) -> RemoteCallbacks<'static> {
    let url = url.to_string();
    let host = host_of(&url);
    let attempts = Arc::new(Mutex::new(Attempts::default()));
    let keys = ssh_key_candidates();

    let mut cb = RemoteCallbacks::new();
    cb.credentials(move |_url, username_from_url, allowed| {
        let mut a = attempts.lock().unwrap();
        let user = username_from_url.unwrap_or("git");

        if allowed.contains(CredentialType::SSH_KEY) {
            if !a.agent {
                a.agent = true;
                if let Ok(cred) = Cred::ssh_key_from_agent(user) {
                    return Ok(cred);
                }
            }
            while a.keys < keys.len() {
                let key = keys[a.keys].clone();
                a.keys += 1;

                let pass = key
                    .file_name()
                    .and_then(|n| n.to_str())
                    .and_then(|n| secrets::read(&format!("ssh:{n}")).ok().flatten());
                if let Ok(cred) = Cred::ssh_key(user, None, &key, pass.as_deref()) {
                    return Ok(cred);
                }
            }
        }

        if allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
            if !a.token {
                a.token = true;
                if let Some(host) = &host {
                    if let Ok(Some(token)) = secrets::read(&format!("git:{host}")) {
                        let login = username_from_url.unwrap_or("oauth2");
                        if let Ok(cred) = Cred::userpass_plaintext(login, &token) {
                            return Ok(cred);
                        }
                    }
                }
            }
            if !a.helper {
                a.helper = true;
                if let Some((u, p)) = credential_helper(&url) {
                    if let Ok(cred) = Cred::userpass_plaintext(&u, &p) {
                        return Ok(cred);
                    }
                }
            }
        }

        if allowed.contains(CredentialType::USERNAME) && !a.default {
            a.default = true;
            return Cred::username(user);
        }

        Err(git2::Error::from_str(
            "No usable credentials. Add a token for this host in Settings → Privacy, \
             load an SSH key into your agent, or configure a credential helper.",
        ))
    });

    cb.certificate_check(|_cert, _host| Ok(git2::CertificateCheckStatus::CertificatePassthrough));
    cb
}

pub fn with_progress<F>(cb: &mut RemoteCallbacks<'_>, sink: F)
where
    F: Fn(TransferProgress) + Send + 'static,
{
    let sink = Arc::new(sink);
    let last = Arc::new(AtomicUsize::new(0));

    let s = sink.clone();
    let l = last.clone();
    cb.transfer_progress(move |stats| {
        let received = stats.received_objects();
        if received.saturating_sub(l.load(Ordering::Relaxed)) >= 64
            || received == stats.total_objects()
        {
            l.store(received, Ordering::Relaxed);
            s(TransferProgress {
                received_objects: received,
                total_objects: stats.total_objects(),
                indexed_objects: stats.indexed_objects(),
                received_bytes: stats.received_bytes(),
                stage: "Receiving objects".to_string(),
            });
        }
        true
    });

    let s = sink.clone();
    cb.push_transfer_progress(move |current, total, bytes| {
        s(TransferProgress {
            received_objects: current,
            total_objects: total,
            indexed_objects: current,
            received_bytes: bytes,
            stage: "Writing objects".to_string(),
        });
    });
}

#[cfg(test)]
mod tests {
    use super::host_of;

    #[test]
    fn extracts_host_from_every_url_shape() {
        assert_eq!(
            host_of("https://github.com/a/b.git").as_deref(),
            Some("github.com")
        );
        assert_eq!(
            host_of("https://user@gitlab.com/a/b").as_deref(),
            Some("gitlab.com")
        );
        assert_eq!(host_of("https://host:8443/a/b").as_deref(), Some("host"));
        assert_eq!(
            host_of("git@github.com:a/b.git").as_deref(),
            Some("github.com")
        );
        assert_eq!(
            host_of("ssh://git@bitbucket.org/a/b").as_deref(),
            Some("bitbucket.org")
        );
        assert_eq!(host_of("/local/path"), None);
        assert_eq!(host_of("../relative/repo"), None);
    }
}
