import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let _counter = 0;
function createTmp() {
  const d = mkdtempSync(join(tmpdir(), `aion-toast-queue-${_counter++}-`));
  mkdirSync(join(d, ".opencode", "memory"), { recursive: true });
  return d;
}

async function helpers() {
  const bundle = await importBundle();
  return bundle._testing.toastQueue();
}

describe("toast queue: append + read", () => {
  it("increments ids and preserves fields", async () => {
    const { enqueueToast, readToastQueue } = await helpers();
    const root = createTmp();
    try {
      const first = enqueueToast(root, {
        title: "I AM AION",
        message: "Online. Watching. The loop begins.",
        variant: "info",
        duration: 4500,
      });
      const second = enqueueToast(root, { message: "phase: gather", variant: "success" });
      assert.equal(first.id, 1);
      assert.equal(second.id, 2);

      const queue = readToastQueue(root);
      assert.equal(queue.items.length, 2);
      assert.deepEqual(queue.items[0], {
        id: 1,
        title: "I AM AION",
        message: "Online. Watching. The loop begins.",
        variant: "info",
        duration: 4500,
        createdAt: first.createdAt,
      });
      assert.equal(queue.items[1].duration, undefined);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("caps the queue at 50 items and keeps the newest", async () => {
    const { enqueueToast, readToastQueue, TOAST_QUEUE_MAX } = await helpers();
    const root = createTmp();
    try {
      for (let i = 0; i < TOAST_QUEUE_MAX + 10; i++) {
        enqueueToast(root, { message: `beat ${i}`, variant: "info" });
      }
      const queue = readToastQueue(root);
      assert.equal(queue.items.length, TOAST_QUEUE_MAX);
      assert.equal(queue.items.at(-1).message, `beat ${TOAST_QUEUE_MAX + 9}`);
      assert.equal(queue.items.at(-1).id, TOAST_QUEUE_MAX + 10);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("survives a corrupt queue file and recovers on the next write", async () => {
    const { enqueueToast, readToastQueue } = await helpers();
    const root = createTmp();
    try {
      writeFileSync(join(root, ".opencode", "memory", "tui-toasts.json"), "{not json");
      assert.deepEqual(readToastQueue(root).items, []);

      const item = enqueueToast(root, { message: "back in business", variant: "warning" });
      assert.equal(item.id, 1);
      assert.deepEqual(readToastQueue(root).items.map((t) => t.message), ["back in business"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("toast queue: cursor semantics", () => {
  it("initial cursor skips stale items but keeps fresh ones", async () => {
    const { enqueueToast, readToastQueue, initialToastCursor, toastsAfter } = await helpers();
    const root = createTmp();
    try {
      const now = Date.now();
      enqueueToast(root, { message: "stale", variant: "info" }, { now: new Date(now - 60_000) });
      enqueueToast(root, { message: "fresh", variant: "info" }, { now: new Date(now - 1_000) });

      const cursor = initialToastCursor(readToastQueue(root), { now });
      assert.equal(cursor, 1, "only the stale item is behind the cursor");
      assert.deepEqual(
        toastsAfter(readToastQueue(root), cursor).map((t) => t.message),
        ["fresh"],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips entries with unparseable timestamps", async () => {
    const { readToastQueue, initialToastCursor } = await helpers();
    const root = createTmp();
    try {
      writeFileSync(
        join(root, ".opencode", "memory", "tui-toasts.json"),
        JSON.stringify({
          version: 1,
          items: [
            { id: 1, message: "no timestamp", variant: "info", createdAt: "not-a-date" },
            { id: 2, message: "bad variant", variant: "purple", createdAt: new Date().toISOString() },
            { id: 3, message: "bad shape", variant: "info", createdAt: new Date().toISOString(), id: "3" },
          ],
        }),
      );
      const queue = readToastQueue(root);
      assert.deepEqual(queue.items.map((t) => t.id), [1], "invalid entries are dropped on read");
      assert.equal(initialToastCursor(queue, { now: Date.now() }), 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
