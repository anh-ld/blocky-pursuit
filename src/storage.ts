import { attempt } from "es-toolkit";

export const StorageKey = {
  Muted: "bp:muted",
  Progress: "bp:progress",
  Tutorial: "bp:tutorial",
  PlayerName: "blocky-pursuit-name",
} as const;

type IStorageKey = (typeof StorageKey)[keyof typeof StorageKey];

export function storageGet(key: IStorageKey): string | null {
  const [, value] = attempt(() => localStorage.getItem(key));
  return value ?? null;
}

export function storageSet(key: IStorageKey, value: string): void {
  attempt(() => localStorage.setItem(key, value));
}

export function storageGetJson<T>(key: IStorageKey): T | null {
  const raw = storageGet(key);
  if (!raw) return null;
  const [, parsed] = attempt(() => JSON.parse(raw) as T);
  return parsed ?? null;
}

export function storageSetJson<T>(key: IStorageKey, value: T): void {
  attempt(() => localStorage.setItem(key, JSON.stringify(value)));
}
