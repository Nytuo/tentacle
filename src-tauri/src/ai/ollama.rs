use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::time::Duration;

const DEFAULT_ENDPOINT: &str = "http://localhost:11434";

fn is_loopback(host: &str) -> bool {
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    bare.eq_ignore_ascii_case("localhost")
        || bare.parse::<IpAddr>().map(|ip| ip.is_loopback()).unwrap_or(false)
}

pub fn resolve_endpoint(requested: Option<&str>, allow_remote: bool) -> Result<(String, bool), String> {
    let raw = requested
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_ENDPOINT);
    let url = reqwest::Url::parse(raw).map_err(|e| format!("Invalid AI endpoint '{raw}': {e}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(format!("AI endpoint must be http or https, not {}", url.scheme()));
    }
    let host = url.host_str().ok_or_else(|| format!("AI endpoint '{raw}' has no host"))?;
    let local = is_loopback(host);
    if !local && !allow_remote {
        return Err(format!(
            "The AI endpoint {host} is not on this machine, so your diffs would be sent to it. \
             Allow remote AI endpoints in Settings → Workspace if that is intended."
        ));
    }
    Ok((raw.trim_end_matches('/').to_string(), local))
}

fn client(timeout: Duration, local: bool) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().timeout(timeout);
    if local {
        builder = builder.no_proxy();
    }
    builder.build().map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    system: Option<String>,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct OllamaResponse {
    response: String,

    #[allow(dead_code)]
    done: bool,
}

#[derive(Debug, Deserialize)]
struct OllamaModelList {
    models: Option<Vec<OllamaModel>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub size: Option<u64>,
}

#[tauri::command]
pub async fn ai_check_ollama(endpoint: Option<String>, allow_remote: Option<bool>) -> Result<bool, String> {
    let (base, local) = resolve_endpoint(endpoint.as_deref(), allow_remote.unwrap_or(false))?;
    let client = client(Duration::from_secs(3), local)?;

    match client.get(&base).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn ai_list_models(endpoint: Option<String>, allow_remote: Option<bool>) -> Result<Vec<OllamaModel>, String> {
    let (base, local) = resolve_endpoint(endpoint.as_deref(), allow_remote.unwrap_or(false))?;
    let client = client(Duration::from_secs(10), local)?;

    let resp = client
        .get(format!("{base}/api/tags"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err("Failed to list models".to_string());
    }

    let list: OllamaModelList = resp.json().await.map_err(|e| e.to_string())?;
    Ok(list.models.unwrap_or_default())
}

#[tauri::command]
pub async fn ai_generate_commit_message(
    diff: String,
    model: Option<String>,
    endpoint: Option<String>,
    allow_remote: Option<bool>,
) -> Result<String, String> {
    let (base, local) = resolve_endpoint(endpoint.as_deref(), allow_remote.unwrap_or(false))?;
    let client = client(Duration::from_secs(60), local)?;

    let model_name = model.unwrap_or_else(|| "mistral".to_string());

    let request = OllamaRequest {
        model: model_name,
        prompt: format!("Generate a concise conventional commit message for the following diff. Only output the commit message, nothing else.\n\n{}", diff),
        system: Some("You are a senior software developer. Write conventional commit messages that are concise and descriptive. Use the format: type(scope): description. Types: feat, fix, docs, style, refactor, test, chore. Keep the message under 72 characters.".to_string()),
        stream: false,
    };

    let resp = client
        .post(format!("{base}/api/generate"))
        .json(&request)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err("Failed to generate commit message".to_string());
    }

    let result: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(result.response.trim().to_string())
}

#[tauri::command]
pub async fn ai_generate_pr_description(
    diff: String,
    title: String,
    model: Option<String>,
    endpoint: Option<String>,
    allow_remote: Option<bool>,
) -> Result<String, String> {
    let (base, local) = resolve_endpoint(endpoint.as_deref(), allow_remote.unwrap_or(false))?;
    let client = client(Duration::from_secs(120), local)?;

    let model_name = model.unwrap_or_else(|| "mistral".to_string());

    let request = OllamaRequest {
        model: model_name,
        prompt: format!(
            "Generate a pull request description for a PR titled \"{}\".\n\nThe diff:\n{}\n\nWrite a clear PR description with: Summary, Changes Made (bullet points), and Testing Notes.",
            title, diff
        ),
        system: Some("You are a senior software developer writing clear pull request descriptions. Be concise but thorough. Use markdown formatting.".to_string()),
        stream: false,
    };

    let resp = client
        .post(format!("{base}/api/generate"))
        .json(&request)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err("Failed to generate PR description".to_string());
    }

    let result: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(result.response.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::resolve_endpoint;

    #[test]
    fn defaults_to_local_ollama() {
        let (url, local) = resolve_endpoint(None, false).unwrap();
        assert_eq!(url, "http://localhost:11434");
        assert!(local);
        assert_eq!(resolve_endpoint(Some("  "), false).unwrap().0, "http://localhost:11434");
    }

    #[test]
    fn accepts_every_loopback_form() {
        for u in ["http://127.0.0.1:11434", "http://[::1]:11434/", "http://LOCALHOST:1"] {
            let (_, local) = resolve_endpoint(Some(u), false).unwrap_or_else(|e| panic!("{u}: {e}"));
            assert!(local, "{u} is loopback");
        }
    }

    #[test]
    fn refuses_a_remote_endpoint_unless_allowed() {
        let err = resolve_endpoint(Some("http://192.168.1.20:11434"), false).unwrap_err();
        assert!(err.contains("not on this machine"), "{err}");
        assert!(resolve_endpoint(Some("https://ai.example.com"), false).is_err());

        let (url, local) = resolve_endpoint(Some("https://ai.example.com/"), true).unwrap();
        assert_eq!(url, "https://ai.example.com");
        assert!(!local);
    }

    #[test]
    fn rejects_non_http_schemes_and_garbage() {
        assert!(resolve_endpoint(Some("file:///etc/passwd"), true).is_err());
        assert!(resolve_endpoint(Some("not a url"), true).is_err());
    }
}
