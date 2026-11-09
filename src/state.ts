// Skills store — same transition pattern as the memory plugin's settings.ts
// (ctx.storage snapshot + cross-window event sync, minus keychain/legacy
// concerns — this plugin is new and stores plain text only):
//
// - Imported skills live in ctx.storage key "skills" as an array of
//   { name, description, enabled, filename, content, importedAt }.
// - Mutations (import/toggle/delete) persist immediately and emit the
//   plugin-namespaced event "skills-changed" with the full payload, so the
//   main window's skills__read tool + system-prompt index and the settings
//   window's list stay in sync no matter which window made the change.
// - Imports replace by name (last one wins); replacements keep the
//   existing enabled flag so toggling off a skill survives re-import.

import type { PluginContext } from "@companion-lab/plugin";

export type Skill = {
  name: string;
  description: string;
  enabled: boolean;
  filename: string;
  content: string;
  importedAt: number;
};

export type ImportResult = { name: string; replaced: boolean };

const STORE_KEY = "skills";

// ─── Store: snapshots + subscribe/emit + cross-window sync ───

type Listener = () => void;

let ctxRef: PluginContext | null = null;
let snapshot: Skill[] = [];
let loaded = false;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      /* listener errors must not break the store */
    }
  }
}

function normalizeSkill(value: unknown): Skill | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Partial<Skill>;
  if (typeof s.name !== "string" || !s.name.trim()) return null;
  return {
    name: s.name,
    description: typeof s.description === "string" ? s.description : "",
    enabled: typeof s.enabled === "boolean" ? s.enabled : true,
    filename: typeof s.filename === "string" ? s.filename : "",
    content: typeof s.content === "string" ? s.content : "",
    importedAt: typeof s.importedAt === "number" ? s.importedAt : 0,
  };
}

function normalizeList(value: unknown): Skill[] {
  if (!Array.isArray(value)) return [];
  const out: Skill[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const s = normalizeSkill(item);
    // First entry wins on duplicate names (imports unshift the replacement).
    if (s && !seen.has(s.name)) {
      seen.add(s.name);
      out.push(s);
    }
  }
  return out;
}

/** Idempotent. Must run before any component/tool touches the store. */
export function initSkillsStore(ctx: PluginContext): void {
  if (ctxRef) return;
  ctxRef = ctx;

  // Cross-window sync: the other window's mutations land here as events
  // (full payloads in-band, like the memory/chat settings events).
  ctx.events.on("skills-changed", (payload) => {
    snapshot = normalizeList(payload);
    loaded = true;
    notify();
  });

  void (async () => {
    try {
      snapshot = normalizeList(await ctx.storage.get<unknown>(STORE_KEY));
      loaded = true;
      notify();
    } catch (e) {
      ctx.log.warn(`skills load failed: ${e instanceof Error ? e.message : String(e)}`);
      loaded = true;
      notify();
    }
  })();
}

export function subscribeSkills(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stable snapshot reference (useSyncExternalStore-friendly). */
export function getSkills(): Skill[] {
  return snapshot;
}

export function isLoaded(): boolean {
  return loaded;
}

function persist(): void {
  const ctx = ctxRef;
  if (!ctx) return;
  void ctx.storage.set(STORE_KEY, snapshot).catch(() => {});
  ctx.events.emit("skills-changed", snapshot);
  notify();
}

/** Import (or replace, by name) one parsed skill file. Newest first. */
export function importSkill(skill: {
  name: string;
  description: string;
  filename: string;
  content: string;
}): ImportResult {
  const existing = snapshot.find((s) => s.name === skill.name);
  const entry: Skill = {
    ...skill,
    enabled: existing ? existing.enabled : true,
    importedAt: Date.now(),
  };
  snapshot = [entry, ...snapshot.filter((s) => s.name !== skill.name)];
  persist();
  return { name: entry.name, replaced: Boolean(existing) };
}

export function setSkillEnabled(name: string, enabled: boolean): void {
  if (!snapshot.some((s) => s.name === name)) return;
  snapshot = snapshot.map((s) => (s.name === name ? { ...s, enabled } : s));
  persist();
}

export function removeSkill(name: string): void {
  snapshot = snapshot.filter((s) => s.name !== name);
  persist();
}
