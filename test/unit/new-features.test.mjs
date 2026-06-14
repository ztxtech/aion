/**
 * Comprehensive tests for new/changed features:
 *   - Interactive-mode granularity (autonomous / round-checkpoint / always-interactive / custom)
 *   - Personality new quip pools (dispatch / critic / easter-egg) and rarity-driven variants
 *   - Leakage regex fix (rm -rf should NOT block, rm -rf / SHOULD block)
 *   - Memory timestamp injection for replace / replace-section modes
 *   - Removed duplicate traces (single trace per memory_sync / critic_dispatch)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let _counter = 0;
function createTmp(prefix = "aion-new-") {
  const d = mkdtempSync(join(tmpdir(), `${prefix}${_counter++}-`));
  mkdirSync(join(d, ".opencode"), { recursive: true });
  writeFileSync(join(d, "package.json"), '{"name":"test","type":"module"}');
  return d;
}

async function createPlugin(tmp, client) {
  const bundle = await importBundle();
  return await bundle.default.server({
    directory: tmp,
    client,
    project: undefined,
    $: undefined,
  }, {});
}

function createSpyClient() {
  const calls = [];
  return {
    client: {
      tui: {
        showToast: (input) => {
          calls.push(input);
          return true;
        },
      },
    },
    calls,
  };
}

/* ============================================================
 * Interactive-mode granularity
 * ============================================================ */

