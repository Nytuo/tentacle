import type { GraphNode, RebaseStep } from "@/lib/api";

export interface SquashPlan {
  onto: string;

  steps: RebaseStep[];
}

export type SquashResult =
  | { ok: true; plan: SquashPlan }
  | {
      ok: false;
      reason: string;
    };

export function buildSquashPlan(
  nodes: GraphNode[],
  selected: string[],
  message: string,
): SquashResult {
  const commits = nodes.filter((n) => n.oid !== "WIP");
  const picked = selected.filter((oid) => oid !== "WIP");

  if (picked.length < 2) {
    return { ok: false, reason: "Select at least two commits to squash." };
  }

  const indices = picked
    .map((oid) => commits.findIndex((n) => n.oid === oid))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

  if (indices.length !== picked.length) {
    return {
      ok: false,
      reason: "Some selected commits are no longer in the graph.",
    };
  }

  const oldestIdx = indices[indices.length - 1];
  const newestIdx = indices[0];
  if (oldestIdx - newestIdx !== indices.length - 1) {
    return {
      ok: false,
      reason: "Select a contiguous run of commits to squash them.",
    };
  }

  const oldest = commits[oldestIdx];
  const onto = oldest.parent_oids[0];
  if (!onto) {
    return { ok: false, reason: "Cannot squash down to the root commit." };
  }

  const chosen = new Set(picked);
  const steps: RebaseStep[] = commits
    .slice(0, oldestIdx + 1)
    .slice()
    .reverse()
    .map((node) => {
      if (node.oid === oldest.oid) {
        return { oid: node.oid, action: "reword", message };
      }
      if (chosen.has(node.oid)) {
        return { oid: node.oid, action: "fixup", message: null };
      }
      return { oid: node.oid, action: "pick", message: null };
    });

  return { ok: true, plan: { onto, steps } };
}
