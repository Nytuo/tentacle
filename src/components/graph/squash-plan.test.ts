import { describe, expect, it } from "vitest";
import { buildSquashPlan } from "@/components/graph/squash-plan";
import type { GraphNode } from "@/lib/api";

function history(count: number): GraphNode[] {
  return Array.from({ length: count }, (_, i) => ({
    oid: `c${i}`,
    short_oid: `c${i}`,
    summary: `commit ${i}`,
    author_name: "Ada",
    author_email: "ada@example.com",
    author_time: 1000 - i,
    parent_oids: i === count - 1 ? [] : [`c${i + 1}`],
    is_merge: false,
    refs: [],
    signature: "none",
    lane: 0,
    color: 0,
    edges: [],
  }));
}

const wip: GraphNode = {
  ...history(1)[0],
  oid: "WIP",
  short_oid: "WIP",
  summary: "Work in Progress",
  parent_oids: ["c0"],
};

describe("buildSquashPlan", () => {
  it("folds a contiguous run into its earliest commit", () => {
    const result = buildSquashPlan(history(5), ["c1", "c2"], "combined");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.onto).toBe("c3");
    expect(result.plan.steps).toEqual([
      { oid: "c2", action: "reword", message: "combined" },
      { oid: "c1", action: "fixup", message: null },
      { oid: "c0", action: "pick", message: null },
    ]);
  });

  it("carries newer commits along, so the rewrite does not drop them", () => {
    const result = buildSquashPlan(history(6), ["c3", "c4"], "m");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.steps.map((s) => s.oid)).toEqual([
      "c4",
      "c3",
      "c2",
      "c1",
      "c0",
    ]);
    expect(
      result.plan.steps.filter((s) => s.action === "pick").map((s) => s.oid),
    ).toEqual(["c2", "c1", "c0"]);
  });

  it("orders steps oldest first, the order they are applied", () => {
    const result = buildSquashPlan(history(4), ["c0", "c1"], "m");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const times = result.plan.steps.map((s) => s.oid);
    expect(times).toEqual(["c1", "c0"]);
    expect(result.plan.onto).toBe("c2");
  });

  it("accepts the selection in any order", () => {
    const forwards = buildSquashPlan(history(5), ["c1", "c2"], "m");
    const backwards = buildSquashPlan(history(5), ["c2", "c1"], "m");
    expect(backwards).toEqual(forwards);
  });

  it("refuses a non-contiguous selection rather than silently reordering", () => {
    const result = buildSquashPlan(history(5), ["c0", "c3"], "m");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/contiguous/i);
  });

  it("refuses to squash down to the root commit", () => {
    const result = buildSquashPlan(history(5), ["c3", "c4"], "m");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/root commit/i);
  });

  it("needs at least two commits", () => {
    const result = buildSquashPlan(history(5), ["c1"], "m");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/at least two/i);
  });

  it("ignores the synthetic working-directory row", () => {
    const nodes = [wip, ...history(5)];
    const result = buildSquashPlan(nodes, ["WIP", "c0", "c1"], "m");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps.map((s) => s.oid)).not.toContain("WIP");
    expect(result.plan.steps.map((s) => s.oid)).toEqual(["c1", "c0"]);
  });

  it("rejects a selection referring to commits that are gone", () => {
    const result = buildSquashPlan(history(3), ["c0", "missing"], "m");
    expect(result.ok).toBe(false);
  });
});
