pub mod repo;
pub mod commits;
pub mod branches;
pub mod diff;
pub mod staging;
pub mod stash;
pub mod tags;
pub mod graph;
pub mod advanced;

use std::sync::Mutex;
use git2::Repository;

pub struct GitState {
    pub repo: Mutex<Option<Repository>>,
    pub repo_path: Mutex<Option<String>>,
}

impl GitState {
    pub fn new() -> Self {
        Self {
            repo: Mutex::new(None),
            repo_path: Mutex::new(None),
        }
    }
}

impl Default for GitState {
    fn default() -> Self {
        Self::new()
    }
}
