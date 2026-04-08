import { useState, useEffect, useMemo } from "react";
import { useGit } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DiffViewer } from "@/components/diff/diff-viewer";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  Plus, Minus, Check, RotateCcw, ArrowUp, ArrowDown,
  Trash2, Sparkles, CheckCircle, File, FolderOpen, FolderClosed,
  List, FolderTree,
} from "lucide-react";
import { cn, statusColor, statusIcon } from "@/lib/utils";
import * as api from "@/lib/api";
import type { StatusEntry } from "@/lib/api";



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

      let existing = current.find(n => n.name === name && n.isDir === !isLast);
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
    nodes.forEach(n => { if (n.isDir) sortNodes(n.children); });
  };
  sortNodes(root);
  return root;
}



type ViewMode = "path" | "tree";

export function ChangesView() {
  const {
    tab, stageFile, unstageFile, stageAll, unstageAll,
    discardFile, createCommit, amendCommit, refreshDiffs
  } = useGit();
  const [commitMessage, setCommitMessage] = useState("");
  const [isAmend, setIsAmend] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [viewingTab, setViewingTab] = useState<"unstaged" | "staged">("unstaged");
  const [viewMode, setViewMode] = useState<ViewMode>("path");

  useEffect(() => {
    refreshDiffs();
  }, [refreshDiffs]);

  if (!tab) return null;

  const status = tab.status;
  const unstaged = status?.entries.filter(e => !e.is_staged) ?? [];
  const staged = status?.entries.filter(e => e.is_staged) ?? [];

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    if (isAmend) {
      await amendCommit(commitMessage);
    } else {
      await createCommit(commitMessage);
    }
    setCommitMessage("");
    setIsAmend(false);
  };

  const handleGenerateMessage = async () => {
    if (tab.stagedDiff.length === 0) return;
    setGenerating(true);
    try {
      const diffText = tab.stagedDiff.map(f =>
        f.hunks.map(h => h.lines.map(l => `${l.origin}${l.content}`).join("")).join("")
      ).join("\n");
      const msg = await api.aiGenerateCommitMessage(diffText);
      setCommitMessage(msg);
    } catch {
      
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ResizablePanelGroup direction="horizontal">
      
      <ResizablePanel defaultSize="300px" minSize="220px" maxSize="480px">
        <div className="flex flex-col h-full bg-card overflow-hidden">

          
          <div className="flex items-center gap-1 px-2 h-7 border-b shrink-0 bg-muted/30">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex-1">Files</span>
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

          
          <div className="flex flex-col overflow-hidden" style={{ flex: unstaged.length > 0 ? "1 1 0%" : "0 0 auto" }}>
            <div className="flex items-center gap-1 px-2 h-8 border-b shrink-0 bg-muted/40">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                Unstaged ({unstaged.length})
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={stageAll} title="Stage all">
                <Plus className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => { if (confirm("Discard all changes?")) api.discardAll().then(refreshDiffs); }}
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

          
          <div className="flex flex-col overflow-hidden" style={{ flex: staged.length > 0 ? "1 1 0%" : "0 0 auto" }}>
            <div className="flex items-center gap-1 px-2 h-8 border-b shrink-0 bg-muted/40">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                Staged ({staged.length})
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={unstageAll} title="Unstage all">
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
                disabled={!commitMessage.trim() || staged.length === 0}
                size="sm"
                className="flex-1 gap-1.5 h-7 text-xs"
              >
                {isAmend ? <CheckCircle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
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
                title="AI generate commit message"
              >
                <Sparkles className={cn("h-3.5 w-3.5", generating && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      
      <ResizablePanel>
        <div className="flex flex-col h-full">
          <div className="h-8 border-b flex items-center px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0 bg-muted/40">
            {viewingTab === "unstaged" ? "Working Changes" : "Staged Changes"}
          </div>
          <div className="flex-1 overflow-auto">
            <DiffViewer files={viewingTab === "unstaged" ? tab.workingDiff : tab.stagedDiff} />
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}



function FileList({ entries, viewMode, staged, onStage, onUnstage, onDiscard, onClick }: {
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

  
  return <TreeNodes nodes={tree} depth={0} staged={staged} onStage={onStage} onUnstage={onUnstage} onDiscard={onDiscard} onClick={onClick} />;
}



function TreeNodes({ nodes, depth, staged, onStage, onUnstage, onDiscard, onClick }: {
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
          <DirNode key={node.path} node={node} depth={depth} staged={staged} onStage={onStage} onUnstage={onUnstage} onDiscard={onDiscard} onClick={onClick} />
        ) : (
          <FileRow
            key={node.path}
            path={node.name}
            fullPath={node.path}
            status={node.entry!.status}
            onStage={onStage ? () => onStage(node.entry!.path) : undefined}
            onUnstage={onUnstage ? () => onUnstage(node.entry!.path) : undefined}
            onDiscard={onDiscard ? () => onDiscard(node.entry!.path) : undefined}
            staged={staged}
            onClick={onClick}
            indent={depth}
          />
        )
      )}
    </>
  );
}

function DirNode({ node, depth, staged, onStage, onUnstage, onDiscard, onClick }: {
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
        {open
          ? <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
          : <FolderClosed className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <span className="truncate flex-1 font-mono text-xs font-medium text-muted-foreground">
          {node.name}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/60">{fileCount}</span>
      </div>
      {open && (
        <TreeNodes nodes={node.children} depth={depth + 1} staged={staged} onStage={onStage} onUnstage={onUnstage} onDiscard={onDiscard} onClick={onClick} />
      )}
    </>
  );
}



function FileRow({ path, fullPath, status, onStage, onUnstage, onDiscard, staged, onClick, indent }: {
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
  const dir = fullPath === undefined && path.includes("/") ? path.substring(0, path.lastIndexOf("/") + 1) : "";

  return (
    <div
      className="flex items-center gap-1.5 px-2 h-7 hover:bg-accent hover:text-accent-foreground group cursor-pointer transition-colors"
      style={indent !== undefined ? { paddingLeft: `${8 + indent * 16}px` } : undefined}
      onClick={onClick}
    >
      <span className="font-bold w-3.5 text-center shrink-0 text-xs" style={{ color }}>
        {icon}
      </span>
      <File className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate flex-1 font-mono text-xs" title={fullPath ?? path}>
        {dir && <span className="text-muted-foreground">{dir}</span>}
        {fileName}
      </span>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-px shrink-0 transition-opacity">
        {!staged && onStage && (
          <button
            onClick={(e) => { e.stopPropagation(); onStage(); }}
            className="p-0.5 rounded hover:bg-primary/20 hover:text-primary cursor-pointer"
            title="Stage"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
        )}
        {staged && onUnstage && (
          <button
            onClick={(e) => { e.stopPropagation(); onUnstage(); }}
            className="p-0.5 rounded hover:bg-accent cursor-pointer"
            title="Unstage"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        )}
        {!staged && onDiscard && (
          <button
            onClick={(e) => { e.stopPropagation(); onDiscard(); }}
            className="p-0.5 rounded hover:bg-destructive/20 cursor-pointer text-destructive"
            title="Discard"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
