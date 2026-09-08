import { invoke as tauriInvoke } from "@tauri-apps/api/core";

let activeRepoPath: string | null = null;

export function setActiveRepo(path: string | null) {
  activeRepoPath = path;
}

export function getActiveRepo(): string | null {
  return activeRepoPath;
}

function invoke<T>(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (activeRepoPath === null) {
    return Promise.reject(new Error(`${cmd}: no repository is open`));
  }
  return tauriInvoke<T>(cmd, { repoPath: activeRepoPath, ...args });
}

function invokeOn<T>(
  repoPath: string,
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return tauriInvoke<T>(cmd, { repoPath, ...args });
}

const invokeGlobal = tauriInvoke;

export interface RepoInfo {
  path: string;
  name: string;
  head_branch: string | null;
  is_bare: boolean;
  is_empty: boolean;
  is_detached: boolean;
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
  refs: RefInfo[];
  signature: string;
}

export interface RefInfo {
  name: string;
  kind: "local" | "remote" | "tag";
  remote: string | null;
  is_head: boolean;
}

export interface CommitQuery {
  max_count?: number;
  text?: string;
  author?: string;
  path?: string;
  since?: number;
  until?: number;
  branch?: string;
}

export interface BranchInfo {
  name: string;
  is_head: boolean;
  is_remote: boolean;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  target_oid: string | null;
  tip_summary: string | null;
  tip_time: number | null;
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
  time: number | null;
}

export interface TagInfo {
  name: string;
  oid: string;
  message: string | null;
  tagger: string | null;
  tag_time: number | null;
  is_annotated: boolean;
}

export interface GraphNode {
  oid: string;
  short_oid: string;
  summary: string;
  author_name: string;
  author_email: string;
  author_time: number;
  parent_oids: string[];
  is_merge: boolean;
  refs: RefInfo[];
  signature: string;
  lane: number;
  color: number;
  edges: GraphEdge[];
}

export interface GraphEdge {
  from_lane: number;
  to_lane: number;
  color: number;
  target_oid: string;
  edge_type: string;
}

export interface GraphResult {
  nodes: GraphNode[];
  max_lanes: number;
  total_commits: number;
  truncated: boolean;
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
  merged_content: string | null;
}

export interface OpResult {
  status: string;
  message: string;
  conflicted_files: string[];
}

export interface HunkSelection {
  hunk_index: number;
  lines: number[];
}

export interface BlameLine {
  line_no: number;
  content: string;
  oid: string;
  short_oid: string;
  author_name: string;
  author_time: number;
  summary: string;
  starts_block: boolean;
}

export interface BlameResult {
  path: string;
  lines: BlameLine[];
}

export interface ReflogEntry {
  index: number;
  oid: string;
  short_oid: string;
  old_oid: string | null;
  message: string;
  committer: string;
  time: number;
  summary: string | null;
}

export interface RebaseStep {
  oid: string;

  action: string;
  message?: string | null;
}

export interface SubmoduleInfo {
  name: string;
  path: string;
  url: string | null;
  head_oid: string | null;
  workdir_oid: string | null;
  initialized: boolean;
  modified: boolean;
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string | null;
  is_locked: boolean;
  is_prunable: boolean;
}

export interface LfsStatus {
  installed: boolean;
  enabled: boolean;
  tracked_patterns: string[];
}

export interface IgnoreFile {
  path: string;
  content: string;
  exists: boolean;
}

export interface TransferProgress {
  received_objects: number;
  total_objects: number;
  indexed_objects: number;
  received_bytes: number;
  stage: string;
}

export interface RepoChanged {
  repo_path: string;

  scope: string;
}

export const openRepo = (path: string) =>
  invokeGlobal<RepoInfo>("open_repo", { path });
export const initRepo = (path: string) =>
  invokeGlobal<RepoInfo>("init_repo", { path });
export const cloneRepo = (url: string, path: string) =>
  invokeGlobal<RepoInfo>("clone_repo", { url, path });
export const closeRepo = (repoPath: string) =>
  invokeOn<void>(repoPath, "close_repo");
export const getRepoInfo = () => invoke<RepoInfo>("get_repo_info");
export const getFileTree = () => invoke<FileEntry[]>("get_file_tree");
export const getFileContent = (filePath: string) =>
  invoke<string>("get_file_content", { filePath });
export const getFileAtCommit = (filePath: string, oid: string) =>
  invoke<string>("get_file_at_commit", { filePath, oid });

export const getCommits = (query?: CommitQuery) =>
  invoke<CommitInfo[]>("get_commits", { query });
export const getCommitDetails = (oid: string) =>
  invoke<CommitInfo>("get_commit_details", { oid });
