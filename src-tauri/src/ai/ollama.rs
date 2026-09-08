use serde::{Deserialize, Serialize};

const OLLAMA_API: &str = "http://localhost:11434";

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
pub async fn ai_check_ollama() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(OLLAMA_API).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn ai_list_models() -> Result<Vec<OllamaModel>, String> {
    let client = reqwest::Client::new();

    let resp = client
        .get(format!("{}/api/tags", OLLAMA_API))
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
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let model_name = model.unwrap_or_else(|| "mistral".to_string());

    let request = OllamaRequest {
        model: model_name,
        prompt: format!("Generate a concise conventional commit message for the following diff. Only output the commit message, nothing else.\n\n{}", diff),
        system: Some("You are a senior software developer. Write conventional commit messages that are concise and descriptive. Use the format: type(scope): description. Types: feat, fix, docs, style, refactor, test, chore. Keep the message under 72 characters.".to_string()),
        stream: false,
    };

    let resp = client
        .post(format!("{}/api/generate", OLLAMA_API))
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
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

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
        .post(format!("{}/api/generate", OLLAMA_API))
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
