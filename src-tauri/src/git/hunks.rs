use crate::git::{git_err, with_repo, GitState};
use git2::{DiffOptions, Patch, Repository};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct HunkSelection {
    pub hunk_index: usize,

    #[serde(default)]
    pub lines: Vec<usize>,
}

impl HunkSelection {
    fn wants_line(&self, line_index: usize) -> bool {
        self.lines.is_empty() || self.lines.contains(&line_index)
    }
}

fn apply_selected(
    old: &[u8],
    patch: &Patch,
    selections: &[HunkSelection],
) -> Result<Vec<u8>, String> {
    let old_lines = split_lines(old);
    let mut out: Vec<u8> = Vec::with_capacity(old.len());

    let mut cursor: usize = 1;

    for hunk_index in 0..patch.num_hunks() {
        let (hunk, line_count) = patch.hunk(hunk_index).map_err(git_err)?;
        let selection = selections.iter().find(|s| s.hunk_index == hunk_index);

        let hunk_start = hunk.old_start() as usize;
        while cursor < hunk_start {
            if let Some(line) = old_lines.get(cursor - 1) {
                out.extend_from_slice(line);
            }
            cursor += 1;
        }

        for line_index in 0..line_count {
            let line = patch
                .line_in_hunk(hunk_index, line_index)
                .map_err(git_err)?;
            let content = line.content();
            match line.origin() {
                ' ' => out.extend_from_slice(content),
                '+' => {
                    if selection.is_some_and(|s| s.wants_line(line_index)) {
                        out.extend_from_slice(content);
                    }
                }

                '-' if !selection.is_some_and(|s| s.wants_line(line_index)) => {
                    out.extend_from_slice(content)
                }

                _ => {}
            }
        }

        cursor = hunk_start + hunk.old_lines() as usize;
    }

    while cursor <= old_lines.len() {
        if let Some(line) = old_lines.get(cursor - 1) {
            out.extend_from_slice(line);
        }
        cursor += 1;
    }

    Ok(out)
}

fn split_lines(data: &[u8]) -> Vec<&[u8]> {
    let mut lines = Vec::new();
    let mut start = 0;
    for (i, b) in data.iter().enumerate() {
        if *b == b'\n' {
            lines.push(&data[start..=i]);
            start = i + 1;
        }
    }
    if start < data.len() {
        lines.push(&data[start..]);
    }
    lines
}

fn index_content(repo: &Repository, file_path: &str) -> Result<Vec<u8>, String> {
    let index = repo.index().map_err(git_err)?;
    if let Some(entry) = index.get_path(Path::new(file_path), 0) {
        let blob = repo.find_blob(entry.id).map_err(git_err)?;
        return Ok(blob.content().to_vec());
    }
    head_content(repo, file_path)
}

fn head_content(repo: &Repository, file_path: &str) -> Result<Vec<u8>, String> {
    let Ok(head) = repo.head() else {
        return Ok(Vec::new());
    };
    let tree = head
        .peel_to_commit()
        .map_err(git_err)?
        .tree()
        .map_err(git_err)?;
    match tree.get_path(Path::new(file_path)) {
        Ok(entry) => {
            let blob = repo.find_blob(entry.id()).map_err(git_err)?;
            Ok(blob.content().to_vec())
        }
        Err(_) => Ok(Vec::new()),
    }
}

fn workdir_content(repo: &Repository, file_path: &str) -> Result<Vec<u8>, String> {
    let workdir = repo
        .workdir()
        .ok_or("Bare repository has no working tree")?;
    let full = workdir.join(file_path);
    if !full.exists() {
        return Ok(Vec::new());
    }
    std::fs::read(&full).map_err(|e| format!("Cannot read {file_path}: {e}"))
}

fn patch_between<'a>(old: &'a [u8], new: &'a [u8], file_path: &str) -> Result<Patch<'a>, String> {
    let mut opts = DiffOptions::new();
    opts.context_lines(3);
    let path = Path::new(file_path);
    Patch::from_buffers(old, Some(path), new, Some(path), Some(&mut opts)).map_err(git_err)
}

