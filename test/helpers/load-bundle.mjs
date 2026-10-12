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
    const hooks = { tool: {}, permission: {}, session: {} };

    const setupContext = {
      app: { version: "test" },
      location: { directory: root },
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
          return { dispose: async () => {} };
        },
      },
      event: {
        // An empty subscription is sufficient for setup-time smoke tests.
        subscribe: async function * () {},
      },
    };

    const cleanup = await bundle.default.setup(setupContext);
    return {
      tool: tools,
      ...hooks.tool,
      ...cleanup,
      "permission.ask": hooks.permission.evaluate,
      "experimental.compaction.autocontinue": hooks.session.context,
      event: cleanup.event,
      defaultAgent: hooks.defaultAgent,
      cleanup,
    };
  };
  return bundle;
}

export function importBundleSync() {
  return createRequire(import.meta.url)(BUNDLE);
}

export { BUNDLE, REPO_ROOT };
