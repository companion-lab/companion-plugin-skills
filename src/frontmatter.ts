// Minimal frontmatter handling for skill .md files — the "---"-fenced YAML
// subset that Claude/ZCode SKILL.md files use. We only need `name` and
// `description`, so there is no YAML dependency: top-level `key: value`
// lines inside the first fence; quoted values are unquoted.
//
// Plain markdown files without frontmatter still import:
// - name        → the `name` field, else the sanitized filename slug
// - description → the `description` field, else the first heading or first
//   non-empty body line, truncated to ~120 chars

export type ParsedSkillMeta = {
  name: string;
  description: string;
};

/** Lowercase [a-z0-9-_] slug; runs of invalid chars collapse to one "-". */
export function sanitizeName(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "skill";
}

export function truncate(text: string, max = 120): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

function unquote(value: string): string {
  const v = value.trim();
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  ) {
    return v.slice(1, -1).trim();
  }
  return v;
}

/** Parse the first "---"-fenced frontmatter block, if present. */
export function parseFrontmatter(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!text.startsWith("---")) return fields;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return fields;
  const block = text.slice(3, end).replace(/^\r?\n/, "");
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (m && fields[m[1].toLowerCase()] === undefined) fields[m[1].toLowerCase()] = unquote(m[2]);
  }
  return fields;
}

/** Body without the frontmatter fence (unchanged when there is none). */
export function stripFrontmatter(text: string): string {
  return text.replace(/^---[\s\S]*?\n---\s*/, "");
}

/** Derive a description from the body: first heading, else first non-empty line. */
export function deriveDescription(text: string): string {
  for (const raw of stripFrontmatter(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line === "---") continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    return truncate(heading ? heading[1] : line);
  }
  return "";
}

/**
 * Parse an imported skill .md into { name, description }.
 * Returns null when the file has no usable content at all.
 */
export function parseSkillMeta(text: string, filename: string): ParsedSkillMeta | null {
  const fields = parseFrontmatter(text);
  if (!stripFrontmatter(text).trim() && !fields.description) return null;
  const name = fields.name?.trim() ? sanitizeName(fields.name) : sanitizeName(filename.replace(/\.md$/i, ""));
  const description = fields.description?.trim()
    ? truncate(fields.description)
    : deriveDescription(text);
  return { name, description };
}
