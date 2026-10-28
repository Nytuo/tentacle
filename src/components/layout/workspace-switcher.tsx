import { useApp } from "@/stores/app-store";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { promptFor } from "@/components/ui/prompt-dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Layers, ChevronDown, Check, Plus, Settings2 } from "lucide-react";

/** Workspace picker in the window chrome, next to the brand. */
export function WorkspaceSwitcher() {
  const { dispatch } = useApp();
  const { workspaces, active, switchTo, create } = useWorkspaces();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2.5 text-xs border-r shrink-0 hover:bg-accent/60 transition-colors"
          title="Switch workspace"
        >
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="max-w-[120px] truncate font-medium">{active.name}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Workspaces
        </DropdownMenuLabel>
        {workspaces.map(w => (
          <DropdownMenuItem key={w.id} className="text-xs gap-2" onSelect={() => void switchTo(w.id)}>
            <Check className={cn("h-3.5 w-3.5", w.id === active.id ? "opacity-100" : "opacity-0")} />
            <span className="flex-1 truncate">{w.name}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {w.repoPaths.length}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-xs gap-2"
          onSelect={async () => {
            const name = await promptFor({
              title: "New workspace",
              description:
                "A separate set of open repositories, with its own AI settings. " +
                "The repositories you have open now stay in their workspace.",
              label: "Name",
              placeholder: "Client work",
            });
            if (name) create(name);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          New workspace…
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-xs gap-2"
          onSelect={() => dispatch({ type: "OPEN_SETTINGS", payload: "workspace" })}
        >
          <Settings2 className="h-3.5 w-3.5" />
          Workspace settings…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
