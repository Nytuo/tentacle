import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useGit } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StagingDiffViewer } from "@/components/diff/staging-diff-viewer";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { confirmThat, promptFor } from "@/components/ui/prompt-dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle,
  File,
  FolderClosed,
  FolderOpen,
  FolderTree,
  List,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn, statusColor, statusIcon } from "@/lib/utils";
import * as api from "@/lib/api";
import type { StatusEntry } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { EyeOff, FileClock, ScanLine } from "lucide-react";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  entry?: StatusEntry;
}

function buildTree(entries: StatusEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const entry of entries) {
    const parts = entry.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const segmentPath = parts.slice(0, i + 1).join("/");

      let existing = current.find(
        (n) => n.name === name && n.isDir === !isLast,
      );
      if (!existing) {
        existing = {
          name,
          path: segmentPath,
          isDir: !isLast,
          children: [],
          entry: isLast ? entry : undefined,
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => {
      if (n.isDir) sortNodes(n.children);
    });
  };
  sortNodes(root);
  return root;
}

type ViewMode = "path" | "tree";

interface InspectActions {
  history: (path: string) => void;
  blame: (path: string) => void;
  ignore: (path: string) => void;
  copyPath: (path: string) => void;
}

const InspectContext = createContext<InspectActions | null>(null);