fn write_index_blob(repo: &Repository, file_path: &str, content: &[u8]) -> Result<(), String> {
    let mut index = repo.index().map_err(git_err)?;

    let mode = index
        .get_path(Path::new(file_path), 0)
        .map(|e| e.mode)
        .or_else(|| {
            repo.head()
                .ok()
                .and_then(|h| h.peel_to_commit().ok())
                .and_then(|c| c.tree().ok())
                .and_then(|t| t.get_path(Path::new(file_path)).ok())
                .map(|e| e.filemode() as u32)
        })
        .unwrap_or(0o100644);

    if content.is_empty() {
        let existed_before = !head_content(repo, file_path)?.is_empty();
        if existed_before {
            index.remove_path(Path::new(file_path)).map_err(git_err)?;
            return index.write().map_err(git_err);
        }
    }

    let entry = git2::IndexEntry {
        ctime: git2::IndexTime::new(0, 0),
        mtime: git2::IndexTime::new(0, 0),
        dev: 0,
        ino: 0,
        mode,
        uid: 0,
        gid: 0,
        file_size: content.len() as u32,
        id: git2::Oid::zero(),
        flags: 0,
        flags_extended: 0,
        path: file_path.as_bytes().to_vec(),
    };
    index.add_frombuffer(&entry, content).map_err(git_err)?;
    index.write().map_err(git_err)
}

fn invert(patch: &Patch, selections: &[HunkSelection]) -> Result<Vec<HunkSelection>, String> {
    let mut out = Vec::new();

    for hunk_index in 0..patch.num_hunks() {
        let (_, line_count) = patch.hunk(hunk_index).map_err(git_err)?;
        let selection = selections.iter().find(|s| s.hunk_index == hunk_index);

        match selection {
            None => out.push(HunkSelection {
                hunk_index,
                lines: vec![],
            }),

            Some(s) if s.lines.is_empty() => {}

            Some(s) => {
                let lines: Vec<usize> = (0..line_count).filter(|i| !s.lines.contains(i)).collect();
                if !lines.is_empty() {
                    out.push(HunkSelection { hunk_index, lines });
                }
            }
        }
    }

    Ok(out)
}

pub fn stage_hunks_in(
    repo: &Repository,
    file_path: &str,
    selections: &[HunkSelection],
) -> Result<(), String> {
    let staged = index_content(repo, file_path)?;
    let working = workdir_content(repo, file_path)?;

    let patch = patch_between(&staged, &working, file_path)?;
    let result = apply_selected(&staged, &patch, selections)?;
    write_index_blob(repo, file_path, &result)
}

#[tauri::command]
pub fn stage_hunks(
    repo_path: String,
    file_path: String,
    selections: Vec<HunkSelection>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        stage_hunks_in(repo, &file_path, &selections)
    })
}

pub fn unstage_hunks_in(
    repo: &Repository,
    file_path: &str,
    selections: &[HunkSelection],
) -> Result<(), String> {
    let head = head_content(repo, file_path)?;
    let staged = index_content(repo, file_path)?;

    let patch = patch_between(&head, &staged, file_path)?;
    let keep = invert(&patch, selections)?;
    let result = apply_selected(&head, &patch, &keep)?;
    write_index_blob(repo, file_path, &result)
}

#[tauri::command]
pub fn unstage_hunks(
    repo_path: String,
    file_path: String,
    selections: Vec<HunkSelection>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        unstage_hunks_in(repo, &file_path, &selections)
    })
}

pub fn discard_hunks_in(
    repo: &Repository,
    file_path: &str,
    selections: &[HunkSelection],
) -> Result<(), String> {
    let workdir = repo
        .workdir()
        .ok_or("Bare repository has no working tree")?;
    let staged = index_content(repo, file_path)?;
    let working = workdir_content(repo, file_path)?;

    let patch = patch_between(&staged, &working, file_path)?;
    let keep = invert(&patch, selections)?;
    let result = apply_selected(&staged, &patch, &keep)?;
    std::fs::write(workdir.join(file_path), &result)
        .map_err(|e| format!("Cannot write {file_path}: {e}"))
}

