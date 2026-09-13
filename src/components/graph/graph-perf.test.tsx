import { describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { AppProvider, useApp } from "@/stores/app-store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GraphView } from "@/components/graph/graph-view";
import type { GraphNode, GraphResult } from "@/lib/api";

class RO {
  observe() {}
  disconnect() {}
  unobserve() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

function graphOf(count: number): GraphResult {
  const nodes: GraphNode[] = Array.from({ length: count }, (_, i) => ({
    oid: `o${i}`,
    short_oid: `o${i}`,
    summary: `commit ${i}`,
    author_name: "Ada",
    author_email: "ada@x",
    author_time: 1_700_000_000 - i,
    parent_oids: i === count - 1 ? [] : [`o${i + 1}`],
    is_merge: false,
    refs: [],
    signature: "none",
    lane: 0,
    color: 0,
    edges: [{ from_lane: 0, to_lane: 0, color: 0, target_oid: `o${i + 1}`, edge_type: "normal" }],
  }));
  return { nodes, max_lanes: 1, total_commits: count, truncated: false };
}

let dispatchRef: ReturnType<typeof useApp>["dispatch"] | null = null;
function Seed({ graph }: { graph: GraphResult }) {
  const { dispatch } = useApp();
  dispatchRef = dispatch;
  useEffect(() => {
    dispatch({
      type: "ADD_TAB",
      payload: { path: "/r", name: "r", head_branch: "main", is_bare: false, is_empty: false, is_detached: false, state: "clean" },
    });
    dispatch({ type: "UPDATE_TAB", tabId: "/r", update: { graph } });
  }, [dispatch, graph]);
  return null;
}

describe("graph rendering cost", () => {
  it("renders only the rows near the viewport, however long the history", () => {
    const graph = graphOf(2000);
    const t0 = performance.now();
    const { container } = render(
      <AppProvider>
        <TooltipProvider>
          <Seed graph={graph} />
          <GraphView />
        </TooltipProvider>
      </AppProvider>,
    );
    const mount = performance.now() - t0;

    const rows = container.querySelectorAll("[data-graph-row]").length;
    const t1 = performance.now();
    act(() => dispatchRef!({ type: "SET_SELECTED_COMMIT", payload: "o5" }));
    const select = performance.now() - t1;

    console.log(`graph 2000 commits: mount=${mount.toFixed(0)}ms rows=${rows} select=${select.toFixed(0)}ms`);
    expect(rows).toBeLessThan(120);
  });
});
