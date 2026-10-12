import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT, importBundle } from "../helpers/load-bundle.mjs";

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

function createContext(root, registrations = { routes: [], slots: [] }) {
  return {
    location: { directory: root },
    theme: {
      text: {
        base: {},
        muted: {},
        feedback: {
          success: { base: {} },
          warning: { base: {} },
          error: { base: {} },
        },
      },
      hue: {
        accent: { 400: {} },
        interactive: { 300: {} },
      },
      background: { raised: { base: {} } },
      border: { base: {} },
    },
    ui: {
      router: {
        current: () => ({ type: "session", sessionID: "session-live" }),
        register: (page) => {
          registrations.routes.push(page);
          return () => {};
        },
        navigate: () => {},
      },
      panel: { open: () => true, close: () => {}, current: () => undefined },
      slot: (claim) => {
        registrations.slots.push(claim);
        return () => {};
      },
      toast: { show: () => {} },
    },
    keymap: { layer: (factory) => factory() },
    renderer: {
      height: 52,
      on: () => {},
      off: () => {},
    },
  };
}

describe("AION TUI plan watcher", () => {
  it("uses the ZTXTECH logo asset and a stable text fallback", () => {
    assert.equal(
      tuiBundle.ZTXTECH_LOGO_URL,
      "https://ztxtech.github.io/images/brand/ztxtech-logo.png",
    );
  });

  it("registers the board against V2 theme tokens", () => {
    const root = createProject();
    const registrations = { routes: [], slots: [] };
    const cleanup = tuiBundle.default.setup(createContext(root, registrations));

    assert.deepEqual(
      registrations.routes.map((route) => route.name),
      ["aion-dag"],
    );
    assert.deepEqual(
      registrations.slots.map((slot) => slot.append),
      ["session.panel", "sidebar.content", "prompt.footer.status"],
    );
    assert.equal(tuiBundle.AION_STATUS_HINT, "ctrl+g AION board · ctrl+p commands");
    for (const slot of registrations.slots) {
      assert.equal(typeof slot.render, "function");
    }
    assert.equal(typeof cleanup, "function");
    cleanup();
    rmSync(root, { recursive: true, force: true });
  });

  it("exposes blockers beside the plan graph", async () => {
    const root = createProject();
    const board = tuiBundle.watchPlanGraph(root);

    try {
      mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
      writeTodoMap(
        root,
        `# TODO Map

#### TODO-001 First

- Plan step: First
- Depends on:

## Current Blockers

- Evidence gate needs a second seeded run.
`,
      );

      await waitFor(() => board.graph().items.length === 1);
      await waitFor(() => board.blockers().length === 1);
      assert.match(board.blockers()[0], /Evidence gate/);
    } finally {
      board.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads execution mode and active session phase", () => {
    const root = createProject();
    mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
    writeFileSync(
      join(root, ".opencode", "memory", "runtime-state.json"),
      JSON.stringify({
        version: 2,
        executionMode: "MAX",
        preferences: { tokenEconomy: "balanced", preserveAcrossSessions: true },
        activeSessionID: "session-live",
        sessions: {
          "session-live": {
            lastPhase: "implement",
            phaseReason: "implementation",
            resumeHint: "Continue TODO-001.",
            interrupted: true,
            complexityTier: "FULL",
          },
        },
      }),
    );

    const runtimeBoard = tuiBundle.watchRuntimeSnapshot(root, () => "session-live");
    try {
      const runtime = runtimeBoard.runtime();
      assert.equal(runtime.mode, "MAX");
      assert.equal(runtime.phase, "implement");
      assert.equal(runtime.tier, "FULL");
      assert.equal(runtime.interrupted, true);
      assert.equal(runtime.resumeHint, "Continue TODO-001.");
    } finally {
      runtimeBoard.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("gates auto-open to an unopened session panel", () => {
    const root = createProject();
    mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
    writeTodoMap(
      root,
      `# TODO Map

#### TODO-001 First

- Plan step: First
- State: in-progress
- Depends on:
`,
    );
    assert.equal(
      tuiBundle.shouldAutoOpen({
        hasPlan: true,
        routeType: "session",
        armed: true,
        panelOpen: false,
      }),
      true,
    );
    assert.equal(
      tuiBundle.shouldAutoOpen({
        hasPlan: true,
        routeType: "session",
        armed: false,
        panelOpen: false,
      }),
      false,
    );
    assert.equal(
      tuiBundle.shouldAutoOpen({
        hasPlan: true,
        routeType: "session",
        armed: true,
        panelOpen: true,
      }),
      false,
    );
    assert.equal(
      tuiBundle.shouldAutoOpen({
        hasPlan: false,
        routeType: "session",
        armed: true,
        panelOpen: false,
      }),
      false,
    );
    assert.equal(
      tuiBundle.shouldAutoOpen({
        hasPlan: true,
        routeType: "other",
        armed: true,
        panelOpen: false,
      }),
      false,
    );

    rmSync(root, { recursive: true, force: true });
  });

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

describe("AION TUI toast bridge", () => {
  it("delivers new queued toasts exactly once", async () => {
    const root = createProject();
    mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
    const { enqueueToast } = (await (await importBundle())._testing.toastQueue());
    const seen = [];
    const watcher = tuiBundle.watchToasts(root, (toast) => seen.push(toast), {
      pollMs: 20,
      graceMs: 0,
    });

    try {
      enqueueToast(root, {
        title: "I AM AION",
        message: "Online. Watching. The loop begins.",
        variant: "info",
        duration: 4500,
      });
      await waitFor(() => seen.length === 1);
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(seen.length, 1, "polling must not re-render the same toast");
      assert.equal(seen[0].title, "I AM AION");
      assert.equal(seen[0].variant, "info");
    } finally {
      watcher.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips the stale backlog written before the grace window", async () => {
    const root = createProject();
    mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
    const { enqueueToast } = (await (await importBundle())._testing.toastQueue());
    enqueueToast(root, { message: "yesterday's pulse", variant: "info" }, {
      now: new Date(Date.now() - 60_000),
    });

    const seen = [];
    const watcher = tuiBundle.watchToasts(root, (toast) => seen.push(toast), { pollMs: 20 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(seen.length, 0, "restart must not replay old toasts");
    } finally {
      watcher.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("setup wires the queue to context.ui.toast.show", async () => {
    const root = createProject();
    mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
    const shown = [];
    const context = createContext(root);
    context.ui.toast = { show: (toast) => shown.push(toast) };
    const cleanup = tuiBundle.default.setup(context);
    const { enqueueToast } = (await (await importBundle())._testing.toastQueue());

    try {
      enqueueToast(root, { title: "I AM AION", message: "Boot sequence complete.", variant: "info", duration: 4500 });
      await waitFor(() => shown.length >= 1, 3000);
      assert.equal(shown[0].message, "Boot sequence complete.");
      assert.equal(shown[0].title, "I AM AION");
      assert.equal(shown[0].duration, 4500);
    } finally {
      cleanup();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
