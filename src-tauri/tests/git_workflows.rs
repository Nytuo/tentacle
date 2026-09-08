use git2::{Repository, Signature};
use std::fs;
use std::path::Path;
use tentacle_lib::git::commits::{walk_commits, CommitQuery};
use tentacle_lib::git::graph::compute_graph;
use tentacle_lib::git::hunks::{self, HunkSelection};
use tentacle_lib::git::staging;

struct Fixture {
    _dir: tempfile::TempDir,
    repo: Repository,
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        Self { _dir: dir, repo }
    }

    fn path(&self) -> &Path {
        self.repo.workdir().unwrap()
    }

    fn write(&self, name: &str, content: &str) {
        let full = self.path().join(name);
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(full, content).unwrap();
    }

    fn read(&self, name: &str) -> String {
        fs::read_to_string(self.path().join(name)).unwrap()
    }

    fn stage(&self, name: &str) {
        let mut index = self.repo.index().unwrap();
        index.add_path(Path::new(name)).unwrap();
        index.write().unwrap();
    }

    fn commit(&self, message: &str) -> git2::Oid {
        let sig = Signature::now("Test", "test@example.com").unwrap();
        let mut index = self.repo.index().unwrap();
        let tree = self.repo.find_tree(index.write_tree().unwrap()).unwrap();
        let parent = self.repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        self.repo
            .commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
            .unwrap()
    }

    fn staged(&self, name: &str) -> String {
        let index = self.repo.index().unwrap();
        let entry = index
            .get_path(Path::new(name), 0)
            .expect("path is in the index");
        let blob = self.repo.find_blob(entry.id).unwrap();
        String::from_utf8(blob.content().to_vec()).unwrap()
    }

    fn seeded() -> Self {
        let f = Self::new();
        f.write("file.txt", "one\ntwo\nthree\n");
        f.stage("file.txt");
        f.commit("initial");
        f
    }
}

fn whole(hunk_index: usize) -> HunkSelection {
    HunkSelection {
        hunk_index,
        lines: vec![],
    }
}

#[test]
fn staging_one_hunk_leaves_the_other_in_the_working_tree() {
    let f = Fixture::new();

    let base: String = (1..=40).map(|i| format!("line{i}\n")).collect();
    f.write("big.txt", &base);
    f.stage("big.txt");
    f.commit("base");

    let edited = base
        .replace("line2\n", "TOP\n")
        .replace("line39\n", "BOTTOM\n");
    f.write("big.txt", &edited);

    hunks::stage_hunks_in(&f.repo, "big.txt", &[whole(0)]).unwrap();

    let staged = f.staged("big.txt");
    assert!(
        staged.contains("TOP"),
        "the staged hunk should be in the index"
    );
    assert!(
        staged.contains("line39"),
        "the other hunk must not be staged"
    );

    assert_eq!(f.read("big.txt"), edited);
}

#[test]
fn unstaging_a_hunk_returns_the_index_to_head_for_that_region_only() {
    let f = Fixture::new();
    let base: String = (1..=40).map(|i| format!("line{i}\n")).collect();
    f.write("big.txt", &base);
    f.stage("big.txt");
    f.commit("base");

    let edited = base
        .replace("line2\n", "TOP\n")
        .replace("line39\n", "BOTTOM\n");
    f.write("big.txt", &edited);
    f.stage("big.txt");

    hunks::unstage_hunks_in(&f.repo, "big.txt", &[whole(0)]).unwrap();

    let staged = f.staged("big.txt");
    assert!(
        staged.contains("line2"),
        "the unstaged hunk should be back at HEAD"
    );
    assert!(staged.contains("BOTTOM"), "the other hunk must stay staged");
    assert_eq!(
        f.read("big.txt"),
        edited,
        "unstaging must not touch the working tree"
    );
}

