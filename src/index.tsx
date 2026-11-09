// Skills feature plugin: import skill .md files (Claude/ZCode SKILL.md
// compatible — optional `name`/`description` frontmatter) and hand them to
// the agent:
//
// - "Skills" settings tab (skills.list section) — import via a hidden
//   <input type="file">, toggle/delete imported skills. Registered in both
//   windows (settings is where it is used, but registration is harmless in
//   main and keeps the two windows symmetric).
// - Main window only: the `skills__read` frontend tool (loads a skill's
//   full markdown on demand) and the `skills.index` system-prompt fragment —
//   a short name+description index so the model knows what it can load
//   without pushing every skill's full body into every turn. Both refresh on
//   every skills-changed event, so imports/toggles/deletes apply live with
//   no restart; re-registering the same ids replaces in place (an emptied
//   list registers an empty fragment, which the chat plugin filters out).
//
// No backend dylib — skills are plain text in ctx.storage.

import { definePlugin, type PluginContext } from "@companion-lab/plugin";
import { isTauri, currentWindowLabel } from "./tauri";
import { getSkills, initSkillsStore, subscribeSkills } from "./state";
import type { Skill } from "./state";
import { SkillsSection } from "./SkillsSection";

const TOOL_QUALIFIED = "skills__read";

/** Agent-facing index fragment: one bullet per enabled skill. Empty when
 *  nothing is enabled (the chat plugin filters empty fragments out). */
function buildIndexFragment(skills: Skill[]): string {
  if (!skills.length) return "";
  const lines = skills.map((s) => `- ${s.name}${s.description ? `: ${s.description}` : ""}`);
  return (
    "Imported skills you can use — when the user's request matches one, call skills__read " +
    "with its name to load the full instructions, then follow them:\n" +
    lines.join("\n")
  );
}

/** skills__read executor: full markdown of a named enabled skill. */
function readExecute(args: unknown): string {
  const name =
    args && typeof args === "object" && typeof (args as { name?: unknown }).name === "string"
      ? ((args as { name: string }).name.trim())
      : "";
  const enabled = getSkills().filter((s) => s.enabled);
  if (!name) {
    return (
      "No skill name given. " +
      (enabled.length
        ? `Available: ${enabled.map((s) => s.name).join(", ")}.`
        : "No skills are enabled — import .md files in Settings → Skills.")
    );
  }
  const skill = enabled.find((s) => s.name === name);
  if (!skill) {
    return (
      `Skill "${name}" not found or disabled. ` +
      (enabled.length
        ? `Available: ${enabled.map((s) => s.name).join(", ")}.`
        : "No skills are enabled — import .md files in Settings → Skills.")
    );
  }
  return `Instructions for skill "${skill.name}":\n\n${skill.content}`;
}

export default definePlugin((ctx: PluginContext) => {
  ctx.log.info("activating skills plugin");

  // Store first (both windows read it; the settings window also mutates it).
  initSkillsStore(ctx);

  // Settings: bare tab plus registerSection contribution (same id pattern
  // the core used for its own tabs; feature tabs live in the System group —
  // memory is 45, core Plugins is 40, mcp is 30).
  ctx.settings.registerTab({
    id: "skills",
    label: "Skills",
    group: "System",
    order: 46,
    desc: "Imported skill .md files the agent can load on demand",
    icon: ({ className }: { className?: string }) => (
      <svg
        className={className}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* feather "book-open" — imported instructions */}
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  });
  ctx.settings.registerSection({
    id: "skills.list",
    tabId: "skills",
    slot: "top",
    order: 100,
    component: function SkillsListViaCtx() {
      return <SkillsSection ctx={ctx} />;
    },
  });

  if (isTauri() && currentWindowLabel() === "main") {
    // Tool + prompt index live in the main window only — the chat loop (and
    // therefore the registries it reads) runs there; the settings window has
    // no turn to serve. Re-register on every store change; registration is
    // replace-by-name/id, so this is idempotent.
    ctx.tools.register({
      name: "read",
      description:
        "Load the full instructions of an imported skill by name. The skills index in your " +
        "instructions lists the available skills (name + what they do); call this when the " +
        "user's request matches one, then follow the returned instructions.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The skill's name, exactly as listed in the skills index",
          },
        },
        required: ["name"],
      },
      execute: (args: unknown) => readExecute(args),
    });

    const pushIndex = () => {
      ctx.systemPrompt.register({
        id: "skills.index",
        text: buildIndexFragment(getSkills().filter((s) => s.enabled)),
      });
    };
    pushIndex();
    subscribeSkills(pushIndex);
  }
});
