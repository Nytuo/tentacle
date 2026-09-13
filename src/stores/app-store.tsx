import React, { createContext, useContext, useMemo, useReducer, ReactNode } from "react";
import type {
  RepoInfo, BranchInfo, StatusResult, GraphResult,
  StashEntry, TagInfo, RemoteInfo, PullRequest, DiffFile, CommitInfo, MergeStatus,
  ConflictFileData, CommitQuery, ReflogEntry, BlameResult, SubmoduleInfo,
  WorktreeInfo, LfsStatus, TransferProgress, OpResult,
} from "@/lib/api";
import { detectProvider, type ProviderType } from "@/lib/provider-detect";

export type { ProviderType };

export interface RepoTab {
  id: string;
  repo: RepoInfo;
  branches: BranchInfo[];
  status: StatusResult | null;
  graph: GraphResult | null;
  stashes: StashEntry[];
  tags: TagInfo[];
  remotes: RemoteInfo[];
  pullRequests: PullRequest[];
  selectedCommitOid: string | null;
  selectedCommitInfo: CommitInfo | null;
  commitDiff: DiffFile[];
  workingDiff: DiffFile[];
  stagedDiff: DiffFile[];
  activeView: ViewType;
  viewingDiffFile: DiffFile | null;
  loading: Record<string, boolean>;
  mergeStatus: MergeStatus | null;
  conflictFiles: ConflictFileData[];
  graphQuery: CommitQuery;
  reflog: ReflogEntry[];
  submodules: SubmoduleInfo[];
  worktrees: WorktreeInfo[];
  lfs: LfsStatus | null;
  inspectingPath: string | null;
  fileHistory: CommitInfo[];
  blame: BlameResult | null;
  lastOp: OpResult | null;
}

export type ViewType =
  | "graph"
  | "changes"
  | "branches"
  | "prs"
  | "remotes"
  | "settings"
  | "merge-tool"
  | "history"
  | "blame"
  | "reflog"
  | "worktrees"
  | "ignore";

export interface AiSettings {
  enabled: boolean;
  endpoint: string;
  model: string;
  allowRemote: boolean;
}

export const DEFAULT_AI: AiSettings = {
  enabled: true,
  endpoint: "",
  model: "",
  allowRemote: false,
};

export interface Workspace {
  id: string;
  name: string;
  repoPaths: string[];
  activeRepo: string | null;
  ai: AiSettings;
}

export interface RepoSettings {
  providerType: ProviderType | null;
  providerOwner: string;
  providerRepo: string;
  gitlabBaseUrl: string;
}

export type SettingsSection = "app" | "workspace" | "repository";