#[test]
fn discarding_a_hunk_rewrites_only_that_region_of_the_file() {
    let f = Fixture::new();
    let base: String = (1..=40).map(|i| format!("line{i}\n")).collect();
    f.write("big.txt", &base);
    f.stage("big.txt");
    f.commit("base");

    let edited = base
        .replace("line2\n", "TOP\n")
        .replace("line39\n", "BOTTOM\n");
    f.write("big.txt", &edited);

    hunks::discard_hunks_in(&f.repo, "big.txt", &[whole(0)]).unwrap();

    let on_disk = f.read("big.txt");
    assert!(
        on_disk.contains("line2"),
        "the discarded change should be gone"
    );
    assert!(on_disk.contains("BOTTOM"), "the other change must survive");
}

#[test]
fn staging_every_hunk_matches_staging_the_whole_file() {
    let f = Fixture::seeded();
    f.write("file.txt", "ONE\ntwo\nTHREE\n");

    hunks::stage_hunks_in(&f.repo, "file.txt", &[whole(0)]).unwrap();

    assert_eq!(f.staged("file.txt"), "ONE\ntwo\nTHREE\n");
}

#[test]
fn unstaging_a_newly_added_file_removes_it_from_the_index_entirely() {
    let f = Fixture::seeded();
    f.write("new.txt", "hello\n");
    f.stage("new.txt");

    staging::unstage_path(&f.repo, "new.txt").unwrap();

    let index = f.repo.index().unwrap();
    assert!(
        index.get_path(Path::new("new.txt"), 0).is_none(),
        "a file that is not in HEAD should leave the index completely"
    );
    assert!(
        f.path().join("new.txt").exists(),
        "the file itself must survive"
    );
}

#[test]
fn unstaging_a_staged_deletion_restores_the_index_entry() {
    let f = Fixture::seeded();
    fs::remove_file(f.path().join("file.txt")).unwrap();
    let mut index = f.repo.index().unwrap();
    index.remove_path(Path::new("file.txt")).unwrap();
    index.write().unwrap();

    staging::unstage_path(&f.repo, "file.txt").unwrap();

    assert_eq!(
        f.staged("file.txt"),
        "one\ntwo\nthree\n",
        "the index entry should come back from HEAD"
    );
}

#[test]
fn status_reports_a_file_that_is_both_staged_and_further_modified() {
    let f = Fixture::seeded();
    f.write("file.txt", "staged\n");
    f.stage("file.txt");
    f.write("file.txt", "staged and then edited again\n");

    let status = staging::status_of(&f.repo).unwrap();

    let staged: Vec<_> = status.entries.iter().filter(|e| e.is_staged).collect();
    let unstaged: Vec<_> = status.entries.iter().filter(|e| !e.is_staged).collect();
    assert_eq!(staged.len(), 1, "one staged change");
    assert_eq!(unstaged.len(), 1, "and one still in the working tree");
    assert_eq!(status.staged_count, 1);
    assert_eq!(status.unstaged_count, 1);
}

