mod git;
mod remote;
mod ai;

use git::GitState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(GitState::new())
        .invoke_handler(tauri::generate_handler![
            
            git::repo::open_repo,
            git::repo::init_repo,
            git::repo::clone_repo,
            git::repo::get_repo_info,
            git::repo::get_file_tree,
            git::repo::get_file_content,
            
            git::commits::get_commits,
            git::commits::get_commit_details,
            git::commits::create_commit,
            git::commits::amend_commit,
            
            git::branches::get_branches,
            git::branches::create_branch,
            git::branches::delete_branch,
            git::branches::rename_branch,
            git::branches::checkout_branch,
            git::branches::checkout_commit,
            git::branches::merge_branch,
            git::branches::check_merge_status,
            
            git::diff::get_working_diff,
            git::diff::get_staged_diff,
            git::diff::get_commit_diff,
            git::diff::get_conflict_files,
            git::diff::get_conflict_diff,
            git::diff::resolve_conflict_file,
            git::diff::resolve_conflict_with_side,
            
            git::staging::get_status,
            git::staging::stage_file,
            git::staging::unstage_file,
            git::staging::stage_all,
            git::staging::unstage_all,
            git::staging::discard_file,
            git::staging::discard_all,
            
            git::stash::get_stashes,
            git::stash::create_stash,
            git::stash::apply_stash,
            git::stash::drop_stash,
            
            git::tags::get_tags,
            git::tags::create_tag,
            git::tags::delete_tag,
            
            git::graph::get_commit_graph,
            
            git::advanced::rebase_onto,
            git::advanced::abort_rebase,
            git::advanced::continue_rebase,
            git::advanced::cherry_pick,
            git::advanced::revert_commit,
            git::advanced::reset_to_commit,
            
            git::advanced::fetch_remote,
            git::advanced::push_remote,
            git::advanced::pull_remote,
            git::advanced::get_remotes,
            git::advanced::add_remote,
            git::advanced::remove_remote,
            
            remote::github::github_get_repo,
            remote::github::github_list_prs,
            remote::github::github_create_pr,
            remote::github::github_merge_pr,
            remote::github::github_close_pr,
            remote::github::github_list_issues,
            remote::github::github_list_repos,
            
            remote::gitlab::gitlab_get_repo,
            remote::gitlab::gitlab_list_mrs,
            remote::gitlab::gitlab_create_mr,
            remote::gitlab::gitlab_merge_mr,
            remote::gitlab::gitlab_list_issues,
            
            remote::bitbucket::bitbucket_get_repo,
            remote::bitbucket::bitbucket_list_prs,
            remote::bitbucket::bitbucket_create_pr,
            remote::bitbucket::bitbucket_merge_pr,
            
            ai::ollama::ai_check_ollama,
            ai::ollama::ai_list_models,
            ai::ollama::ai_generate_commit_message,
            ai::ollama::ai_generate_pr_description,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
