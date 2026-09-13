use crate::git::{git_err, with_repo, with_repo_async, GitState};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffFile {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub status: String,
    pub hunks: Vec<DiffHunk>,
    pub binary: bool,
    pub additions: usize,
    pub deletions: usize,
    #[serde(default)]
    pub hunks_loaded: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffHunk {
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffLine {
    pub origin: String,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

fn delta_status(status: git2::Delta) -> String {
    match status {
        git2::Delta::Added => "added".to_string(),
        git2::Delta::Deleted => "deleted".to_string(),
        git2::Delta::Modified => "modified".to_string(),
        git2::Delta::Renamed => "renamed".to_string(),
        git2::Delta::Copied => "copied".to_string(),
        git2::Delta::Typechange => "typechange".to_string(),
        _ => "unknown".to_string(),
    }
}

fn parse_diff(diff: &git2::Diff) -> Vec<DiffFile> {
    let mut files: Vec<DiffFile> = Vec::new();

    for (delta_idx, delta) in diff.deltas().enumerate() {
        let old_path = delta
            .old_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());
        let new_path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());
        let binary = delta.old_file().is_binary() || delta.new_file().is_binary();
        let status = delta_status(delta.status());

        let mut hunks = Vec::new();
        let mut additions = 0usize;
        let mut deletions = 0usize;

        if !binary {
            if let Ok(Some(patch)) = git2::Patch::from_diff(diff, delta_idx) {
                {
                    for hunk_idx in 0..patch.num_hunks() {
                        if let Ok((hunk, _)) = patch.hunk(hunk_idx) {
                            let mut lines = Vec::new();
                            for line_idx in 0..patch.num_lines_in_hunk(hunk_idx).unwrap_or(0) {
                                if let Ok(line) = patch.line_in_hunk(hunk_idx, line_idx) {
                                    let origin = match line.origin() {
                                        '+' => {
                                            additions += 1;
                                            "+".to_string()
                                        }
                                        '-' => {
                                            deletions += 1;
                                            "-".to_string()
                                        }
                                        ' ' => " ".to_string(),
                                        _ => " ".to_string(),
                                    };
                                    lines.push(DiffLine {
                                        origin,
                                        content: String::from_utf8_lossy(line.content())
                                            .to_string(),
                                        old_lineno: line.old_lineno(),
                                        new_lineno: line.new_lineno(),
                                    });
                                }
                            }
                            hunks.push(DiffHunk {
                                header: String::from_utf8_lossy(hunk.header()).to_string(),
                                old_start: hunk.old_start(),
                                old_lines: hunk.old_lines(),
                                new_start: hunk.new_start(),
                                new_lines: hunk.new_lines(),
                                lines,
                            });
                        }
                    }
                }
            }
        }

        files.push(DiffFile {
            old_path,
            new_path,
            status,
            hunks,
            binary,
            additions,
            deletions,
            hunks_loaded: true,
        });
    }

    files
}

fn default_opts() -> git2::DiffOptions {
    let mut opts = git2::DiffOptions::new();
    opts.context_lines(3).indent_heuristic(true);
    opts
}

fn find_renames(diff: &mut git2::Diff) {
    let mut find = git2::DiffFindOptions::new();
    find.renames(true).copies(true);
    let _ = diff.find_similar(Some(&mut find));
}

#[tauri::command]
pub async fn get_working_diff(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<DiffFile>, String> {
    with_repo_async(&state, &repo_path, |repo| {
        let mut opts = default_opts();

        opts.include_untracked(true).recurse_untracked_dirs(true);
        let mut diff = repo
            .diff_index_to_workdir(None, Some(&mut opts))
            .map_err(git_err)?;
        find_renames(&mut diff);
        Ok(parse_diff(&diff))
    })
    .await
}

#[tauri::command]
pub async fn get_staged_diff(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<DiffFile>, String> {
    with_repo_async(&state, &repo_path, |repo| {
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        let mut opts = default_opts();
        let mut diff = repo
            .diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
            .map_err(git_err)?;
        find_renames(&mut diff);
        Ok(parse_diff(&diff))
    })
    .await
}

#[tauri::command]
pub async fn get_commit_diff(
    repo_path: String,
    oid: String,
    state: State<'_, GitState>,
) -> Result<Vec<DiffFile>, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        if oid == "WIP" {
            let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
            let mut opts = default_opts();
            opts.include_untracked(true).recurse_untracked_dirs(true);
            let mut diff = repo
                .diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts))
                .map_err(git_err)?;
            find_renames(&mut diff);
            return Ok(parse_diff(&diff));
        }

        let commit = repo
            .revparse_single(&oid)
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?;
        let tree = commit.tree().map_err(git_err)?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

        let mut opts = default_opts();
        let mut diff = repo
            .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
            .map_err(git_err)?;
        find_renames(&mut diff);
        Ok(parse_diff(&diff))
    })
    .await
}

