import { invoke } from "@tauri-apps/api/core";


export interface RepoInfo {
  path: string;
  name: string;
  head_branch: string | null;
  is_bare: boolean;
  is_empty: boolean;
  state: string;
}

export interface FileEntry {
  path: string;
  name: string;
  is_dir: boolean;
  children: FileEntry[] | null;
}

export interface CommitInfo {
  oid: string;
  short_oid: string;
  message: string;
  summary: string;
  author_name: string;
  author_email: string;
  author_time: number;
  committer_name: string;
  committer_email: string;
  committer_time: number;
  parent_oids: string[];
  is_merge: boolean;
  refs: string[];
}

export interface BranchInfo {
  name: string;
  is_head: boolean;
  is_remote: boolean;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  target_oid: string | null;
}

export interface DiffFile {
  old_path: string | null;
  new_path: string | null;
  status: string;
  hunks: DiffHunk[];
  binary: boolean;
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  header: string;
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  origin: string;
  content: string;
  old_lineno: number | null;
  new_lineno: number | null;
}

export interface StatusEntry {
  path: string;
  status: string;
  is_staged: boolean;
}

export interface StatusResult {
  entries: StatusEntry[];
  staged_count: number;
  unstaged_count: number;
  untracked_count: number;
  conflicted_count: number;
}

export interface StashEntry {
  index: number;
  message: string;
  oid: string;
}

export interface TagInfo {
  name: string;
  oid: string;
  message: string | null;
  tagger: string | null;
  is_annotated: boolean;
}

export interface GraphNode {
  oid: string;
  short_oid: string;
  summary: string;
  author_name: string;
  author_time: number;
  parent_oids: string[];
  is_merge: boolean;
  refs: string[];
  lane: number;
  edges: GraphEdge[];
}

export interface GraphEdge {
  from_lane: number;
  to_lane: number;
  target_oid: string;
  edge_type: string;
}

export interface GraphResult {
  nodes: GraphNode[];
  max_lanes: number;
  total_commits: number;
}

export interface RemoteInfo {
  name: string;
  url: string;
  push_url: string | null;
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  author: string;
  source_branch: string;
  target_branch: string;
  created_at: string;
  updated_at: string;
  url: string;
  mergeable: boolean | null;
  draft: boolean;
  labels: string[];
  reviewers: string[];
  comments_count: number;
  provider: string;
}

export interface RepoRemoteInfo {
  full_name: string;
  description: string | null;
  default_branch: string;
  stars: number;
  forks: number;
  open_issues: number;
  url: string;
  clone_url: string;
  ssh_url: string | null;
  is_private: boolean;
  provider: string;
}

export interface CreatePrRequest {
  title: string;
  body: string | null;
  source_branch: string;
  target_branch: string;
  draft: boolean;
}

export interface IssueInfo {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  author: string;
  labels: string[];
  created_at: string;
  url: string;
  provider: string;
}

export interface OllamaModel {
  name: string;
  size: number | null;
}

export interface ConflictFileData {
  path: string;
  base_content: string | null;
  current_content: string | null;
  incoming_content: string | null;
  is_binary: boolean;
}


export const openRepo = (path: string) => invoke<RepoInfo>("open_repo", { path });
export const initRepo = (path: string) => invoke<RepoInfo>("init_repo", { path });
export const cloneRepo = (url: string, path: string) => invoke<RepoInfo>("clone_repo", { url, path });
export const getRepoInfo = () => invoke<RepoInfo>("get_repo_info");
export const getFileTree = () => invoke<FileEntry[]>("get_file_tree");
export const getFileContent = (filePath: string) => invoke<string>("get_file_content", { filePath });


export const getCommits = (maxCount?: number) => invoke<CommitInfo[]>("get_commits", { maxCount });
export const getCommitDetails = (oid: string) => invoke<CommitInfo>("get_commit_details", { oid });
export const createCommit = (message: string) => invoke<string>("create_commit", { message });
export const amendCommit = (message?: string) => invoke<string>("amend_commit", { message });

export interface MergeStatus {
  source_branch: string;
  target_branch: string;
  /** "up_to_date" | "fast_forward" | "ok" | "conflicts" | "error" */
  status: string;
  ahead: number;
  behind: number;
}


export const getBranches = () => invoke<BranchInfo[]>("get_branches");
export const createBranch = (name: string, startPoint?: string) => invoke<BranchInfo>("create_branch", { name, startPoint });
export const deleteBranch = (name: string) => invoke<void>("delete_branch", { name });
export const renameBranch = (oldName: string, newName: string) => invoke<void>("rename_branch", { oldName, newName });
export const checkoutBranch = (name: string) => invoke<void>("checkout_branch", { name });
export const checkoutCommit = (oid: string) => invoke<void>("checkout_commit", { oid });
export const mergeBranch = (branchName: string) => invoke<string>("merge_branch", { branchName });
export const checkMergeStatus = (targetBranch: string) =>
  invoke<MergeStatus>("check_merge_status", { targetBranch });


export const getWorkingDiff = () => invoke<DiffFile[]>("get_working_diff");
export const getStagedDiff = () => invoke<DiffFile[]>("get_staged_diff");
export const getCommitDiff = (oid: string) => invoke<DiffFile[]>("get_commit_diff", { oid });
export const getConflictFiles = () => invoke<string[]>("get_conflict_files");
export const getConflictDiff = () => invoke<ConflictFileData[]>("get_conflict_diff");
export const resolveConflictFile = (filePath: string, resolvedContent: string) =>
  invoke<void>("resolve_conflict_file", { filePath, resolvedContent });
export const resolveConflictWithSide = (filePath: string, side: string) =>
  invoke<void>("resolve_conflict_with_side", { filePath, side });