export function ChangesView() {
  const {
    tab,
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    discardFile,
    discardAll,
    createCommit,
    refreshDiffs,
    stageHunks,
    unstageHunks,
    discardHunks,
    showFileHistory,
    showBlame,
    ignorePath,
    setError,
  } = useGit();
  const [commitMessage, setCommitMessage] = useState("");
  const [isAmend, setIsAmend] = useState(false);
  const [signOff, setSignOff] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [viewingTab, setViewingTab] = useState<"unstaged" | "staged">(
    "unstaged",
  );
  const [viewMode, setViewMode] = useState<ViewMode>("path");

  useEffect(() => {
    refreshDiffs();
  }, [refreshDiffs]);

  useEffect(() => {
    if (!isAmend) return;
    let cancelled = false;
    api
      .getHeadMessage()
      .then((msg) => {
        if (!cancelled) {
          setCommitMessage((prev) => (prev.trim() ? prev : msg.trim()));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAmend]);

  if (!tab) return null;

  const status = tab.status;
  const unstaged = status?.entries.filter((e) => !e.is_staged) ?? [];
  const staged = status?.entries.filter((e) => e.is_staged) ?? [];

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    await createCommit(commitMessage, { amend: isAmend, sign_off: signOff });
    setCommitMessage("");
    setIsAmend(false);
  };

  const handleGenerateMessage = async () => {
    if (tab.stagedDiff.length === 0) return;
    setGenerating(true);
    try {
      const diffText = tab.stagedDiff
        .map((f) =>
          f.hunks
            .map((h) => h.lines.map((l) => `${l.origin}${l.content}`).join(""))
            .join(""),
        )
        .join("\n");
      const msg = await api.aiGenerateCommitMessage(diffText);
      setCommitMessage(msg);
    } catch {
    } finally {
      setGenerating(false);
    }
  };

  const inspect: InspectActions = {
    history: (path) => void showFileHistory(path),
    blame: (path) => void showBlame(path),
    ignore: (path) => void ignorePath(path),
    copyPath: (path) => {
      navigator.clipboard
        .writeText(path)
        .catch(() => setError("Could not copy to the clipboard"));
    },
  };

  return (
    <InspectContext.Provider value={inspect}>
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize="300px" minSize="220px" maxSize="480px">
          <div className="flex flex-col h-full bg-card overflow-hidden">
            <div className="flex items-center gap-1 px-2 h-7 border-b shrink-0 bg-muted/30">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex-1">
                Files
              </span>
              <Button
                variant={viewMode === "path" ? "secondary" : "ghost"}
                size="icon"
                className="h-5 w-5"
                onClick={() => setViewMode("path")}
                title="Flat list (path)"
              >
                <List className="h-3 w-3" />
              </Button>
              <Button
                variant={viewMode === "tree" ? "secondary" : "ghost"}
                size="icon"
                className="h-5 w-5"
                onClick={() => setViewMode("tree")}
                title="Tree view"
              >
                <FolderTree className="h-3 w-3" />
              </Button>
            </div>

            <div
              className="flex flex-col overflow-hidden"
              style={{ flex: unstaged.length > 0 ? "1 1 0%" : "0 0 auto" }}
            >
              <div className="flex items-center gap-1 px-2 h-8 border-b shrink-0 bg-muted/40">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                  Unstaged ({unstaged.length})
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={stageAll}
                  title="Stage all"
                >
                  <Plus className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={async () => {
                    const ok = await confirmThat({
                      title: "Discard every change in the working tree?",
                      description:
                        "Tracked files go back to their staged state. This cannot be undone.",
                      confirmLabel: "Discard all",
                      destructive: true,
                    });
                    if (ok) void discardAll(false);
                  }}
                  title="Discard all"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <FileList
                  entries={unstaged}
                  viewMode={viewMode}
                  staged={false}
                  onStage={stageFile}
                  onDiscard={discardFile}
                  onClick={() => setViewingTab("unstaged")}
                />
                {unstaged.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                    No unstaged changes
                  </div>
                )}
              </ScrollArea>
            </div>

            <Separator />

            <div
              className="flex flex-col overflow-hidden"
              style={{ flex: staged.length > 0 ? "1 1 0%" : "0 0 auto" }}
            >
              <div className="flex items-center gap-1 px-2 h-8 border-b shrink-0 bg-muted/40">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                  Staged ({staged.length})
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={unstageAll}
                  title="Unstage all"
                >
                  <Minus className="h-3 w-3" />
                </Button>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <FileList
                  entries={staged}
                  viewMode={viewMode}
                  staged={true}
                  onUnstage={unstageFile}
                  onClick={() => setViewingTab("staged")}
                />
                {staged.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                    No staged changes
                  </div>
                )}
              </ScrollArea>
            </div>

            <Separator />

            <div className="p-2.5 space-y-2 shrink-0">
              <Textarea
                placeholder="Commit message..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                className="min-h-[68px] text-sm resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleCommit();
                  }
                }}
              />
              <div className="flex items-center gap-1.5">
                <Button
                  onClick={handleCommit}
                  disabled={
                    !commitMessage.trim() || (staged.length === 0 && !isAmend)
                  }
                  size="sm"
                  className="flex-1 gap-1.5 h-7 text-xs"
                >
                  {isAmend ? (
                    <CheckCircle className="h-3.5 w-3.5" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {isAmend ? "Amend" : "Commit"}
                </Button>
                <Button
                  variant={isAmend ? "secondary" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setIsAmend(!isAmend)}
                >
                  Amend
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={handleGenerateMessage}
                  disabled={generating || staged.length === 0}
                  title="Generate a commit message locally with Ollama"
                >
                  <Sparkles
                    className={cn("h-3.5 w-3.5", generating && "animate-spin")}
                  />
                </Button>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                <Switch
                  checked={signOff}
                  onCheckedChange={setSignOff}
                  className="scale-75 -ml-1"
                />
                Add <span className="font-mono">Signed-off-by</span> trailer
              </label>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel>
          <div className="flex flex-col h-full">
            <div className="h-8 border-b flex items-center gap-1 px-2 shrink-0 bg-muted/40">
              {(["unstaged", "staged"] as const).map((t) => (
                <Button
                  key={t}
                  variant={viewingTab === t ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 text-[11px] capitalize"
                  onClick={() => setViewingTab(t)}
                >
                  {t === "unstaged" ? "Working changes" : "Staged changes"}
                </Button>
              ))}
              <span className="flex-1" />
              <span className="text-[10px] text-muted-foreground pr-1">
                Click lines to stage part of a hunk
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <StagingDiffViewer
                key={viewingTab}
                files={
                  viewingTab === "unstaged" ? tab.workingDiff : tab.stagedDiff
                }
                side={viewingTab}
                onStage={(path, selections) =>
                  selections.length === 0
                    ? void stageFile(path)
                    : void stageHunks(path, selections)
                }
                onUnstage={(path, selections) =>
                  selections.length === 0
                    ? void unstageFile(path)
                    : void unstageHunks(path, selections)
                }
                onDiscard={(path, selections) =>
                  selections.length === 0
                    ? void discardFile(path)
                    : void discardHunks(path, selections)
                }
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </InspectContext.Provider>
  );
}

function FileList({
  entries,
  viewMode,
  staged,
  onStage,
  onUnstage,
  onDiscard,
  onClick,
}: {
  entries: StatusEntry[];
  viewMode: ViewMode;
  staged: boolean;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
  onDiscard?: (path: string) => void;
  onClick?: () => void;
}) {
  const tree = useMemo(() => buildTree(entries), [entries]);

  if (entries.length === 0) return null;

  if (viewMode === "path") {
    return (
      <>
        {entries.map((entry) => (
          <FileRow
            key={entry.path}
            path={entry.path}
            status={entry.status}
            onStage={onStage ? () => onStage(entry.path) : undefined}
            onUnstage={onUnstage ? () => onUnstage(entry.path) : undefined}
            onDiscard={onDiscard ? () => onDiscard(entry.path) : undefined}
            staged={staged}
            onClick={onClick}
          />
        ))}
      </>
    );
  }

  return (
    <TreeNodes
      nodes={tree}
      depth={0}
      staged={staged}
      onStage={onStage}
      onUnstage={onUnstage}
      onDiscard={onDiscard}
      onClick={onClick}
    />
  );
}

function TreeNodes({
  nodes,
  depth,
  staged,
  onStage,
  onUnstage,
  onDiscard,
  onClick,
}: {
  nodes: TreeNode[];
  depth: number;
  staged: boolean;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
  onDiscard?: (path: string) => void;
  onClick?: () => void;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.isDir ? (
          <DirNode
            key={node.path}
            node={node}
            depth={depth}
            staged={staged}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
            onClick={onClick}
          />
        ) : (
          <FileRow
            key={node.path}
            path={node.name}
            fullPath={node.path}
            status={node.entry!.status}
            onStage={onStage ? () => onStage(node.entry!.path) : undefined}
            onUnstage={
              onUnstage ? () => onUnstage(node.entry!.path) : undefined
            }
            onDiscard={
              onDiscard ? () => onDiscard(node.entry!.path) : undefined
            }
            staged={staged}
            onClick={onClick}
            indent={depth}
          />
        ),
      )}
    </>
  );
}