#[tauri::command]
pub async fn get_range_diff(
    repo_path: String,
    from: String,
    to: String,
    state: State<'_, GitState>,
) -> Result<Vec<DiffFile>, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let from_tree = repo
            .revparse_single(&from)
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?
            .tree()
            .map_err(git_err)?;
        let to_tree = repo
            .revparse_single(&to)
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?
            .tree()
            .map_err(git_err)?;

        let mut opts = default_opts();
        let mut diff = repo
            .diff_tree_to_tree(Some(&from_tree), Some(&to_tree), Some(&mut opts))
            .map_err(git_err)?;
        find_renames(&mut diff);
        Ok(parse_diff(&diff))
    })
    .await
}

fn commit_diff<'r>(
    repo: &'r git2::Repository,
    oid: &str,
    paths: &[&str],
) -> Result<git2::Diff<'r>, String> {
    let mut opts = default_opts();
    for p in paths {
        opts.pathspec(p);
    }

    let mut diff = if oid == "WIP" {
        opts.include_untracked(true).recurse_untracked_dirs(true);
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts))
            .map_err(git_err)?
    } else {
        let commit = repo
            .revparse_single(oid)
            .map_err(git_err)?
            .peel_to_commit()
            .map_err(git_err)?;
        let tree = commit.tree().map_err(git_err)?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
        repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
            .map_err(git_err)?
    };
    find_renames(&mut diff);
    Ok(diff)
}

fn files_only(diff: &git2::Diff) -> Vec<DiffFile> {
    let mut out = Vec::with_capacity(diff.deltas().len());
    for (i, delta) in diff.deltas().enumerate() {
        let patch = git2::Patch::from_diff(diff, i).ok().flatten();
        let binary = delta.old_file().is_binary()
            || delta.new_file().is_binary()
            || patch.as_ref().map(|p| p.delta().flags().is_binary()).unwrap_or(false);
        let (additions, deletions) = match (&patch, binary) {
            (Some(p), false) => p.line_stats().map(|(_, a, d)| (a, d)).unwrap_or((0, 0)),
            _ => (0, 0),
        };
        out.push(DiffFile {
            old_path: delta.old_file().path().map(|p| p.to_string_lossy().to_string()),
            new_path: delta.new_file().path().map(|p| p.to_string_lossy().to_string()),
            status: delta_status(delta.status()),
            hunks: Vec::new(),
            binary,
            additions,
            deletions,
            hunks_loaded: false,
        });
    }
    out
}

#[tauri::command]
pub async fn get_commit_files(
    repo_path: String,
    oid: String,
    state: State<'_, GitState>,
) -> Result<Vec<DiffFile>, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        Ok(files_only(&commit_diff(repo, &oid, &[])?))
    })
    .await
}

#[tauri::command]
pub async fn get_commit_file_diff(
    repo_path: String,
    oid: String,
    file_path: String,
    old_path: Option<String>,
    state: State<'_, GitState>,
) -> Result<DiffFile, String> {
    with_repo_async(&state, &repo_path, move |repo| {
        let mut paths = vec![file_path.as_str()];
        if let Some(old) = old_path.as_deref() {
            if old != file_path {
                paths.push(old);
            }
        }
        let diff = commit_diff(repo, &oid, &paths)?;
        parse_diff(&diff)
            .into_iter()
            .find(|f| {
                f.new_path.as_deref() == Some(file_path.as_str())
                    || f.old_path.as_deref() == Some(file_path.as_str())
            })
            .ok_or_else(|| format!("{file_path} is not changed in {oid}"))
    })
    .await
}

