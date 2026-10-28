use crate::git::commits::{walk_commits, CommitQuery, RefInfo};
use crate::git::{with_repo_async, GitState};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;

const LANE_COLOR_COUNT: usize = 8;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphNode {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
    pub author_name: String,

    pub author_email: String,
    pub author_time: i64,
    pub parent_oids: Vec<String>,
    pub is_merge: bool,
    pub refs: Vec<RefInfo>,

    pub signature: String,

    pub lane: usize,

    pub color: usize,

    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphEdge {
    pub from_lane: usize,

    pub to_lane: usize,

    pub color: usize,

    pub target_oid: String,

    pub edge_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphResult {
    pub nodes: Vec<GraphNode>,
    pub max_lanes: usize,
    pub total_commits: usize,

    pub truncated: bool,
}

type PendingEdge = (usize, usize, usize, String, &'static str);

#[derive(Clone)]
struct Lane {
    oid: String,
    color: usize,
}

fn pick_color(lanes: &[Option<Lane>]) -> usize {
    let used: HashSet<usize> = lanes
        .iter()
        .flatten()
        .map(|l| l.color % LANE_COLOR_COUNT)
        .collect();
    (0..LANE_COLOR_COUNT)
        .find(|c| !used.contains(c))
        .unwrap_or(used.len() % LANE_COLOR_COUNT)
}

fn alloc_lane(lanes: &mut Vec<Option<Lane>>, oid: String, color: usize) -> usize {
    let slot = Lane { oid, color };
    match lanes.iter().position(|l| l.is_none()) {
        Some(idx) => {
            lanes[idx] = Some(slot);
            idx
        }
        None => {
            lanes.push(Some(slot));
            lanes.len() - 1
        }
    }
}

pub fn compute_graph(commits: &[crate::git::commits::CommitInfo]) -> GraphResult {
    if commits.is_empty() {
        return GraphResult {
            nodes: vec![],
            max_lanes: 0,
            total_commits: 0,
            truncated: false,
        };
    }

    let mut lanes: Vec<Option<Lane>> = Vec::new();
    let mut max_lanes = 0usize;
    let mut nodes: Vec<GraphNode> = Vec::with_capacity(commits.len());

    let mut bands: Vec<Vec<PendingEdge>> = Vec::with_capacity(commits.len());

    for commit in commits {
        let mut my_lane: Option<usize> = None;
        for (i, slot) in lanes.iter_mut().enumerate() {
            if slot.as_ref().is_none_or(|l| l.oid != commit.oid) {
                continue;
            }
            match my_lane {
                None => my_lane = Some(i),
                Some(_) => *slot = None,
            }
        }

        let (lane_idx, color) = match my_lane {
            Some(i) => (i, lanes[i].as_ref().unwrap().color),
            None => {
                let color = pick_color(&lanes);
                let idx = alloc_lane(&mut lanes, commit.oid.clone(), color);
                (idx, color)
            }
        };

        let mut band: Vec<PendingEdge> = Vec::new();

        let mut fresh: HashSet<usize> = HashSet::new();

        if let Some((first_parent, extra_parents)) = commit.parent_oids.split_first() {
            lanes[lane_idx] = Some(Lane {
                oid: first_parent.clone(),
                color,
            });

            for parent in extra_parents {
                let existing = lanes
                    .iter()
                    .position(|l| l.as_ref().is_some_and(|s| &s.oid == parent));
                let (p_lane, pcolor) = match existing {
                    Some(idx) => (idx, lanes[idx].as_ref().unwrap().color),
                    None => {
                        let pcolor = pick_color(&lanes);
                        let idx = alloc_lane(&mut lanes, parent.clone(), pcolor);
                        fresh.insert(idx);
                        (idx, pcolor)
                    }
                };
                band.push((lane_idx, p_lane, pcolor, parent.clone(), "branch"));
            }
        } else {
            lanes[lane_idx] = None;
        }

        for (i, slot) in lanes.iter().enumerate() {
            let Some(slot) = slot else { continue };
            if fresh.contains(&i) {
                continue;
            }
            band.push((i, i, slot.color, slot.oid.clone(), "normal"));
        }
        band.sort_by_key(|(_, lane, _, _, _)| *lane);

        while matches!(lanes.last(), Some(None)) {
            lanes.pop();
        }
        max_lanes = max_lanes.max(lanes.len().max(lane_idx + 1));

        bands.push(band);
        nodes.push(GraphNode {
            oid: commit.oid.clone(),
            short_oid: commit.short_oid.clone(),
            summary: commit.summary.clone(),
            author_name: commit.author_name.clone(),
            author_email: commit.author_email.clone(),
            author_time: commit.author_time,
            parent_oids: commit.parent_oids.clone(),
            is_merge: commit.is_merge,
            refs: commit.refs.clone(),
            signature: commit.signature.clone(),
            lane: lane_idx,
            color,
            edges: Vec::new(),
        });
    }

    for i in 0..nodes.len() {
        let next = nodes.get(i + 1);
        let edges = bands[i]
            .iter()
            .map(|(from_lane, lane, color, target_oid, kind)| {
                let (to_lane, edge_type) = match next {
                    Some(n) if &n.oid == target_oid => {
                        (n.lane, if n.lane == *from_lane { *kind } else { "merge" })
                    }
                    _ => (*lane, *kind),
                };
                GraphEdge {
                    from_lane: *from_lane,
                    to_lane,
                    color: *color,
                    target_oid: target_oid.clone(),
                    edge_type: edge_type.to_string(),
                }
            })
            .collect();
        nodes[i].edges = edges;
    }

    let total = nodes.len();
    GraphResult {
        nodes,
        max_lanes,
        total_commits: total,
        truncated: false,
    }
}

#[tauri::command]
pub async fn get_commit_graph(
    repo_path: String,
    query: Option<CommitQuery>,
    state: State<'_, GitState>,
) -> Result<GraphResult, String> {
    let query = query.unwrap_or_default();
    with_repo_async(&state, &repo_path, move |repo| {
        let max = query.max_count.unwrap_or(500);
        let mut commits = walk_commits(repo, &query)?;
        let truncated = commits.len() >= max;

        let searching = query.text.is_some() || query.author.is_some() || query.path.is_some();
        if !searching {
            if let Ok(status) = crate::git::staging::status_of(repo) {
                let dirty = status.staged_count
                    + status.unstaged_count
                    + status.untracked_count
                    + status.conflicted_count;
                let head_oid = repo.head().ok().and_then(|h| h.target());
                if dirty > 0 {
                    if let Some(head_oid) = head_oid {
                        let now = chrono::Utc::now().timestamp();
                        commits.insert(
                            0,
                            crate::git::commits::CommitInfo {
                                oid: "WIP".to_string(),
                                short_oid: "WIP".to_string(),
                                message: "Working directory changes".to_string(),
                                summary: "Work in Progress".to_string(),
                                author_name: "You".to_string(),
                                author_email: String::new(),
                                author_time: now,
                                committer_name: "You".to_string(),
                                committer_email: String::new(),
                                committer_time: now,
                                parent_oids: vec![head_oid.to_string()],
                                is_merge: false,
                                refs: vec![],
                                signature: "none".to_string(),
                            },
                        );
                    }
                }
            }
        }

        let mut graph = compute_graph(&commits);
        graph.truncated = truncated;
        Ok(graph)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::commits::CommitInfo;

    fn c(oid: &str, parents: &[&str]) -> CommitInfo {
        CommitInfo {
            oid: oid.to_string(),
            short_oid: oid.to_string(),
            message: oid.to_string(),
            summary: oid.to_string(),
            author_name: "a".into(),
            author_email: "a@b".into(),
            author_time: 0,
            committer_name: "a".into(),
            committer_email: "a@b".into(),
            committer_time: 0,
            parent_oids: parents.iter().map(|p| p.to_string()).collect(),
            is_merge: parents.len() > 1,
            refs: vec![],
            signature: "none".to_string(),
        }
    }

    #[test]
    fn linear_history_stays_in_one_lane() {
        let g = compute_graph(&[c("c", &["b"]), c("b", &["a"]), c("a", &[])]);
        assert_eq!(g.max_lanes, 1);
        assert!(g.nodes.iter().all(|n| n.lane == 0));

        assert!(g.nodes[2].edges.is_empty());
    }

    #[test]
    fn merge_reuses_lanes_instead_of_leaking_them() {
        let g = compute_graph(&[
            c("m", &["main1", "side1"]),
            c("main1", &["base"]),
            c("side1", &["base"]),
            c("base", &[]),
        ]);
        assert_eq!(g.max_lanes, 2, "a single merge needs exactly two lanes");

        assert!(g.nodes[3].edges.is_empty());
    }

    #[test]
    fn converging_lanes_land_on_the_next_commit() {
        let g = compute_graph(&[
            c("m", &["main1", "side1"]),
            c("main1", &["base"]),
            c("side1", &["base"]),
            c("base", &[]),
        ]);

        let base_lane = g.nodes[3].lane;
        for e in &g.nodes[2].edges {
            if e.target_oid == "base" {
                assert_eq!(e.to_lane, base_lane);
            }
        }
    }

    #[test]
    fn truncated_parents_keep_their_lane_going() {
        let g = compute_graph(&[c("b", &["a"]), c("a", &["cut-off"])]);
        let last = g.nodes.last().unwrap();
        assert_eq!(last.edges.len(), 1);
        assert_eq!(last.edges[0].target_oid, "cut-off");
    }

    #[test]
    fn two_roots_get_separate_lanes() {
        let g = compute_graph(&[c("x", &[]), c("y", &[])]);
        assert_eq!(g.nodes[0].lane, 0);
        assert_eq!(g.nodes[1].lane, 0, "a closed lane is reused");
        assert!(g.nodes[0].edges.is_empty());
    }
}

#[cfg(test)]
mod real_repo_tests {
    use super::*;

    #[test]
    fn layout_is_consistent_on_a_real_repository() {
        let Ok(repo) = git2::Repository::open("..") else {
            return;
        };
        let mut walk = repo.revwalk().unwrap();
        walk.set_sorting(git2::Sort::TIME | git2::Sort::TOPOLOGICAL)
            .unwrap();
        walk.push_head().unwrap();

        let commits: Vec<crate::git::commits::CommitInfo> = walk
            .take(500)
            .filter_map(|o| o.ok())
            .filter_map(|oid| repo.find_commit(oid).ok())
            .map(|c| crate::git::commits::CommitInfo {
                oid: c.id().to_string(),
                short_oid: format!("{:.7}", c.id()),
                message: c.message().unwrap_or("").to_string(),
                summary: c.summary().unwrap_or("").to_string(),
                author_name: c.author().name().unwrap_or("").to_string(),
                author_email: String::new(),
                author_time: c.author().when().seconds(),
                committer_name: String::new(),
                committer_email: String::new(),
                committer_time: 0,
                parent_oids: c.parent_ids().map(|p| p.to_string()).collect(),
                is_merge: c.parent_count() > 1,
                refs: vec![],
                signature: "none".to_string(),
            })
            .collect();

        if commits.len() < 2 {
            return;
        }
        let g = compute_graph(&commits);

        assert!(g.max_lanes >= 1);
        for (i, node) in g.nodes.iter().enumerate() {
            assert!(node.lane < g.max_lanes, "row {i} sits outside max_lanes");
            for e in &node.edges {
                assert!(e.from_lane < g.max_lanes && e.to_lane < g.max_lanes);
            }

            if !node.parent_oids.is_empty() && i + 1 < g.nodes.len() {
                for p in &node.parent_oids {
                    assert!(
                        node.edges.iter().any(|e| &e.target_oid == p),
                        "row {i} drops parent {p}"
                    );
                }
            }
        }
    }
}
