use crate::remote::{CreatePrRequest, IssueInfo, PullRequest, RepoRemoteInfo};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::Deserialize;

fn gitlab_headers(token: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("PRIVATE-TOKEN", HeaderValue::from_str(token).unwrap());
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers
}

#[derive(Debug, Deserialize)]
struct GlProject {
    /// Part of GitLab's response shape; deserialized but not acted on.
    #[allow(dead_code)]
    id: u64,
    path_with_namespace: String,
    description: Option<String>,
    default_branch: Option<String>,
    star_count: u64,
    forks_count: u64,
    open_issues_count: Option<u64>,
    web_url: String,
    http_url_to_repo: String,
    ssh_url_to_repo: Option<String>,
    visibility: String,
}

#[derive(Debug, Deserialize)]
struct GlMr {
    id: u64,
    iid: u64,
    title: String,
    description: Option<String>,
    state: String,
    author: GlUser,
    source_branch: String,
    target_branch: String,
    created_at: String,
    updated_at: String,
    web_url: String,
    merge_status: Option<String>,
    draft: bool,
    labels: Vec<String>,
    reviewers: Option<Vec<GlUser>>,
    user_notes_count: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct GlIssue {
    id: u64,
    iid: u64,
    title: String,
    description: Option<String>,
    state: String,
    author: GlUser,
    labels: Vec<String>,
    created_at: String,
    web_url: String,
}

#[derive(Debug, Deserialize)]
struct GlUser {
    username: String,
}

#[tauri::command]
pub async fn gitlab_get_repo(
    base_url: String,
    project_id: String,
    token: String,
) -> Result<RepoRemoteInfo, String> {
    let client = reqwest::Client::new();
    let encoded = urlencoding::encode(&project_id);

    let resp = client
        .get(format!("{}/api/v4/projects/{}", base_url, encoded))
        .headers(gitlab_headers(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitLab API error: {}", resp.status()));
    }

    let project: GlProject = resp.json().await.map_err(|e| e.to_string())?;

    Ok(RepoRemoteInfo {
        full_name: project.path_with_namespace,
        description: project.description,
        default_branch: project.default_branch.unwrap_or_else(|| "main".to_string()),
        stars: project.star_count,
        forks: project.forks_count,
        open_issues: project.open_issues_count.unwrap_or(0),
        url: project.web_url,
        clone_url: project.http_url_to_repo,
        ssh_url: project.ssh_url_to_repo,
        is_private: project.visibility == "private",
        provider: "gitlab".to_string(),
    })
}

#[tauri::command]
pub async fn gitlab_list_mrs(
    base_url: String,
    project_id: String,
    state: Option<String>,
    token: String,
) -> Result<Vec<PullRequest>, String> {
    let client = reqwest::Client::new();
    let encoded = urlencoding::encode(&project_id);
    let state_param = state.unwrap_or_else(|| "opened".to_string());

    let resp = client
        .get(format!(
            "{}/api/v4/projects/{}/merge_requests?state={}&per_page=50",
            base_url, encoded, state_param
        ))
        .headers(gitlab_headers(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitLab API error: {}", resp.status()));
    }

    let mrs: Vec<GlMr> = resp.json().await.map_err(|e| e.to_string())?;

    Ok(mrs
        .into_iter()
        .map(|mr| PullRequest {
            id: mr.id,
            number: mr.iid,
            title: mr.title,
            body: mr.description,
            state: mr.state,
            author: mr.author.username,
            source_branch: mr.source_branch,
            target_branch: mr.target_branch,
            created_at: mr.created_at,
            updated_at: mr.updated_at,
            url: mr.web_url,
            mergeable: mr.merge_status.map(|s| s == "can_be_merged"),
            draft: mr.draft,
            labels: mr.labels,
            reviewers: mr
                .reviewers
                .unwrap_or_default()
                .into_iter()
                .map(|r| r.username)
                .collect(),
            comments_count: mr.user_notes_count.unwrap_or(0),
            provider: "gitlab".to_string(),
        })
        .collect())
}

#[tauri::command]
pub async fn gitlab_create_mr(
    base_url: String,
    project_id: String,
    mr: CreatePrRequest,
    token: String,
) -> Result<PullRequest, String> {
    let client = reqwest::Client::new();
    let encoded = urlencoding::encode(&project_id);

    let body = serde_json::json!({
        "title": mr.title,
        "description": mr.body,
        "source_branch": mr.source_branch,
        "target_branch": mr.target_branch,
    });

    let resp = client
        .post(format!(
            "{}/api/v4/projects/{}/merge_requests",
            base_url, encoded
        ))
        .headers(gitlab_headers(&token))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("GitLab API error: {}", err_text));
    }

    let mr_resp: GlMr = resp.json().await.map_err(|e| e.to_string())?;

    Ok(PullRequest {
        id: mr_resp.id,
        number: mr_resp.iid,
        title: mr_resp.title,
        body: mr_resp.description,
        state: mr_resp.state,
        author: mr_resp.author.username,
        source_branch: mr_resp.source_branch,
        target_branch: mr_resp.target_branch,
        created_at: mr_resp.created_at,
        updated_at: mr_resp.updated_at,
        url: mr_resp.web_url,
        mergeable: mr_resp.merge_status.map(|s| s == "can_be_merged"),
        draft: mr_resp.draft,
        labels: mr_resp.labels,
        reviewers: mr_resp
            .reviewers
            .unwrap_or_default()
            .into_iter()
            .map(|r| r.username)
            .collect(),
        comments_count: mr_resp.user_notes_count.unwrap_or(0),
        provider: "gitlab".to_string(),
    })
}

#[tauri::command]
pub async fn gitlab_merge_mr(
    base_url: String,
    project_id: String,
    mr_iid: u64,
    token: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let encoded = urlencoding::encode(&project_id);

    let resp = client
        .put(format!(
            "{}/api/v4/projects/{}/merge_requests/{}/merge",
            base_url, encoded, mr_iid
        ))
        .headers(gitlab_headers(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Failed to merge MR: {}", resp.status()));
    }

    Ok("MR merged successfully".to_string())
}

#[tauri::command]
pub async fn gitlab_list_issues(
    base_url: String,
    project_id: String,
    state: Option<String>,
    token: String,
) -> Result<Vec<IssueInfo>, String> {
    let client = reqwest::Client::new();
    let encoded = urlencoding::encode(&project_id);
    let state_param = state.unwrap_or_else(|| "opened".to_string());

    let resp = client
        .get(format!(
            "{}/api/v4/projects/{}/issues?state={}&per_page=50",
            base_url, encoded, state_param
        ))
        .headers(gitlab_headers(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitLab API error: {}", resp.status()));
    }

    let issues: Vec<GlIssue> = resp.json().await.map_err(|e| e.to_string())?;

    Ok(issues
        .into_iter()
        .map(|i| IssueInfo {
            id: i.id,
            number: i.iid,
            title: i.title,
            body: i.description,
            state: i.state,
            author: i.author.username,
            labels: i.labels,
            created_at: i.created_at,
            url: i.web_url,
            provider: "gitlab".to_string(),
        })
        .collect())
}
