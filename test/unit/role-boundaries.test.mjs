import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(HERE, "..", "..", "src", "prompts", "agent-prompts");

function readPrompt(agent) {
  return readFileSync(join(PROMPTS_DIR, agent, "default.md"), "utf8");
}

describe("hard role boundaries (orchestrator must not do worker work)", () => {
  it("aion prompt declares explicit no-direct-edit / no-direct-debug / no-direct-experiment / no-direct-search rules", () => {
    const prompt = readPrompt("aion");
    const requiredPhrases = [
      "Hard Role Boundaries",
      "HARD GATE",
      "MUST NOT do",
      "NO direct file editing",
      "NO direct debugging",
      "NO direct experiment building",
      "NO direct evidence collection",
      "NO direct requirement extraction",
      "delegate",
      "task",
      "temptation",
      "Reception Contract",
      "dispatch prompt minimal contract",
      "emergency self-fix",
    ];
    for (const phrase of requiredPhrases) {
      assert.ok(
        prompt.toLowerCase().includes(phrase.toLowerCase()),
        `aion prompt missing required phrase: "${phrase}"`,
      );
    }
  });

  it("aion prompt states main-agent is the orchestrator, not the worker", () => {
    const prompt = readPrompt("aion");
    assert.match(prompt, /orchestrator/i);
    assert.match(prompt, /not the worker/i);
  });

  it("aion prompt lists what the main-agent IS allowed to do (dispatch, integrate, orchestrate, ask)", () => {
    const prompt = readPrompt("aion");
    const allowedActions = [
      "Dispatch",
      "Read & integrate reports",
      "Update the todo list",
      "question",
      "orchestration tools",
    ];
    for (const action of allowedActions) {
      assert.ok(
        prompt.toLowerCase().includes(action.toLowerCase()),
        `aion prompt missing allowed-action declaration: "${action}"`,
      );
    }
  });

  it("aion prompt warns the user monitors the trace and will judge role violations", () => {
    const prompt = readPrompt("aion");
    assert.match(prompt, /trace/i);
    assert.match(prompt, /role violation|own fix|play.{0,5}role/i);
  });
});

describe("subagent reception contracts (leaf workers declare their intake shape)", () => {
  const leafAgents = ["coder", "information-collector", "requirements-analyst"];

  for (const agent of leafAgents) {
    it(`${agent} prompt has a Reception Contract section`, () => {
      const prompt = readPrompt(agent);
      assert.match(prompt, /Reception Contract/i, `${agent} missing Reception Contract`);
    });

    it(`${agent} prompt has a 'What you MUST NOT do' section`, () => {
      const prompt = readPrompt(agent);
      assert.match(prompt, /MUST NOT do/i, `${agent} missing 'MUST NOT do' rules`);
    });

    it(`${agent} prompt declares it cannot dispatch other subagents (or only main agent can)`, () => {
      const prompt = readPrompt(agent);
      const cannotDispatch =
        /cannot dispatch other subagents/i.test(prompt) ||
        /MUST NOT dispatch/i.test(prompt) ||
        /do not dispatch other subagents/i.test(prompt);
      assert.ok(
        cannotDispatch,
        `${agent} must explicitly state it cannot dispatch other subagents`,
      );
    });

    it(`${agent} prompt describes its reportback shape`, () => {
      const prompt = readPrompt(agent);
      assert.match(prompt, /Reportback/i, `${agent} missing reportback shape`);
    });
  }
});

describe("role-boundary consistency between main-agent and subagents", () => {
  it("aion and coder agree that fixes require the diagnose -> patch -> verify -> report flow", () => {
    const aion = readPrompt("aion");
    const coder = readPrompt("coder");
    for (const phase of ["Diagnose", "Patch", "Verify", "Report"]) {
      assert.ok(
        coder.includes(phase),
        `coder prompt missing fix phase: ${phase}`,
      );
    }
    assert.ok(
      aion.includes("dispatch") && aion.includes("integration"),
      "aion prompt must talk about dispatch + integration",
    );
  });

  it("information-collector and requirements-analyst prompts both require structured reportback", () => {
    const ic = readPrompt("information-collector");
    const ra = readPrompt("requirements-analyst");
    for (const keyword of ["ranked", "confidence", "summary", "memory append"]) {
      assert.ok(
        ic.toLowerCase().includes(keyword),
        `information-collector missing reportback keyword: ${keyword}`,
      );
    }
    for (const keyword of ["7-section", "Compute Budget", "Hardware Probe", "assumption"]) {
      assert.ok(
        ra.toLowerCase().includes(keyword.toLowerCase()),
        `requirements-analyst missing reportback keyword: ${keyword}`,
      );
    }
  });

  it("all four agent prompts are written in English (no Chinese characters)", () => {
    const agents = ["aion", "coder", "information-collector", "requirements-analyst"];
    for (const agent of agents) {
      const prompt = readPrompt(agent);
      const hasChinese = /[\u4e00-\u9fff]/.test(prompt);
      assert.ok(!hasChinese, `${agent} prompt contains Chinese characters (forbidden)`);
    }
  });
});
