import { useEffect, useState } from "react";
import { useGit } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ExternalLink,
  GitMerge,
  GitPullRequest,
  MessageSquare,
  Plus,
  Sparkles,
  User,
} from "lucide-react";
import * as api from "@/lib/api";
import { errorText } from "@/hooks/use-git";
import { confirmThat } from "@/components/ui/prompt-dialog";
import type { CreatePrRequest, PullRequest } from "@/lib/api";

export function PrView() {
  const { state, tab, dispatch, setError } = useGit();
  const [prState, setPrState] = useState("open");
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPr, setNewPr] = useState<CreatePrRequest>({
    title: "",
    body: null,
    source_branch: "",
    target_branch: "main",
    draft: false,
  });
  const [generatingDesc, setGeneratingDesc] = useState(false);

  const withToken = async (): Promise<string | null> => {
    if (!state.providerType) return null;
    if (!state.allowNetwork) {
      setError(
        "Provider requests are turned off. Enable them in Settings → Privacy.",
      );
      return null;
    }
    const token = await api
      .secretGet(api.providerTokenKey(state.providerType))
      .catch(() => null);
    if (!token) {
      setError(
        "No token saved for this provider. Add one in Settings → Provider.",
      );
      return null;
    }
    return token;
  };

  const loadPrs = async () => {
    if (
      !state.providerType ||
      !state.providerTokenSaved ||
      !state.allowNetwork
    ) {
      return;
    }
    setLoading(true);
    try {
      const token = await api.secretGet(
        api.providerTokenKey(state.providerType),
      );
      if (!token) return;
      let prs: PullRequest[] = [];
      if (state.providerType === "github") {
        prs = await api.githubListPrs(
          state.providerOwner,
          state.providerRepo,
          prState,
          token,
        );
      } else if (state.providerType === "gitlab") {
        const glState = prState === "open" ? "opened" : prState;
        prs = await api.gitlabListMrs(
          state.gitlabBaseUrl,
          `${state.providerOwner}/${state.providerRepo}`,
          glState,
          token,
        );
      } else if (state.providerType === "bitbucket") {
        const bbState = prState.toUpperCase();
        prs = await api.bitbucketListPrs(
          state.providerOwner,
          state.providerRepo,
          bbState,
          token,
        );
      }
      dispatch({ type: "SET_PULL_REQUESTS", payload: prs });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrs();
  }, [
    prState,
    state.providerType,
    state.providerTokenSaved,
    state.allowNetwork,
  ]);

  const handleCreatePr = async () => {
    if (!newPr.title) return;
    const token = await withToken();
    if (!token) return;
    try {
      if (state.providerType === "github") {
        await api.githubCreatePr(
          state.providerOwner,
          state.providerRepo,
          newPr,
          token,
        );
      } else if (state.providerType === "gitlab") {
        await api.gitlabCreateMr(
          state.gitlabBaseUrl,
          `${state.providerOwner}/${state.providerRepo}`,
          newPr,
          token,
        );
      } else if (state.providerType === "bitbucket") {
        await api.bitbucketCreatePr(
          state.providerOwner,
          state.providerRepo,
          newPr,
          token,
        );
      }
      setCreateOpen(false);
      setNewPr({
        title: "",
        body: null,
        source_branch: "",
        target_branch: "main",
        draft: false,
      });
      await loadPrs();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const handleMergePr = async (pr: PullRequest) => {
    const ok = await confirmThat({
      title: `Merge #${pr.number}?`,
      description: pr.title,
      confirmLabel: "Merge",
    });
    if (!ok) return;
    const token = await withToken();
    if (!token) return;
    try {
      if (state.providerType === "github") {
        await api.githubMergePr(
          state.providerOwner,
          state.providerRepo,
          pr.number,
          undefined,
          token,
        );
      } else if (state.providerType === "gitlab") {
        await api.gitlabMergeMr(
          state.gitlabBaseUrl,
          `${state.providerOwner}/${state.providerRepo}`,
          pr.number,
          token,
        );
      } else if (state.providerType === "bitbucket") {
        await api.bitbucketMergePr(
          state.providerOwner,
          state.providerRepo,
          pr.number,
          token,
        );
      }
      await loadPrs();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const handleGenerateDescription = async () => {
    if (!newPr.title || !tab) return;
    setGeneratingDesc(true);
    try {
      const diffText = tab.stagedDiff
        .map((f) =>
          f.hunks
            .map((h) => h.lines.map((l) => `${l.origin}${l.content}`).join(""))
            .join(""),
        )
        .join("\n");
      const desc = await api.aiGeneratePrDescription(diffText, newPr.title);
      setNewPr({ ...newPr, body: desc });
    } catch {
    } finally {
      setGeneratingDesc(false);
    }
  };

  if (!state.providerType || !state.providerTokenSaved || !state.allowNetwork) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3 max-w-sm px-4">
          <GitPullRequest className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
          <h3 className="font-semibold text-sm">
            {state.providerType &&
            state.providerTokenSaved &&
            !state.allowNetwork
              ? "Provider requests are turned off"
              : "Configure a remote provider"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {state.providerType &&
            state.providerTokenSaved &&
            !state.allowNetwork
              ? "Tentacle will not contact a provider API until you allow it in Settings → Privacy."
              : "Add your GitHub, GitLab or Bitbucket details in Settings to manage pull requests."}
          </p>
          <Button
            size="sm"
            onClick={() =>
              dispatch({ type: "SET_ACTIVE_VIEW", payload: "settings" })
            }
          >
            Open Settings
          </Button>
        </div>
      </div>
    );
  }

  const localBranches = tab?.branches.filter((b) => !b.is_remote) ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-2.5 py-2 border-b flex items-center gap-2 shrink-0">
        <Tabs value={prState} onValueChange={setPrState}>
          <TabsList className="h-7">
            <TabsTrigger value="open" className="text-xs h-6 px-2.5">
              Open
            </TabsTrigger>
            <TabsTrigger value="closed" className="text-xs h-6 px-2.5">
              Closed
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs h-6 px-2.5">
              All
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex-1" />

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1 h-7 text-xs px-2.5">
              <Plus className="h-3 w-3" /> New PR
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Pull Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="PR Title..."
                value={newPr.title}
                onChange={(e) => setNewPr({ ...newPr, title: e.target.value })}
                autoFocus
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Source
                  </label>
                  <select
                    className="w-full h-8 rounded-md border border-input bg-transparent px-3 text-xs"
                    value={newPr.source_branch}
                    onChange={(e) =>
                      setNewPr({ ...newPr, source_branch: e.target.value })
                    }
                  >
                    <option value="">Select branch...</option>
                    {localBranches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Target
                  </label>
                  <Input
                    value={newPr.target_branch}
                    onChange={(e) =>
                      setNewPr({ ...newPr, target_branch: e.target.value })
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="relative">
                <Textarea
                  placeholder="Description..."
                  value={newPr.body ?? ""}
                  onChange={(e) => setNewPr({ ...newPr, body: e.target.value })}
                  className="min-h-[100px] text-xs pr-16"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1.5 right-1.5 gap-1 h-6 text-[10px] px-2"
                  onClick={handleGenerateDescription}
                  disabled={generatingDesc}
                >
                  <Sparkles className="h-3 w-3" /> AI
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPr.draft}
                  onChange={(e) =>
                    setNewPr({ ...newPr, draft: e.target.checked })
                  }
                  className="rounded"
                />
                Draft PR
              </label>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreatePr}
                disabled={!newPr.title || !newPr.source_branch}
                size="sm"
              >
                Create PR
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2.5"
          onClick={loadPrs}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {tab?.pullRequests.length === 0 && !loading && (
          <div className="p-8 text-center text-muted-foreground text-xs">
            No pull requests found
          </div>
        )}
        {tab?.pullRequests.map((pr) => (
          <div
            key={pr.id}
            className="border-b px-3 py-3 hover:bg-accent/20 transition-colors"
          >
            <div className="flex items-start gap-2.5">
              <GitPullRequest
                className={`h-4 w-4 mt-px shrink-0 ${
                  pr.state === "open" || pr.state === "opened"
                    ? "text-added"
                    : "text-destructive"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">
                    {pr.title}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    #{pr.number}
                  </span>
                  {pr.draft && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      Draft
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {pr.author}
                  </span>
                  <span className="font-mono">
                    {pr.source_branch} → {pr.target_branch}
                  </span>
                  {pr.comments_count > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {pr.comments_count}
                    </span>
                  )}
                </div>
                {pr.labels.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {pr.labels.map((l) => (
                      <Badge
                        key={l}
                        variant="secondary"
                        className="text-[10px] h-4 px-1.5"
                      >
                        {l}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {(pr.state === "open" || pr.state === "opened") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMergePr(pr)}
                    className="gap-1.5 h-7 text-xs px-2.5"
                  >
                    <GitMerge className="h-3.5 w-3.5" /> Merge
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => window.open(pr.url, "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
