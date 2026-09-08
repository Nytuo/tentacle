import { describe, expect, it } from "vitest";
import { parseConflictRegions } from "@/components/merge/conflict-regions";

describe("parseConflictRegions", () => {
  it("splits a single region into its two sides", () => {
    const merged =
      "top\n<<<<<<< HEAD\nmine\n=======\nyours\n>>>>>>> other\nbottom\n";
    const parsed = parseConflictRegions(merged);

    expect(parsed).not.toBeNull();
    expect(parsed!.regions).toHaveLength(1);
    expect(parsed!.regions[0].ours).toEqual(["mine"]);
    expect(parsed!.regions[0].theirs).toEqual(["yours"]);
    expect(parsed!.regions[0].context).toEqual(["top"]);
  });

  it("finds every region, in order", () => {
    const merged =
      "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\n" +
      "mid\n" +
      "<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> x\n";
    const parsed = parseConflictRegions(merged)!;

    expect(parsed.regions).toHaveLength(2);
    expect(parsed.regions[0].ours).toEqual(["a"]);
    expect(parsed.regions[1].ours).toEqual(["c"]);
    expect(parsed.regions[1].context).toEqual(["mid"]);
  });

  it("discards the diff3 base section", () => {
    const merged =
      "<<<<<<< HEAD\nmine\n||||||| base\norig\n=======\nyours\n>>>>>>> x\n";
    const parsed = parseConflictRegions(merged)!;

    expect(parsed.regions[0].ours).toEqual(["mine"]);
    expect(parsed.regions[0].theirs).toEqual(["yours"]);
  });

  it("handles a side that is empty on one branch", () => {
    const merged = "<<<<<<< HEAD\n=======\nadded\n>>>>>>> x\n";
    const parsed = parseConflictRegions(merged)!;

    expect(parsed.regions[0].ours).toEqual([]);
    expect(parsed.regions[0].theirs).toEqual(["added"]);
  });

  it("returns null for a file with no markers", () => {
    expect(parseConflictRegions("just\nsome\nlines\n")).toBeNull();
    expect(parseConflictRegions("")).toBeNull();
  });

  it("returns null rather than half a region when a marker is unterminated", () => {
    expect(
      parseConflictRegions("<<<<<<< HEAD\nmine\n=======\nyours\n"),
    ).toBeNull();
  });
});