function DirNode({
  node,
  depth,
  staged,
  onStage,
  onUnstage,
  onDiscard,
  onClick,
}: {
  node: TreeNode;
  depth: number;
  staged: boolean;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
  onDiscard?: (path: string) => void;
  onClick?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const fileCount = useMemo(() => {
    let count = 0;
    const walk = (n: TreeNode) => {
      if (!n.isDir) count++;
      else n.children.forEach(walk);
    };
    walk(node);
    return count;
  }, [node]);

  return (
    <>
      <div
        className="flex items-center gap-1.5 px-2 h-7 hover:bg-accent/60 cursor-pointer transition-colors select-none"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <FolderClosed className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate flex-1 font-mono text-xs font-medium text-muted-foreground">
          {node.name}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/60">
          {fileCount}
        </span>
      </div>
      {open && (
        <TreeNodes
          nodes={node.children}
          depth={depth + 1}
          staged={staged}
          onStage={onStage}
          onUnstage={onUnstage}
          onDiscard={onDiscard}
          onClick={onClick}
        />
      )}
    </>
  );
}

function FileRow({
  path,
  fullPath,
  status,
  onStage,
  onUnstage,
  onDiscard,
  staged,
  onClick,
  indent,
}: {
  path: string;
  fullPath?: string;
  status: string;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  staged?: boolean;
  onClick?: () => void;
  indent?: number;
}) {
  const color = statusColor(status);
  const icon = statusIcon(status);

  const fileName = path.split("/").pop() || path;
  const dir =
    fullPath === undefined && path.includes("/")
      ? path.substring(0, path.lastIndexOf("/") + 1)
      : "";

  const target = fullPath ?? path;

  const row = (
    <div
      className="flex items-center gap-1.5 px-2 h-7 hover:bg-accent hover:text-accent-foreground group cursor-pointer transition-colors"
      style={
        indent !== undefined
          ? { paddingLeft: `${8 + indent * 16}px` }
          : undefined
      }
      onClick={onClick}
    >
      <span
        className="font-bold w-3.5 text-center shrink-0 text-xs"
        style={{ color }}
      >
        {icon}
      </span>
      <File className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span
        className="truncate flex-1 font-mono text-xs"
        title={fullPath ?? path}
      >
        {dir && <span className="text-muted-foreground">{dir}</span>}
        {fileName}
      </span>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-px shrink-0 transition-opacity">
        {!staged && onStage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStage();
            }}
            className="p-0.5 rounded hover:bg-primary/20 hover:text-primary cursor-pointer"
            title="Stage"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
        )}
        {staged && onUnstage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnstage();
            }}
            className="p-0.5 rounded hover:bg-accent cursor-pointer"
            title="Unstage"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        )}
        {!staged && onDiscard && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            className="p-0.5 rounded hover:bg-destructive/20 cursor-pointer text-destructive"
            title="Discard"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );

  const onInspect = useContext(InspectContext);
  if (!onInspect) return row;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          className="gap-2 text-xs"
          onSelect={() => onInspect.history(target)}
        >
          <FileClock className="h-3.5 w-3.5 shrink-0" />
          File history
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 text-xs"
          onSelect={() => onInspect.blame(target)}
        >
          <ScanLine className="h-3.5 w-3.5 shrink-0" />
          Blame
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2 text-xs"
          onSelect={() => onInspect.copyPath(target)}
        >
          <File className="h-3.5 w-3.5 shrink-0" />
          Copy path
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 text-xs"
          onSelect={() => onInspect.ignore(target)}
        >
          <EyeOff className="h-3.5 w-3.5 shrink-0" />
          Add to .gitignore
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
