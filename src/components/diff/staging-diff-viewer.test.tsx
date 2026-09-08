import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StagingDiffViewer } from "@/components/diff/staging-diff-viewer";
import type { DiffFile } from "@/lib/api";

function fixture(): DiffFile {
  return {
    old_path: "src/a.ts",
    new_path: "src/a.ts",
    status: "modified",
    binary: false,
    additions: 2,
    deletions: 1,
    hunks: [
      {
        header: "@@ -1,3 +1,3 @@",
        old_start: 1,
        old_lines: 3,
        new_start: 1,
        new_lines: 3,
        lines: [
          { origin: " ", content: "one\n", old_lineno: 1, new_lineno: 1 },
          { origin: "-", content: "two\n", old_lineno: 2, new_lineno: null },
          { origin: "+", content: "TWO\n", old_lineno: null, new_lineno: 2 },
          { origin: " ", content: "three\n", old_lineno: 3, new_lineno: 3 },
        ],
      },
      {
        header: "@@ -20,2 +20,3 @@",
        old_start: 20,
        old_lines: 2,
        new_start: 20,
        new_lines: 3,
        lines: [
          { origin: " ", content: "twenty\n", old_lineno: 20, new_lineno: 20 },
          { origin: "+", content: "NEW\n", old_lineno: null, new_lineno: 21 },
        ],
      },
    ],
  };
}

function setup(side: "unstaged" | "staged" = "unstaged") {
  const onStage = vi.fn();
  const onUnstage = vi.fn();
  const onDiscard = vi.fn();
  render(
    <StagingDiffViewer
      files={[fixture()]}
      side={side}
      onStage={onStage}
      onUnstage={onUnstage}
      onDiscard={onDiscard}
    />,
  );
  return { onStage, onUnstage, onDiscard };
}

describe("hunk staging", () => {
  it("stages a whole file with an empty selection", () => {
    const { onStage } = setup();
    fireEvent.click(screen.getByRole("button", { name: /stage file/i }));
    expect(onStage).toHaveBeenCalledWith("src/a.ts", []);
  });

  it("stages one hunk by its index", () => {
    const { onStage } = setup();
    fireEvent.click(screen.getAllByRole("button", { name: /stage hunk/i })[1]);
    expect(onStage).toHaveBeenCalledWith("src/a.ts", [
      { hunk_index: 1, lines: [] },
    ]);
  });

  it("selects individual changed lines and reports their in-hunk indices", () => {
    const { onStage } = setup();

    const selectable = screen.getAllByRole("checkbox");
    expect(selectable).toHaveLength(3);

    fireEvent.click(selectable[1]);
    fireEvent.click(screen.getByRole("button", { name: /stage lines/i }));

    expect(onStage).toHaveBeenCalledWith("src/a.ts", [
      { hunk_index: 0, lines: [2] },
    ]);
  });

  it("groups a multi-hunk line selection per hunk", () => {
    const { onStage } = setup();
    const selectable = screen.getAllByRole("checkbox");

    fireEvent.click(selectable[0]);
    fireEvent.click(selectable[2]);
    fireEvent.click(screen.getByRole("button", { name: /stage lines/i }));

    expect(onStage).toHaveBeenCalledWith("src/a.ts", [
      { hunk_index: 0, lines: [1] },
      { hunk_index: 1, lines: [1] },
    ]);
  });

  it("deselects a line when it is clicked again", () => {
    setup();
    const line = screen.getAllByRole("checkbox")[0];

    fireEvent.click(line);
    expect(screen.getByText(/1 line selected/)).toBeInTheDocument();

    fireEvent.click(line);
    expect(screen.queryByText(/line selected/)).not.toBeInTheDocument();
  });

  it("offers unstaging rather than staging on the staged side", () => {
    setup("staged");
    expect(
      screen.getByRole("button", { name: /unstage file/i }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /^stage file$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /discard/i }),
    ).not.toBeInTheDocument();
  });

  it("unstages a selection of lines from the staged side", () => {
    const { onUnstage } = setup("staged");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /unstage lines/i }));
    expect(onUnstage).toHaveBeenCalledWith("src/a.ts", [
      { hunk_index: 0, lines: [1] },
    ]);
  });
});
