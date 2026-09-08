import { useState } from "react";
import { useGit } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, FolderOpen, Plus } from "lucide-react";
import * as api from "@/lib/api";

export function WelcomeScreen() {
  const { openRepository, dispatch, setError } = useGit();
  const [cloneUrl, setCloneUrl] = useState("");
  const [clonePath, setClonePath] = useState("");
  const [cloning, setCloning] = useState(false);
  const [initPath, setInitPath] = useState("");
  const [view, setView] = useState<"main" | "clone" | "init">("main");

  const handleOpen = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await openRepository(selected as string);
    }
  };

  const handleClone = async () => {
    if (!cloneUrl || !clonePath) return;
    setCloning(true);
    try {
      const repo = await api.cloneRepo(cloneUrl, clonePath);
      dispatch({ type: "ADD_TAB", payload: repo });
    } catch (e) {
      setError(String(e));
    } finally {
      setCloning(false);
    }
  };

  const handleInit = async () => {
    if (!initPath) return;
    try {
      const repo = await api.initRepo(initPath);
      dispatch({ type: "ADD_TAB", payload: repo });
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSelectClonePath = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) setClonePath(selected as string);
  };

  const handleSelectInitPath = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) setInitPath(selected as string);
  };

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 p-8">
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center mb-3">
            <img
              src="/logo.png"
              alt="Tentacle"
              className="h-20 w-20 object-contain"
            />
          </div>
          <div className="mb-1">
            <h1 className="text-3xl font-bold tracking-tight">Tentacle</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Privacy-first Git GUI. No telemetry, local-only.
          </p>
        </div>

        {view === "main" && (
          <div className="space-y-3">
            <Button
              onClick={handleOpen}
              className="w-full h-11 gap-2"
              size="lg"
            >
              <FolderOpen className="h-4 w-4" />
              Open Repository
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setView("clone")}
              >
                <Download className="h-4 w-4" />
                Clone
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setView("init")}
              >
                <Plus className="h-4 w-4" />
                Init New
              </Button>
            </div>
          </div>
        )}

        {view === "clone" && (
          <div className="space-y-3">
            <Input
              placeholder="https://github.com/user/repo.git"
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Input
                placeholder="Destination path..."
                value={clonePath}
                onChange={(e) => setClonePath(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleSelectClonePath}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setView("main")}
              >
                Cancel
              </Button>
              <Button
                onClick={handleClone}
                disabled={!cloneUrl || !clonePath || cloning}
                className="flex-1 gap-2"
              >
                <Download className="h-4 w-4" />
                {cloning ? "Cloning..." : "Clone"}
              </Button>
            </div>
          </div>
        )}

        {view === "init" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Path for new repository..."
                value={initPath}
                onChange={(e) => setInitPath(e.target.value)}
                className="flex-1"
                autoFocus
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleSelectInitPath}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setView("main")}
              >
                Cancel
              </Button>
              <Button
                onClick={handleInit}
                disabled={!initPath}
                className="flex-1 gap-2"
              >
                <Plus className="h-4 w-4" />
                Initialize
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