export const getFileHistory = (filePath: string, maxCount?: number) =>
  invoke<CommitInfo[]>("get_file_history", { filePath, maxCount });
export const getHeadMessage = () => invoke<string>("get_head_message");

export interface CommitOptions {
  amend?: boolean;
  sign_off?: boolean;
  allow_empty?: boolean;
}

export const createCommit = (message: string, options?: CommitOptions) =>
  invoke<string>("create_commit", { message, options });
export const amendCommit = (message?: string) =>
  invoke<string>("amend_commit", { message });

export interface MergeStatus {
  source_branch: string;
  target_branch: string;

  status: string;
  ahead: number;
  behind: number;
}

export const getBranches = () => invoke<BranchInfo[]>("get_branches");
export const createBranch = (
  name: string,
  startPoint?: string,
  checkout?: boolean,
) => invoke<BranchInfo>("create_branch", { name, startPoint, checkout });
export const deleteBranch = (name: string, force?: boolean) =>
  invoke<void>("delete_branch", { name, force });
export const renameBranch = (oldName: string, newName: string) =>
  invoke<void>("rename_branch", { oldName, newName });
export const checkoutBranch = (name: string) =>
  invoke<void>("checkout_branch", { name });
export const checkoutCommit = (oid: string) =>
  invoke<void>("checkout_commit", { oid });
export const setUpstream = (branch: string, upstream: string | null) =>
  invoke<void>("set_upstream", { branch, upstream });
export const mergeBranch = (branchName: string, noFf?: boolean) =>
  invoke<OpResult>("merge_branch", { branchName, noFf });
export const checkMergeStatus = (targetBranch: string) =>
  invoke<MergeStatus>("check_merge_status", { targetBranch });
export const getDefaultBranch = () => invoke<string>("get_default_branch");

export const getWorkingDiff = () => invoke<DiffFile[]>("get_working_diff");
export const getStagedDiff = () => invoke<DiffFile[]>("get_staged_diff");
export const getCommitDiff = (oid: string) =>
  invoke<DiffFile[]>("get_commit_diff", { oid });
export const getRangeDiff = (from: string, to: string) =>
  invoke<DiffFile[]>("get_range_diff", { from, to });
export const getConflictFiles = () => invoke<string[]>("get_conflict_files");
export const getConflictDiff = () =>
  invoke<ConflictFileData[]>("get_conflict_diff");
export const resolveConflictFile = (
  filePath: string,
  resolvedContent: string,
) => invoke<void>("resolve_conflict_file", { filePath, resolvedContent });
export const resolveConflictWithSide = (filePath: string, side: string) =>
  invoke<void>("resolve_conflict_with_side", { filePath, side });
export const resolveConflictHunks = (filePath: string, choices: string[]) =>
  invoke<void>("resolve_conflict_hunks", { filePath, choices });

export const getStatus = () => invoke<StatusResult>("get_status");
export const stageFile = (filePath: string) =>
  invoke<void>("stage_file", { filePath });
export const stageFiles = (filePaths: string[]) =>
  invoke<void>("stage_files", { filePaths });
export const unstageFile = (filePath: string) =>
  invoke<void>("unstage_file", { filePath });
export const unstageFiles = (filePaths: string[]) =>
  invoke<void>("unstage_files", { filePaths });
export const stageAll = () => invoke<void>("stage_all");
export const unstageAll = () => invoke<void>("unstage_all");
export const discardFile = (filePath: string) =>
  invoke<void>("discard_file", { filePath });
export const discardAll = (includeUntracked?: boolean) =>
  invoke<void>("discard_all", { includeUntracked: includeUntracked ?? false });

export const stageHunks = (filePath: string, selections: HunkSelection[]) =>
  invoke<void>("stage_hunks", { filePath, selections });
export const unstageHunks = (filePath: string, selections: HunkSelection[]) =>
  invoke<void>("unstage_hunks", { filePath, selections });
export const discardHunks = (filePath: string, selections: HunkSelection[]) =>
  invoke<void>("discard_hunks", { filePath, selections });

export const getStashes = () => invoke<StashEntry[]>("get_stashes");
export const createStash = (
  message?: string,
  includeUntracked?: boolean,
  keepIndex?: boolean,
) =>
  invoke<string>("create_stash", {
    message,
    includeUntracked: includeUntracked ?? true,
    keepIndex,
  });
export const applyStash = (index: number, drop?: boolean) =>
  invoke<void>("apply_stash", { index, drop: drop ?? false });
export const dropStash = (index: number) =>
  invoke<void>("drop_stash", { index });
