// Settings section for the Skills tab (registered as skills.list):
//
// - Import: hidden <input type="file" accept=".md" multiple> — the same
//   pattern the vrm plugin uses for .vrm models (no native file dialog is
//   wired into the app). Files are read as text in the webview; the store
//   persists via ctx.storage.
// - List: newest first, host item-row classes; per-skill enable checkbox
//   (enabled skills go into the agent's index fragment), expandable raw
//   markdown view, delete behind ConfirmModal.
//
// Components come from the host's shared UI kit via ctx.ui; styling is
// inline like the memory/chat plugin sections.

import { useRef, useState, useSyncExternalStore } from "react";
import type { PluginContext } from "@companion-lab/plugin";
import {
  getSkills,
  importSkill,
  isLoaded,
  removeSkill,
  setSkillEnabled,
  subscribeSkills,
  type ImportResult,
  type Skill,
} from "./state";
import { parseSkillMeta } from "./frontmatter";

export function SkillsSection({ ctx }: { ctx: PluginContext }) {
  const skills = useSyncExternalStore(subscribeSkills, getSkills);
  const { Button, ConfirmModal, SectionCard } = ctx.ui as Record<string, any>;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Skill | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const imported: ImportResult[] = [];
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const meta = parseSkillMeta(text, file.name);
        if (!meta) {
          failed.push(file.name);
          continue;
        }
        imported.push(importSkill({ ...meta, filename: file.name, content: text }));
      } catch {
        failed.push(file.name);
      }
    }
    const added = imported.filter((r) => !r.replaced).length;
    const replaced = imported.length - added;
    const parts: string[] = [];
    if (added) parts.push(`imported ${added}`);
    if (replaced) parts.push(`replaced ${replaced}`);
    if (failed.length) parts.push(`failed: ${failed.join(", ")}`);
    setResult(parts.length ? parts.join(" · ") : "nothing to import");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!isLoaded()) {
    return (
      <SectionCard title="Skills">
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
      </SectionCard>
    );
  }

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <SectionCard
      title="Skills"
      badge={skills.length ? `${enabledCount}/${skills.length} on` : undefined}
      action={
        <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
          Import .md files
        </Button>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,text/markdown"
        multiple
        style={{ display: "none" }}
        onChange={(e) => void handleFiles(e.target.files)}
      />
      {result && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{result}</div>
      )}
      {skills.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
          No skills yet. Import one or more markdown files — Claude/ZCode SKILL.md files work as
          is (optional <code>name</code>/<code>description</code> frontmatter; otherwise the
          filename and first line are used). Enabled skills are listed in the agent's
          instructions, and it loads the full text with the <code>skills__read</code> tool when a
          request matches.
        </div>
      )}
      {skills.map((skill) => (
        <div key={skill.name} className={`item-row${skill.enabled ? "" : " item-row-dim"}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label
              title="Include in the agent's skills index"
              style={{ display: "flex", alignItems: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <input
                type="checkbox"
                checked={skill.enabled}
                onChange={(e) => setSkillEnabled(skill.name, e.target.checked)}
              />
            </label>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="item-title">{skill.name}</div>
              <div className="item-meta">
                {skill.description || "no description"}
                {skill.filename ? ` · ${skill.filename}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <Button
                variant="secondary"
                onClick={() => setExpanded(expanded === skill.name ? null : skill.name)}
                style={{ padding: "5px 10px", fontSize: 11 }}
              >
                {expanded === skill.name ? "Hide" : "View"}
              </Button>
              <Button
                variant="danger"
                onClick={() => setPendingDelete(skill)}
                style={{ padding: "5px 10px", fontSize: 11 }}
              >
                Delete
              </Button>
            </div>
          </div>
          {expanded === skill.name && (
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.09)",
                fontSize: 11,
                lineHeight: 1.5,
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 260,
                overflowY: "auto",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {skill.content}
            </pre>
          )}
        </div>
      ))}
      {pendingDelete && (
        <ConfirmModal
          title="Delete skill"
          message={`Remove "${pendingDelete.name}"? The agent will no longer be able to load it.`}
          confirmLabel="Delete"
          onConfirm={() => {
            removeSkill(pendingDelete.name);
            setPendingDelete(null);
            setResult("");
          }}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </SectionCard>
  );
}
