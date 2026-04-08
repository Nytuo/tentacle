use crate::git::GitState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphNode {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
    pub author_name: String,
    pub author_time: i64,
    pub parent_oids: Vec<String>,
    pub is_merge: bool,
    pub refs: Vec<String>,
    
    pub lane: usize,
    
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphEdge {
    pub from_lane: usize,
    pub to_lane: usize,
    pub target_oid: String,
    
    pub edge_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphResult {
    pub nodes: Vec<GraphNode>,
    pub max_lanes: usize,
    pub total_commits: usize,
}






pub fn compute_graph(commits: &[crate::git::commits::CommitInfo]) -> GraphResult {
    if commits.is_empty() {
        return GraphResult {
            nodes: vec![],
            max_lanes: 0,
            total_commits: 0,
        };
    }

    
    let mut lanes: Vec<Option<String>> = Vec::new();
    let mut max_lanes = 0usize;
    let mut nodes: Vec<GraphNode> = Vec::new();

    
    let mut oid_to_row: HashMap<String, usize> = HashMap::new();
    for (i, c) in commits.iter().enumerate() {
        oid_to_row.insert(c.oid.clone(), i);
    }

    for commit in commits {
        
        let my_lane = lanes.iter().position(|l| l.as_deref() == Some(&commit.oid));

        let lane_idx = if let Some(idx) = my_lane {
            idx
        } else {
            
            let free = lanes.iter().position(|l| l.is_none());
            if let Some(idx) = free {
                lanes[idx] = Some(commit.oid.clone());
                idx
            } else {
                lanes.push(Some(commit.oid.clone()));
                lanes.len() - 1
            }
        };

        let mut edges = Vec::new();

        if !commit.parent_oids.is_empty() {
            
            let first_parent = &commit.parent_oids[0];
            lanes[lane_idx] = Some(first_parent.clone());
            edges.push(GraphEdge {
                from_lane: lane_idx,
                to_lane: lane_idx,
                target_oid: first_parent.clone(),
                edge_type: "normal".to_string(),
            });

            
            for parent in &commit.parent_oids[1..] {
                let parent_lane = lanes.iter().position(|l| l.as_deref() == Some(parent));

                let p_lane = if let Some(idx) = parent_lane {
                    idx
                } else {
                    let free = lanes.iter().position(|l| l.is_none());
                    if let Some(idx) = free {
                        lanes[idx] = Some(parent.clone());
                        idx
                    } else {
                        lanes.push(Some(parent.clone()));
                        lanes.len() - 1
                    }
                };

                edges.push(GraphEdge {
                    from_lane: lane_idx,
                    to_lane: p_lane,
                    target_oid: parent.clone(),
                    edge_type: "merge".to_string(),
                });
            }
        } else {
            
            lanes[lane_idx] = None;
        }

        
        while lanes.last().map(|l| l.is_none()).unwrap_or(false) {
            lanes.pop();
        }

        max_lanes = max_lanes.max(lanes.len());

        nodes.push(GraphNode {
            oid: commit.oid.clone(),
            short_oid: commit.short_oid.clone(),
            summary: commit.summary.clone(),
            author_name: commit.author_name.clone(),
            author_time: commit.author_time,
            parent_oids: commit.parent_oids.clone(),
            is_merge: commit.is_merge,
            refs: commit.refs.clone(),
            lane: lane_idx,
            edges,
        });
    }

    let total = nodes.len();
    GraphResult {
        nodes,
        max_lanes,
        total_commits: total,
    }
}

#[tauri::command]
pub fn get_commit_graph(
    max_count: Option<usize>,
    state: State<'_, GitState>,
) -> Result<GraphResult, String> {
    let mut commits = crate::git::commits::get_commits(max_count, state.clone())?;
    
    
    if let Ok(status) = crate::git::staging::get_status(state.clone()) {
        if status.staged_count + status.unstaged_count + status.untracked_count + status.conflicted_count > 0 {
            
            let repo_lock = state.repo.lock().unwrap();
            if let Some(repo) = repo_lock.as_ref() {
                if let Ok(head) = repo.head() {
                    if let Some(head_oid) = head.target() {
                        let now = chrono::Utc::now().timestamp();
                        let wip = crate::git::commits::CommitInfo {
                            oid: "WIP".to_string(),
                            short_oid: "WIP".to_string(),
                            message: "Working directory changes".to_string(),
                            summary: "Work in Progress".to_string(),
                            author_name: "You".to_string(),
                            author_email: "".to_string(),
                            author_time: now,
                            committer_name: "You".to_string(),
                            committer_email: "".to_string(),
                            committer_time: now,
                            parent_oids: vec![head_oid.to_string()],
                            is_merge: false,
                            refs: vec![],
                        };
                        commits.insert(0, wip);
                    }
                }
            }
        }
    }

    Ok(compute_graph(&commits))
}
