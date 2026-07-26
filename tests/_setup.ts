/* Headless DOM stub. Several world modules build a CanvasTexture at import time, which is enough to
   break `import` under bun. This is only here to let those modules load — nothing draws, and no test
   should assert on anything that goes through it. */

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

/* In-memory localStorage — the real one is absent headless, and without it every saved-progress or
   saved-name read comes back empty, which hides the persistence half of those modules. */
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

/* Radio voice lines fetch a manifest on the first chatter line. Nothing asserts on it — this just
   keeps a failed network call from drowning out real test output. */
globalThis.fetch = (() => Promise.reject(new Error("network disabled in tests"))) as typeof fetch;

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis as unknown as Window & typeof globalThis;
  globalThis.addEventListener ??= noop;
  globalThis.removeEventListener ??= noop;
}
