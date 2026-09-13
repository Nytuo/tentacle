import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  useApp, useActiveTab, useActiveWorkspace, useRepoSettings,
  type AiSettings, type ProviderType, type RepoSettings, type SettingsSection,
} from "@/stores/app-store";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { errorText } from "@/hooks/use-git";
import { SHORTCUTS } from "@/hooks/use-shortcuts";
import { readStoredState, purgeStoredState } from "@/hooks/use-persistence";
import { isLocalEndpoint, endpointHost } from "@/lib/endpoint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { confirmThat } from "@/components/ui/prompt-dialog";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import {
  Settings2, Layers, GitBranch, X, Globe, Bot, Shield, Lock, Key, Trash2, Eye,
  Keyboard, Sun, Moon, User, AlertTriangle, CheckCircle, XCircle, Loader2, FolderOpen,
} from "lucide-react";

const PROVIDERS: ProviderType[] = ["github", "gitlab", "bitbucket"];
const PROVIDER_LABEL: Record<ProviderType, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
};

type Icon = ComponentType<{ className?: string }>;

function Section({
  title,
  description,
  icon: IconCmp,
  children,
}: {
  title: string;
  description?: string;
  icon?: Icon;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <header className="space-y-0.5">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {IconCmp && <IconCmp className="h-4 w-4 text-muted-foreground" />}
          {title}
        </h3>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        )}
      </header>
      <div className="rounded-lg border divide-y">{children}</div>
    </section>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium">{label}</div>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