export const stashToBranch = (index: number, branch: string) =>
  invoke<void>("stash_to_branch", { index, branch });

export const getTags = () => invoke<TagInfo[]>("get_tags");
export const createTag = (
  name: string,
  oid?: string,
  message?: string,
  force?: boolean,
) => invoke<string>("create_tag", { name, oid, message, force });
export const deleteTag = (name: string) => invoke<void>("delete_tag", { name });

export const getCommitGraph = (query?: CommitQuery) =>
  invoke<GraphResult>("get_commit_graph", { query });

export const rebaseOnto = (ontoBranch: string) =>
  invoke<OpResult>("rebase_onto", { ontoBranch });
export const rebaseInteractive = (onto: string, steps: RebaseStep[]) =>
  invoke<OpResult>("rebase_interactive", { onto, steps });
export const abortRebase = () => invoke<void>("abort_rebase");
export const continueRebase = () => invoke<OpResult>("continue_rebase");
export const cherryPick = (oid: string) =>
  invoke<OpResult>("cherry_pick", { oid });
export const revertCommit = (oid: string) =>
  invoke<OpResult>("revert_commit", { oid });
export const resetToCommit = (oid: string, mode: string) =>
  invoke<void>("reset_to_commit", { oid, mode });
export const abortOperation = () => invoke<OpResult>("abort_operation");

export const fetchRemote = (remoteName?: string, prune?: boolean) =>
  invoke<OpResult>("fetch_remote", { remoteName, prune });
export const fetchAll = () => invoke<OpResult>("fetch_all");

export interface PushOptions {
  remoteName?: string;
  branch?: string;
  force?: boolean;
  setUpstream?: boolean;
  pushTags?: boolean;
}

export const pushRemote = (options: PushOptions = {}) =>
  invoke<OpResult>("push_remote", {
    remoteName: options.remoteName,
    branch: options.branch,
    force: options.force,
    setUpstream: options.setUpstream,
    pushTags: options.pushTags,
  });
export const pushTag = (tag: string, remoteName?: string) =>
  invoke<OpResult>("push_tag", { tag, remoteName });
export const deleteRemoteBranch = (remoteName: string, branch: string) =>
  invoke<OpResult>("delete_remote_branch", { remoteName, branch });
export const pullRemote = (remoteName?: string, rebase?: boolean) =>
  invoke<OpResult>("pull_remote", { remoteName, rebase });
export const getRemotes = () => invoke<RemoteInfo[]>("get_remotes");
export const addRemote = (name: string, url: string) =>
  invoke<void>("add_remote", { name, url });
export const removeRemote = (name: string) =>
  invoke<void>("remove_remote", { name });
export const renameRemote = (oldName: string, newName: string) =>
  invoke<void>("rename_remote", { oldName, newName });
export const setRemoteUrl = (name: string, url: string) =>
  invoke<void>("set_remote_url", { name, url });

export const getBlame = (filePath: string, oid?: string) =>
  invoke<BlameResult>("get_blame", { filePath, oid });
export const getReflog = (reference?: string, maxCount?: number) =>
  invoke<ReflogEntry[]>("get_reflog", { reference, maxCount });
export const restoreFromReflog = (oid: string, hard: boolean) =>
  invoke<void>("restore_from_reflog", { oid, hard });
export const readIgnoreFile = (name: string) =>
  invoke<IgnoreFile>("read_ignore_file", { name });
export const writeIgnoreFile = (name: string, content: string) =>
  invoke<void>("write_ignore_file", { name, content });
export const addIgnorePattern = (pattern: string) =>
  invoke<void>("add_ignore_pattern", { pattern });
export const isIgnored = (path: string) =>
  invoke<boolean>("is_ignored", { path });

export const getSubmodules = () => invoke<SubmoduleInfo[]>("get_submodules");
export const updateSubmodules = (init?: boolean) =>
  invoke<string>("update_submodules", { init });
export const addSubmodule = (url: string, path: string) =>
  invoke<void>("add_submodule", { url, path });
export const getWorktrees = () => invoke<WorktreeInfo[]>("get_worktrees");
export const addWorktree = (name: string, path: string, branch?: string) =>
  invoke<void>("add_worktree", { name, path, branch });
export const removeWorktree = (name: string) =>
  invoke<void>("remove_worktree", { name });
export const getLfsStatus = () => invoke<LfsStatus>("get_lfs_status");

export const watchRepo = (repoPath: string) =>
  invokeOn<void>(repoPath, "watch_repo");
export const unwatchRepo = (repoPath: string) =>
  invokeOn<void>(repoPath, "unwatch_repo");

export const secretSet = (key: string, value: string) =>
  invokeGlobal<void>("secret_set", { key, value });