export const getStatus = () => invoke<StatusResult>("get_status");
export const stageFile = (filePath: string) => invoke<void>("stage_file", { filePath });
export const unstageFile = (filePath: string) => invoke<void>("unstage_file", { filePath });
export const stageAll = () => invoke<void>("stage_all");
export const unstageAll = () => invoke<void>("unstage_all");
export const discardFile = (filePath: string) => invoke<void>("discard_file", { filePath });
export const discardAll = () => invoke<void>("discard_all");


export const getStashes = () => invoke<StashEntry[]>("get_stashes");
export const createStash = (message?: string, includeUntracked?: boolean) =>
  invoke<string>("create_stash", { message, includeUntracked: includeUntracked ?? true });
export const applyStash = (index: number, drop?: boolean) =>
  invoke<void>("apply_stash", { index, drop: drop ?? false });
export const dropStash = (index: number) => invoke<void>("drop_stash", { index });


export const getTags = () => invoke<TagInfo[]>("get_tags");
export const createTag = (name: string, message?: string, targetOid?: string) =>
  invoke<string>("create_tag", { name, message, targetOid });
export const deleteTag = (name: string) => invoke<void>("delete_tag", { name });


export const getCommitGraph = (maxCount?: number) =>
  invoke<GraphResult>("get_commit_graph", { maxCount });


export const rebaseOnto = (ontoBranch: string) => invoke<string>("rebase_onto", { ontoBranch });
export const abortRebase = () => invoke<void>("abort_rebase");
export const continueRebase = () => invoke<string>("continue_rebase");
export const cherryPick = (oid: string) => invoke<string>("cherry_pick", { oid });
export const revertCommit = (oid: string) => invoke<string>("revert_commit", { oid });
export const resetToCommit = (oid: string, mode: string) => invoke<void>("reset_to_commit", { oid, mode });


export const fetchRemote = (remoteName?: string) => invoke<string>("fetch_remote", { remoteName });
export const pushRemote = (remoteName?: string, branch?: string) =>
  invoke<string>("push_remote", { remoteName, branch });
export const pullRemote = (remoteName?: string) => invoke<string>("pull_remote", { remoteName });
export const getRemotes = () => invoke<RemoteInfo[]>("get_remotes");
export const addRemote = (name: string, url: string) => invoke<void>("add_remote", { name, url });
export const removeRemote = (name: string) => invoke<void>("remove_remote", { name });


export const githubGetRepo = (owner: string, repo: string, token: string) =>
  invoke<RepoRemoteInfo>("github_get_repo", { owner, repo, token });
export const githubListPrs = (owner: string, repo: string, state: string | undefined, token: string) =>
  invoke<PullRequest[]>("github_list_prs", { owner, repo, state, token });
export const githubCreatePr = (owner: string, repo: string, pr: CreatePrRequest, token: string) =>
  invoke<PullRequest>("github_create_pr", { owner, repo, pr, token });
export const githubMergePr = (owner: string, repo: string, prNumber: number, method: string | undefined, token: string) =>
  invoke<string>("github_merge_pr", { owner, repo, prNumber, method, token });
export const githubClosePr = (owner: string, repo: string, prNumber: number, token: string) =>
  invoke<void>("github_close_pr", { owner, repo, prNumber, token });
export const githubListIssues = (owner: string, repo: string, state: string | undefined, token: string) =>
  invoke<IssueInfo[]>("github_list_issues", { owner, repo, state, token });
export const githubListRepos = (token: string) => invoke<RepoRemoteInfo[]>("github_list_repos", { token });


export const gitlabGetRepo = (baseUrl: string, projectId: string, token: string) =>
  invoke<RepoRemoteInfo>("gitlab_get_repo", { baseUrl, projectId, token });
export const gitlabListMrs = (baseUrl: string, projectId: string, state: string | undefined, token: string) =>
  invoke<PullRequest[]>("gitlab_list_mrs", { baseUrl, projectId, state, token });
export const gitlabCreateMr = (baseUrl: string, projectId: string, mr: CreatePrRequest, token: string) =>
  invoke<PullRequest>("gitlab_create_mr", { baseUrl, projectId, mr, token });
export const gitlabMergeMr = (baseUrl: string, projectId: string, mrIid: number, token: string) =>
  invoke<string>("gitlab_merge_mr", { baseUrl, projectId, mrIid, token });
export const gitlabListIssues = (baseUrl: string, projectId: string, state: string | undefined, token: string) =>
  invoke<IssueInfo[]>("gitlab_list_issues", { baseUrl, projectId, state, token });


export const bitbucketGetRepo = (workspace: string, repoSlug: string, token: string) =>
  invoke<RepoRemoteInfo>("bitbucket_get_repo", { workspace, repoSlug, token });
export const bitbucketListPrs = (workspace: string, repoSlug: string, state: string | undefined, token: string) =>
  invoke<PullRequest[]>("bitbucket_list_prs", { workspace, repoSlug, state, token });
export const bitbucketCreatePr = (workspace: string, repoSlug: string, pr: CreatePrRequest, token: string) =>
  invoke<PullRequest>("bitbucket_create_pr", { workspace, repoSlug, pr, token });
export const bitbucketMergePr = (workspace: string, repoSlug: string, prId: number, token: string) =>
  invoke<string>("bitbucket_merge_pr", { workspace, repoSlug, prId, token });


export const aiCheckOllama = () => invoke<boolean>("ai_check_ollama");
export const aiListModels = () => invoke<OllamaModel[]>("ai_list_models");
export const aiGenerateCommitMessage = (diff: string, model?: string) =>
  invoke<string>("ai_generate_commit_message", { diff, model });
export const aiGeneratePrDescription = (diff: string, title: string, model?: string) =>
  invoke<string>("ai_generate_pr_description", { diff, title, model });