export function SettingsView() {
  const { state, dispatch } = useApp();
  const tab = useActiveTab();
  const workspace = useActiveWorkspace();
  const section: SettingsSection =
    state.settingsSection === "repository" && !tab ? "workspace" : state.settingsSection;

  const nav: { id: SettingsSection; label: string; hint: string; icon: Icon; disabled: boolean }[] = [
    { id: "app", label: "Application", hint: "Applies everywhere", icon: Settings2, disabled: false },
    { id: "workspace", label: workspace.name, hint: "This workspace", icon: Layers, disabled: false },
    {
      id: "repository",
      label: tab?.repo.name ?? "Repository",
      hint: tab ? "This repository" : "Open a repository first",
      icon: GitBranch,
      disabled: !tab,
    },
  ];

  const titles: Record<SettingsSection, string> = {
    app: "Application settings",
    workspace: "Workspace settings",
    repository: "Repository settings",
  };

  return (
    <div className="flex h-full">
      <nav className="w-56 shrink-0 border-r bg-card p-2 space-y-1">
        <div className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Settings
        </div>
        {nav.map(item => {
          const ItemIcon = item.icon;
          return (
            <button
              key={item.id}
              disabled={item.disabled}
              onClick={() => dispatch({ type: "SET_SETTINGS_SECTION", payload: item.id })}
              className={cn(
                "w-full text-left rounded-md px-2.5 py-2 transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                section === item.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <ItemIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{item.label}</span>
              </div>
              <div className="text-[11px] text-muted-foreground pl-6 truncate">{item.hint}</div>
            </button>
          );
        })}
      </nav>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-5 space-y-6">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold flex-1">{titles[section]}</h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => dispatch({ type: "CLOSE_SETTINGS" })}
              aria-label="Close settings"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {section === "app" && <AppSettings />}
          {section === "workspace" && <WorkspaceSettings key={workspace.id} />}
          {section === "repository" && tab && <RepositorySettings key={tab.id} />}
        </div>
      </ScrollArea>
    </div>
  );
}


function AppSettings() {
  const { state, dispatch } = useApp();
  const [tokens, setTokens] = useState<Partial<Record<ProviderType, boolean>>>({});
  const [stored, setStored] = useState<string | null>(null);

  const refreshTokens = useCallback(async () => {
    const entries = await Promise.all(
      PROVIDERS.map(
        async p => [p, await api.secretHas(api.providerTokenKey(p)).catch(() => false)] as const,
      ),
    );
    setTokens(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void refreshTokens();
  }, [refreshTokens]);

  return (
    <>
      <Section title="Appearance" icon={Sun}>
        <Row label="Theme">
          {(["light", "dark"] as const).map(t => (
            <Button
              key={t}
              size="sm"
              variant={state.theme === t ? "secondary" : "ghost"}
              className="h-7 text-xs gap-1.5 capitalize"
              onClick={() => dispatch({ type: "SET_THEME", payload: t })}
            >
              {t === "light" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {t}
            </Button>
          ))}
        </Row>
      </Section>

      <Section
        title="Privacy"
        icon={Shield}
        description="What leaves this machine, and what Tentacle remembers."
      >
        <Row
          label="Allow provider API requests"
          description="Off by default. While off, Tentacle makes no request to GitHub, GitLab or Bitbucket and pull requests are unavailable. Git itself still fetches from and pushes to your remotes."
        >
          <Switch
            checked={state.allowNetwork}
            onCheckedChange={v => dispatch({ type: "SET_ALLOW_NETWORK", payload: v })}
          />
        </Row>
        <Row
          label="Don't remember repositories"
          description="Repository paths stay in memory and are never written to disk. Workspaces are remembered by name only, empty."
        >
          <Switch
            checked={state.ephemeral}
            onCheckedChange={v => dispatch({ type: "SET_EPHEMERAL", payload: v })}
          />
        </Row>
        <div className="px-3 py-2.5 space-y-1.5">
          <div className="text-xs font-medium">Everything that can leave this machine</div>
          <ul className="text-[11px] text-muted-foreground space-y-1 leading-relaxed">
            <li>
              <span className="text-foreground">Fetch, pull, push, clone</span> — only to the
              remotes configured in each repository.
            </li>
            <li>
              <span className="text-foreground">Provider APIs</span> —{" "}
              {state.allowNetwork ? "allowed" : "blocked"}, and only to the forge a repository
              lives on.
            </li>
            <li>
              <span className="text-foreground">AI</span> — your workspace&rsquo;s endpoint. Local
              Ollama by default; a remote endpoint is refused unless that workspace allows it.
            </li>
            <li>
              <span className="text-foreground">Nothing else</span> — no telemetry, analytics,
              crash reports or update checks.
            </li>
          </ul>
        </div>
      </Section>

      <Section
        title="Saved tokens"
        icon={Key}
        description="Kept in your operating system keychain, never in Tentacle's settings file. One per provider, shared by every repository on it. Add one from a repository's settings."
      >
        {PROVIDERS.map(p => (
          <Row key={p} label={PROVIDER_LABEL[p]}>
            {tokens[p] ? (
              <>
                <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                  <Lock className="h-3 w-3" /> In keychain
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-destructive"
                  onClick={async () => {
                    await api.secretDelete(api.providerTokenKey(p)).catch(() => undefined);
                    void refreshTokens();
                  }}
                >
                  Remove
                </Button>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">None</span>
            )}
          </Row>
        ))}
      </Section>

      <Section
        title="Stored data"
        icon={Eye}
        description="Everything Tentacle writes to disk, exactly as written."
      >
        <Row label="Settings file">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={async () => setStored(JSON.stringify(await readStoredState(), null, 2))}
          >
            <Eye className="h-3 w-3" /> Show
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-destructive"
            onClick={async () => {
              const ok = await confirmThat({
                title: "Erase everything Tentacle has stored?",
                description:
                  "Deletes the settings file and every saved token from your keychain. " +
                  "Your repositories are not touched.",
                confirmLabel: "Erase",
                destructive: true,
              });
              if (!ok) return;
              await purgeStoredState(PROVIDERS);
              setStored(null);
              void refreshTokens();
            }}
          >
            <Trash2 className="h-3 w-3" /> Erase all
          </Button>
        </Row>
        {stored && (
          <pre className="m-3 text-[10px] font-mono bg-muted rounded p-2 overflow-x-auto max-h-64">
            {stored}
          </pre>
        )}
      </Section>

      <Section title="Keyboard shortcuts" icon={Keyboard}>
        {SHORTCUTS.map(s => (
          <Row key={s.id} label={s.label}>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-muted">
              {s.keys}
            </kbd>
          </Row>
        ))}
      </Section>
    </>
  );
}

type AiStatus = "idle" | "checking" | "up" | "down" | "refused" | "error";

function WorkspaceSettings() {
  const { state, dispatch } = useApp();
  const workspace = useActiveWorkspace();
  const { rename, remove } = useWorkspaces();
  const [name, setName] = useState(workspace.name);

  const ai = workspace.ai;
  const setAi = (patch: Partial<AiSettings>) =>
    dispatch({ type: "SET_WORKSPACE_AI", payload: { id: workspace.id, ai: patch } });
  const [endpoint, setEndpoint] = useState(ai.endpoint);
  const remote = !isLocalEndpoint(endpoint);

  const [status, setStatus] = useState<AiStatus>("idle");
  const [statusText, setStatusText] = useState("");
  const [models, setModels] = useState<api.OllamaModel[]>([]);

  const check = useCallback(async (config: AiSettings) => {
    setStatus("checking");
    try {
      const up = await api.aiCheckOllama(config);
      if (!up) {
        setStatus("down");
        setModels([]);
        return;
      }
      setStatus("up");
      setModels(await api.aiListModels(config).catch(() => []));
    } catch (e) {
      const message = errorText(e);
      setStatus(message.includes("not on this machine") ? "refused" : "error");
      setStatusText(message);
      setModels([]);
    }
  }, []);

  useEffect(() => {
    if (ai.enabled) void check(ai);
  }, [ai, check]);

  const commitEndpoint = () => {
    if (endpoint.trim() !== ai.endpoint) setAi({ endpoint: endpoint.trim() });
  };

  const modelOptions =
    ai.model && !models.some(m => m.name === ai.model)
      ? [{ name: ai.model, size: null }, ...models]
      : models;

  return (
    <>
      <Section
        title="Workspace"
        icon={Layers}
        description="A set of repositories you work on together. Switch workspaces from the menu beside the Tentacle logo."
      >
        <Row label="Name">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={() => rename(workspace.id, name)}
            onKeyDown={e => {
              if (e.key === "Enter") rename(workspace.id, name);
            }}
            className="h-7 w-56 text-xs"
          />
        </Row>
        <div className="px-3 py-2.5 space-y-1.5">
          <div className="text-xs font-medium">Repositories ({workspace.repoPaths.length})</div>
          {workspace.repoPaths.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              None yet. Open one with the + button in the title bar.
            </p>
          ) : (
            <ul className="space-y-1">
              {workspace.repoPaths.map(path => {
                const open = state.tabs.some(t => t.id === path);
                return (
                  <li key={path} className="flex items-center gap-2 group">
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs font-medium shrink-0">
                      {path.split(/[\\/]/).pop()}
                    </span>
                    <span
                      className="text-[11px] text-muted-foreground font-mono truncate flex-1"
                      title={path}
                    >
                      {path}
                    </span>
                    {!open && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        not open
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      title="Remove from this workspace"
                      onClick={() => {
                        if (open) {
                          api.closeRepo(path).catch(() => undefined);
                          dispatch({ type: "CLOSE_TAB", payload: path });
                        } else {
                          dispatch({
                            type: "REMOVE_WORKSPACE_REPO",
                            payload: { id: workspace.id, path },
                          });
                        }
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      <Section
        title="AI"
        icon={Bot}
        description="Commit messages and pull request descriptions written by a model you choose. Each workspace has its own, so client work can use a different model from personal projects."
      >
        <Row label="Enable AI assistance">
          <Switch checked={ai.enabled} onCheckedChange={v => setAi({ enabled: v })} />
        </Row>
        {ai.enabled && (
          <>
            <Row
              label="Endpoint"
              description="An Ollama-compatible server. Leave blank for Ollama on this machine."
            >
              <Input
                value={endpoint}
                placeholder="http://localhost:11434"
                onChange={e => setEndpoint(e.target.value)}
                onBlur={commitEndpoint}
                onKeyDown={e => {
                  if (e.key === "Enter") commitEndpoint();
                }}
                className="h-7 w-64 text-xs font-mono"
              />
            </Row>
            {remote && (
              <div className="px-3 py-2.5 bg-amber-500/10 space-y-2">
                <div className="flex items-start gap-2 text-[11px] leading-relaxed">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-px" />
                  <span>
                    <span className="font-medium">{endpointHost(endpoint)}</span> is not this
                    machine. Allowing it sends every diff you ask the AI to describe to that
                    server.
                  </span>
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Switch
                    checked={ai.allowRemote}
                    onCheckedChange={v => setAi({ allowRemote: v })}
                  />
                  Allow this remote endpoint
                </label>
              </div>
            )}
            <Row label="Status">
              {status === "checking" && (
                <Badge variant="outline" className="gap-1 text-[10px] h-5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking
                </Badge>
              )}
              {status === "up" && (
                <Badge className="gap-1 text-[10px] h-5">
                  <CheckCircle className="h-3 w-3" /> Connected
                </Badge>
              )}
              {status === "down" && (
                <Badge variant="destructive" className="gap-1 text-[10px] h-5">
                  <XCircle className="h-3 w-3" /> Not running
                </Badge>
              )}
              {status === "error" && (
                <Badge variant="destructive" className="gap-1 text-[10px] h-5">
                  <XCircle className="h-3 w-3" /> Error
                </Badge>
              )}
              {status === "refused" && (
                <Badge variant="destructive" className="gap-1 text-[10px] h-5">
                  <Shield className="h-3 w-3" /> Blocked
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px]"
                onClick={() => void check(ai)}
              >
                Test
              </Button>
            </Row>
            {(status === "refused" || status === "error") && (
              <p className="px-3 py-2 text-[11px] text-destructive">{statusText}</p>
            )}
            {status === "down" && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
                Nothing answered. For local AI, install Ollama from ollama.com, run{" "}
                <code>ollama serve</code>, then <code>ollama pull llama3.2</code>.
              </p>
            )}
            <Row
              label="Model"
              description={
                models.length === 0 ? "Connect to list the endpoint's models." : undefined
              }
            >
              <select
                value={ai.model}
                onChange={e => setAi({ model: e.target.value })}
                className="h-7 w-56 rounded-md border bg-background px-2 text-xs"
              >
                <option value="">Endpoint default</option>
                {modelOptions.map(m => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Row>
          </>
        )}
      </Section>

      <Section title="Delete workspace" icon={Trash2}>
        <Row
          label={`Delete “${workspace.name}”`}
          description={
            state.workspaces.length <= 1
              ? "This is your only workspace."
              : "The repositories stay on disk; only this list of them and its AI settings go."
          }
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive"
            disabled={state.workspaces.length <= 1}
            onClick={async () => {
              const ok = await confirmThat({
                title: `Delete workspace ${workspace.name}?`,
                description:
                  "The repositories stay on disk. Only the workspace and its settings are removed.",
                confirmLabel: "Delete",
                destructive: true,
              });
              if (ok) await remove(workspace.id);
            }}
          >
            Delete
          </Button>
        </Row>
      </Section>
    </>
  );
}


function RepositorySettings() {
  const { state, dispatch } = useApp();
  const tab = useActiveTab()!;
  const provider = useRepoSettings();
  const explicit = state.repoSettings[tab.id];
  const set = (settings: Partial<RepoSettings>) =>
    dispatch({ type: "SET_REPO_SETTINGS", payload: { path: tab.id, settings } });
  const fail = (e: unknown) => dispatch({ type: "SET_ERROR", payload: errorText(e) });

  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    setReplacing(false);
    setTokenDraft("");
    if (!provider.providerType) {
      setTokenSaved(false);
      return;
    }
    let cancelled = false;
    api
      .secretHas(api.providerTokenKey(provider.providerType))
      .then(v => !cancelled && setTokenSaved(v))
      .catch(() => !cancelled && setTokenSaved(false));
    return () => {
      cancelled = true;
    };
  }, [provider.providerType]);

  const saveToken = async () => {
    if (!provider.providerType || !tokenDraft.trim()) return;
    try {
      await api.secretSet(api.providerTokenKey(provider.providerType), tokenDraft.trim());
      setTokenSaved(true);
      setTokenDraft("");
      setReplacing(false);
    } catch (e) {
      fail(e);
    }
  };

  const removeToken = async () => {
    if (!provider.providerType) return;
    try {
      await api.secretDelete(api.providerTokenKey(provider.providerType));
      setTokenSaved(false);
    } catch (e) {
      fail(e);
    }
  };

  const [identity, setIdentity] = useState<api.Identity | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getIdentity()
      .then(id => {
        if (cancelled) return;
        setIdentity(id);
        setNameDraft(id.name.scope === "repository" ? id.name.value ?? "" : "");
        setEmailDraft(id.email.scope === "repository" ? id.email.value ?? "" : "");
      })
      .catch(e => !cancelled && fail(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  const saveIdentity = async () => {
    try {
      setIdentity(await api.setIdentity(nameDraft, emailDraft));
    } catch (e) {
      fail(e);
    }
  };

  const clearIdentity = async () => {
    try {
      setIdentity(await api.setIdentity("", ""));
      setNameDraft("");
      setEmailDraft("");
    } catch (e) {
      fail(e);
    }
  };

  const scopeBadge = (scope: string) => (
    <Badge variant={scope === "repository" ? "secondary" : "outline"} className="text-[10px] h-4">
      {scope === "repository" ? "this repository" : scope === "global" ? "global config" : "not set"}
    </Badge>
  );

  const hasOverride =
    identity?.name.scope === "repository" || identity?.email.scope === "repository";
  const ownerLabel =
    provider.providerType === "bitbucket"
      ? "Workspace / repository"
      : provider.providerType === "gitlab"
        ? "Group / project"
        : "Owner / repository";

  return (
    <>
      <div className="rounded-lg border px-3 py-2.5 flex items-center gap-2.5">
        <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium">{tab.repo.name}</div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">{tab.repo.path}</div>
        </div>
      </div>

      <Section
        title="Hosting provider"
        icon={Globe}
        description="Where this repository's pull requests live. Read from the origin remote when it can be."
      >
        <Row
          label="Provider"
          description={
            provider.detected
              ? "Detected from the origin remote."
              : explicit?.providerType
                ? "Set for this repository."
                : "Not detected — choose one to use pull requests."
          }
        >
          {PROVIDERS.map(p => (
            <Button
              key={p}
              size="sm"
              variant={provider.providerType === p ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => set({ providerType: p })}
            >
              {PROVIDER_LABEL[p]}
            </Button>
          ))}
        </Row>

        {provider.providerType && (
          <>
            <Row label={ownerLabel}>
              <Input
                value={explicit?.providerOwner ?? ""}
                placeholder={provider.providerOwner || "owner"}
                onChange={e => set({ providerOwner: e.target.value })}
                className="h-7 w-36 text-xs"
              />
              <span className="text-muted-foreground">/</span>
              <Input
                value={explicit?.providerRepo ?? ""}
                placeholder={provider.providerRepo || "repository"}
                onChange={e => set({ providerRepo: e.target.value })}
                className="h-7 w-36 text-xs"
              />
            </Row>
            {provider.providerType === "gitlab" && (
              <Row label="GitLab URL">
                <Input
                  value={explicit?.gitlabBaseUrl ?? ""}
                  placeholder={provider.gitlabBaseUrl}
                  onChange={e => set({ gitlabBaseUrl: e.target.value })}
                  className="h-7 w-64 text-xs font-mono"
                />
              </Row>
            )}
            <Row
              label={`${PROVIDER_LABEL[provider.providerType]} token`}
              description={`Kept in your OS keychain and shared by every ${PROVIDER_LABEL[provider.providerType]} repository. Never shown again once saved.`}
            >
              {tokenSaved && !replacing ? (
                <>
                  <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                    <Lock className="h-3 w-3" /> Saved
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => setReplacing(true)}
                  >
                    Replace
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-destructive"
                    onClick={removeToken}
                  >
                    Remove
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    type="password"
                    value={tokenDraft}
                    placeholder="Paste a token…"
                    onChange={e => setTokenDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") void saveToken();
                    }}
                    className="h-7 w-48 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!tokenDraft.trim()}
                    onClick={saveToken}
                  >
                    Save
                  </Button>
                </>
              )}
            </Row>
            {!state.allowNetwork && (
              <p className="px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10">
                Provider requests are off in Application settings → Privacy, so nothing is sent
                until you allow them.
              </p>
            )}
          </>
        )}

        {explicit && (
          <Row
            label="Overrides"
            description="Forget what you set here and go back to what the origin remote says."
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => dispatch({ type: "CLEAR_REPO_SETTINGS", payload: tab.id })}
            >
              Reset
            </Button>
          </Row>
        )}
      </Section>

      <Section
        title="Commit identity"
        icon={User}
        description="The name and email written into every commit here. In a public repository they are published permanently — if your global address is personal, set a work or no-reply one for this repository."
      >
        {identity && (
          <>
            <Row label="Name">
              <span className="text-xs">{identity.name.value ?? "—"}</span>
              {scopeBadge(identity.name.scope)}
            </Row>
            <Row label="Email">
              <span className="text-xs font-mono">{identity.email.value ?? "—"}</span>
              {scopeBadge(identity.email.scope)}
            </Row>
          </>
        )}
        <div className="px-3 py-2.5 space-y-2">
          <div className="text-xs font-medium">Override for this repository</div>
          <div className="flex gap-2">
            <Input
              value={nameDraft}
              placeholder={identity?.name.value ?? "Name"}
              onChange={e => setNameDraft(e.target.value)}
              className="h-7 text-xs"
            />
            <Input
              value={emailDraft}
              placeholder={identity?.email.value ?? "email@example.com"}
              onChange={e => setEmailDraft(e.target.value)}
              className="h-7 text-xs font-mono"
            />
          </div>
          {provider.providerType === "github" && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              GitHub gives every account a private address of the form{" "}
              <span className="font-mono">ID+username@users.noreply.github.com</span> — it is
              listed in your GitHub email settings.
            </p>
          )}
          <div className="flex gap-2 justify-end">
            {hasOverride && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearIdentity}>
                Use global identity
              </Button>
            )}
            <Button size="sm" className="h-7 text-xs" onClick={saveIdentity}>
              Save for this repository
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
