/* Headless DOM stub — world modules build a CanvasTexture at import time, which breaks `import` under bun. */
/* Nothing draws; no test should assert on anything that goes through it. */

const noop = () => {};

const ctx2d = new Proxy(
  { measureText: () => ({ width: 10 }), canvas: null as unknown },
  { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : noop) },
);

function stubCanvas() {
  return { width: 0, height: 0, style: {}, getContext: () => ctx2d, toDataURL: () => "" };
}

if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    createElement: (tag: string) => (tag === "canvas" ? stubCanvas() : { style: {}, appendChild: noop, remove: noop }),
    getElementById: () => null,
    body: { appendChild: noop, removeChild: noop },
    addEventListener: noop,
    removeEventListener: noop,
  } as unknown as Document;
}

/* In-memory localStorage — absent headless, and empty reads would hide the persistence half of those modules. */
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

/* Radio chatter fetches a manifest nothing asserts on — keep the failed call out of test output. */
globalThis.fetch = (() => Promise.reject(new Error("network disabled in tests"))) as typeof fetch;

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis as unknown as Window & typeof globalThis;
  globalThis.addEventListener ??= noop;
  globalThis.removeEventListener ??= noop;
}
