use crate::remote::{CreatePrRequest, PullRequest, RepoRemoteInfo};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::Deserialize;

fn bitbucket_headers(token: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers
}

const BB_API: &str = "https://api.bitbucket.org/2.0";

#[derive(Debug, Deserialize)]
struct BbRepo {
    full_name: String,
    description: Option<String>,
    mainbranch: Option<BbMainBranch>,
    links: BbLinks,
    is_private: bool,
}

#[derive(Debug, Deserialize)]
struct BbMainBranch {
    name: String,
}

#[derive(Debug, Deserialize)]
struct BbLinks {
    html: BbLink,
    clone: Vec<BbCloneLink>,
}

#[derive(Debug, Deserialize)]
struct BbLink {
    href: String,
}

#[derive(Debug, Deserialize)]
struct BbCloneLink {
    name: String,
    href: String,
}

#[derive(Debug, Deserialize)]
struct BbPrList {
    values: Vec<BbPr>,
}

#[derive(Debug, Deserialize)]
struct BbPr {
    id: u64,
    title: String,
    description: Option<String>,
    state: String,
    author: BbUser,
    source: BbPrRef,
    destination: BbPrRef,
    created_on: String,
    updated_on: String,
    links: BbPrLinks,
    comment_count: Option<u64>,
    reviewers: Option<Vec<BbUser>>,
}

#[derive(Debug, Deserialize)]
struct BbUser {
    display_name: String,
}

#[derive(Debug, Deserialize)]
struct BbPrRef {
    branch: BbPrBranch,
}

#[derive(Debug, Deserialize)]
struct BbPrBranch {
    name: String,
}

#[derive(Debug, Deserialize)]
struct BbPrLinks {
    html: BbLink,
}

#[tauri::command]
pub async fn bitbucket_get_repo(
    workspace: String,
    repo_slug: String,
    token: String,
) -> Result<RepoRemoteInfo, String> {
    let client = reqwest::Client::new();

    let resp = client
        .get(format!(
            "{}/repositories/{}/{}",
            BB_API, workspace, repo_slug
        ))
        .headers(bitbucket_headers(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Bitbucket API error: {}", resp.status()));
    }

    let repo: BbRepo = resp.json().await.map_err(|e| e.to_string())?;

    let clone_url = repo
        .links
        .clone
        .iter()
        .find(|c| c.name == "https")
        .map(|c| c.href.clone())
        .unwrap_or_default();
    let ssh_url = repo
        .links
        .clone
        .iter()
        .find(|c| c.name == "ssh")
        .map(|c| c.href.clone());

    Ok(RepoRemoteInfo {
        full_name: repo.full_name,
        description: repo.description,
        default_branch: repo
            .mainbranch
            .map(|b| b.name)
            .unwrap_or_else(|| "main".to_string()),
        stars: 0,
        forks: 0,
        open_issues: 0,
        url: repo.links.html.href,
        clone_url,
        ssh_url,
        is_private: repo.is_private,
        provider: "bitbucket".to_string(),
    })
}

#[tauri::command]
pub async fn bitbucket_list_prs(
    workspace: String,
    repo_slug: String,
    state: Option<String>,
    token: String,
) -> Result<Vec<PullRequest>, String> {
    let client = reqwest::Client::new();
    let state_param = state.unwrap_or_else(|| "OPEN".to_string());

    let resp = client
        .get(format!(
            "{}/repositories/{}/{}/pullrequests?state={}&pagelen=50",
            BB_API, workspace, repo_slug, state_param
        ))
        .headers(bitbucket_headers(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Bitbucket API error: {}", resp.status()));
    }

    let pr_list: BbPrList = resp.json().await.map_err(|e| e.to_string())?;

    Ok(pr_list
        .values
        .into_iter()
        .map(|pr| PullRequest {
            id: pr.id,
            number: pr.id,
            title: pr.title,
            body: pr.description,
            state: pr.state.to_lowercase(),
            author: pr.author.display_name,
            source_branch: pr.source.branch.name,
            target_branch: pr.destination.branch.name,
            created_at: pr.created_on,
            updated_at: pr.updated_on,
            url: pr.links.html.href,
            mergeable: None,
            draft: false,
            labels: vec![],
            reviewers: pr
                .reviewers
                .unwrap_or_default()
                .into_iter()
                .map(|r| r.display_name)
                .collect(),
            comments_count: pr.comment_count.unwrap_or(0),
            provider: "bitbucket".to_string(),
        })
        .collect())
}

#[tauri::command]
pub async fn bitbucket_create_pr(
    workspace: String,
    repo_slug: String,
    pr: CreatePrRequest,
    token: String,
) -> Result<PullRequest, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "title": pr.title,
        "description": pr.body,
        "source": { "branch": { "name": pr.source_branch } },
        "destination": { "branch": { "name": pr.target_branch } },
        "close_source_branch": false,
    });

    let resp = client
        .post(format!(
            "{}/repositories/{}/{}/pullrequests",
            BB_API, workspace, repo_slug
        ))
        .headers(bitbucket_headers(&token))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Bitbucket API error: {}", err_text));
    }

    let pr_resp: BbPr = resp.json().await.map_err(|e| e.to_string())?;

    Ok(PullRequest {
        id: pr_resp.id,
        number: pr_resp.id,
        title: pr_resp.title,
        body: pr_resp.description,
        state: pr_resp.state.to_lowercase(),
        author: pr_resp.author.display_name,
        source_branch: pr_resp.source.branch.name,
        target_branch: pr_resp.destination.branch.name,
        created_at: pr_resp.created_on,
        updated_at: pr_resp.updated_on,
        url: pr_resp.links.html.href,
        mergeable: None,
        draft: false,
        labels: vec![],
        reviewers: pr_resp
            .reviewers
            .unwrap_or_default()
            .into_iter()
            .map(|r| r.display_name)
            .collect(),
        comments_count: pr_resp.comment_count.unwrap_or(0),
        provider: "bitbucket".to_string(),
    })
}

#[tauri::command]
pub async fn bitbucket_merge_pr(
    workspace: String,
    repo_slug: String,
    pr_id: u64,
    token: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let resp = client
        .post(format!(
            "{}/repositories/{}/{}/pullrequests/{}/merge",
            BB_API, workspace, repo_slug, pr_id
        ))
        .headers(bitbucket_headers(&token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Failed to merge PR: {}", resp.status()));
    }

    Ok("PR merged successfully".to_string())
}