#[test]
fn history_search_matches_message_author_and_hash() {
    let f = Fixture::seeded();
    f.write("a.txt", "a\n");
    f.stage("a.txt");
    let target = f.commit("add the widget");
    f.write("b.txt", "b\n");
    f.stage("b.txt");
    f.commit("unrelated change");

    let by_text = walk_commits(
        &f.repo,
        &CommitQuery {
            text: Some("widget".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(by_text.len(), 1);
    assert_eq!(by_text[0].oid, target.to_string());

    let by_hash = walk_commits(
        &f.repo,
        &CommitQuery {
            text: Some(target.to_string()[..7].to_string()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        by_hash.len(),
        1,
        "a short hash prefix should find the commit"
    );

    let by_author = walk_commits(
        &f.repo,
        &CommitQuery {
            author: Some("nobody".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(
        by_author.is_empty(),
        "an author that does not exist matches nothing"
    );
}

#[test]
fn history_can_be_restricted_to_commits_touching_one_path() {
    let f = Fixture::seeded();
    f.write("src/a.txt", "a\n");
    f.stage("src/a.txt");
    f.commit("touch a");
    f.write("src/b.txt", "b\n");
    f.stage("src/b.txt");
    f.commit("touch b");

    let touching_a = walk_commits(
        &f.repo,
        &CommitQuery {
            path: Some("src/a.txt".into()),
            ..Default::default()
        },
    )
    .unwrap();

    assert_eq!(touching_a.len(), 1);
    assert_eq!(touching_a[0].summary, "touch a");
}

#[test]
fn the_walk_includes_commits_from_every_branch_not_just_head() {
    let f = Fixture::seeded();
    let base = f.repo.head().unwrap().peel_to_commit().unwrap();

    f.repo.branch("side", &base, false).unwrap();
    let sig = Signature::now("Test", "test@example.com").unwrap();
    let tree = base.tree().unwrap();
    let side = f
        .repo
        .commit(
            Some("refs/heads/side"),
            &sig,
            &sig,
            "on the side",
            &tree,
            &[&base],
        )
        .unwrap();

    let all = walk_commits(&f.repo, &CommitQuery::default()).unwrap();
    assert!(
        all.iter().any(|c| c.oid == side.to_string()),
        "a commit only on a side branch must still appear in the graph"
    );
}

#[test]
fn the_graph_of_a_real_merge_uses_two_lanes_and_closes_them() {
    let f = Fixture::seeded();
    let base = f.repo.head().unwrap().peel_to_commit().unwrap();
    let sig = Signature::now("Test", "test@example.com").unwrap();

    f.write("left.txt", "l\n");
    f.stage("left.txt");
    let left_tree = f
        .repo
        .find_tree(f.repo.index().unwrap().write_tree().unwrap())
        .unwrap();
    f.repo
        .commit(Some("HEAD"), &sig, &sig, "left", &left_tree, &[&base])
        .unwrap();
    let left_commit = f.repo.head().unwrap().peel_to_commit().unwrap();

    f.write("right.txt", "r\n");
    f.stage("right.txt");
    let right_tree = f
        .repo
        .find_tree(f.repo.index().unwrap().write_tree().unwrap())
        .unwrap();
    let right = f
        .repo
        .commit(
            Some("refs/heads/side"),
            &sig,
            &sig,
            "right",
            &right_tree,
            &[&base],
        )
        .unwrap();
    let right_commit = f.repo.find_commit(right).unwrap();

    f.repo
        .commit(
            Some("HEAD"),
            &sig,
            &sig,
            "merge",
            &right_tree,
            &[&left_commit, &right_commit],
        )
        .unwrap();

    let commits = walk_commits(&f.repo, &CommitQuery::default()).unwrap();
    let graph = compute_graph(&commits);

    assert_eq!(graph.max_lanes, 2, "one merge needs exactly two lanes");

    for node in &graph.nodes {
        for edge in &node.edges {
            assert!(edge.from_lane < graph.max_lanes);
            assert!(edge.to_lane < graph.max_lanes);
        }
    }
    assert!(
        graph.nodes.last().unwrap().edges.is_empty(),
        "the root commit ends its lane"
    );
}

#[test]
fn the_graph_marks_truncation_when_history_is_cut_short() {
    let f = Fixture::seeded();
    for i in 0..5 {
        f.write("file.txt", &format!("v{i}\n"));
        f.stage("file.txt");
        f.commit(&format!("change {i}"));
    }

    let commits = walk_commits(
        &f.repo,
        &CommitQuery {
            max_count: Some(3),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(commits.len(), 3);

    let graph = compute_graph(&commits);

    assert!(
        !graph.nodes.last().unwrap().edges.is_empty(),
        "a truncated history keeps its lane going off the end"
    );
}

#[test]
fn refs_are_classified_as_local_remote_or_tag() {
    let f = Fixture::seeded();
    let head = f.repo.head().unwrap().peel_to_commit().unwrap();
    let sig = Signature::now("Test", "test@example.com").unwrap();

    f.repo.branch("feature", &head, false).unwrap();

    f.repo
        .reference("refs/remotes/origin/main", head.id(), false, "test")
        .unwrap();
    f.repo
        .tag_lightweight("v1.0", head.as_object(), false)
        .unwrap();
    f.repo
        .tag("v2.0", head.as_object(), &sig, "annotated", false)
        .unwrap();

    let commits = walk_commits(&f.repo, &CommitQuery::default()).unwrap();
    let tip = commits
        .iter()
        .find(|c| c.oid == head.id().to_string())
        .unwrap();

    let kind_of = |name: &str| {
        tip.refs
            .iter()
            .find(|r| r.name == name)
            .unwrap_or_else(|| panic!("{name} should be listed on the tip"))
            .kind
            .as_str()
    };

    assert_eq!(kind_of("feature"), "local");
    assert_eq!(kind_of("origin/main"), "remote");
    assert_eq!(kind_of("v1.0"), "tag", "a lightweight tag is still a tag");
    assert_eq!(
        kind_of("v2.0"),
        "tag",
        "an annotated tag resolves to its commit"
    );

    let origin_main = tip.refs.iter().find(|r| r.name == "origin/main").unwrap();
    assert_eq!(
        origin_main.remote.as_deref(),
        None,
        "no remote is configured yet"
    );
}

#[test]
fn a_remote_ref_names_its_remote_even_when_the_branch_has_slashes() {
    let f = Fixture::seeded();
    let head = f.repo.head().unwrap().peel_to_commit().unwrap();
    f.repo
        .remote("origin", "https://example.com/x.git")
        .unwrap();
    f.repo
        .reference(
            "refs/remotes/origin/feature/deep/name",
            head.id(),
            false,
            "test",
        )
        .unwrap();

    let commits = walk_commits(&f.repo, &CommitQuery::default()).unwrap();
    let tip = commits
        .iter()
        .find(|c| c.oid == head.id().to_string())
        .unwrap();
    let r = tip
        .refs
        .iter()
        .find(|r| r.name == "origin/feature/deep/name")
        .expect("the remote branch should be listed");

    assert_eq!(r.kind, "remote");
    assert_eq!(
        r.remote.as_deref(),
        Some("origin"),
        "split on the remote, not the first slash"
    );
}

#[test]
fn the_checked_out_branch_is_marked_as_head() {
    let f = Fixture::seeded();
    let head = f.repo.head().unwrap().peel_to_commit().unwrap();
    f.repo.branch("other", &head, false).unwrap();

    let commits = walk_commits(&f.repo, &CommitQuery::default()).unwrap();
    let tip = commits
        .iter()
        .find(|c| c.oid == head.id().to_string())
        .unwrap();

    let head_refs: Vec<&str> = tip
        .refs
        .iter()
        .filter(|r| r.is_head)
        .map(|r| r.name.as_str())
        .collect();
    assert_eq!(head_refs.len(), 1, "exactly one ref is HEAD");
    assert_eq!(tip.refs[0].name, head_refs[0], "HEAD sorts first");
}

#[test]
fn a_remote_head_pointer_is_not_listed_as_a_branch() {
    let f = Fixture::seeded();
    let head = f.repo.head().unwrap().peel_to_commit().unwrap();
    f.repo
        .reference("refs/remotes/origin/main", head.id(), false, "test")
        .unwrap();
    f.repo
        .reference_symbolic(
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/main",
            false,
            "test",
        )
        .unwrap();

    let commits = walk_commits(&f.repo, &CommitQuery::default()).unwrap();
    let tip = commits
        .iter()
        .find(|c| c.oid == head.id().to_string())
        .unwrap();

    assert!(
        !tip.refs.iter().any(|r| r.name.ends_with("/HEAD")),
        "origin/HEAD duplicates origin/main and should be filtered out"
    );
}
