import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RefCell } from "@/components/graph/graph-view";
import type { RefInfo } from "@/lib/api";

function ref(
  name: string,
  kind: RefInfo["kind"],
  extra: Partial<RefInfo> = {},
): RefInfo {
  return { name, kind, remote: null, is_head: false, ...extra };
}

function renderCell(refs: RefInfo[], onSolo = vi.fn()) {
  render(
    <TooltipProvider>
      <RefCell refs={refs} onSolo={onSolo} />
    </TooltipProvider>,
  );
  return onSolo;
}

describe("RefCell", () => {
  it("renders nothing but spacing when a commit carries no refs", () => {
    renderCell([]);
    expect(screen.queryByTitle(/branch|tag/i)).not.toBeInTheDocument();
  });

  it("shows a single ref without a counter", () => {
    renderCell([ref("main", "local", { is_head: true })]);
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it("shows only the first ref plus a +N counter for the rest", () => {
    renderCell([
      ref("main", "local", { is_head: true }),
      ref("origin/main", "remote", { remote: "origin" }),
      ref("v1.0", "tag"),
      ref("v1.1", "tag"),
    ]);

    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();

    expect(screen.queryByText("v1.0")).not.toBeInTheDocument();
  });

  it("labels each kind distinctly, so local and remote are not confusable", () => {
    const { unmount } = render(
      <TooltipProvider>
        <RefCell
          refs={[ref("origin/main", "remote", { remote: "origin" })]}
          onSolo={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(screen.getByTitle("Remote branch: origin/main")).toBeInTheDocument();
    unmount();

    render(
      <TooltipProvider>
        <RefCell refs={[ref("main", "local")]} onSolo={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.getByTitle("Local branch: main")).toBeInTheDocument();
  });

  it("marks the checked-out branch differently from any other local branch", () => {
    render(
      <TooltipProvider>
        <RefCell
          refs={[ref("main", "local", { is_head: true })]}
          onSolo={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(screen.getByTitle("Checked out: main")).toBeInTheDocument();
  });

  it("splits a remote ref into its remote and branch parts", () => {
    renderCell([ref("origin/feature/deep", "remote", { remote: "origin" })]);

    expect(screen.getByText("origin/")).toBeInTheDocument();
    expect(screen.getByText("feature/deep")).toBeInTheDocument();
  });

  it("solos the ref that was clicked", () => {
    const onSolo = renderCell([
      ref("main", "local", { is_head: true }),
      ref("origin/main", "remote", { remote: "origin" }),
    ]);

    fireEvent.click(screen.getByTitle("Show only main"));
    expect(onSolo).toHaveBeenCalledWith(
      expect.objectContaining({ name: "main" }),
    );
  });
});
