import { useState, useEffect } from "react";
import { useGit } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Shield, Globe, Key, Bot, CheckCircle, XCircle, Lock } from "lucide-react";
import * as api from "@/lib/api";

export function SettingsView() {
  const { state, dispatch } = useGit();
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<api.OllamaModel[]>([]);

  useEffect(() => {
    checkOllama();
  }, []);

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
                  Configure your Git hosting provider for PR management.
                </p>
              </div>

              <div className="flex gap-2">
                {(["github", "gitlab", "bitbucket"] as const).map((provider) => (
                  <Button
                    key={provider}
                    variant={state.providerType === provider ? "default" : "outline"}
                    size="sm"
                    onClick={() => dispatch({ type: "SET_PROVIDER_TYPE", payload: provider })}
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
                    <Input
                      type="password"
                      placeholder="Enter your token..."
                      value={state.providerToken}
                      onChange={(e) => dispatch({ type: "SET_PROVIDER_TOKEN", payload: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Stored locally only. Never sent anywhere except the provider's API.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">
                        {state.providerType === "bitbucket" ? "Workspace" : "Owner/Org"}
                      </label>
                      <Input
                        placeholder={state.providerType === "bitbucket" ? "workspace" : "owner"}
                        value={state.providerOwner}
                        onChange={(e) => dispatch({ type: "SET_PROVIDER_OWNER", payload: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">Repository</label>
                      <Input
                        placeholder="repo-name"
                        value={state.providerRepo}
                        onChange={(e) => dispatch({ type: "SET_PROVIDER_REPO", payload: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  {state.providerType === "gitlab" && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">GitLab Base URL</label>
                      <Input
                        placeholder="https://gitlab.com"
                        value={state.gitlabBaseUrl}
                        onChange={(e) => dispatch({ type: "SET_GITLAB_BASE_URL", payload: e.target.value })}
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
                   Tentacle uses Ollama for local AI inference. No data leaves your machine.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                {ollamaAvailable === null ? (
                  <Badge variant="outline" className="text-[10px] h-5">Checking...</Badge>
                ) : ollamaAvailable ? (
                  <Badge variant="default" className="gap-1 text-[10px] h-5">
                    <CheckCircle className="h-3 w-3" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1 text-[10px] h-5">
                    <XCircle className="h-3 w-3" /> Not Available
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={checkOllama} className="h-6 text-[10px] px-2">
                  Retry
                </Button>
              </div>

              {ollamaAvailable && ollamaModels.length > 0 && (
                <div className="rounded-lg border p-3">
                  <span className="text-xs font-medium">Available Models</span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ollamaModels.map((model) => (
                      <Badge key={model.name} variant="secondary" className="text-[10px] font-mono h-5">
                        {model.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {!ollamaAvailable && ollamaAvailable !== null && (
                <div className="rounded-lg border p-3 text-xs text-muted-foreground space-y-1.5">
                  <p>Ollama is not running. To use AI features:</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>Install Ollama from <span className="font-mono">ollama.com</span></li>
                    <li>Run <code className="bg-muted px-1 rounded">ollama serve</code></li>
                    <li>Pull a model: <code className="bg-muted px-1 rounded">ollama pull llama3.2</code></li>
                  </ol>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">Privacy</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  NytGit is designed with privacy as a core principle.
                </p>
              </div>

              <div className="space-y-2">
                {[
                  { icon: Shield, text: "Zero telemetry — no usage data is collected" },
                  { icon: Lock,   text: "Credentials stored locally — never sent to our servers" },
                  { icon: Bot,    text: "AI runs locally via Ollama — your code stays on your machine" },
                  { icon: Globe,  text: "Only connects to provider APIs you configure" },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-lg border p-3">
                    <Icon className="h-3.5 w-3.5 text-primary mt-px shrink-0" />
                    <span className="text-xs">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