#[tauri::command]
pub fn get_conflict_files(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<String>, String> {
    with_repo(&state, &repo_path, |repo| {
        let index = repo.index().map_err(git_err)?;
        let mut conflicts = Vec::new();
        if let Ok(iter) = index.conflicts() {
            for conflict in iter.flatten() {
                if let Some(entry) = conflict.our.as_ref().or(conflict.their.as_ref()) {
                    conflicts.push(String::from_utf8_lossy(&entry.path).to_string());
                }
            }
        }
        Ok(conflicts)
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConflictFileData {
    pub path: String,
    pub base_content: Option<String>,
    pub current_content: Option<String>,
    pub incoming_content: Option<String>,
    pub is_binary: bool,

    pub merged_content: Option<String>,
}

fn blob_to_string(repo: &git2::Repository, oid: git2::Oid) -> Option<String> {
    let blob = repo.find_blob(oid).ok()?;
    if blob.is_binary() {
        return None;
    }
    Some(String::from_utf8_lossy(blob.content()).to_string())
}

#[tauri::command]
pub fn get_conflict_diff(
    repo_path: String,
    state: State<'_, GitState>,
) -> Result<Vec<ConflictFileData>, String> {
    with_repo(&state, &repo_path, |repo| {
        let index = repo.index().map_err(git_err)?;
        let workdir = repo.workdir();
        let mut result = Vec::new();

        if let Ok(iter) = index.conflicts() {
            for conflict in iter.flatten() {
                let path = conflict
                    .our
                    .as_ref()
                    .or(conflict.their.as_ref())
                    .or(conflict.ancestor.as_ref())
                    .map(|e| String::from_utf8_lossy(&e.path).to_string())
                    .unwrap_or_default();

                let is_binary = [conflict.our.as_ref(), conflict.their.as_ref()]
                    .into_iter()
                    .flatten()
                    .any(|e| repo.find_blob(e.id).map(|b| b.is_binary()).unwrap_or(false));

                result.push(ConflictFileData {
                    base_content: conflict
                        .ancestor
                        .as_ref()
                        .and_then(|e| blob_to_string(repo, e.id)),
                    current_content: conflict
                        .our
                        .as_ref()
                        .and_then(|e| blob_to_string(repo, e.id)),
                    incoming_content: conflict
                        .their
                        .as_ref()
                        .and_then(|e| blob_to_string(repo, e.id)),
                    merged_content: workdir
                        .map(|w| w.join(&path))
                        .and_then(|p| std::fs::read_to_string(p).ok()),
                    path,
                    is_binary,
                });
            }
        }
        Ok(result)
    })
}

fn write_resolution(repo: &git2::Repository, file_path: &str, content: &str) -> Result<(), String> {
    let workdir = repo
        .workdir()
        .ok_or("Bare repository has no working tree")?;
    std::fs::write(workdir.join(file_path), content.as_bytes())
        .map_err(|e| format!("Cannot write {file_path}: {e}"))?;

    let mut index = repo.index().map_err(git_err)?;

    index.add_path(Path::new(file_path)).map_err(git_err)?;
    index.write().map_err(git_err)
}

#[tauri::command]
pub fn resolve_conflict_file(
    repo_path: String,
    file_path: String,
    resolved_content: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        write_resolution(repo, &file_path, &resolved_content)
    })
}

#[tauri::command]
pub fn resolve_conflict_with_side(
    repo_path: String,
    file_path: String,
    side: String,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let index = repo.index().map_err(git_err)?;
        let mut chosen: Option<String> = None;

        if let Ok(iter) = index.conflicts() {
            for conflict in iter.flatten() {
                let cpath = conflict
                    .our
                    .as_ref()
                    .or(conflict.their.as_ref())
                    .or(conflict.ancestor.as_ref())
                    .map(|e| String::from_utf8_lossy(&e.path).to_string())
                    .unwrap_or_default();

                if cpath == file_path {
                    let entry = match side.as_str() {
                        "current" => conflict.our.as_ref(),
                        "incoming" => conflict.their.as_ref(),
                        "base" => conflict.ancestor.as_ref(),
                        _ => {
                            return Err(
                                "Invalid side. Use 'current', 'incoming', or 'base'".to_string()
                            )
                        }
                    };
                    chosen = entry.and_then(|e| blob_to_string(repo, e.id));
                    break;
                }
            }
        }

        let content =
            chosen.ok_or_else(|| format!("Could not read the '{side}' side of '{file_path}'"))?;
        drop(index);
        write_resolution(repo, &file_path, &content)
    })
}

#[tauri::command]
pub fn resolve_conflict_hunks(
    repo_path: String,
    file_path: String,
    choices: Vec<String>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        let workdir = repo
            .workdir()
            .ok_or("Bare repository has no working tree")?;
        let merged = std::fs::read_to_string(workdir.join(&file_path))
            .map_err(|e| format!("Cannot read {file_path}: {e}"))?;
        let resolved = apply_conflict_choices(&merged, &choices)?;
        write_resolution(repo, &file_path, &resolved)
    })
}

