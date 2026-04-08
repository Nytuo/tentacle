import { useCallback, useRef, useLayoutEffect, useState, useMemo, useEffect } from "react";
import { useGit } from "@/hooks/use-git";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuLabel, ContextMenuSub,
  ContextMenuSubTrigger, ContextMenuSubContent,
} from "@/components/ui/context-menu";
import { laneColor, formatTimestamp, formatFullDate, statusIcon, statusColor, cn } from "@/lib/utils";
import {
  File, User, Clock, GitCommit, Hash, X, Copy, GitBranch,
  ChevronsUp, RotateCcw, Undo2, Cherry, Tag,
  FolderOpen, FolderClosed, List, FolderTree,
} from "lucide-react";
import type { GraphNode, DiffFile } from "@/lib/api";
import { Button } from "@/components/ui/button";



interface DiffTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: DiffTreeNode[];
  file?: DiffFile;
}

function buildDiffTree(files: DiffFile[]): DiffTreeNode[] {
  const root: DiffTreeNode[] = [];
  for (const file of files) {
    const fullPath = file.new_path || file.old_path || "unknown";
    const parts = fullPath.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const segPath = parts.slice(0, i + 1).join("/");
      let node = current.find(n => n.name === name && n.isDir === !isLast);
      if (!node) {
        node = { name, path: segPath, isDir: !isLast, children: [], file: isLast ? file : undefined };
        current.push(node);
      }
      current = node.children;
    }
  }
  const sort = (nodes: DiffTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(n => { if (n.isDir) sort(n.children); });
  };
  sort(root);
  return root;
}

function DiffDirNode({ node, depth, onFileClick }: {
  node: DiffTreeNode;
  depth: number;
  onFileClick: (f: DiffFile) => void;
}) {
  const [open, setOpen] = useState(true);
  const count = useMemo(() => {
    let n = 0;
    const walk = (x: DiffTreeNode) => { if (!x.isDir) n++; else x.children.forEach(walk); };
    walk(node);
    return n;
  }, [node]);

  return (
    <>
      <div
        className="flex items-center gap-1.5 px-3 h-7 hover:bg-accent/60 cursor-pointer transition-colors select-none"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => setOpen(o => !o)}
      >
        {open
          ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <FolderClosed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="truncate flex-1 font-mono text-xs font-medium text-muted-foreground">
          {node.name}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/60">{count}</span>
      </div>
      {open && <DiffTreeNodes nodes={node.children} depth={depth + 1} onFileClick={onFileClick} />}
    </>
  );
}

function DiffTreeNodes({ nodes, depth, onFileClick }: {
  nodes: DiffTreeNode[];
  depth: number;
  onFileClick: (f: DiffFile) => void;
}) {
  return (
    <>
      {nodes.map(node =>
        node.isDir
          ? <DiffDirNode key={node.path} node={node} depth={depth} onFileClick={onFileClick} />
          : <DiffFileRow key={node.path} file={node.file!} label={node.name} indent={depth} onFileClick={onFileClick} />
      )}
    </>
  );
}

function DiffFileRow({ file, label, indent = 0, onFileClick }: {
  file: DiffFile;
  label: string;
  indent?: number;
  onFileClick: (f: DiffFile) => void;
}) {
  const fullPath = file.new_path || file.old_path || "unknown";
  const color = statusColor(file.status);
  return (
    <button
      className="w-full flex items-center gap-2 h-7 text-xs hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer text-left"
      style={{ paddingLeft: `${12 + indent * 16}px`, paddingRight: "12px" }}
      title={fullPath}
      onClick={() => onFileClick(file)}
    >
      <span className="font-bold w-4 text-center shrink-0" style={{ color }}>
        {statusIcon(file.status)}
      </span>
      <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate flex-1 font-mono">{label}</span>
      {!file.binary && (
        <span className="shrink-0 tabular-nums">
          <span className="text-green-500">+{file.additions}</span>
          {" "}
          <span className="text-red-400">-{file.deletions}</span>
        </span>
      )}
    </button>
  );
}

