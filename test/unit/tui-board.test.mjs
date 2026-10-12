import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT } from "../helpers/load-bundle.mjs";

const tuiBundle = await import(
  new URL(`file://${join(REPO_ROOT, ".opencode", "plugins", "aion", "tui.js")}`).href
);

function createProject() {
  return mkdtempSync(join(tmpdir(), "aion-tui-board-"));
}

function waitFor(predicate, timeoutMs = 2000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("plan watcher did not refresh before timeout"));
        return;
      }
      setTimeout(check, 20);
    };

    check();
  });
}

function writeTodoMap(root, content) {
  writeFileSync(join(root, ".opencode", "memory", "todo-map.md"), content);
}

describe("AION TUI plan watcher", () => {
  it("recovers when plan directories are created after startup", async () => {
    const root = createProject();
    const board = tuiBundle.watchPlanGraph(root);

    try {
      assert.equal(board.graph().items.length, 0);

      mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
      writeTodoMap(
        root,
        `# TODO Map

#### TODO-001 First

- Plan step: First
- Depends on:
`,
      );

      await waitFor(() => board.graph().items.length === 1);
      assert.deepEqual(board.graph().layers, [["TODO-001"]]);
      assert.equal(board.graph().hasCycle, false);
    } finally {
      board.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("updates cycle detection while the board is open and stops after cleanup", async () => {
    const root = createProject();
    mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
    writeTodoMap(
      root,
      `# TODO Map

#### TODO-001 First

- Plan step: First
- Depends on:
`,
    );

    const board = tuiBundle.watchPlanGraph(root);

    try {
      await waitFor(() => board.graph().items.length === 1);
      const initialVersion = board.version();

      writeTodoMap(
        root,
        `# TODO Map

#### TODO-001 First

- Plan step: First
- Depends on: TODO-002

#### TODO-002 Second

- Plan step: Second
- Depends on: TODO-001
`,
      );

      await waitFor(() => board.graph().hasCycle);
      assert.deepEqual(board.graph().invalidDependencies, []);

      board.dispose();
      await new Promise((resolve) => setTimeout(resolve, 180));

      writeTodoMap(
        root,
        `# TODO Map

#### TODO-001 First

- Plan step: First
- Depends on:
`,
      );
      await new Promise((resolve) => setTimeout(resolve, 180));

      assert.equal(board.version(), initialVersion + 1);
      assert.equal(board.graph().hasCycle, true);
    } finally {
      board.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
