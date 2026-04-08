import React, { createContext, useContext, useReducer, ReactNode } from "react";
import type {
  RepoInfo, BranchInfo, StatusResult, GraphResult,
  StashEntry, TagInfo, RemoteInfo, PullRequest, DiffFile, CommitInfo, MergeStatus,
  ConflictFileData,
} from "@/lib/api";


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
}

export type ViewType = "graph" | "changes" | "branches" | "prs" | "remotes" | "settings" | "merge-tool";

export interface AppState {
  tabs: RepoTab[];
  activeTabId: string | null;
  error: string | null;
  theme: "light" | "dark";
  isRestored: boolean;
  
  providerType: "github" | "gitlab" | "bitbucket" | null;
  providerToken: string;
  providerOwner: string;
  providerRepo: string;
  gitlabBaseUrl: string;
}

const initialState: AppState = {
  tabs: [],
  activeTabId: null,
  error: null,
  theme: "dark",
  isRestored: false,
  providerType: null,
  providerToken: "",
  providerOwner: "",
  providerRepo: "",
  gitlabBaseUrl: "https://gitlab.com",
};

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
  };
}

function updateTab(state: AppState, tabId: string, update: Partial<RepoTab>): AppState {
  return {
    ...state,
    tabs: state.tabs.map(t => t.id === tabId ? { ...t, ...update } : t),
  };
}

type Action =
  
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
  
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_THEME"; payload: "light" | "dark" }
  | { type: "SET_PROVIDER_TYPE"; payload: AppState["providerType"] }
  | { type: "SET_PROVIDER_TOKEN"; payload: string }
  | { type: "SET_PROVIDER_OWNER"; payload: string }
  | { type: "SET_PROVIDER_REPO"; payload: string }
  | { type: "SET_GITLAB_BASE_URL"; payload: string }
  | { type: "SET_THEME_SILENT"; payload: "light" | "dark" }
  | { type: "SET_PROVIDER_SETTINGS"; payload: Pick<AppState, "providerType" | "providerToken" | "providerOwner" | "providerRepo" | "gitlabBaseUrl"> }
  | { type: "SET_RESTORED" };

function reducer(state: AppState, action: Action): AppState {
  const tabId = state.activeTabId;

  switch (action.type) {
    
    case "ADD_TAB": {
      const existing = state.tabs.find(t => t.id === action.payload.path);
      if (existing) {
        return { ...state, activeTabId: existing.id };
      }
      const newTab = createRepoTab(action.payload);
      return {
        ...state,
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      };
    }
    case "CLOSE_TAB": {
      const filtered = state.tabs.filter(t => t.id !== action.payload);
      let newActive = state.activeTabId;
      if (state.activeTabId === action.payload) {
        const idx = state.tabs.findIndex(t => t.id === action.payload);
        newActive = filtered[Math.min(idx, filtered.length - 1)]?.id ?? null;
      }
      return { ...state, tabs: filtered, activeTabId: newActive };
    }
    case "SET_ACTIVE_TAB":
      return { ...state, activeTabId: action.payload };
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
      return tabId ? updateTab(state, tabId, { selectedCommitOid: action.payload, viewingDiffFile: null }) : state;
    case "SET_SELECTED_COMMIT_INFO":
      return tabId ? updateTab(state, tabId, { selectedCommitInfo: action.payload }) : state;
    case "SET_COMMIT_DIFF":
      return tabId ? updateTab(state, tabId, { commitDiff: action.payload }) : state;
    case "SET_WORKING_DIFF":
      return tabId ? updateTab(state, tabId, { workingDiff: action.payload }) : state;
    case "SET_STAGED_DIFF":
      return tabId ? updateTab(state, tabId, { stagedDiff: action.payload }) : state;
    case "SET_ACTIVE_VIEW":
      return tabId ? updateTab(state, tabId, { activeView: action.payload, viewingDiffFile: null }) : state;
    case "SET_VIEWING_DIFF_FILE":
      return tabId ? updateTab(state, tabId, { viewingDiffFile: action.payload }) : state;
    case "SET_MERGE_STATUS":
      return tabId ? updateTab(state, tabId, { mergeStatus: action.payload }) : state;
    case "SET_CONFLICT_FILES":
      return tabId ? updateTab(state, tabId, { conflictFiles: action.payload }) : state;
    case "SET_LOADING":
      if (!tabId) return state;
      return updateTab(state, tabId, {
        loading: {
          ...state.tabs.find(t => t.id === tabId)!.loading,
          [action.payload.key]: action.payload.value,
        },
      });

    
    case "SET_ERROR": return { ...state, error: action.payload };
    case "SET_THEME": return { ...state, theme: action.payload };
    case "SET_PROVIDER_TYPE": return { ...state, providerType: action.payload };
    case "SET_PROVIDER_TOKEN": return { ...state, providerToken: action.payload };
    case "SET_PROVIDER_OWNER": return { ...state, providerOwner: action.payload };
    case "SET_PROVIDER_REPO": return { ...state, providerRepo: action.payload };
    case "SET_GITLAB_BASE_URL": return { ...state, gitlabBaseUrl: action.payload };
    case "SET_THEME_SILENT": return { ...state, theme: action.payload };
    case "SET_PROVIDER_SETTINGS": return { ...state, ...action.payload };
    case "SET_RESTORED": return { ...state, isRestored: true };
    default: return state;
  }
}

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}

/** Get the currently active tab's state, or null if no tab. */
export function useActiveTab(): RepoTab | null {
  const { state } = useApp();
  if (!state.activeTabId) return null;
  return state.tabs.find(t => t.id === state.activeTabId) ?? null;
}
