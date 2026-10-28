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

#[derive(Debug, Serialize)]
struct OpenAiMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct OpenAiChatRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct OpenAiMessageResponse {
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatChoice {
    message: OpenAiMessageResponse,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatResponse {
    choices: Vec<OpenAiChatChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelItem {
    id: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelList {
    data: Option<Vec<OpenAiModelItem>>,
}

async fn call_local_ai(
    base: &str,
    client: &reqwest::Client,
    model: &str,
    system: &str,
    prompt: &str,
) -> Result<String, String> {
    if base.ends_with("/v1") {
        let req = OpenAiChatRequest {
            model: model.to_string(),
            messages: vec![
                OpenAiMessage {
                    role: "system".into(),
                    content: system.to_string(),
                },
                OpenAiMessage {
                    role: "user".into(),
                    content: prompt.to_string(),
                },
            ],
            stream: false,
        };
        let resp = client
            .post(format!("{base}/chat/completions"))
            .json(&req)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("AI request failed ({status}): {text}"));
        }
        let parsed: OpenAiChatResponse = resp.json().await.map_err(|e| e.to_string())?;
        return parsed
            .choices
            .first()
            .map(|c| c.message.content.trim().to_string())
            .ok_or_else(|| "AI returned empty response".to_string());
    }

    let req = OllamaRequest {
        model: model.to_string(),
        prompt: prompt.to_string(),
        system: Some(system.to_string()),
        stream: false,
    };

    let resp = client
        .post(format!("{base}/api/generate"))
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        let result: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;
        return Ok(result.response.trim().to_string());
    }

    // Fallback: check OpenAI-compatible /v1/chat/completions
    let open_ai_req = OpenAiChatRequest {
        model: model.to_string(),
        messages: vec![
            OpenAiMessage {
                role: "system".into(),
                content: system.to_string(),
            },
            OpenAiMessage {
                role: "user".into(),
                content: prompt.to_string(),
            },
        ],
        stream: false,
    };
    if let Ok(v1_resp) = client
        .post(format!("{base}/v1/chat/completions"))
        .json(&open_ai_req)
        .send()
        .await
    {
        if v1_resp.status().is_success() {
            if let Ok(parsed) = v1_resp.json::<OpenAiChatResponse>().await {
                if let Some(choice) = parsed.choices.first() {
                    return Ok(choice.message.content.trim().to_string());
                }
            }
        }
    }

    Err(format!("AI request failed (HTTP {})", resp.status()))
}

#[tauri::command]
pub async fn ai_check_ollama(endpoint: Option<String>, allow_remote: Option<bool>) -> Result<bool, String> {
    let (base, local) = resolve_endpoint(endpoint.as_deref(), allow_remote.unwrap_or(false))?;
    let client = client(Duration::from_secs(3), local)?;

    if let Ok(resp) = client.get(&base).send().await {
        if resp.status().is_success() {
            return Ok(true);
        }
    }
    // Also try /v1/models if base doesn't end with /v1
    let v1_url = if base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    };
    match client.get(v1_url).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn ai_list_models(endpoint: Option<String>, allow_remote: Option<bool>) -> Result<Vec<OllamaModel>, String> {
    let (base, local) = resolve_endpoint(endpoint.as_deref(), allow_remote.unwrap_or(false))?;
    let client = client(Duration::from_secs(10), local)?;

    // Try Ollama endpoint first
    if let Ok(resp) = client.get(format!("{base}/api/tags")).send().await {
        if resp.status().is_success() {
            if let Ok(list) = resp.json::<OllamaModelList>().await {
                return Ok(list.models.unwrap_or_default());
            }
        }
    }

    // Try OpenAI-compatible /v1/models
    let v1_url = if base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    };
    let resp = client.get(v1_url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err("Failed to list models".to_string());
    }
    let list: OpenAiModelList = resp.json().await.map_err(|e| e.to_string())?;
    let models = list
        .data
        .unwrap_or_default()
        .into_iter()
        .map(|m| OllamaModel {
            name: m.id,
            size: None,
        })
        .collect();
    Ok(models)
}