#[tauri::command]
pub fn discard_hunks(
    repo_path: String,
    file_path: String,
    selections: Vec<HunkSelection>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        discard_hunks_in(repo, &file_path, &selections)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn apply(old: &str, new: &str, selections: &[HunkSelection]) -> String {
        let patch = patch_between(old.as_bytes(), new.as_bytes(), "f.txt").unwrap();
        let out = apply_selected(old.as_bytes(), &patch, selections).unwrap();
        String::from_utf8(out).unwrap()
    }

    fn whole(hunk_index: usize) -> HunkSelection {
        HunkSelection {
            hunk_index,
            lines: vec![],
        }
    }

    #[test]
    fn selecting_nothing_leaves_content_untouched() {
        let old = "a\nb\nc\n";
        let new = "a\nCHANGED\nc\n";
        assert_eq!(apply(old, new, &[]), old);
    }

    #[test]
    fn selecting_every_hunk_reproduces_the_new_content() {
        let old = "a\nb\nc\n";
        let new = "a\nCHANGED\nc\n";
        assert_eq!(apply(old, new, &[whole(0)]), new);
    }

    #[test]
    fn one_hunk_applies_without_disturbing_the_other() {
        let old = (1..=40).map(|i| format!("line{i}\n")).collect::<String>();
        let new = old
            .replace("line2\n", "TOP\n")
            .replace("line39\n", "BOTTOM\n");

        let first = apply(&old, &new, &[whole(0)]);
        assert!(first.contains("TOP"), "selected hunk must be applied");
        assert!(
            first.contains("line39"),
            "unselected hunk must be left alone"
        );

        let second = apply(&old, &new, &[whole(1)]);
        assert!(
            second.contains("line2"),
            "unselected hunk must be left alone"
        );
        assert!(second.contains("BOTTOM"), "selected hunk must be applied");
    }

    #[test]
    fn line_selection_applies_only_the_chosen_additions() {
        let old = "a\nb\n";
        let new = "a\nX\nY\nb\n";
        let patch = patch_between(old.as_bytes(), new.as_bytes(), "f.txt").unwrap();

        let (_h, count) = patch.hunk(0).unwrap();
        let mut x_index = None;
        for i in 0..count {
            let l = patch.line_in_hunk(0, i).unwrap();
            if l.origin() == '+' && l.content() == b"X\n" {
                x_index = Some(i);
            }
        }

        let sel = HunkSelection {
            hunk_index: 0,
            lines: vec![x_index.unwrap()],
        };
        let out = apply_selected(old.as_bytes(), &patch, &[sel]).unwrap();
        let out = String::from_utf8(out).unwrap();
        assert_eq!(out, "a\nX\nb\n", "only the selected addition should land");
    }

    #[test]
    fn a_file_without_a_trailing_newline_round_trips() {
        let old = "a\nb";
        let new = "a\nc";
        assert_eq!(apply(old, new, &[]), old);
        assert_eq!(apply(old, new, &[whole(0)]), new);
    }

    #[test]
    fn inverting_a_selection_keeps_exactly_what_was_not_picked() {
        let old = (1..=40).map(|i| format!("line{i}\n")).collect::<String>();
        let new = old
            .replace("line2\n", "TOP\n")
            .replace("line39\n", "BOTTOM\n");
        let patch = patch_between(old.as_bytes(), new.as_bytes(), "f.txt").unwrap();

        let keep = invert(&patch, &[whole(0)]).unwrap();
        assert_eq!(keep.len(), 1);
        assert_eq!(keep[0].hunk_index, 1);

        assert_eq!(invert(&patch, &[]).unwrap().len(), patch.num_hunks());

        assert!(invert(&patch, &[whole(0), whole(1)]).unwrap().is_empty());
    }

    #[test]
    fn unstaging_one_hunk_is_staging_the_other_from_the_base() {
        let old = (1..=40).map(|i| format!("line{i}\n")).collect::<String>();
        let new = old
            .replace("line2\n", "TOP\n")
            .replace("line39\n", "BOTTOM\n");
        let patch = patch_between(old.as_bytes(), new.as_bytes(), "f.txt").unwrap();

        let keep = invert(&patch, &[whole(0)]).unwrap();
        let rebuilt =
            String::from_utf8(apply_selected(old.as_bytes(), &patch, &keep).unwrap()).unwrap();
        assert_eq!(rebuilt, apply(&old, &new, &[whole(1)]));
    }

    #[test]
    fn split_lines_keeps_terminators() {
        assert_eq!(split_lines(b"a\nb\n"), vec![&b"a\n"[..], &b"b\n"[..]]);
        assert_eq!(split_lines(b"a\nb"), vec![&b"a\n"[..], &b"b"[..]]);
        assert!(split_lines(b"").is_empty());
    }
}
