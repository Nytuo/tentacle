import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useGit } from "@/hooks/use-git";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  cn,
  formatFullDate,
  formatTimestamp,
  laneColor,
  statusColor,
  statusIcon,
} from "@/lib/utils";
import {
  Check,
  Cherry,
  ChevronsUp,
  CircleSlash,
  Clock,
  Cloud,
  Combine,
  Copy,
  File,
  FileClock,
  FolderClosed,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitCommit,
  Hash,
  Layers,
  List,
  ListOrdered,
  RotateCcw,
  ScanLine,
  Search,
  ShieldCheck,
  Tag,
  Undo2,
  User,
  X,
} from "lucide-react";
import type { DiffFile, GraphNode, RefInfo } from "@/lib/api";
import { buildSquashPlan } from "@/components/graph/squash-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  chooseFrom,
  confirmThat,
  promptFor,
} from "@/components/ui/prompt-dialog";
import { InteractiveRebaseDialog } from "@/components/graph/interactive-rebase";

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
      let node = current.find((n) => n.name === name && n.isDir === !isLast);
      if (!node) {
        node = {
          name,
          path: segPath,
          isDir: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
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
    nodes.forEach((n) => {
      if (n.isDir) sort(n.children);
    });
  };
  sort(root);
  return root;
}

function DiffDirNode({
  node,
  depth,
  onFileClick,
}: {
  node: DiffTreeNode;
  depth: number;
  onFileClick: (f: DiffFile) => void;
}) {
  const [open, setOpen] = useState(true);
  const count = useMemo(() => {
    let n = 0;
    const walk = (x: DiffTreeNode) => {
      if (!x.isDir) n++;
      else x.children.forEach(walk);
    };
    walk(node);
    return n;
  }, [node]);

  return (
    <>
      <div
        className="flex items-center gap-1.5 px-3 h-7 hover:bg-accent/60 cursor-pointer transition-colors select-none"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <FolderClosed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate flex-1 font-mono text-xs font-medium text-muted-foreground">
          {node.name}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/60">
          {count}
        </span>
      </div>
      {open && (
        <DiffTreeNodes
          nodes={node.children}
          depth={depth + 1}
          onFileClick={onFileClick}
        />
      )}
    </>
  );
}

function DiffTreeNodes({
  nodes,
  depth,
  onFileClick,
}: {
  nodes: DiffTreeNode[];
  depth: number;
  onFileClick: (f: DiffFile) => void;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.isDir ? (
          <DiffDirNode
            key={node.path}
            node={node}
            depth={depth}
            onFileClick={onFileClick}
          />
        ) : (
          <DiffFileRow
            key={node.path}
            file={node.file!}
            label={node.name}
            indent={depth}
            onFileClick={onFileClick}
          />
        ),
      )}
    </>
  );
}

function DiffFileRow({
  file,
  label,
  indent = 0,
  onFileClick,
}: {
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
          <span className="text-green-500">+{file.additions}</span>{" "}
          <span className="text-red-400">-{file.deletions}</span>
        </span>
      )}
    </button>
  );
}

const ROW_HEIGHT = 32;

const NODE_SIZE = 18;
const LANE_WIDTH = NODE_SIZE + 6;
const LINE_WIDTH = 2;

const REF_COL_WIDTH = 148;

const OVERSCAN = 6;

function laneX(lane: number) {
  return lane * LANE_WIDTH + LANE_WIDTH / 2 + 2;
}