#[tauri::command]
pub async fn ai_generate_commit_message(
    diff: String,
    style: Option<String>,
    model: Option<String>,
    endpoint: Option<String>,
    allow_remote: Option<bool>,
) -> Result<String, String> {
    let (base, local) = resolve_endpoint(endpoint.as_deref(), allow_remote.unwrap_or(false))?;
    let client = client(Duration::from_secs(60), local)?;
    let model_name = model.unwrap_or_else(|| "mistral".to_string());

    let style_str = style.as_deref().unwrap_or("conventional");
    let (system, prompt) = match style_str {
        "detailed" => (
            "You are a senior software developer writing clear, comprehensive commit messages. Output a conventional commit subject line (< 72 chars), a blank line, and a concise bulleted list of rationale and changes. Only output the commit message, no markdown wrappers.",
            format!("Write a detailed commit message for this diff:\n\n{}", diff),
        ),
        "gitmoji" => (
            "You are a developer who uses gitmoji. Write a commit message starting with an appropriate gitmoji (e.g. :sparkles: feat:, :bug: fix:, :recycle: refactor:, :books: docs:, :white_check_mark: test:, :wrench: chore:) followed by a concise description under 72 chars. Only output the commit message.",
            format!("Write a gitmoji commit message for this diff:\n\n{}", diff),
        ),
        "short" => (
            "You are a developer writing ultra-concise commit titles under 50 characters without fluff. Only output the commit message line.",
            format!("Write a brief one-line commit message for this diff:\n\n{}", diff),
        ),
        _ => (
            "You are a senior software developer. Write conventional commit messages that are concise and descriptive. Use the format: type(scope): description. Types: feat, fix, docs, style, refactor, test, chore. Keep the message under 72 characters. Only output the commit message, nothing else.",
            format!("Generate a concise conventional commit message for the following diff. Only output the commit message, nothing else.\n\n{}", diff),
        ),
    };

    call_local_ai(&base, &client, &model_name, system, &prompt).await
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

    let system = "You are a senior software developer writing clear pull request descriptions. Be concise but thorough. Use markdown formatting.";
    let prompt = format!(
        "Generate a pull request description for a PR titled \"{}\".\n\nThe diff:\n{}\n\nWrite a clear PR description with: Summary, Changes Made (bullet points), and Testing Notes.",
        title, diff
    );

    call_local_ai(&base, &client, &model_name, system, &prompt).await
}

#[tauri::command]
pub async fn ai_review_diff(
    diff: String,
    focus: Option<String>,
    model: Option<String>,
    endpoint: Option<String>,
    allow_remote: Option<bool>,
) -> Result<String, String> {
    let (base, local) = resolve_endpoint(endpoint.as_deref(), allow_remote.unwrap_or(false))?;
    let client = client(Duration::from_secs(120), local)?;
    let model_name = model.unwrap_or_else(|| "mistral".to_string());

    let focus_str = focus.as_deref().unwrap_or("general");
    let system = "You are a principal engineer and security auditor conducting an expert code review. \
Be direct, constructive, and highly technical. Structure your response in clean GitHub markdown with these sections:\n\
### 🎯 Executive Summary\n\
### 🛡️ Security & Reliability Risk\n\
### ⚠️ Bugs, Edge Cases & Regressions\n\
### 💡 Optimization & Code Hygiene\n\
### 🧪 Recommended Test Cases";

    let prompt = format!(
        "Please review the following git diff. Review focus: {focus_str}.\n\nDiff:\n{diff}"
    );

    call_local_ai(&base, &client, &model_name, system, &prompt).await
}

#[tauri::command]
pub async fn ai_generate_changelog(
    commits_or_diff: String,
    style: Option<String>,
    model: Option<String>,
    endpoint: Option<String>,
    allow_remote: Option<bool>,
) -> Result<String, String> {
    let (base, local) = resolve_endpoint(endpoint.as_deref(), allow_remote.unwrap_or(false))?;
    let client = client(Duration::from_secs(120), local)?;
    let model_name = model.unwrap_or_else(|| "mistral".to_string());

    let style_str = style.as_deref().unwrap_or("keep-a-changelog");
    let system = if style_str == "conventional" {
        "You are a release manager. Format the changelog grouped by conventional commit types (Features, Bug Fixes, Performance, Refactoring, Maintenance). Use Markdown."
    } else {
        "You are a release engineer. Generate a Keep a Changelog compliant changelog in Markdown with categories: Added, Changed, Fixed, Security, Removed. Exclude merge commits or minor chore noise."
    };

    let prompt = format!(
        "Generate a polished changelog from the following git history / diff:\n\n{}",
        commits_or_diff
    );

    call_local_ai(&base, &client, &model_name, system, &prompt).await
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
