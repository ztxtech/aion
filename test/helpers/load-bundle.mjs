import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const BUNDLE = join(REPO_ROOT, ".opencode", "plugins", "aion", "server.js");

export async function importBundle() {
  const url = new URL(`file://${BUNDLE}`).href;
  const bundle = await import(url);
  bundle.default.server = async (context = {}) => {
    const root = context.directory;
    const tools = {};
    const hooks = { tool: {}, permission: {}, session: {}, sessionAll: {} };
    const promptCalls = [];
    const eventQueue = [];
    const eventWaiters = [];

    const setupContext = {
      app: { version: "test" },
      location: {
        directory: root,
        project: {
          id: context.projectID ?? "test-project",
          directory: context.projectDirectory ?? root,
          canonical: context.projectCanonical ?? context.projectDirectory ?? root,
        },
      },
      client: context.client,
      options: context.options ?? {},
      agent: {
        reload: async () => {},
        transform: async (callback) => {
          callback({ default: (id) => { hooks.defaultAgent = id; } });
          return { dispose: async () => {} };
        },
      },
      tool: {
        transform: async (callback) => {
          callback({
            add: (tool) => {
              tools[tool.name] = {
                ...tool,
                execute: async (args, toolContext) => {
                  const result = await tool.execute(args, toolContext);
                  return typeof result.content === "string"
                    ? result.content
                    : JSON.stringify(result.content);
                },
              };
            },
          });
          return { dispose: async () => {} };
        },
        hook: async (name, callback) => {
          hooks.tool[name] = callback;
          return { dispose: async () => {} };
        },
      },
      permission: {
        hook: async (name, callback) => {
          hooks.permission[name] = callback;
          return { dispose: async () => {} };
        },
      },
      session: {
        hook: async (name, callback) => {
          hooks.session[name] = callback;
          hooks.sessionAll[name] = [...(hooks.sessionAll[name] ?? []), callback];
          return { dispose: async () => {} };
        },
        get: async ({ sessionID }) => {
          if (context.sessionErrors?.[sessionID]) throw context.sessionErrors[sessionID];
          return {
            id: sessionID,
            agent: context.sessionAgents?.[sessionID] ?? "aion",
            parentID: context.sessionParents?.[sessionID],
            projectID: context.sessionProjects?.[sessionID] ?? context.projectID ?? "test-project",
            location: {
              directory: context.sessionDirectories?.[sessionID] ?? root,
            },
          };
        },
        prompt: async (input) => {
          await context.beforePrompt?.(input);
          if (context.promptFailures?.[input.sessionID] > 0) {
            context.promptFailures[input.sessionID] -= 1;
            throw new Error(`prompt failed for ${input.sessionID}`);
          }
          promptCalls.push(input);
          return { id: `inbox-${promptCalls.length}`, sessionID: input.sessionID };
        },
      },
      event: {
        subscribe() {
          return {
            [Symbol.asyncIterator]() {
              return {
                next() {
                  if (eventQueue.length > 0) return Promise.resolve({ done: false, value: eventQueue.shift() });
                  return new Promise((resolve) => eventWaiters.push(resolve));
                },
                return() {
                  return Promise.resolve({ done: true, value: undefined });
                },
              };
            },
          };
        },
      },
    };

    const cleanup = await bundle.default.setup(setupContext);
    return {
      tool: tools,
      ...hooks.tool,
      toolHooks: hooks.tool,
      sessionHooks: hooks.sessionAll,
      "session.prompt": hooks.session.prompt,
      ...cleanup,
      "permission.ask": hooks.permission.evaluate,
      "experimental.compaction.autocontinue": hooks.session.context,
      event: cleanup.event,
      defaultAgent: hooks.defaultAgent,
      cleanup,
      promptCalls,
      async emitEvent(event) {
        const payload = {
          location: { directory: root },
          ...event,
          data: event.data ? { ...event.data } : undefined,
        };
        const waiter = eventWaiters.shift();
        if (waiter) waiter({ done: false, value: payload });
        else eventQueue.push(payload);
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
      },
    };
  };
  return bundle;
}

export function importBundleSync() {
  return createRequire(import.meta.url)(BUNDLE);
}

export { BUNDLE, REPO_ROOT };
