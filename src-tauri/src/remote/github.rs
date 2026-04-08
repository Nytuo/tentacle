use serde::{Deserialize, Serialize};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, USER_AGENT, ACCEPT};
use crate::remote::{PullRequest, RepoRemoteInfo, CreatePrRequest, IssueInfo};

const GITHUB_API: &str = "https://api.github.com";

fn github_headers(token: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
    headers.insert(USER_AGENT, HeaderValue::from_static("NytGit/0.1.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));
    headers
}

#[derive(Debug, Deserialize)]
struct GhRepo {
    full_name: String,
    description: Option<String>,
    default_branch: String,
    stargazers_count: u64,
    forks_count: u64,
    open_issues_count: u64,
    html_url: String,
    clone_url: String,
    ssh_url: Option<String>,
    private: bool,
}

#[derive(Debug, Deserialize)]
struct GhPr {
    id: u64,
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    user: GhUser,
    head: GhBranchRef,
    base: GhBranchRef,
    created_at: String,
    updated_at: String,
    html_url: String,
    mergeable: Option<bool>,
    draft: Option<bool>,
    labels: Vec<GhLabel>,
    requested_reviewers: Vec<GhUser>,
    comments: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct GhIssue {
    id: u64,
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    user: GhUser,
    labels: Vec<GhLabel>,
    created_at: String,
    html_url: String,
}

#[derive(Debug, Deserialize)]
struct GhUser {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GhBranchRef {
    #[serde(rename = "ref")]
    ref_name: String,
}

#[derive(Debug, Deserialize)]
struct GhLabel {
    name: String,
}

#[derive(Debug, Serialize)]
struct GhCreatePr {
    title: String,
    body: Option<String>,
    head: String,
    base: String,
    draft: bool,
}

#[derive(Debug, Serialize)]
struct GhMergePr {
    merge_method: String,
}

#[tauri::command]
pub async fn github_get_repo(owner: String, repo: String, token: String) -> Result<RepoRemoteInfo, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/repos/{}/{}", GITHUB_API, owner, repo))
        .headers(github_headers(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    let gh_repo: GhRepo = resp.json().await.map_err(|e| e.to_string())?;

    Ok(RepoRemoteInfo {
        full_name: gh_repo.full_name,
        description: gh_repo.description,
        default_branch: gh_repo.default_branch,
        stars: gh_repo.stargazers_count,
        forks: gh_repo.forks_count,
        open_issues: gh_repo.open_issues_count,
        url: gh_repo.html_url,
        clone_url: gh_repo.clone_url,
        ssh_url: gh_repo.ssh_url,
        is_private: gh_repo.private,
        provider: "github".to_string(),
    })
}

#[tauri::command]
pub async fn github_list_prs(owner: String, repo: String, state: Option<String>, token: String) -> Result<Vec<PullRequest>, String> {
    let client = reqwest::Client::new();
    let state_param = state.unwrap_or_else(|| "open".to_string());

    let resp = client
        .get(format!("{}/repos/{}/{}/pulls?state={}&per_page=50", GITHUB_API, owner, repo, state_param))
        .headers(github_headers(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    let prs: Vec<GhPr> = resp.json().await.map_err(|e| e.to_string())?;

    Ok(prs.into_iter().map(|pr| PullRequest {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        author: pr.user.login,
        source_branch: pr.head.ref_name,
        target_branch: pr.base.ref_name,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        url: pr.html_url,
        mergeable: pr.mergeable,
        draft: pr.draft.unwrap_or(false),
        labels: pr.labels.into_iter().map(|l| l.name).collect(),
        reviewers: pr.requested_reviewers.into_iter().map(|r| r.login).collect(),
        comments_count: pr.comments.unwrap_or(0),
        provider: "github".to_string(),
    }).collect())
}

#[tauri::command]
pub async fn github_create_pr(owner: String, repo: String, pr: CreatePrRequest, token: String) -> Result<PullRequest, String> {
    let client = reqwest::Client::new();

    let body = GhCreatePr {
        title: pr.title,
        body: pr.body,
        head: pr.source_branch,
        base: pr.target_branch,
        draft: pr.draft,
    };

    let resp = client
        .post(format!("{}/repos/{}/{}/pulls", GITHUB_API, owner, repo))
        .headers(github_headers(&token))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub API error: {}", err_text));
    }

    let pr: GhPr = resp.json().await.map_err(|e| e.to_string())?;

    Ok(PullRequest {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        author: pr.user.login,
        source_branch: pr.head.ref_name,
        target_branch: pr.base.ref_name,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        url: pr.html_url,
        mergeable: pr.mergeable,
        draft: pr.draft.unwrap_or(false),
        labels: pr.labels.into_iter().map(|l| l.name).collect(),
        reviewers: pr.requested_reviewers.into_iter().map(|r| r.login).collect(),
        comments_count: pr.comments.unwrap_or(0),
        provider: "github".to_string(),
    })
}

#[tauri::command]
pub async fn github_merge_pr(owner: String, repo: String, pr_number: u64, method: Option<String>, token: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let merge_method = method.unwrap_or_else(|| "merge".to_string());

    let body = GhMergePr {
        merge_method,
    };

    let resp = client
        .put(format!("{}/repos/{}/{}/pulls/{}/merge", GITHUB_API, owner, repo, pr_number))
        .headers(github_headers(&token))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Failed to merge PR: {}", err_text));
    }

    Ok("PR merged successfully".to_string())
}

#[tauri::command]
pub async fn github_close_pr(owner: String, repo: String, pr_number: u64, token: String) -> Result<(), String> {
    let client = reqwest::Client::new();

    let resp = client
        .patch(format!("{}/repos/{}/{}/pulls/{}", GITHUB_API, owner, repo, pr_number))
        .headers(github_headers(&token))
        .json(&serde_json::json!({ "state": "closed" }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Failed to close PR: {}", resp.status()));
    }

    Ok(())
}

#[tauri::command]
pub async fn github_list_issues(owner: String, repo: String, state: Option<String>, token: String) -> Result<Vec<IssueInfo>, String> {
    let client = reqwest::Client::new();
    let state_param = state.unwrap_or_else(|| "open".to_string());

    let resp = client
        .get(format!("{}/repos/{}/{}/issues?state={}&per_page=50", GITHUB_API, owner, repo, state_param))
        .headers(github_headers(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    let issues: Vec<GhIssue> = resp.json().await.map_err(|e| e.to_string())?;

    Ok(issues.into_iter().map(|i| IssueInfo {
        id: i.id,
        number: i.number,
        title: i.title,
        body: i.body,
        state: i.state,
        author: i.user.login,
        labels: i.labels.into_iter().map(|l| l.name).collect(),
        created_at: i.created_at,
        url: i.html_url,
        provider: "github".to_string(),
    }).collect())
}

#[tauri::command]
pub async fn github_list_repos(token: String) -> Result<Vec<RepoRemoteInfo>, String> {
    let client = reqwest::Client::new();

    let resp = client
        .get(format!("{}/user/repos?per_page=100&sort=updated", GITHUB_API))
        .headers(github_headers(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    let repos: Vec<GhRepo> = resp.json().await.map_err(|e| e.to_string())?;

    Ok(repos.into_iter().map(|r| RepoRemoteInfo {
        full_name: r.full_name,
        description: r.description,
        default_branch: r.default_branch,
        stars: r.stargazers_count,
        forks: r.forks_count,
        open_issues: r.open_issues_count,
        url: r.html_url,
        clone_url: r.clone_url,
        ssh_url: r.ssh_url,
        is_private: r.private,
        provider: "github".to_string(),
    }).collect())
}