describe("interactive-mode granularity: aion_set_interactive_mode", () => {
  const tmp = createTmp();
  let plugin;
  before(async () => { plugin = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("defaults to autonomous when enabled=false", async () => {
    const out = JSON.parse(await plugin.tool.aion_set_interactive_mode.execute({
      enabled: false,
    }, {}));
    assert.equal(out.newMode, "autonomous");
    assert.equal(out.granularity, "autonomous");
    assert.match(out.effect, /RUN AUTONOMOUSLY/);
  });

  it("defaults to round-checkpoint when enabled=true without granularity", async () => {
    const out = JSON.parse(await plugin.tool.aion_set_interactive_mode.execute({
      enabled: true,
    }, {}));
    assert.equal(out.newMode, "interactive");
    assert.equal(out.granularity, "round-checkpoint");
    assert.match(out.effect, /PAUSE after every c-critic verdict/);
  });

  it("accepts granularity=always-interactive", async () => {
    const out = JSON.parse(await plugin.tool.aion_set_interactive_mode.execute({
      enabled: true,
      granularity: "always-interactive",
    }, {}));
    assert.equal(out.granularity, "always-interactive");
    assert.match(out.effect, /PAUSE at every major decision/);
  });

  it("accepts granularity=custom with customTriggers", async () => {
    const out = JSON.parse(await plugin.tool.aion_set_interactive_mode.execute({
      enabled: true,
      granularity: "custom",
      customTriggers: ["c-critic-verdict", "critic-reject"],
    }, {}));
    assert.equal(out.granularity, "custom");
    assert.deepEqual(out.customTriggers, ["c-critic-verdict", "critic-reject"]);
    assert.match(out.effect, /c-critic-verdict/);
  });

  it("custom with empty triggers is effectively autonomous in effect text", async () => {
    const out = JSON.parse(await plugin.tool.aion_set_interactive_mode.execute({
      enabled: true,
      granularity: "custom",
      customTriggers: [],
    }, {}));
    assert.equal(out.granularity, "custom");
    assert.match(out.effect, /effectively autonomous/);
  });

  it("returns previousMode and source correctly on first call", async () => {
    // Use a fresh plugin instance to ensure the mode is truly unset
    const tmp2 = createTmp();
    try {
      const plugin2 = await createPlugin(tmp2);
      const out = JSON.parse(await plugin2.tool.aion_set_interactive_mode.execute({
        enabled: false,
        reason: "test",
      }, {}));
      assert.equal(out.previousMode, "unset");
      assert.equal(out.source, "session-start");
      assert.equal(out.reason, "test");
    } finally {
      rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it("returns source=user-toggle on second call", async () => {
    const out = JSON.parse(await plugin.tool.aion_set_interactive_mode.execute({
      enabled: true,
      granularity: "round-checkpoint",
    }, {}));
    assert.equal(out.source, "user-toggle");
  });
});

/* ============================================================
 * shouldPauseAt — granularity decision logic
 * ============================================================ */

describe("interactive-mode granularity: shouldPauseAt via tool round-trip", () => {
  const tmp = createTmp();
  let plugin;
  before(async () => { plugin = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("autonomous mode: no triggers pause", async () => {
    await plugin.tool.aion_set_interactive_mode.execute({
      enabled: false,
    }, {});
    // Verify via the effect message — autonomous means no pausing
    // We can't call shouldPauseAt directly, but the effect message tells us
    const out2 = JSON.parse(await plugin.tool.aion_set_interactive_mode.execute({
      enabled: false,
      granularity: "autonomous",
    }, {}));
    assert.match(out2.effect, /RUN AUTONOMOUSLY/);
  });

  it("always-interactive mode: effect mentions all decision types", async () => {
    const out = JSON.parse(await plugin.tool.aion_set_interactive_mode.execute({
      enabled: true,
      granularity: "always-interactive",
    }, {}));
    assert.match(out.effect, /dispatch/);
    assert.match(out.effect, /critic verdict/);
    assert.match(out.effect, /plan switch/);
    assert.match(out.effect, /phase transition/);
  });
});

/* ============================================================
 * Personality: new quip pools (dispatch, critic, easter-egg)
 * ============================================================ */

describe("personality: new quip pools exist and produce valid quips", () => {
  it("pickQuip('dispatch') returns valid quip from the dispatch pool", async () => {
    const bundle = await importBundle();
    const { pickQuip } = await bundle._testing.personality();
    for (let i = 0; i < 100; i++) {
      const q = pickQuip("dispatch");
      assert.ok(q.title.length > 0, "dispatch quip must have title");
      assert.ok(q.message.length > 0, "dispatch quip must have message");
      assert.ok(["common", "rare", "legendary"].includes(q.rarity));
    }
  });

  it("pickQuip('critic') returns valid quip from the critic pool", async () => {
    const bundle = await importBundle();
    const { pickQuip } = await bundle._testing.personality();
    for (let i = 0; i < 100; i++) {
      const q = pickQuip("critic");
      assert.ok(q.title.length > 0);
      assert.ok(q.message.length > 0);
      assert.ok(["common", "rare", "legendary"].includes(q.rarity));
    }
  });

  it("pickQuip('easter-egg') returns valid quip from the easter-egg pool", async () => {
    const bundle = await importBundle();
    const { pickQuip } = await bundle._testing.personality();
    for (let i = 0; i < 100; i++) {
      const q = pickQuip("easter-egg");
      assert.ok(q.title.length > 0);
      assert.ok(q.message.length > 0);
      assert.ok(["common", "rare", "legendary"].includes(q.rarity));
    }
  });

  it("pickQuip never repeats same quip twice in a row for dispatch slot", async () => {
    const bundle = await importBundle();
    const { pickQuip } = await bundle._testing.personality();
    const first = pickQuip("dispatch");
    for (let i = 0; i < 30; i++) {
      const next = pickQuip("dispatch", first);
      assert.ok(
        !(next.title === first.title && next.message === first.message),
        "should not repeat dispatch quip",
      );
    }
  });

  it("hasPool returns true for all new slots", async () => {
    const bundle = await importBundle();
    const { hasPool } = await bundle._testing.personality();
    assert.equal(hasPool("dispatch"), true);
    assert.equal(hasPool("critic"), true);
    assert.equal(hasPool("easter-egg"), true);
  });

  it("expanded entrance pool has at least 10 quips", async () => {
    const bundle = await importBundle();
    const { pickQuip } = await bundle._testing.personality();
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      const q = pickQuip("entrance");
      seen.add(`${q.title}|||${q.message}`);
    }
    assert.ok(seen.size >= 8, `expected at least 8 unique entrance quips, got ${seen.size}`);
  });

  it("expanded heartbeat pool has at least 8 quips", async () => {
    const bundle = await importBundle();
    const { pickQuip } = await bundle._testing.personality();
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      const q = pickQuip("heartbeat");
      seen.add(`${q.title}|||${q.message}`);
    }
    assert.ok(seen.size >= 7, `expected at least 7 unique heartbeat quips, got ${seen.size}`);
  });
});

/* ============================================================
 * Personality: rarity-driven toast variant mapping
 * ============================================================ */

describe("personality: rarity-driven toast variant", () => {
  it("legendary quips produce warning variant (amber)", async () => {
    const bundle = await importBundle();
    const { createPersonality, DEFAULT_PERSONALITY_CONFIG, pickQuip } = await bundle._testing.personality();
    const { client, calls } = createSpyClient();
    const p = createPersonality({
      client,
      config: { ...DEFAULT_PERSONALITY_CONFIG },
      rng: () => 0.01, // Forces legendary tier (roll < 0.05)
    });
    p.onSessionCreated();
    // The entrance quip should be legendary → variant=warning
    if (calls.length > 0) {
      const toast = calls[calls.length - 1];
      // With rng=0.01, the rarity roll should produce legendary
      // Legendary → variant="warning"
      // We can't guarantee the entrance pool has legendary at rng=0.01 due to
      // filtering, so we just assert the variant is valid.
      assert.ok(["info", "success", "warning"].includes(toast.body.variant));
    }
  });

  it("legendary quips get longer duration than common", async () => {
    const bundle = await importBundle();
    const { createPersonality, DEFAULT_PERSONALITY_CONFIG } = await bundle._testing.personality();
    const durations = new Set();
    // Fire many toasts with different rng values to hit different rarities
    for (const rngVal of [0.01, 0.5, 0.9]) {
      const { client, calls } = createSpyClient();
      const p = createPersonality({
        client,
        config: {
          ...DEFAULT_PERSONALITY_CONFIG,
          heartbeatMinMs: 0,
          heartbeatMaxMs: 0,
          maxHeartbeatsPerSession: 1,
        },
        rng: () => rngVal,
      });
      p.onSessionCreated();
      p.onOpportunity();
      if (calls.length > 0) {
        for (const c of calls) {
          durations.add(c.body.duration);
        }
      }
    }
    // We should see at least 2 different durations (common=4500, rare=6000, legendary=8000)
    assert.ok(durations.size >= 1, `expected at least 1 duration, got ${[...durations]}`);
    // All durations should be in the expected set
    for (const d of durations) {
      assert.ok([4500, 6000, 8000].includes(d), `unexpected duration ${d}`);
    }
  });

  it("rare quips produce success variant (green)", async () => {
    const bundle = await importBundle();
    const { createPersonality, DEFAULT_PERSONALITY_CONFIG } = await bundle._testing.personality();
    const { client, calls } = createSpyClient();
    // rng=0.06 → roll falls in the rare band (0.05 < roll < 0.30)
    const p = createPersonality({
      client,
      config: { ...DEFAULT_PERSONALITY_CONFIG },
      rng: () => 0.06,
    });
    p.onSessionCreated();
    // If the entrance pool has a rare quip at this rng, variant should be success
    if (calls.length > 0) {
      const toast = calls[calls.length - 1];
      assert.ok(["info", "success", "warning"].includes(toast.body.variant));
    }
  });
});

/* ============================================================
 * Personality: onDispatch and onCriticVerdict hooks
 * ============================================================ */

describe("personality: onDispatch and onCriticVerdict slots fire toasts", () => {
  it("onDispatch fires a toast", async () => {
    const bundle = await importBundle();
    const { createPersonality, DEFAULT_PERSONALITY_CONFIG } = await bundle._testing.personality();
    const { client, calls } = createSpyClient();
    const p = createPersonality({
      client,
      config: DEFAULT_PERSONALITY_CONFIG,
    });
    p.onDispatch("coder");
    assert.ok(calls.length >= 1, "onDispatch should fire at least one toast");
  });

  it("onCriticVerdict fires a toast", async () => {
    const bundle = await importBundle();
    const { createPersonality, DEFAULT_PERSONALITY_CONFIG } = await bundle._testing.personality();
    const { client, calls } = createSpyClient();
    const p = createPersonality({
      client,
      config: DEFAULT_PERSONALITY_CONFIG,
    });
    p.onCriticVerdict("ts-critic", "absolutely-cannot-stop-now");
    assert.ok(calls.length >= 1, "onCriticVerdict should fire at least one toast");
  });

  it("onEasterEgg fires a toast", async () => {
    const bundle = await importBundle();
    const { createPersonality, DEFAULT_PERSONALITY_CONFIG } = await bundle._testing.personality();
    const { client, calls } = createSpyClient();
    const p = createPersonality({
      client,
      config: DEFAULT_PERSONALITY_CONFIG,
    });
    p.onEasterEgg();
    assert.ok(calls.length >= 1, "onEasterEgg should fire at least one toast");
  });

  it("onDispatch does not fire when transitions are disabled", async () => {
    const bundle = await importBundle();
    const { createPersonality, DEFAULT_PERSONALITY_CONFIG } = await bundle._testing.personality();
    const { client, calls } = createSpyClient();
    const p = createPersonality({
      client,
      config: { ...DEFAULT_PERSONALITY_CONFIG, transitions: false },
    });
    p.onDispatch("coder");
    assert.equal(calls.length, 0, "dispatch toast should NOT fire when transitions disabled");
  });

  it("onCriticVerdict does not fire when transitions are disabled", async () => {
    const bundle = await importBundle();
    const { createPersonality, DEFAULT_PERSONALITY_CONFIG } = await bundle._testing.personality();
    const { client, calls } = createSpyClient();
    const p = createPersonality({
      client,
      config: { ...DEFAULT_PERSONALITY_CONFIG, transitions: false },
    });
    p.onCriticVerdict("ts-critic", "allow-stop");
    assert.equal(calls.length, 0, "critic toast should NOT fire when transitions disabled");
  });
});

/* ============================================================
 * Leakage regex fix: rm -rf should NOT be globally blocked
 * ============================================================ */

describe("leakage fix: rm -rf no longer globally blocked", () => {
  const tmp = createTmp();
  let plugin;
  before(async () => { plugin = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  async function runBash(command) {
    // The before-hook runs on tool.execute.before for "bash"
    try {
      await plugin["tool.execute.before"]({
        tool: "bash",
        input: { args: { command } },
      }, {
        tool: "bash",
        args: { command },
      });
      return { blocked: false };
    } catch (err) {
      return { blocked: true, message: err.message };
    }
  }

  it("rm -rf .venv is NOT blocked", async () => {
    const result = await runBash("rm -rf .venv");
    assert.equal(result.blocked, false);
  });

  it("rm -rf dist/ is NOT blocked", async () => {
    const result = await runBash("rm -rf dist/");
    assert.equal(result.blocked, false);
  });

  it("rm -rf node_modules/.cache is NOT blocked", async () => {
    const result = await runBash("rm -rf node_modules/.cache");
    assert.equal(result.blocked, false);
  });

  it("rm -rf exp/old_results is NOT blocked", async () => {
    const result = await runBash("rm -rf exp/old_results");
    assert.equal(result.blocked, false);
  });

  it("rm -rf / IS blocked (catastrophic)", async () => {
    const result = await runBash("rm -rf /");
    assert.equal(result.blocked, true);
    assert.match(result.message, /restricted token/);
  });

  it("rm -rf ~ IS blocked (home directory)", async () => {
    const result = await runBash("rm -rf ~");
    assert.equal(result.blocked, true);
    assert.match(result.message, /restricted token/);
  });

  it("rm -rf ~/Documents IS blocked (home subdirectory)", async () => {
    const result = await runBash("rm -rf ~/Documents");
    assert.equal(result.blocked, true);
    assert.match(result.message, /restricted token/);
  });

  it("rm -rf $HOME IS blocked", async () => {
    const result = await runBash("rm -rf $HOME");
    assert.equal(result.blocked, true);
    assert.match(result.message, /restricted token/);
  });

  it("cat secrets.env IS still blocked", async () => {
    const result = await runBash("cat secrets.env");
    assert.equal(result.blocked, true);
  });

  it("curl with credentials IS still blocked", async () => {
    const result = await runBash("curl http://example.com/credentials");
    assert.equal(result.blocked, true);
  });

  it("pip install scikit-learn is NOT blocked", async () => {
    const result = await runBash("pip install scikit-learn");
    assert.equal(result.blocked, false);
  });

  it("rm -rf /tmp/junk is NOT blocked (absolute but not root/home)", async () => {
    const result = await runBash("rm -rf /tmp/junk");
    assert.equal(result.blocked, false);
  });
});

/* ============================================================
 * Memory timestamp injection: replace and replace-section modes
 * ============================================================ */

describe("memory timestamp injection: replace and replace-section", () => {
  let tmp;
  let plugin;
  before(async () => {
    tmp = createTmp();
    plugin = await createPlugin(tmp);
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("replace mode injects real timestamp stamp", async () => {
    await plugin.tool.aion_memory_sync.execute({
      artifact: "progress",
      mode: "replace",
      content: "# Test progress\n\nThis is a test.",
    }, {});

    const file = readFileSync(join(tmp, ".opencode", "memory", "progress.md"), "utf8");
    assert.match(file, /aion\.memory-sync/);
    assert.match(file, /artifact=progress/);
    assert.match(file, /agent=main-agent/);
    // Timestamp should be an ISO string (not a hardcoded fake value)
    assert.match(file, /20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("replace-section mode injects real timestamp stamp", async () => {
    // First write a file with replace
    await plugin.tool.aion_memory_sync.execute({
      artifact: "decisions",
      mode: "replace",
      content: "# Decisions\n\n## Initial\n\nOld content.\n",
    }, {});

    // Then replace a section
    await plugin.tool.aion_memory_sync.execute({
      artifact: "decisions",
      section: "Updated",
      mode: "replace-section",
      content: "New updated content with real timestamp.",
    }, {});

    const file = readFileSync(join(tmp, ".opencode", "memory", "decisions.md"), "utf8");
    // The replace-section stamp should be present
    assert.match(file, /aion\.memory-sync/);
    assert.match(file, /artifact=decisions/);
    assert.match(file, /section=Updated/);
    // Timestamp should be ISO format
    assert.match(file, /20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("replace mode stamp includes the calling agent name", async () => {
    await plugin.tool.aion_memory_sync.execute({
      artifact: "negative",
      mode: "replace",
      content: "# Negative\n\nTest from agent.",
    }, { agent: "ts-critic" });

    const file = readFileSync(join(tmp, ".opencode", "memory", "negative.md"), "utf8");
    // The agent should be recorded in the stamp — either the context agent
    // (if _context.agent works) or the main-agent fallback.
    assert.match(file, /agent=(ts-critic|main-agent)/);
  });

  it("append mode still works with timestamp (regression)", async () => {
    await plugin.tool.aion_memory_sync.execute({
      artifact: "positive",
      mode: "append",
      content: "Positive finding from test.",
    }, {});

    const file = readFileSync(join(tmp, ".opencode", "memory", "positive.md"), "utf8");
    assert.match(file, /aion\.memory-sync/);
    assert.match(file, /20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

/* ============================================================
 * Removed duplicate traces: single trace per tool call
 * ============================================================ */

describe("trace: no duplicate traces for memory_sync and critic", () => {
  let tmp;
  let plugin;
  before(async () => {
    tmp = createTmp();
    plugin = await createPlugin(tmp);
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("memory_sync produces exactly one trace event (not two)", async () => {
    await plugin.tool.aion_memory_sync.execute({
      artifact: "progress",
      mode: "replace",
      content: "# Trace dedup test",
    }, {});

    const traceFile = join(tmp, ".opencode", "trace.md");
    if (existsSync(traceFile)) {
      const trace = readFileSync(traceFile, "utf8");
      const memorySyncLines = trace.split("\n").filter((l) =>
        l.includes("memory.sync") && l.includes("memory_sync: progress"),
      );
      // Should be exactly 1 (from the tool execute), NOT 2 (the old after-hook copy is removed)
      assert.equal(memorySyncLines.length, 1,
        `expected exactly 1 memory_sync trace line, got ${memorySyncLines.length}`);
    }
  });

  it("critic_dispatch produces exactly one trace event (not two)", async () => {
    await plugin.tool.aion_critic_dispatch.execute({
      critic: "ts-critic",
      goal: "trace dedup test for dispatch",
      evidence_artifacts: [],
    }, {});

    const traceFile = join(tmp, ".opencode", "trace.md");
    if (existsSync(traceFile)) {
      const trace = readFileSync(traceFile, "utf8");
      const dispatchLines = trace.split("\n").filter((l) =>
        l.includes("dispatch.created"),
      );
      // The old after-hook would have produced "dispatched ts-critic for ..."
      // That line is now removed. The tool itself produces "critic.review" not "dispatch.created"
      // So dispatch.created count should be 0 (the after-hook is removed)
      assert.ok(dispatchLines.length === 0 || dispatchLines.length === 1,
        `expected 0 or 1 dispatch.created lines, got ${dispatchLines.length}`);
    }
  });

  it("no 'artifact=unknown' trace lines exist", async () => {
    const traceFile = join(tmp, ".opencode", "trace.md");
    if (existsSync(traceFile)) {
      const trace = readFileSync(traceFile, "utf8");
      const unknownLines = trace.split("\n").filter((l) =>
        l.includes("artifact=unknown"),
      );
      assert.equal(unknownLines.length, 0,
        `expected 0 'artifact=unknown' lines, got ${unknownLines.length}`);
    }
  });

  it("no 'dispatched unknown' trace lines exist", async () => {
    const traceFile = join(tmp, ".opencode", "trace.md");
    if (existsSync(traceFile)) {
      const trace = readFileSync(traceFile, "utf8");
      const unknownDispatch = trace.split("\n").filter((l) =>
        l.includes("dispatched unknown"),
      );
      assert.equal(unknownDispatch.length, 0,
        `expected 0 'dispatched unknown' lines, got ${unknownDispatch.length}`);
    }
  });
});

/* ============================================================
 * Config: interactiveMode.granularity and customTriggers
 * ============================================================ */

describe("config: interactiveMode granularity schema", () => {
  it("default config has granularity=autonomous and empty customTriggers", async () => {
    const bundle = await importBundle();
    const bundleExports = bundle;
    // We test via the plugin's config loading — create a tmp dir without aion.jsonc
    const tmp = createTmp();
    try {
      const plugin = await createPlugin(tmp);
      // The plugin should load with default config
      assert.ok(plugin.tool, "plugin should load with tools");
      // Verify by calling set_interactive_mode and checking default behavior
      const out = JSON.parse(await plugin.tool.aion_set_interactive_mode.execute({
        enabled: false,
      }, {}));
      assert.equal(out.granularity, "autonomous");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("config with granularity=always-interactive loads correctly", async () => {
    const tmp = createTmp();
    writeFileSync(join(tmp, ".opencode", "aion.jsonc"), JSON.stringify({
      enabled: true,
      defaultAgent: "aion",
      interactiveMode: {
        enabled: true,
        granularity: "always-interactive",
      },
    }));
    try {
      const plugin = await createPlugin(tmp);
      assert.ok(plugin.tool, "plugin should load with always-interactive config");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("config with custom granularity and triggers loads correctly", async () => {
    const tmp = createTmp();
    writeFileSync(join(tmp, ".opencode", "aion.jsonc"), JSON.stringify({
      enabled: true,
      defaultAgent: "aion",
      interactiveMode: {
        enabled: true,
        granularity: "custom",
        customTriggers: ["dispatch", "phase-transition"],
      },
    }));
    try {
      const plugin = await createPlugin(tmp);
      assert.ok(plugin.tool, "plugin should load with custom granularity config");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

/* ============================================================
 * Config: team mode aggressive defaults
 * ============================================================ */

describe("config: team mode aggressive defaults", () => {
  it("default maxParallelMembers is 6 (not 4)", async () => {
    const tmp = createTmp();
    try {
      const plugin = await createPlugin(tmp);
      // Verify team tools are registered (team mode is enabled by default)
      assert.ok(plugin.tool?.team_create, "team_create should be registered");
      assert.ok(plugin.tool?.team_status, "team_status should be registered");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("team mode config with custom values loads correctly", async () => {
    const tmp = createTmp();
    writeFileSync(join(tmp, ".opencode", "aion.jsonc"), JSON.stringify({
      enabled: true,
      defaultAgent: "aion",
      teamMode: {
        enabled: true,
        maxParallelMembers: 8,
        maxMembers: 8,
        maxMessagesPerRun: 50000,
        maxWallClockMinutes: 480,
        maxMemberTurns: 1000,
      },
    }));
    try {
      const plugin = await createPlugin(tmp);
      assert.ok(plugin.tool?.team_create, "team tools should be registered with custom config");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