const ROW_HEIGHT = 32;
const LANE_WIDTH = 16;
const NODE_RADIUS = 4;

/** Deterministic hue from author name (0–360) */
function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 360;
}

/** Small colored-initial avatar for graph rows */
function AuthorAvatar({ name }: { name: string }) {
  const hue = nameHue(name);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center rounded-full text-[9px] font-bold select-none"
      style={{
        width: 16,
        height: 16,
        background: `hsl(${hue} 60% 45%)`,
        color: "white",
      }}
    >
      {initial}
    </span>
  );
}

/** Compute how wide the SVG graph column is */
function svgWidth(maxLanes: number) {
  return (maxLanes + 1) * LANE_WIDTH + 8;
}

function GraphSVG({ nodes, maxLanes, height, scrollTop, containerHeight }: {
  nodes: GraphNode[];
  maxLanes: number;
  height: number;
  scrollTop: number;
  containerHeight: number;
}) {
  const width = svgWidth(maxLanes);
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const endRow = Math.min(nodes.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + 5);
  const visibleNodes = nodes.slice(startRow, endRow);

  return (
    <svg
      width={width}
      height={height}
      className="shrink-0"
      style={{ minWidth: width }}
    >
      {visibleNodes.map((node, vi) => {
        const rowIdx = startRow + vi;
        const y = rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        return node.edges.map((edge, ei) => {
          const x1 = edge.from_lane * LANE_WIDTH + LANE_WIDTH / 2 + 4;
          const color = laneColor(edge.from_lane);
          const targetIdx = nodes.findIndex(n => n.oid === edge.target_oid);
          if (targetIdx < 0) return null;
          const y2 = targetIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
          const x2 = edge.to_lane * LANE_WIDTH + LANE_WIDTH / 2 + 4;
          if (edge.from_lane === edge.to_lane) {
            return <line key={`${rowIdx}-${ei}`} x1={x1} y1={y} x2={x2} y2={y2} stroke={color} strokeWidth={1.5} opacity={0.7} />;
          }
          const midY = (y + y2) / 2;
          return (
            <path
              key={`${rowIdx}-${ei}`}
              d={`M ${x1} ${y} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
              fill="none"
              stroke={laneColor(edge.to_lane)}
              strokeWidth={1.5}
              opacity={0.6}
            />
          );
        });
      })}
      {visibleNodes.map((node, vi) => {
        const rowIdx = startRow + vi;
        const cx = node.lane * LANE_WIDTH + LANE_WIDTH / 2 + 4;
        const cy = rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const color = laneColor(node.lane);
        const isWip = node.oid === "WIP";
        return (
          <circle
            key={node.oid}
            cx={cx}
            cy={cy}
            r={node.is_merge ? NODE_RADIUS + 1 : NODE_RADIUS}
            fill={isWip ? "transparent" : (node.is_merge ? "var(--color-background)" : color)}
            stroke={color}
            strokeWidth={2}
            strokeDasharray={isWip ? "3 2" : undefined}
          />
        );
      })}
    </svg>
  );
}

/** Inline ref badge — branch=teal, tag=amber */
function RefBadge({ ref: refName }: { ref: string }) {
  const isTag = refName.startsWith("tag: ") || refName.startsWith("refs/tags/");
  const isRemote = refName.startsWith("refs/remotes/");
  const label = refName
    .replace(/^refs\/(heads|tags|remotes)\//, "")
    .replace(/^tag: /, "");
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-mono font-bold shrink-0 border shadow-sm transition-all cursor-default select-none",
      isTag
        ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
        : isRemote
          ? "bg-purple-500/20 text-purple-400 border-purple-500/40"
          : "bg-primary/20 text-primary border-primary/40"
    )}>
      {isTag ? <Tag className="h-2.5 w-2.5" /> : <GitBranch className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

/** Commit detail panel — right side */
export function CommitDetailPanel({ onClose }: { onClose: () => void }) {
  const { tab, dispatch } = useGit();
  const [viewMode, setViewMode] = useState<"path" | "tree">("path");

  const commit = tab?.selectedCommitInfo;
  const diff = tab?.commitDiff ?? [];

  
  useEffect(() => {
    setViewMode("path");
  }, [tab?.selectedCommitOid]);

  if (!commit) return null;

  const title = commit.summary;
  const body = commit.message.length > commit.summary.length
    ? commit.message.slice(commit.summary.length).trim()
    : null;

  const handleFileClick = (file: DiffFile) => {
    dispatch({ type: "SET_VIEWING_DIFF_FILE", payload: file });
  };

  return (
    <div className="h-full flex flex-col bg-card">
      
      <div className="px-3 py-3 border-b shrink-0 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-snug flex-1">{title}</h3>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        {body && (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{body}</p>
        )}
        {commit.refs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {commit.refs.map(ref => <RefBadge key={ref} ref={ref} />)}
          </div>
        )}
        <Separator />
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Hash className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono text-primary">{commit.short_oid}</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span>{commit.author_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{formatFullDate(commit.author_time)}</span>
          </div>
          {commit.parent_oids.length > 0 && (
            <div className="flex items-center gap-2">
              <GitCommit className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono">{commit.parent_oids.map(p => p.slice(0, 7)).join(", ")}</span>
            </div>
          )}
        </div>
      </div>

      
      <div className="px-2 h-8 border-b shrink-0 flex items-center gap-1 bg-muted/40">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1 pl-1">
          Files changed ({diff.length})
        </span>
        <Button
          variant={viewMode === "path" ? "secondary" : "ghost"}
          size="icon"
          className="h-5 w-5"
          onClick={() => setViewMode("path")}
          title="Flat list"
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

      
      <ScrollArea className="flex-1">
        <div className="py-px">
          {viewMode === "path" ? (
            /* ── Flat path list ── */
            diff.map((file, idx) => {
              const path = file.new_path || file.old_path || "unknown";
              const fileName = path.split("/").pop() || path;
              const dir = path.includes("/") ? path.substring(0, path.lastIndexOf("/") + 1) : "";
              return (
                <button
                  key={idx}
                  className="w-full flex items-center gap-2 px-3 h-7 text-xs hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer text-left"
                  onClick={() => handleFileClick(file)}
                >
                  <span className="font-bold w-4 text-center shrink-0" style={{ color: statusColor(file.status) }}>
                    {statusIcon(file.status)}
                  </span>
                  <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1 font-mono">
                    {dir && <span className="text-muted-foreground">{dir}</span>}
                    {fileName}
                  </span>
                  {!file.binary && (
                    <span className="shrink-0 tabular-nums">
                      <span className="text-green-500">+{file.additions}</span>
                      {" "}
                      <span className="text-red-400">-{file.deletions}</span>
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            /* ── Full diff tree ── */
            <DiffTreeNodes
              nodes={buildDiffTree(diff)}
              depth={0}
              onFileClick={handleFileClick}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function GraphView() {
  const { tab, selectCommit, checkoutCommit, createBranch, mergeBranch, rebaseOnto, cherryPick, revertCommit, resetToCommit, createTag } = useGit();
  const graph = tab?.graph;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  
  
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    setContainerHeight(el.clientHeight || 600);
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setContainerHeight(h);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <GitCommit className="h-10 w-10 mx-auto opacity-30" />
          <p className="text-sm font-medium">No commits yet</p>
          <p className="text-xs opacity-60">Make your first commit to see the history</p>
        </div>
      </div>
    );
  }

  const totalHeight = graph.nodes.length * ROW_HEIGHT;
  const hasSelection = tab?.selectedCommitOid != null;
  const graphColWidth = svgWidth(graph.max_lanes);

  return (
    <ResizablePanelGroup direction="horizontal" key={hasSelection ? "with-detail" : "no-detail"}>
      <ResizablePanel minSize="400px">
        <div className="flex flex-col h-full">
          
          <div className="h-8 border-b flex items-center px-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider shrink-0 bg-muted/40 select-none">
            
            <span style={{ width: graphColWidth, minWidth: graphColWidth }} className="shrink-0" />
            
            <span className="w-16 shrink-0 pl-1">Hash</span>
            
            <span className="flex-1 ml-2">Message</span>
            
            <span className="w-36 text-right shrink-0">Author</span>
            
            <span className="w-28 text-right pr-2 shrink-0">Date</span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
            {/* The outer div establishes the scroll height. Inside we use a grid
                so the SVG and text rows share the same row without absolute positioning. */}
            <div style={{ height: totalHeight, display: "grid", gridTemplateColumns: `${graphColWidth}px 1fr` }}>
              
              <GraphSVG
                nodes={graph.nodes}
                maxLanes={graph.max_lanes}
                height={totalHeight}
                scrollTop={scrollTop}
                containerHeight={containerHeight}
              />

              
              <div className="relative">
                {graph.nodes.map((node, idx) => (
                  <ContextMenu key={node.oid}>
                    <ContextMenuTrigger asChild>
                      <div
                        draggable={node.oid !== "WIP"}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/git-oid", node.oid);
                          e.dataTransfer.setData("application/git-summary", node.summary);
                          e.dataTransfer.effectAllowed = "copyMove";
                        }}
                        onDragOver={(e) => {
                          if (node.oid !== "WIP") {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const sourceOid = e.dataTransfer.getData("application/git-oid");
                          const sourceSummary = e.dataTransfer.getData("application/git-summary");
                          if (sourceOid && sourceOid !== node.oid) {
                            const action = window.prompt(
                              `Dropped commit ${sourceOid.slice(0, 7)} (${sourceSummary}) onto ${node.short_oid}.\n\n` +
                              `Choose action:\n(m) Merge into current branch\n(r) Rebase current branch onto this\n(c) Cherry-pick onto current`,
                              "m"
                            );
                            if (action === "m") mergeBranch(sourceOid);
                            else if (action === "r") rebaseOnto(node.oid);
                            else if (action === "c") cherryPick(sourceOid);
                          }
                        }}
                        className={cn(
                          "absolute inset-x-0 flex items-center px-2 text-xs cursor-pointer transition-colors group",
                          tab?.selectedCommitOid === node.oid
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/50",
                          node.oid === "WIP" && "opacity-80 italic"
                        )}
                        style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}
                        onClick={() => selectCommit(node.oid)}
                      >
                        
                        <span className="w-16 font-mono text-primary shrink-0 pl-1 truncate">
                          {node.oid === "WIP" ? "--" : node.short_oid}
                        </span>

                        
                        <span className="flex-1 ml-2 flex items-center gap-1 min-w-0 overflow-hidden">
                          {node.oid === "WIP" && (
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-muted-foreground border border-dashed shrink-0">
                              WIP
                            </span>
                          )}
                          {node.refs.map(ref => <RefBadge key={ref} ref={ref} />)}
                          <span className={cn("truncate", node.oid === "WIP" && "text-muted-foreground font-medium")}>
                            {node.summary}
                          </span>
                        </span>

                        
                        <span className="w-36 flex items-center justify-end gap-1.5 text-muted-foreground shrink-0 overflow-hidden">
                          <span className="truncate text-right">{node.author_name}</span>
                          <AuthorAvatar name={node.author_name} />
                        </span>

                        
                        <span className="w-28 text-right text-muted-foreground shrink-0 pr-2 tabular-nums">
                          {node.oid === "WIP" ? "now" : formatTimestamp(node.author_time)}
                        </span>
                      </div>
                    </ContextMenuTrigger>

                    <ContextMenuContent className="w-56">
                      <ContextMenuLabel className="text-xs font-mono text-muted-foreground font-normal">
                        {node.short_oid} — {node.summary.length > 32 ? node.summary.slice(0, 32) + "…" : node.summary}
                      </ContextMenuLabel>
                      <ContextMenuSeparator />

                      
                      <ContextMenuItem
                        className="gap-2 text-xs"
                        onSelect={() => navigator.clipboard.writeText(node.oid)}
                      >
                        <Copy className="h-3.5 w-3.5 shrink-0" />
                        Copy full SHA
                      </ContextMenuItem>
                      <ContextMenuItem
                        className="gap-2 text-xs"
                        onSelect={() => navigator.clipboard.writeText(node.short_oid)}
                      >
                        <Copy className="h-3.5 w-3.5 shrink-0 opacity-0" />
                        Copy short SHA
                      </ContextMenuItem>

                      <ContextMenuSeparator />

                      
                      <ContextMenuItem
                        className="gap-2 text-xs"
                        onSelect={() => checkoutCommit(node.oid)}
                      >
                        <ChevronsUp className="h-3.5 w-3.5 shrink-0" />
                        Checkout commit
                      </ContextMenuItem>

                      
                      <ContextMenuItem
                        className="gap-2 text-xs"
                        onSelect={() => {
                          const name = window.prompt("New branch name:");
                          if (name?.trim()) createBranch(name.trim(), node.oid);
                        }}
                      >
                        <GitBranch className="h-3.5 w-3.5 shrink-0" />
                        Create branch here…
                      </ContextMenuItem>

                      
                      <ContextMenuItem
                        className="gap-2 text-xs"
                        onSelect={() => {
                          const name = window.prompt("Tag name:");
                          if (name?.trim()) createTag(name.trim(), node.oid);
                        }}
                      >
                        <Tag className="h-3.5 w-3.5 shrink-0" />
                        Create tag here…
                      </ContextMenuItem>

                      <ContextMenuSeparator />

                      
                      <ContextMenuItem
                        className="gap-2 text-xs"
                        onSelect={() => cherryPick(node.oid)}
                      >
                        <Cherry className="h-3.5 w-3.5 shrink-0" />
                        Cherry-pick
                      </ContextMenuItem>

                      
                      <ContextMenuItem
                        className="gap-2 text-xs"
                        onSelect={() => revertCommit(node.oid)}
                      >
                        <Undo2 className="h-3.5 w-3.5 shrink-0" />
                        Revert commit
                      </ContextMenuItem>

                      <ContextMenuSeparator />

                      
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="gap-2 text-xs">
                          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                          Reset current branch to here
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-48">
                          <ContextMenuItem
                            className="gap-2 text-xs"
                            onSelect={() => resetToCommit(node.oid, "soft")}
                          >
                            <span className="w-3.5 shrink-0" />
                            Soft — keep index &amp; working tree
                          </ContextMenuItem>
                          <ContextMenuItem
                            className="gap-2 text-xs"
                            onSelect={() => resetToCommit(node.oid, "mixed")}
                          >
                            <span className="w-3.5 shrink-0" />
                            Mixed — keep working tree
                          </ContextMenuItem>
                          <ContextMenuItem
                            className="gap-2 text-xs text-destructive focus:text-destructive"
                            onSelect={() => {
                              if (window.confirm(`Hard reset to ${node.short_oid}? Uncommitted changes will be lost.`)) {
                                resetToCommit(node.oid, "hard");
                              }
                            }}
                          >
                            <span className="w-3.5 shrink-0" />
                            Hard — discard all changes
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ResizablePanel>

      {hasSelection && (
        <>
          <ResizableHandle />
          <ResizablePanel defaultSize="420px" minSize="280px" maxSize="700px">
            <CommitDetailPanel onClose={() => selectCommit(null)} />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