export interface AppState {
  tabs: RepoTab[];
  activeTabId: string | null;
  error: string | null;
  theme: "light" | "dark";
  isRestored: boolean;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  repoSettings: Record<string, RepoSettings>;
  allowNetwork: boolean;
  ephemeral: boolean;
  transfer: TransferProgress | null;
  paletteOpen: boolean;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function newWorkspace(name: string, id: string = makeId()): Workspace {
  return { id, name, repoPaths: [], activeRepo: null, ai: { ...DEFAULT_AI } };
}

export const DEFAULT_WORKSPACE_ID = "default";

export function initialAppState(): AppState {
  return {
    tabs: [],
    activeTabId: null,
    error: null,
    theme: "dark",
    isRestored: false,
    workspaces: [newWorkspace("Default", DEFAULT_WORKSPACE_ID)],
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    repoSettings: {},
    allowNetwork: false,
    ephemeral: false,
    transfer: null,
    paletteOpen: false,
    settingsOpen: false,
    settingsSection: "app",
  };
}

function createRepoTab(repo: RepoInfo): RepoTab {
  return {
    id: repo.path,
    repo,
    branches: [],
    status: null,
    graph: null,
    stashes: [],
    tags: [],
    remotes: [],
    pullRequests: [],
    selectedCommitOid: null,
    selectedCommitInfo: null,
    commitDiff: [],
    workingDiff: [],
    stagedDiff: [],
    activeView: "graph",
    viewingDiffFile: null,
    loading: {},
    mergeStatus: null,
    conflictFiles: [],
    graphQuery: { max_count: 500 },
    reflog: [],
    submodules: [],
    worktrees: [],
    lfs: null,
    inspectingPath: null,
    fileHistory: [],
    blame: null,
    lastOp: null,
  };
}

function updateTab(state: AppState, tabId: string, update: Partial<RepoTab>): AppState {
  return {
    ...state,
    tabs: state.tabs.map(t => (t.id === tabId ? { ...t, ...update } : t)),
  };
}

function withActiveWorkspace(state: AppState, fn: (w: Workspace) => Workspace): AppState {
  return {
    ...state,
    workspaces: state.workspaces.map(w => (w.id === state.activeWorkspaceId ? fn(w) : w)),
  };
}

const EMPTY_REPO_SETTINGS: RepoSettings = {
  providerType: null,
  providerOwner: "",
  providerRepo: "",
  gitlabBaseUrl: "",
};

export type Action =
  | { type: "ADD_TAB"; payload: RepoInfo }
  | { type: "CLOSE_TAB"; payload: string }
  | { type: "SET_ACTIVE_TAB"; payload: string }
  | { type: "RESTORE_TABS"; payload: { tabs: RepoTab[]; activeTabId: string | null } }
  | { type: "UPDATE_TAB"; tabId: string; update: Partial<RepoTab> }
  | { type: "SET_REPO"; payload: RepoInfo }
  | { type: "SET_BRANCHES"; payload: BranchInfo[] }
  | { type: "SET_STATUS"; payload: StatusResult | null }
  | { type: "SET_GRAPH"; payload: GraphResult | null }
  | { type: "SET_STASHES"; payload: StashEntry[] }
  | { type: "SET_TAGS"; payload: TagInfo[] }
  | { type: "SET_REMOTES"; payload: RemoteInfo[] }
  | { type: "SET_PULL_REQUESTS"; payload: PullRequest[] }
  | { type: "SET_SELECTED_COMMIT"; payload: string | null }
  | { type: "SET_SELECTED_COMMIT_INFO"; payload: CommitInfo | null }
  | { type: "SET_COMMIT_DIFF"; payload: DiffFile[] }
  | { type: "SET_WORKING_DIFF"; payload: DiffFile[] }
  | { type: "SET_STAGED_DIFF"; payload: DiffFile[] }
  | { type: "SET_ACTIVE_VIEW"; payload: ViewType }
  | { type: "SET_VIEWING_DIFF_FILE"; payload: DiffFile | null }
  | { type: "SET_LOADING"; payload: { key: string; value: boolean } }
  | { type: "SET_MERGE_STATUS"; payload: MergeStatus | null }
  | { type: "SET_CONFLICT_FILES"; payload: ConflictFileData[] }
  | { type: "SET_GRAPH_QUERY"; payload: CommitQuery }
  | { type: "SET_REFLOG"; payload: ReflogEntry[] }
  | { type: "SET_SUBMODULES"; payload: SubmoduleInfo[] }
  | { type: "SET_WORKTREES"; payload: WorktreeInfo[] }
  | { type: "SET_LFS"; payload: LfsStatus | null }
  | { type: "SET_INSPECTING_PATH"; payload: string | null }
  | { type: "SET_FILE_HISTORY"; payload: CommitInfo[] }
  | { type: "SET_BLAME"; payload: BlameResult | null }
  | { type: "SET_LAST_OP"; payload: OpResult | null }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_THEME"; payload: "light" | "dark" }
  | { type: "SET_THEME_SILENT"; payload: "light" | "dark" }
  | { type: "SET_ALLOW_NETWORK"; payload: boolean }
  | { type: "SET_EPHEMERAL"; payload: boolean }
  | { type: "SET_TRANSFER"; payload: TransferProgress | null }
  | { type: "SET_PALETTE_OPEN"; payload: boolean }
  | { type: "OPEN_SETTINGS"; payload?: SettingsSection }
  | { type: "CLOSE_SETTINGS" }
  | { type: "SET_SETTINGS_SECTION"; payload: SettingsSection }
  | { type: "CREATE_WORKSPACE"; payload: Workspace }
  | { type: "RENAME_WORKSPACE"; payload: { id: string; name: string } }
  | { type: "DELETE_WORKSPACE"; payload: string }
  | { type: "SET_ACTIVE_WORKSPACE"; payload: string }
  | { type: "REMOVE_WORKSPACE_REPO"; payload: { id: string; path: string } }
  | { type: "SET_WORKSPACE_AI"; payload: { id: string; ai: Partial<AiSettings> } }
  | { type: "SET_REPO_SETTINGS"; payload: { path: string; settings: Partial<RepoSettings> } }
  | { type: "CLEAR_REPO_SETTINGS"; payload: string }
  | {
      type: "RESTORE_SETTINGS";
      payload: Pick<
        AppState,
        "theme" | "allowNetwork" | "ephemeral" | "workspaces" | "activeWorkspaceId" | "repoSettings"
      >;
    }
  | { type: "SET_RESTORED" };

export function reducer(state: AppState, action: Action): AppState {
  const tabId = state.activeTabId;

  switch (action.type) {
    case "ADD_TAB": {
      const path = action.payload.path;
      const existing = state.tabs.find(t => t.id === path);
      const next: AppState = existing
        ? { ...state, activeTabId: existing.id }
        : { ...state, tabs: [...state.tabs, createRepoTab(action.payload)], activeTabId: path };
      return withActiveWorkspace(next, w => ({
        ...w,
        repoPaths: w.repoPaths.includes(path) ? w.repoPaths : [...w.repoPaths, path],
        activeRepo: path,
      }));
    }
    case "CLOSE_TAB": {
      const filtered = state.tabs.filter(t => t.id !== action.payload);
      let newActive = state.activeTabId;
      if (state.activeTabId === action.payload) {
        const idx = state.tabs.findIndex(t => t.id === action.payload);
        newActive = filtered[Math.min(idx, filtered.length - 1)]?.id ?? null;
      }
      return withActiveWorkspace({ ...state, tabs: filtered, activeTabId: newActive }, w => ({
        ...w,
        repoPaths: w.repoPaths.filter(p => p !== action.payload),
        activeRepo: newActive,
      }));
    }
    case "SET_ACTIVE_TAB":
      return withActiveWorkspace({ ...state, activeTabId: action.payload }, w => ({
        ...w,
        activeRepo: action.payload,
      }));
    case "RESTORE_TABS":
      return { ...state, tabs: action.payload.tabs, activeTabId: action.payload.activeTabId };
    case "UPDATE_TAB":
      return updateTab(state, action.tabId, action.update);

    case "SET_REPO":
      return tabId ? updateTab(state, tabId, { repo: action.payload }) : state;
    case "SET_BRANCHES":
      return tabId ? updateTab(state, tabId, { branches: action.payload }) : state;
    case "SET_STATUS":
      return tabId ? updateTab(state, tabId, { status: action.payload }) : state;
    case "SET_GRAPH":
      return tabId ? updateTab(state, tabId, { graph: action.payload }) : state;
    case "SET_STASHES":
      return tabId ? updateTab(state, tabId, { stashes: action.payload }) : state;
    case "SET_TAGS":
      return tabId ? updateTab(state, tabId, { tags: action.payload }) : state;
    case "SET_REMOTES":
      return tabId ? updateTab(state, tabId, { remotes: action.payload }) : state;
    case "SET_PULL_REQUESTS":
      return tabId ? updateTab(state, tabId, { pullRequests: action.payload }) : state;
    case "SET_SELECTED_COMMIT":
      return tabId
        ? updateTab(state, tabId, { selectedCommitOid: action.payload, viewingDiffFile: null })
        : state;
    case "SET_SELECTED_COMMIT_INFO":
      return tabId ? updateTab(state, tabId, { selectedCommitInfo: action.payload }) : state;
    case "SET_COMMIT_DIFF":
      return tabId ? updateTab(state, tabId, { commitDiff: action.payload }) : state;
    case "SET_WORKING_DIFF":
      return tabId ? updateTab(state, tabId, { workingDiff: action.payload }) : state;
    case "SET_STAGED_DIFF":
      return tabId ? updateTab(state, tabId, { stagedDiff: action.payload }) : state;
    case "SET_ACTIVE_VIEW": {
      const next = { ...state, settingsOpen: false };
      return tabId
        ? updateTab(next, tabId, { activeView: action.payload, viewingDiffFile: null })
        : next;
    }
    case "SET_VIEWING_DIFF_FILE":
      return tabId ? updateTab(state, tabId, { viewingDiffFile: action.payload }) : state;
    case "SET_MERGE_STATUS":
      return tabId ? updateTab(state, tabId, { mergeStatus: action.payload }) : state;
    case "SET_CONFLICT_FILES":
      return tabId ? updateTab(state, tabId, { conflictFiles: action.payload }) : state;
    case "SET_GRAPH_QUERY":
      return tabId ? updateTab(state, tabId, { graphQuery: action.payload }) : state;
    case "SET_REFLOG":
      return tabId ? updateTab(state, tabId, { reflog: action.payload }) : state;
    case "SET_SUBMODULES":
      return tabId ? updateTab(state, tabId, { submodules: action.payload }) : state;
    case "SET_WORKTREES":
      return tabId ? updateTab(state, tabId, { worktrees: action.payload }) : state;
    case "SET_LFS":
      return tabId ? updateTab(state, tabId, { lfs: action.payload }) : state;
    case "SET_INSPECTING_PATH":
      return tabId ? updateTab(state, tabId, { inspectingPath: action.payload }) : state;
    case "SET_FILE_HISTORY":
      return tabId ? updateTab(state, tabId, { fileHistory: action.payload }) : state;
    case "SET_BLAME":
      return tabId ? updateTab(state, tabId, { blame: action.payload }) : state;
    case "SET_LAST_OP":
      return tabId ? updateTab(state, tabId, { lastOp: action.payload }) : state;
    case "SET_LOADING": {
      const tab = tabId ? state.tabs.find(t => t.id === tabId) : undefined;
      if (!tab) return state;
      return updateTab(state, tab.id, {
        loading: { ...tab.loading, [action.payload.key]: action.payload.value },
      });
    }

    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_THEME":
    case "SET_THEME_SILENT":
      return { ...state, theme: action.payload };
    case "SET_ALLOW_NETWORK":
      return { ...state, allowNetwork: action.payload };
    case "SET_EPHEMERAL":
      return { ...state, ephemeral: action.payload };
    case "SET_TRANSFER":
      return { ...state, transfer: action.payload };
    case "SET_PALETTE_OPEN":
      return { ...state, paletteOpen: action.payload };

    case "OPEN_SETTINGS":
      return {
        ...state,
        settingsOpen: true,
        settingsSection: action.payload ?? state.settingsSection,
      };
    case "CLOSE_SETTINGS":
      return { ...state, settingsOpen: false };
    case "SET_SETTINGS_SECTION":
      return { ...state, settingsSection: action.payload };

    case "CREATE_WORKSPACE":
      if (state.workspaces.some(w => w.id === action.payload.id)) return state;
      return { ...state, workspaces: [...state.workspaces, action.payload] };
    case "RENAME_WORKSPACE":
      return {
        ...state,
        workspaces: state.workspaces.map(w =>
          w.id === action.payload.id ? { ...w, name: action.payload.name } : w,
        ),
      };
    case "DELETE_WORKSPACE": {
      if (state.workspaces.length <= 1) return state;
      const workspaces = state.workspaces.filter(w => w.id !== action.payload);
      if (workspaces.length === state.workspaces.length) return state;
      if (state.activeWorkspaceId !== action.payload) return { ...state, workspaces };
      return {
        ...state,
        workspaces,
        activeWorkspaceId: workspaces[0].id,
        tabs: [],
        activeTabId: null,
      };
    }
    case "SET_ACTIVE_WORKSPACE": {
      if (action.payload === state.activeWorkspaceId) return state;
      if (!state.workspaces.some(w => w.id === action.payload)) return state;
      return { ...state, activeWorkspaceId: action.payload, tabs: [], activeTabId: null };
    }
    case "REMOVE_WORKSPACE_REPO":
      return {
        ...state,
        workspaces: state.workspaces.map(w =>
          w.id === action.payload.id
            ? {
                ...w,
                repoPaths: w.repoPaths.filter(p => p !== action.payload.path),
                activeRepo: w.activeRepo === action.payload.path ? null : w.activeRepo,
              }
            : w,
        ),
      };
    case "SET_WORKSPACE_AI":
      return {
        ...state,
        workspaces: state.workspaces.map(w =>
          w.id === action.payload.id ? { ...w, ai: { ...w.ai, ...action.payload.ai } } : w,
        ),
      };

    case "SET_REPO_SETTINGS": {
      const { path, settings } = action.payload;
      const prev = state.repoSettings[path] ?? EMPTY_REPO_SETTINGS;
      return { ...state, repoSettings: { ...state.repoSettings, [path]: { ...prev, ...settings } } };
    }
    case "CLEAR_REPO_SETTINGS": {
      const { [action.payload]: _dropped, ...rest } = state.repoSettings;
      return { ...state, repoSettings: rest };
    }

    case "RESTORE_SETTINGS":
      return { ...state, ...action.payload };
    case "SET_RESTORED":
      return { ...state, isRestored: true };
    default:
      return state;
  }
}

const AppContext = createContext<
  { state: AppState; dispatch: React.Dispatch<Action> } | undefined
>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialAppState);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}