export const secretGet = (key: string) =>
  invokeGlobal<string | null>("secret_get", { key });
export const secretDelete = (key: string) =>
  invokeGlobal<void>("secret_delete", { key });
export const secretHas = (key: string) =>
  invokeGlobal<boolean>("secret_has", { key });

export const providerTokenKey = (provider: string) => `provider:${provider}`;

export const hostTokenKey = (host: string) => `git:${host}`;

export const githubGetRepo = (owner: string, repo: string, token: string) =>
  invokeGlobal<RepoRemoteInfo>("github_get_repo", { owner, repo, token });
export const githubListPrs = (
  owner: string,
  repo: string,
  state: string | undefined,
  token: string,
) =>
  invokeGlobal<PullRequest[]>("github_list_prs", { owner, repo, state, token });
export const githubCreatePr = (
  owner: string,
  repo: string,
  pr: CreatePrRequest,
  token: string,
) => invokeGlobal<PullRequest>("github_create_pr", { owner, repo, pr, token });
export const githubMergePr = (
  owner: string,
  repo: string,
  prNumber: number,
  method: string | undefined,
  token: string,
) =>
  invokeGlobal<string>("github_merge_pr", {
    owner,
    repo,
    prNumber,
    method,
    token,
  });
export const githubClosePr = (
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
) => invokeGlobal<void>("github_close_pr", { owner, repo, prNumber, token });
export const githubListIssues = (
  owner: string,
  repo: string,
  state: string | undefined,
  token: string,
) =>
  invokeGlobal<IssueInfo[]>("github_list_issues", {
    owner,
    repo,
    state,
    token,
  });
export const githubListRepos = (token: string) =>
  invokeGlobal<RepoRemoteInfo[]>("github_list_repos", { token });

export const gitlabGetRepo = (
  baseUrl: string,
  projectId: string,
  token: string,
) =>
  invokeGlobal<RepoRemoteInfo>("gitlab_get_repo", {
    baseUrl,
    projectId,
    token,
  });
export const gitlabListMrs = (
  baseUrl: string,
  projectId: string,
  state: string | undefined,
  token: string,
) =>
  invokeGlobal<PullRequest[]>("gitlab_list_mrs", {
    baseUrl,
    projectId,
    state,
    token,
  });
export const gitlabCreateMr = (
  baseUrl: string,
  projectId: string,
  mr: CreatePrRequest,
  token: string,
) =>
  invokeGlobal<PullRequest>("gitlab_create_mr", {
    baseUrl,
    projectId,
    mr,
    token,
  });
export const gitlabMergeMr = (
  baseUrl: string,
  projectId: string,
  mrIid: number,
  token: string,
) =>
  invokeGlobal<string>("gitlab_merge_mr", { baseUrl, projectId, mrIid, token });
export const gitlabListIssues = (
  baseUrl: string,
  projectId: string,
  state: string | undefined,
  token: string,
) =>
  invokeGlobal<IssueInfo[]>("gitlab_list_issues", {
    baseUrl,
    projectId,
    state,
    token,
  });

export const bitbucketGetRepo = (
  workspace: string,
  repoSlug: string,
  token: string,
) =>
  invokeGlobal<RepoRemoteInfo>("bitbucket_get_repo", {
    workspace,
    repoSlug,
    token,
  });
export const bitbucketListPrs = (
  workspace: string,
  repoSlug: string,
  state: string | undefined,
  token: string,
) =>
  invokeGlobal<PullRequest[]>("bitbucket_list_prs", {
    workspace,
    repoSlug,
    state,
    token,
  });
export const bitbucketCreatePr = (
  workspace: string,
  repoSlug: string,
  pr: CreatePrRequest,
  token: string,
) =>
  invokeGlobal<PullRequest>("bitbucket_create_pr", {
    workspace,
    repoSlug,
    pr,
    token,
  });
export const bitbucketMergePr = (
  workspace: string,
  repoSlug: string,
  prId: number,
  token: string,
) =>
  invokeGlobal<string>("bitbucket_merge_pr", {
    workspace,
    repoSlug,
    prId,
    token,
  });

export const aiCheckOllama = () => invokeGlobal<boolean>("ai_check_ollama");
export const aiListModels = () => invokeGlobal<OllamaModel[]>("ai_list_models");
export const aiGenerateCommitMessage = (diff: string, model?: string) =>
  invokeGlobal<string>("ai_generate_commit_message", { diff, model });
export const aiGeneratePrDescription = (
  diff: string,
  title: string,
  model?: string,
) => invokeGlobal<string>("ai_generate_pr_description", { diff, title, model });