fn apply_conflict_choices(merged: &str, choices: &[String]) -> Result<String, String> {
    let mut out = String::with_capacity(merged.len());
    let mut region = 0usize;
    let mut lines = merged.lines().peekable();

    while let Some(line) = lines.next() {
        if !line.starts_with("<<<<<<<") {
            out.push_str(line);
            out.push('\n');
            continue;
        }

        enum Section {
            Ours,
            Base,
            Theirs,
        }
        let mut ours = Vec::new();
        let mut theirs = Vec::new();
        let mut section = Section::Ours;
        let mut closed = false;

        for line in lines.by_ref() {
            if line.starts_with(">>>>>>>") {
                closed = true;
                break;
            } else if line.starts_with("=======") {
                section = Section::Theirs;
            } else if line.starts_with("|||||||") {
                section = Section::Base;
            } else {
                match section {
                    Section::Ours => ours.push(line),
                    Section::Theirs => theirs.push(line),
                    Section::Base => {}
                }
            }
        }

        if !closed {
            return Err("Unterminated conflict marker in file".to_string());
        }

        let choice = choices.get(region).map(|s| s.as_str()).unwrap_or("current");
        region += 1;

        let picked: Vec<&str> = match choice {
            "incoming" => theirs,
            "both" => ours.into_iter().chain(theirs).collect(),
            _ => ours,
        };
        for line in picked {
            out.push_str(line);
            out.push('\n');
        }
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::apply_conflict_choices;

    const MERGED: &str = "top\n<<<<<<< HEAD\nmine\n=======\nyours\n>>>>>>> other\nbottom\n";

    fn choose(choice: &str) -> String {
        apply_conflict_choices(MERGED, &[choice.to_string()]).unwrap()
    }

    #[test]
    fn keeps_the_chosen_side_and_drops_the_markers() {
        assert_eq!(choose("current"), "top\nmine\nbottom\n");
        assert_eq!(choose("incoming"), "top\nyours\nbottom\n");
        assert_eq!(choose("both"), "top\nmine\nyours\nbottom\n");
    }

    #[test]
    fn each_region_is_chosen_independently() {
        let two =
            "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\nmid\n<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> x\n";
        let out = apply_conflict_choices(two, &["current".into(), "incoming".into()]).unwrap();
        assert_eq!(out, "a\nmid\nd\n");
    }

    #[test]
    fn a_diff3_base_section_is_discarded() {
        let d3 = "<<<<<<< HEAD\nmine\n||||||| base\norig\n=======\nyours\n>>>>>>> x\n";
        assert_eq!(
            apply_conflict_choices(d3, &["current".into()]).unwrap(),
            "mine\n"
        );
    }

    #[test]
    fn an_unterminated_marker_is_an_error_not_a_silent_truncation() {
        assert!(apply_conflict_choices("<<<<<<< HEAD\nmine\n", &["current".into()]).is_err());
    }
}

#[cfg(test)]
mod perf {
    use super::*;
    use std::time::Instant;

    fn big_commit(files: usize, lines: usize) -> (tempfile::TempDir, git2::Oid) {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        let sig = git2::Signature::now("t", "t@t").unwrap();
        let body = |tag: &str| (0..lines).map(|i| format!("{tag} line {i}\n")).collect::<String>();

        for f in 0..files {
            let p = dir.path().join(format!("src/mod{}/file{f}.txt", f % 40));
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, body("old")).unwrap();
        }
        let mut idx = repo.index().unwrap();
        idx.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None).unwrap();
        idx.write().unwrap();
        let tree = repo.find_tree(idx.write_tree().unwrap()).unwrap();
        let base = repo.commit(Some("HEAD"), &sig, &sig, "base", &tree, &[]).unwrap();
        let base = repo.find_commit(base).unwrap();

        for f in 0..files {
            let p = dir.path().join(format!("src/mod{}/file{f}.txt", f % 40));
            std::fs::write(&p, body("new")).unwrap();
        }
        let mut idx = repo.index().unwrap();
        idx.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None).unwrap();
        idx.write().unwrap();
        let tree = repo.find_tree(idx.write_tree().unwrap()).unwrap();
        let oid = repo.commit(Some("HEAD"), &sig, &sig, "big", &tree, &[&base]).unwrap();
        (dir, oid)
    }

    #[test]
    #[ignore]
    fn perf_commit_click_path() {
        let (dir, oid) = big_commit(1500, 60);
        let repo = git2::Repository::open(dir.path()).unwrap();
        let commit = repo.find_commit(oid).unwrap();
        let tree = commit.tree().unwrap();
        let parent = commit.parent(0).unwrap().tree().unwrap();

        let t = Instant::now();
        let mut diff = repo.diff_tree_to_tree(Some(&parent), Some(&tree), None).unwrap();
        let raw = t.elapsed();

        let t = Instant::now();
        let mut f = git2::DiffFindOptions::new();
        f.renames(true).copies(true);
        diff.find_similar(Some(&mut f)).unwrap();
        let copies = t.elapsed();

        let mut diff2 = repo.diff_tree_to_tree(Some(&parent), Some(&tree), None).unwrap();
        let t = Instant::now();
        let mut f = git2::DiffFindOptions::new();
        f.renames(true);
        diff2.find_similar(Some(&mut f)).unwrap();
        let renames_only = t.elapsed();

        let t = Instant::now();
        let full = parse_diff(&diff2);
        let parse = t.elapsed();

        let t = Instant::now();
        let json = serde_json::to_string(&full).unwrap();
        let ser = t.elapsed();

        let t = Instant::now();
        let mut stats = Vec::new();
        for i in 0..diff2.deltas().len() {
            if let Ok(Some(p)) = git2::Patch::from_diff(&diff2, i) {
                let (_, a, d) = p.line_stats().unwrap();
                stats.push((diff2.get_delta(i).unwrap().new_file().path().map(|p| p.to_string_lossy().to_string()), a, d));
            }
        }
        let stats_time = t.elapsed();
        let stats_json = serde_json::to_string(&stats).unwrap();
        eprintln!("stats_only={stats_time:?} stats_payload={}KB", stats_json.len() / 1024);

        eprintln!(
            "files={} raw={raw:?} find(copies)={copies:?} find(renames)={renames_only:?} \
             parse_all_lines={parse:?} serialize={ser:?} payload={}KB",
            full.len(),
            json.len() / 1024
        );
    }
}

