import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const BUNDLE = join(REPO_ROOT, ".opencode", "plugins", "aion.js");

export async function importBundle() {
  const url = new URL(`file://${BUNDLE}`).href;
  return await import(url);
}

export function importBundleSync() {
  return createRequire(import.meta.url)(BUNDLE);
}

export { BUNDLE, REPO_ROOT };