function laneY(row: number) {
  return row * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function identityHue(identity: string): number {
  let h = 0;
  for (let i = 0; i < identity.length; i++) {
    h = (h * 31 + identity.charCodeAt(i)) & 0xffff;
  }
  return h % 360;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function svgWidth(maxLanes: number) {
  return (maxLanes + 1) * LANE_WIDTH + 8;
}

function GraphLanes({
  nodes,
  maxLanes,
  height,
  startRow,
  endRow,
}: {
  nodes: GraphNode[];
  maxLanes: number;
  height: number;
  startRow: number;
  endRow: number;
}) {
  const width = svgWidth(maxLanes);
  const visibleNodes = nodes.slice(startRow, endRow);

  return (
    <svg
      width={width}
      height={height}
      className="absolute inset-y-0 left-0"
      style={{ minWidth: width }}
    >
      {visibleNodes.map((node, vi) => {
        const rowIdx = startRow + vi;
        const y1 = laneY(rowIdx);
        const y2 = laneY(rowIdx + 1);
        return node.edges.map((edge, ei) => {
          const x1 = laneX(edge.from_lane);
          const x2 = laneX(edge.to_lane);
          const color = laneColor(edge.color);
          const key = `${rowIdx}-${ei}`;
          if (x1 === x2) {
            return (
              <line
                key={key}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={LINE_WIDTH}
                strokeLinecap="round"
              />
            );
          }

          const bend = (y2 - y1) * 0.5;
          return (
            <path
              key={key}
              d={`M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${
                y2 - bend
              }, ${x2} ${y2}`}
              fill="none"
              stroke={color}
              strokeWidth={LINE_WIDTH}
              strokeLinecap="round"
            />
          );
        });
      })}
    </svg>
  );
}

function CommitNode({
  node,
  row,
  selected,
  onClick,
}: {
  node: GraphNode;
  row: number;
  selected: boolean;
  onClick: (event: React.MouseEvent, row: number, oid: string) => void;
}) {
  const isWip = node.oid === "WIP";
  const lane = laneColor(node.color);
  const hue = identityHue(node.author_email || node.author_name);

  const dot = (
    <div
      role="button"
      tabIndex={-1}
      onClick={(event) => onClick(event, row, node.oid)}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center select-none pointer-events-auto"
      style={{
        left: laneX(node.lane),
        top: laneY(row),
        width: NODE_SIZE,
        height: NODE_SIZE,

        background: isWip ? "var(--color-background)" : `hsl(${hue} 55% 45%)`,
        boxShadow: selected
          ? `0 0 0 2px ${lane}, 0 0 0 5px color-mix(in oklab, ${lane} 35%, transparent)`
          : `0 0 0 2px ${lane}`,
        border: isWip ? `1.5px dashed ${lane}` : undefined,
        color: "white",
        fontSize: 9,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {isWip || node.is_merge ? null : initialsOf(node.author_name)}
    </div>
  );

  if (isWip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{dot}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          Uncommitted changes in your working tree
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{dot}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <div className="space-y-1 text-xs">
          <p className="font-medium">{node.author_name}</p>
          {node.author_email && (
            <p className="text-muted-foreground font-mono text-[10px]">
              {node.author_email}
            </p>
          )}
          <p className="text-muted-foreground">
            {formatFullDate(node.author_time)}
          </p>
          {node.is_merge && (
            <p className="text-muted-foreground">
              Merge of {node.parent_oids.length} parents
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const REF_STYLE = {
  head: {
    chip: "bg-primary text-primary-foreground border-primary",
    icon: Check,
    label: "Checked out",
  },
  local: {
    chip: "bg-primary/15 text-primary border-primary/40",
    icon: GitBranch,
    label: "Local branch",
  },
  remote: {
    chip: "bg-sky-500/15 text-sky-400 border-sky-500/40",
    icon: Cloud,
    label: "Remote branch",
  },
  tag: {
    chip: "bg-amber-500/15 text-amber-400 border-amber-500/40",
    icon: Tag,
    label: "Tag",
  },
} as const;

type RefStyleKey = keyof typeof REF_STYLE;

function styleKey(ref: RefInfo): RefStyleKey {
  if (ref.is_head) return "head";
  return ref.kind;
}

export function RefBadge({
  refInfo,
  compact,
}: {
  refInfo: RefInfo;
  compact?: boolean;
}) {
  const style = REF_STYLE[styleKey(refInfo)];
  const Icon = style.icon;

  const remote = refInfo.kind === "remote" ? refInfo.remote : null;
  const label =
    remote && refInfo.name.startsWith(`${remote}/`)
      ? refInfo.name.slice(remote.length + 1)
      : refInfo.name;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 h-5 rounded-full text-[10px] font-mono font-bold",
        "border shrink-0 select-none max-w-full",
        compact ? "px-1.5" : "px-2",
        style.chip,
      )}
      title={`${style.label}: ${refInfo.name}`}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      {remote && <span className="opacity-60 shrink-0">{remote}/</span>}
      <span className="truncate">{label}</span>
    </span>
  );
}

export function RefCell({
  refs,
  onSolo,
}: {
  refs: RefInfo[];
  onSolo: (ref: RefInfo) => void;
}) {
  if (refs.length === 0) {
    return <span style={{ width: REF_COL_WIDTH }} className="shrink-0" />;
  }

  const [primary, ...rest] = refs;

  return (
    <span
      className="shrink-0 flex items-center justify-end gap-1 pr-2 overflow-hidden"
      style={{ width: REF_COL_WIDTH }}
    >
      <button
        className="min-w-0 flex items-center cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onSolo(primary);
        }}
        title={`Show only ${primary.name}`}
      >
        <RefBadge refInfo={primary} />
      </button>

      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center h-5 px-1.5 rounded-full border border-border bg-muted text-[10px] font-mono font-bold text-muted-foreground shrink-0 cursor-default">
              +{rest.length}
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Also here
              </p>
              <div className="flex flex-col items-start gap-1">
                {rest.map((r) => (
                  <button
                    key={`${r.kind}:${r.name}`}
                    className="max-w-full"
                    onClick={() => onSolo(r)}
                    title={`Show only ${r.name}`}
                  >
                    <RefBadge refInfo={r} />
                  </button>
                ))}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

export function CommitDetailPanel({ onClose }: { onClose: () => void }) {
  const { tab, dispatch, showFileHistory, showBlame } = useGit();
  const [viewMode, setViewMode] = useState<"path" | "tree">("path");

  const commit = tab?.selectedCommitInfo;
  const diff = tab?.commitDiff ?? [];

  useEffect(() => {
    setViewMode("path");
  }, [tab?.selectedCommitOid]);

  if (!commit) return null;

  const title = commit.summary;
  const body =
    commit.message.length > commit.summary.length
      ? commit.message.slice(commit.summary.length).trim()
      : null;

  const handleFileClick = (file: DiffFile) => {
    dispatch({ type: "SET_VIEWING_DIFF_FILE", payload: file });
  };

  const filePath = (file: DiffFile) => file.new_path || file.old_path || "";

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="px-3 py-3 border-b shrink-0 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-snug flex-1">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        {body && (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {body}
          </p>
        )}
        {commit.refs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {commit.refs.map((ref) => (
              <RefBadge key={`${ref.kind}:${ref.name}`} refInfo={ref} />
            ))}
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
          {commit.signature !== "none" && (
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span title="Tentacle does not hold the signer's public key, so it reports the signature's presence rather than verifying it.">
                Signed
              </span>
            </div>
          )}
          {commit.parent_oids.length > 0 && (
            <div className="flex items-center gap-2">
              <GitCommit className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono">
                {commit.parent_oids.map((p) => p.slice(0, 7)).join(", ")}
              </span>
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
              const dir = path.includes("/")
                ? path.substring(0, path.lastIndexOf("/") + 1)
                : "";
              return (
                <ContextMenu key={idx}>
                  <ContextMenuTrigger asChild>
                    <button
                      className="w-full flex items-center gap-2 px-3 h-7 text-xs hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer text-left"
                      onClick={() => handleFileClick(file)}
                    >
                      <span
                        className="font-bold w-4 text-center shrink-0"
                        style={{ color: statusColor(file.status) }}
                      >
                        {statusIcon(file.status)}
                      </span>
                      <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 font-mono">
                        {dir && (
                          <span className="text-muted-foreground">{dir}</span>
                        )}
                        {fileName}
                      </span>
                      {!file.binary && (
                        <span className="shrink-0 tabular-nums">
                          <span className="text-green-500">
                            +{file.additions}
                          </span>{" "}
                          <span className="text-red-400">
                            -{file.deletions}
                          </span>
                        </span>
                      )}
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuItem
                      className="gap-2 text-xs"
                      onSelect={() => showFileHistory(filePath(file))}
                    >
                      <FileClock className="h-3.5 w-3.5 shrink-0" />
                      File history
                    </ContextMenuItem>
                    <ContextMenuItem
                      className="gap-2 text-xs"
                      onSelect={() => showBlame(filePath(file), commit.oid)}
                    >
                      <ScanLine className="h-3.5 w-3.5 shrink-0" />
                      Blame at this commit
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
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

function GraphSearch() {
  const { tab, setGraphQuery } = useGit();
  const [text, setText] = useState(tab?.graphQuery.text ?? "");
  const [path, setPath] = useState(tab?.graphQuery.path ?? "");
  const [author, setAuthor] = useState(tab?.graphQuery.author ?? "");
  const [open, setOpen] = useState(false);

  const branch = tab?.graphQuery.branch;

  const primed = useRef(false);
  useEffect(() => {
    if (!primed.current) {
      primed.current = true;
      return;
    }
    const timer = setTimeout(() => {
      void setGraphQuery({
        ...(branch ? { branch } : {}),
        max_count: 500,
        text: text.trim() || undefined,
        path: path.trim() || undefined,
        author: author.trim() || undefined,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [author, branch, path, text, setGraphQuery]);

  const active = Boolean(text || path || author);

  return (
    <div className="border-b bg-card px-2 py-1.5 shrink-0 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search messages, authors and hashes…"
          className="h-7 text-xs"
        />
        <Button
          variant={open || active ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-[11px] shrink-0"
          onClick={() => setOpen((o) => !o)}
        >
          Filters
        </Button>
        {active && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="Clear filters"
            onClick={() => {
              setText("");
              setPath("");
              setAuthor("");
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {open && (
        <div className="flex gap-1.5">
          <Input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author"
            className="h-7 text-xs"
          />
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="Path, e.g. src/lib/api.ts"
            className="h-7 text-xs font-mono"
          />
        </div>
      )}
    </div>
  );
}

export function GraphView() {
  const {
    tab,
    selectCommit,
    checkoutCommit,
    createBranch,
    mergeBranch,
    rebaseOnto,
    rebaseInteractive,
    cherryPick,
    revertCommit,
    resetToCommit,
    createTag,
    setGraphQuery,
    setError,
  } = useGit();
  const [rebaseFrom, setRebaseFrom] = useState<string | null>(null);
  const graph = tab?.graph;

  const [multi, setMulti] = useState<string[]>([]);
  const anchor = useRef<number | null>(null);

  useEffect(() => {
    setMulti([]);
    anchor.current = null;
  }, [tab?.id, graph]);

  const oids = useMemo(() => (graph?.nodes ?? []).map((n) => n.oid), [graph]);

  const handleRowClick = useCallback(
    (event: React.MouseEvent, index: number, oid: string) => {
      const additive = event.metaKey || event.ctrlKey;
      const ranged = event.shiftKey;

      if (!additive && !ranged) {
        setMulti([]);
        anchor.current = index;
        void selectCommit(oid);
        return;
      }

      if (oid === "WIP") return;

      if (ranged && anchor.current !== null) {
        const [from, to] = [anchor.current, index].sort((a, b) => a - b);
        setMulti(oids.slice(from, to + 1).filter((o) => o !== "WIP"));
        return;
      }

      anchor.current = index;
      setMulti((prev) =>
        prev.includes(oid) ? prev.filter((o) => o !== oid) : [...prev, oid],
      );
    },
    [oids, selectCommit],
  );

  const isSelected = useCallback(
    (oid: string) =>
      multi.length > 0 ? multi.includes(oid) : tab?.selectedCommitOid === oid,
    [multi, tab?.selectedCommitOid],
  );

  const soloRef = useCallback(
    (ref: RefInfo) => {
      void setGraphQuery({
        ...(tab?.graphQuery ?? {}),
        max_count: 500,
        branch: ref.name,
      });
    },
    [setGraphQuery, tab?.graphQuery],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    setContainerHeight(el.clientHeight || 600);
    const observer = new ResizeObserver((entries) => {
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

  const filtering = Boolean(
    tab?.graphQuery.text || tab?.graphQuery.path || tab?.graphQuery.author,
  );

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <GraphSearch />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <GitCommit className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-sm font-medium">
              {filtering ? "No commits match" : "No commits yet"}
            </p>
            <p className="text-xs opacity-60">
              {filtering
                ? "Try a shorter search, or clear the filters."
                : "Make your first commit to see the history."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalHeight = graph.nodes.length * ROW_HEIGHT;
  const hasSelection = tab?.selectedCommitOid != null;
  const graphColWidth = svgWidth(graph.max_lanes);

  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endRow = Math.min(
    graph.nodes.length,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN,
  );

  const squashSelection = async () => {
    const message = await promptFor({
      title: `Squash ${multi.length} commits`,
      description:
        "They become one commit. History is rewritten below this point.",
      label: "Message for the combined commit",
      defaultValue:
        graph.nodes.find((n) => n.oid === multi[multi.length - 1])?.summary ??
        "",
    });
    if (!message) return;

    const result = buildSquashPlan(graph.nodes, multi, message);
    if (!result.ok) {
      setError(result.reason);
      return;
    }

    setMulti([]);
    await rebaseInteractive(result.plan.onto, result.plan.steps);
  };

  const soloBranch = tab?.graphQuery.branch;

  return (
    <ResizablePanelGroup
      direction="horizontal"
      key={hasSelection ? "with-detail" : "no-detail"}
    >
      <ResizablePanel minSize="400px">
        <div className="flex flex-col h-full">
          <GraphSearch />

          {soloBranch && (
            <div className="shrink-0 flex items-center gap-2 border-b bg-primary/10 px-3 py-1.5">
              <CircleSlash className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="text-xs">
                Showing only{" "}
                <span className="font-mono font-medium">{soloBranch}</span> and
                its ancestors
              </span>
              <span className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px]"
                onClick={() =>
                  void setGraphQuery({
                    ...(tab?.graphQuery ?? {}),
                    branch: undefined,
                  })
                }
              >
                Show all branches
              </Button>
            </div>
          )}

          {multi.length > 0 && (
            <div className="shrink-0 flex items-center gap-2 border-b bg-accent px-3 py-1.5">
              <Layers className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs font-medium">
                {multi.length} commits selected
              </span>
              <span className="flex-1" />
              <Button
                size="sm"
                className="h-6 text-[11px] gap-1"
                disabled={multi.length < 2}
                onClick={squashSelection}
              >
                <Combine className="h-3 w-3" /> Squash
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] gap-1"
                onClick={async () => {
                  const ordered = graph.nodes
                    .filter((n) => multi.includes(n.oid))
                    .reverse()
                    .map((n) => n.oid);
                  setMulti([]);
                  for (const oid of ordered) {
                    const result = await cherryPick(oid);
                    if (result?.status === "conflicts") break;
                  }
                }}
              >
                <Cherry className="h-3 w-3" /> Cherry-pick
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] gap-1"
                onClick={() => {
                  const ordered = graph.nodes
                    .filter((n) => multi.includes(n.oid))
                    .map((n) => n.oid);
                  void navigator.clipboard.writeText(ordered.join("\n"));
                }}
              >
                <Copy className="h-3 w-3" /> Copy SHAs
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setMulti([])}
                aria-label="Clear selection"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          <div className="h-8 border-b flex items-center px-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider shrink-0 bg-muted/40 select-none">
            <span
              className="shrink-0 text-right pr-2"
              style={{ width: REF_COL_WIDTH }}
            >
              Refs
            </span>
            <span
              style={{ width: graphColWidth, minWidth: graphColWidth }}
              className="shrink-0"
            />
            <span className="w-16 shrink-0 pl-1">Hash</span>
            <span className="flex-1 ml-2">Message</span>
            <span className="w-28 text-right pr-2 shrink-0">Date</span>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-auto"
            onScroll={handleScroll}
          >
            <div className="relative" style={{ height: totalHeight }}>
              <div className="relative">
                {graph.nodes.map((node, idx) => (
                  <ContextMenu key={node.oid}>
                    <ContextMenuTrigger asChild>
                      <div
                        draggable={node.oid !== "WIP"}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "application/git-oid",
                            node.oid,
                          );
                          e.dataTransfer.setData(
                            "application/git-summary",
                            node.summary,
                          );
                          e.dataTransfer.effectAllowed = "copyMove";
                        }}
                        onDragOver={(e) => {
                          if (node.oid !== "WIP") {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }
                        }}
                        onDrop={async (e) => {
                          e.preventDefault();
                          const sourceOid = e.dataTransfer.getData(
                            "application/git-oid",
                          );
                          const sourceSummary = e.dataTransfer.getData(
                            "application/git-summary",
                          );
                          if (!sourceOid || sourceOid === node.oid) return;

                          const short = sourceOid.slice(0, 7);
                          const action = await chooseFrom({
                            title: `Drop ${short} onto ${node.short_oid}`,
                            description: sourceSummary,
                            options: [
                              {
                                value: "merge",
                                label: `Merge ${short} into the current branch`,
                                description:
                                  "Creates a merge commit, keeping both histories.",
                              },
                              {
                                value: "rebase",
                                label: `Rebase the current branch onto ${node.short_oid}`,
                                description:
                                  "Replays your commits on top. Rewrites history.",
                              },
                              {
                                value: "cherry-pick",
                                label: `Cherry-pick ${short} onto the current branch`,
                                description:
                                  "Copies just that one commit across.",
                              },
                            ],
                          });

                          if (action === "merge") void mergeBranch(sourceOid);
                          else if (action === "rebase") {
                            void rebaseOnto(node.oid);
                          } else if (action === "cherry-pick") {
                            void cherryPick(sourceOid);
                          }
                        }}
                        className={cn(
                          "absolute inset-x-0 flex items-center px-2 text-xs cursor-pointer transition-colors group",
                          isSelected(node.oid)
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/50",
                          multi.includes(node.oid) &&
                            "shadow-[inset_3px_0_0_0_var(--color-primary)]",
                          node.oid === "WIP" && "opacity-80 italic",
                        )}
                        style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}
                        onClick={(e) => handleRowClick(e, idx, node.oid)}
                      >
                        <RefCell refs={node.refs} onSolo={soloRef} />

                        <span
                          className="shrink-0"
                          style={{
                            width: graphColWidth,
                            minWidth: graphColWidth,
                          }}
                        />

                        <span className="w-16 font-mono text-primary shrink-0 pl-1 truncate">
                          {node.oid === "WIP" ? "--" : node.short_oid}
                        </span>

                        <span className="flex-1 ml-2 flex items-center gap-1.5 min-w-0 overflow-hidden">
                          {node.oid === "WIP" && (
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-muted-foreground border border-dashed shrink-0">
                              WIP
                            </span>
                          )}
                          <span
                            className={cn(
                              "truncate",
                              node.oid === "WIP" &&
                                "text-muted-foreground font-medium",
                            )}
                          >
                            {node.summary}
                          </span>
                          {node.signature !== "none" && (
                            <ShieldCheck
                              className="h-3 w-3 shrink-0 text-primary/70"
                              aria-label="Signed commit"
                            />
                          )}
                        </span>

                        <span className="w-28 text-right text-muted-foreground shrink-0 pr-2 tabular-nums">
                          {node.oid === "WIP"
                            ? "now"
                            : formatTimestamp(node.author_time)}
                        </span>
                      </div>
                    </ContextMenuTrigger>

                    <ContextMenuContent className="w-56">
                      <ContextMenuLabel className="text-xs font-mono text-muted-foreground font-normal">
                        {node.short_oid} —{" "}
                        {node.summary.length > 32
                          ? node.summary.slice(0, 32) + "…"
                          : node.summary}
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
                        onSelect={() =>
                          navigator.clipboard.writeText(node.short_oid)
                        }
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
                        onSelect={async () => {
                          const name = await promptFor({
                            title: "New branch",
                            description: `Starting at ${node.short_oid} — ${node.summary}`,
                            label: "Branch name",
                            placeholder: "feature/my-change",
                            validate: (v) =>
                              /[\s~^:?*\[\\]/.test(v)
                                ? "Branch names cannot contain spaces or ~ ^ : ? * [ \\"
                                : null,
                          });
                          if (name) void createBranch(name, node.oid, true);
                        }}
                      >
                        <GitBranch className="h-3.5 w-3.5 shrink-0" />
                        Create branch here…
                      </ContextMenuItem>

                      <ContextMenuItem
                        className="gap-2 text-xs"
                        onSelect={async () => {
                          const name = await promptFor({
                            title: "New tag",
                            description: `Pointing at ${node.short_oid} — ${node.summary}`,
                            label: "Tag name",
                            placeholder: "v1.0.0",
                          });
                          if (!name) return;
                          const message = await promptFor({
                            title: "Tag message",
                            description:
                              "A message makes this an annotated tag, recording who tagged and when. Leave blank for a lightweight tag.",
                            label: "Message",
                            validate: () => null,
                          });
                          void createTag(name, node.oid, message || undefined);
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
                        disabled={node.oid === "WIP"}
                        onSelect={() => setRebaseFrom(node.oid)}
                      >
                        <ListOrdered className="h-3.5 w-3.5 shrink-0" />
                        Rebase interactively from here…
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
                            onSelect={async () => {
                              const ok = await confirmThat({
                                title: `Hard reset to ${node.short_oid}?`,
                                description:
                                  "Uncommitted changes are lost and commits after this one leave the branch. " +
                                  "They stay recoverable from the reflog.",
                                confirmLabel: "Hard reset",
                                destructive: true,
                              });
                              if (ok) void resetToCommit(node.oid, "hard");
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

              <div
                className="absolute top-0 bottom-0 pointer-events-none z-10"
                style={{ left: REF_COL_WIDTH + 8, width: graphColWidth }}
              >
                <GraphLanes
                  nodes={graph.nodes}
                  maxLanes={graph.max_lanes}
                  height={totalHeight + ROW_HEIGHT / 2}
                  startRow={startRow}
                  endRow={endRow}
                />
                {graph.nodes.slice(startRow, endRow).map((node, vi) => (
                  <CommitNode
                    key={node.oid}
                    node={node}
                    row={startRow + vi}
                    selected={isSelected(node.oid)}
                    onClick={handleRowClick}
                  />
                ))}
              </div>
            </div>
            {graph.truncated && (
              <div className="h-8 flex items-center justify-center text-[11px] text-muted-foreground select-none border-t">
                History truncated at {graph.total_commits.toLocaleString()}{" "}
                commits — older commits are not shown.
              </div>
            )}
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

      {rebaseFrom && (
        <InteractiveRebaseDialog
          fromOid={rebaseFrom}
          onClose={() => setRebaseFrom(null)}
        />
      )}
    </ResizablePanelGroup>
  );
}
