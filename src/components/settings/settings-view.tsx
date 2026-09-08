import { useEffect, useState } from "react";
import { useGit } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { confirmThat } from "@/components/ui/prompt-dialog";
import { purgeStoredState, readStoredState } from "@/hooks/use-persistence";
import { errorText } from "@/hooks/use-git";
import {
  Bot,
  CheckCircle,
  Eye,
  Globe,
  HardDrive,
  Key,
  Lock,
  Shield,
  Trash2,
  XCircle,
} from "lucide-react";
import * as api from "@/lib/api";

const PROVIDERS = ["github", "gitlab", "bitbucket"] as const;

export function SettingsView() {
  const { state, dispatch, setError } = useGit();
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<api.OllamaModel[]>([]);

  const [tokenDraft, setTokenDraft] = useState("");
  const [storedState, setStoredState] = useState<string | null>(null);

  useEffect(() => {
    checkOllama();
  }, []);

  useEffect(() => {
    setTokenDraft("");
    if (!state.providerType) {
      dispatch({ type: "SET_PROVIDER_TOKEN_SAVED", payload: false });
      return;
    }
    api
      .secretHas(api.providerTokenKey(state.providerType))
      .then((saved) =>
        dispatch({ type: "SET_PROVIDER_TOKEN_SAVED", payload: saved }),
      )
      .catch(() =>
        dispatch({ type: "SET_PROVIDER_TOKEN_SAVED", payload: false }),
      );
  }, [dispatch, state.providerType]);

  const saveToken = async () => {
    if (!state.providerType || !tokenDraft.trim()) return;
    try {
      await api.secretSet(
        api.providerTokenKey(state.providerType),
        tokenDraft.trim(),
      );
      dispatch({ type: "SET_PROVIDER_TOKEN_SAVED", payload: true });
      setTokenDraft("");
    } catch (e) {
      setError(errorText(e));
    }
  };

  const clearToken = async () => {
    if (!state.providerType) return;
    try {
      await api.secretDelete(api.providerTokenKey(state.providerType));
      dispatch({ type: "SET_PROVIDER_TOKEN_SAVED", payload: false });
      setTokenDraft("");
    } catch (e) {
      setError(errorText(e));
    }
  };

  const checkOllama = async () => {
    try {
      const available = await api.aiCheckOllama();
      setOllamaAvailable(available);
      if (available) {
        const models = await api.aiListModels();
        setOllamaModels(models);
      }
    } catch {
      setOllamaAvailable(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="max-w-xl mx-auto px-5 py-5 space-y-5">
        <h1 className="text-base font-semibold">Settings</h1>

        <Tabs defaultValue="provider">
          <TabsList>
            <TabsTrigger value="provider" className="gap-1.5 text-xs">
              <Globe className="h-3.5 w-3.5" /> Provider
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5 text-xs">
              <Bot className="h-3.5 w-3.5" /> AI
            </TabsTrigger>
            <TabsTrigger value="privacy" className="gap-1.5 text-xs">
              <Shield className="h-3.5 w-3.5" /> Privacy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="provider" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">Remote Provider</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure your Git hosting provider for pull request
                  management.
                </p>
              </div>

              {!state.allowNetwork && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  Outbound requests are turned off. Enable them under{" "}
                  <span className="font-medium">Privacy</span> before Tentacle
                  will contact a provider API.
                </div>
              )}

              <div className="flex gap-2">
                {PROVIDERS.map((provider) => (
                  <Button
                    key={provider}
                    variant={
                      state.providerType === provider ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() =>
                      dispatch({
                        type: "SET_PROVIDER_TYPE",
                        payload: provider,
                      })
                    }
                    className="capitalize h-8 text-xs gap-1.5"
                  >
                    <Globe className="h-3 w-3" />
                    {provider}
                  </Button>
                ))}
              </div>

              {state.providerType && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div>
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
                      <Key className="h-3 w-3" />
                      Personal Access Token
                    </label>

                    {state.providerTokenSaved && !tokenDraft ? (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="gap-1 text-[10px] h-6"
                        >
                          <Lock className="h-3 w-3" /> Saved in your keychain
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => setTokenDraft(" ")}
                        >
                          Replace
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2 text-destructive"
                          onClick={clearToken}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          placeholder="Paste your token…"
                          value={tokenDraft.trim()}
                          onChange={(e) => setTokenDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveToken();
                          }}
                          className="h-8 text-xs font-mono"
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs shrink-0"
                          disabled={!tokenDraft.trim()}
                          onClick={saveToken}
                        >
                          Save
                        </Button>
                      </div>
                    )}

                    <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                      Stored in your operating system keychain, never in
                      Tentacle&rsquo;s settings file. It is read only when a
                      request needs it, and is never displayed again.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">
                        {state.providerType === "bitbucket"
                          ? "Workspace"
                          : "Owner/Org"}
                      </label>
                      <Input
                        placeholder={
                          state.providerType === "bitbucket"
                            ? "workspace"
                            : "owner"
                        }
                        value={state.providerOwner}
                        onChange={(e) =>
                          dispatch({
                            type: "SET_PROVIDER_OWNER",
                            payload: e.target.value,
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">
                        Repository
                      </label>
                      <Input
                        placeholder="repo-name"
                        value={state.providerRepo}
                        onChange={(e) =>
                          dispatch({
                            type: "SET_PROVIDER_REPO",
                            payload: e.target.value,
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  {state.providerType === "gitlab" && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">
                        GitLab Base URL
                      </label>
                      <Input
                        placeholder="https://gitlab.com"
                        value={state.gitlabBaseUrl}
                        onChange={(e) =>
                          dispatch({
                            type: "SET_GITLAB_BASE_URL",
                            payload: e.target.value,
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">Local AI (Ollama)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tentacle uses Ollama for local inference. No data leaves your
                  machine.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                {ollamaAvailable === null ? (
                  <Badge variant="outline" className="text-[10px] h-5">
                    Checking…
                  </Badge>
                ) : ollamaAvailable ? (
                  <Badge variant="default" className="gap-1 text-[10px] h-5">
                    <CheckCircle className="h-3 w-3" /> Connected
                  </Badge>
                ) : (
                  <Badge
                    variant="destructive"
                    className="gap-1 text-[10px] h-5"
                  >
                    <XCircle className="h-3 w-3" /> Not available
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkOllama}
                  className="h-6 text-[10px] px-2"
                >
                  Retry
                </Button>
              </div>

              {ollamaAvailable && ollamaModels.length > 0 && (
                <div className="rounded-lg border p-3">
                  <span className="text-xs font-medium">Available models</span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ollamaModels.map((model) => (
                      <Badge
                        key={model.name}
                        variant="secondary"
                        className="text-[10px] font-mono h-5"
                      >
                        {model.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {ollamaAvailable === false && (
                <div className="rounded-lg border p-3 text-xs text-muted-foreground space-y-1.5">
                  <p>Ollama is not running. To use the AI features:</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>
                      Install Ollama from{" "}
                      <span className="font-mono">ollama.com</span>
                    </li>
                    <li>
                      Run{" "}
                      <code className="bg-muted px-1 rounded">
                        ollama serve
                      </code>
                    </li>
                    <li>
                      Pull a model:{" "}
                      <code className="bg-muted px-1 rounded">
                        ollama pull llama3.2
                      </code>
                    </li>
                  </ol>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium">Privacy</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  What leaves your machine, and what Tentacle keeps.
                </p>
              </div>

              <div className="rounded-lg border p-3 flex items-start gap-3">
                <Globe className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium flex-1">
                      Allow provider API requests
                    </span>
                    <Switch
                      checked={state.allowNetwork}
                      onCheckedChange={(checked) =>
                        dispatch({
                          type: "SET_ALLOW_NETWORK",
                          payload: checked,
                        })
                      }
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Off by default. While off, Tentacle makes no request to
                    GitHub, GitLab or Bitbucket — pull requests and issues stay
                    unavailable. Fetching and pushing over git are unaffected;
                    those go only to the remotes in your repository.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {[
                  {
                    icon: Shield,
                    text: "No telemetry, analytics or crash reporting. Ever.",
                  },
                  {
                    icon: Lock,
                    text: "Tokens live in your operating system keychain, not in a settings file.",
                  },
                  {
                    icon: Bot,
                    text: "AI runs locally through Ollama; your code is never uploaded.",
                  },
                  {
                    icon: HardDrive,
                    text: "No cloud sync. Settings are a single JSON file on this machine.",
                  },
                ].map(({ icon: Icon, text }, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg border p-3"
                  >
                    <Icon className="h-3.5 w-3.5 text-primary mt-px shrink-0" />
                    <span className="text-xs leading-relaxed">{text}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium flex-1">
                    Stored data
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 gap-1"
                    onClick={async () => {
                      const data = await readStoredState();
                      setStoredState(JSON.stringify(data, null, 2));
                    }}
                  >
                    <Eye className="h-3 w-3" /> Show
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 gap-1 text-destructive"
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
                      await purgeStoredState([...PROVIDERS]);
                      dispatch({
                        type: "SET_PROVIDER_TOKEN_SAVED",
                        payload: false,
                      });
                      setStoredState(null);
                    }}
                  >
                    <Trash2 className="h-3 w-3" /> Erase all
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Everything Tentacle writes to disk, exactly as it is written.
                </p>
                {storedState && (
                  <pre className="text-[10px] font-mono bg-muted rounded p-2 overflow-x-auto max-h-56">
                    {storedState}
                  </pre>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