export function useActiveTab(): RepoTab | null {
  const { state } = useApp();
  if (!state.activeTabId) return null;
  return state.tabs.find(t => t.id === state.activeTabId) ?? null;
}

export function useActiveWorkspace(): Workspace {
  const { state } = useApp();
  return state.workspaces.find(w => w.id === state.activeWorkspaceId) ?? state.workspaces[0];
}

export interface EffectiveRepoSettings extends RepoSettings {
  detected: boolean;
}

export function effectiveRepoSettings(
  explicit: RepoSettings | undefined,
  remotes: RemoteInfo[],
): EffectiveRepoSettings {
  const origin = remotes.find(r => r.name === "origin") ?? remotes[0];
  const found = origin ? detectProvider(origin.url) : null;
  const providerType = explicit?.providerType ?? found?.providerType ?? null;
  const same = found && found.providerType === providerType ? found : null;
  return {
    providerType,
    providerOwner: explicit?.providerOwner || same?.owner || "",
    providerRepo: explicit?.providerRepo || same?.repo || "",
    gitlabBaseUrl: explicit?.gitlabBaseUrl || same?.baseUrl || "https://gitlab.com",
    detected: !explicit?.providerType && Boolean(found),
  };
}

export function useRepoSettings(): EffectiveRepoSettings {
  const { state } = useApp();
  const tab = useActiveTab();
  const explicit = tab ? state.repoSettings[tab.id] : undefined;
  const remotes = tab?.remotes;
  return useMemo(() => effectiveRepoSettings(explicit, remotes ?? []), [explicit, remotes]);
}