#[cfg(test)]
mod listing_tests {
    use super::*;

    fn repo_with_commit() -> (tempfile::TempDir, git2::Oid) {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        let sig = git2::Signature::now("t", "t@t").unwrap();
        let commit_all = |msg: &str, parent: Option<git2::Oid>| {
            let mut idx = repo.index().unwrap();
            idx.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None).unwrap();
            idx.update_all(["*"].iter(), None).unwrap();
            idx.write().unwrap();
            let tree = repo.find_tree(idx.write_tree().unwrap()).unwrap();
            let parents: Vec<git2::Commit> = parent.map(|p| repo.find_commit(p).unwrap()).into_iter().collect();
            let refs: Vec<&git2::Commit> = parents.iter().collect();
            repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &refs).unwrap()
        };
        std::fs::write(dir.path().join("a.txt"), "1\n2\n3\n").unwrap();
        std::fs::write(dir.path().join("gone.txt"), "x\n").unwrap();
        let base = commit_all("base", None);
        std::fs::write(dir.path().join("a.txt"), "1\nTWO\n3\n4\n").unwrap();
        std::fs::remove_file(dir.path().join("gone.txt")).unwrap();
        std::fs::write(dir.path().join("new.txt"), "n\n").unwrap();
        let oid = commit_all("change", Some(base));
        (dir, oid)
    }

    #[test]
    fn the_file_listing_agrees_with_the_full_diff_but_carries_no_lines() {
        let (dir, oid) = repo_with_commit();
        let repo = git2::Repository::open(dir.path()).unwrap();
        let diff = commit_diff(&repo, &oid.to_string(), &[]).unwrap();

        let full = parse_diff(&diff);
        let listed = files_only(&diff);

        assert_eq!(listed.len(), full.len());
        for (l, f) in listed.iter().zip(&full) {
            assert_eq!(l.new_path, f.new_path);
            assert_eq!(l.status, f.status);
            assert_eq!((l.additions, l.deletions), (f.additions, f.deletions));
            assert!(l.hunks.is_empty() && !l.hunks_loaded);
            assert!(f.hunks_loaded);
        }
    }

    #[test]
    fn a_pathspec_narrows_the_diff_to_one_file() {
        let (dir, oid) = repo_with_commit();
        let repo = git2::Repository::open(dir.path()).unwrap();
        let diff = commit_diff(&repo, &oid.to_string(), &["a.txt"]).unwrap();
        let files = parse_diff(&diff);

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].new_path.as_deref(), Some("a.txt"));
        assert!(!files[0].hunks.is_empty(), "the opened file carries its hunks");
    }
}
