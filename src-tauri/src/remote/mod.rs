pub mod bitbucket;
pub mod github;
pub mod gitlab;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PullRequest {
    pub id: u64,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub author: String,
    pub source_branch: String,
    pub target_branch: String,
    pub created_at: String,
    pub updated_at: String,
    pub url: String,
    pub mergeable: Option<bool>,
    pub draft: bool,
    pub labels: Vec<String>,
    pub reviewers: Vec<String>,
    pub comments_count: u64,
    pub provider: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoRemoteInfo {
    pub full_name: String,
    pub description: Option<String>,
    pub default_branch: String,
    pub stars: u64,
    pub forks: u64,
    pub open_issues: u64,
    pub url: String,
    pub clone_url: String,
    pub ssh_url: Option<String>,
    pub is_private: bool,
    pub provider: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreatePrRequest {
    pub title: String,
    pub body: Option<String>,
    pub source_branch: String,
    pub target_branch: String,
    pub draft: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IssueInfo {
    pub id: u64,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub author: String,
    pub labels: Vec<String>,
    pub created_at: String,
    pub url: String,
    pub provider: String,
}
