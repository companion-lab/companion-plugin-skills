# companion-plugin-skills

Skills feature plugin for the Companion app: import skill `.md` files and make
them available to the agent.

## How it works

- **Import** — Settings → Skills → *Import .md files* (multi-select). The file
  format matches Claude/ZCode `SKILL.md`: optional `---`-fenced frontmatter
  with `name` / `description`; without it, the name comes from the filename
  and the description from the first heading or line. Imports replace an
  existing skill of the same name (keeping its enabled flag).
- **Storage** — plain text in the plugin's namespaced `ctx.storage` key
  `skills` (`{app_data}/plugins-data/skills.json`), synced across the main
  and settings windows via the `skills-changed` event. No backend dylib.
- **Agent integration** — enabled skills appear in the system prompt as a
  short index (`- name: description`); the agent loads a skill's full text on
  demand with the `skills__read` tool. This keeps every-turn prompt cost
  small while the full instructions arrive only when relevant. Imports,
  toggles and deletes apply to the live chat loop without a restart.
- **UI** — the Skills tab lists skills with an enable checkbox (excluded
  from index + tool when off), a raw-content viewer and delete (confirm).

## Build

```sh
node app/scripts/build-plugin.mjs plugin-repos/companion-plugin-skills --out plugins/skills
```

The output package lands in repo-root `plugins/` where dev builds discover it
(restart the app after building). For release bundling, add `skills` to
`BUNDLED_IDS` in `app/src-tauri/src/plugin_host/mod.rs` and the features list
in `plugin-repos/build-all.sh`.
