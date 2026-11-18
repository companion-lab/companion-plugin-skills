import { describe, expect, it } from "vitest";
import {
  deriveDescription,
  parseFrontmatter,
  parseSkillMeta,
  sanitizeName,
  stripFrontmatter,
  truncate,
} from "./frontmatter";

describe("sanitizeName", () => {
  it("lowercases and slugs runs of invalid chars into single dashes", () => {
    expect(sanitizeName("My Cool Skill!")).toBe("my-cool-skill");
    expect(sanitizeName("a  b")).toBe("a-b");
    // "Ünïcode": ü and ï each become a dash, then edges are stripped.
    expect(sanitizeName("Ünïcode")).toBe("n-code");
  });

  it("keeps [a-z0-9-_] characters and collapses dash runs", () => {
    expect(sanitizeName("Skill-Name_2")).toBe("skill-name_2");
    expect(sanitizeName("123")).toBe("123");
    expect(sanitizeName("  Already--ok_name  ")).toBe("already-ok_name");
  });

  it("falls back to 'skill' when nothing usable remains", () => {
    // All-invalid input leaves a stripped-empty slug → the fallback.
    expect(sanitizeName("!!!***")).toBe("skill");
    expect(sanitizeName("")).toBe("skill");
    expect(sanitizeName("   ")).toBe("skill");
  });
});

describe("truncate", () => {
  it("passes through short text after trimming", () => {
    expect(truncate("  padded  ")).toBe("padded");
    // Exactly 120 chars fits: the limit is inclusive (length <= max).
    expect(truncate("x".repeat(120))).toBe("x".repeat(120));
    expect(truncate("   ")).toBe("");
  });

  it("cuts at max−1 and appends an ellipsis so results stay within max", () => {
    expect(truncate("x".repeat(121))).toBe("x".repeat(119) + "…");
    expect(truncate("hello world", 5)).toBe("hell…");
  });

  it("trims whitespace left by the cut before appending the ellipsis", () => {
    // 118 a's + two spaces + "b" = 121 chars; slicing at 119 leaves a
    // trailing space that trimEnd removes before the "…".
    expect(truncate("a".repeat(118) + "  b")).toBe("a".repeat(118) + "…");
  });
});

describe("parseFrontmatter", () => {
  it("parses the first --- fence into top-level keys", () => {
    expect(parseFrontmatter("---\nname: foo\ndescription: bar\n---\nbody")).toEqual({
      name: "foo",
      description: "bar",
    });
  });

  it("returns empty for no fence or an unterminated fence", () => {
    expect(parseFrontmatter("hello world")).toEqual({});
    // Doesn't *start* with --- → no frontmatter.
    expect(parseFrontmatter("abc---\nname: x")).toEqual({});
    // The closing \n--- is never found → nothing is extracted.
    expect(parseFrontmatter("---\nname: foo")).toEqual({});
    expect(parseFrontmatter("---")).toEqual({});
  });

  it("unquotes quoted values and trims bare ones", () => {
    expect(parseFrontmatter('---\nname: "My Skill"\n---\n')).toEqual({ name: "My Skill" });
    expect(parseFrontmatter("---\ndescription: 'single quoted'\n---\n")).toEqual({
      description: "single quoted",
    });
    // Whitespace around the value is trimmed either way.
    expect(parseFrontmatter("---\nname:    spaced   \n---\n")).toEqual({ name: "spaced" });
    // Mismatched quotes are not a quote pair — kept literally.
    expect(parseFrontmatter('---\nname: "quoted\n---\n')).toEqual({ name: '"quoted' });
  });

  it("keeps the first occurrence of duplicate keys (case-insensitively)", () => {
    expect(parseFrontmatter("---\nname: first\nname: second\n---\n")).toEqual({ name: "first" });
    // "Name" and "name" normalize to the same lowercase key.
    expect(parseFrontmatter("---\nName: a\nname: b\n---\n")).toEqual({ name: "a" });
  });

  it("splits CRLF fences but drops the final field's trailing \\r", () => {
    // indexOf("\n---") starts at the closing fence's \n, so on CRLF files
    // the sliced block keeps a trailing \r on its LAST line. JS regex `.`/
    // `$` cannot match across \r, so that line fails the key regex and is
    // silently dropped — earlier CRLF fields parse cleanly.
    expect(parseFrontmatter("---\r\nname: crlf\r\ndescription: value\r\n---\r\nbody")).toEqual({
      name: "crlf",
    });
    // Order swapped: now the description survives and the name is dropped.
    expect(parseFrontmatter("---\r\ndescription: value\r\nname: crlf\r\n---\r\nbody")).toEqual({
      description: "value",
    });
  });

  it("keeps colons inside values and lowercases keys", () => {
    expect(parseFrontmatter("---\ndescription: a: b\nurl: http://x\nMY_KEY-2: v\n---\n")).toEqual({
      description: "a: b",
      url: "http://x",
      "my_key-2": "v",
    });
  });
});

describe("stripFrontmatter", () => {
  it("removes the fence and leading blank lines of the body", () => {
    expect(stripFrontmatter("---\nname: x\n---\nBody line")).toBe("Body line");
    // \s* after the closing --- eats the blank line too.
    expect(stripFrontmatter("---\nkey: v\n---\n\nBody after blank")).toBe("Body after blank");
    expect(stripFrontmatter("---\na: 1\n---\nLine1\nLine2")).toBe("Line1\nLine2");
    expect(stripFrontmatter("---\nname: x\n---\n")).toBe("");
  });

  it("leaves text without a (complete) fence untouched", () => {
    expect(stripFrontmatter("Just text")).toBe("Just text");
    // No closing --- → the regex never matches, fence included.
    expect(stripFrontmatter("---\nname: x")).toBe("---\nname: x");
  });

  it("handles CRLF fences", () => {
    expect(stripFrontmatter("---\r\nname: x\r\n---\r\nBody")).toBe("Body");
  });
});

describe("deriveDescription", () => {
  it("prefers the first heading over later lines", () => {
    expect(deriveDescription("# Title\n\nbody line")).toBe("Title");
    expect(deriveDescription("###### Deep heading")).toBe("Deep heading");
    // Heading markers allow inner spacing: # + \s+ capture.
    expect(deriveDescription("#   Spaced heading   ")).toBe("Spaced heading");
  });

  it("skips blank and bare --- lines before the first real line", () => {
    expect(deriveDescription("\n\n---\n# Real\nbody")).toBe("Real");
    // Without a heading, the first non-empty line is the description.
    expect(deriveDescription("Plain intro line\n# Later")).toBe("Plain intro line");
  });

  it("truncates long descriptions", () => {
    expect(deriveDescription("# " + "x".repeat(130))).toBe("x".repeat(119) + "…");
  });

  it("returns empty for empty or fence-only bodies", () => {
    expect(deriveDescription("")).toBe("");
    expect(deriveDescription("\n\n")).toBe("");
    expect(deriveDescription("---\n---")).toBe("");
    expect(deriveDescription("# Title\r\nbody")).toBe("Title"); // CRLF bodies
  });
});

describe("parseSkillMeta", () => {
  it("uses the name field over the filename slug", () => {
    expect(parseSkillMeta("---\nname: My Skill\ndescription: Does things\n---\nbody", "whatever.md")).toEqual({
      name: "my-skill",
      description: "Does things",
    });
  });

  it("falls back to the sanitized filename (extension stripped)", () => {
    expect(parseSkillMeta("---\ndescription: D\n---\nbody", "My Cool Skill.md")).toEqual({
      name: "my-cool-skill",
      description: "D",
    });
    // .md is stripped case-insensitively; the rest is slugged.
    expect(parseSkillMeta("---\ndescription: D\n---\nbody", "Notes.MD")!.name).toBe("notes");
    expect(parseSkillMeta("---\ndescription: D\n---\nbody", "Weird!!Name.md")!.name).toBe("weird-name");
  });

  it("derives the description from the body when the field is missing", () => {
    expect(parseSkillMeta("no frontmatter, just body\nsecond", "f.md")).toEqual({
      name: "f",
      description: "no frontmatter, just body",
    });
  });

  it("prefers the description field over the derived body description", () => {
    expect(
      parseSkillMeta("---\ndescription: Field wins\n---\n# Heading", "s.md")!.description,
    ).toBe("Field wins");
  });

  it("returns null only when the body is empty and no description field exists", () => {
    expect(parseSkillMeta("", "a.md")).toBeNull();
    expect(parseSkillMeta("   \n  ", "a.md")).toBeNull();
    // Frontmatter with a name but no description and no body → still null.
    expect(parseSkillMeta("---\nname: x\n---\n", "a.md")).toBeNull();
  });

  it("survives a blank body when the description field is set", () => {
    expect(parseSkillMeta("---\ndescription: From field\n---\n", "s.md")).toEqual({
      name: "s",
      description: "From field",
    });
  });

  it("treats a blank name field as missing and truncates long descriptions", () => {
    // name: is present but whitespace-only → filename slug wins.
    expect(parseSkillMeta("---\nname:   \ndescription: d\n---\nb", "fallback.md")!.name).toBe("fallback");
    expect(parseSkillMeta("---\ndescription: " + "x".repeat(130) + "\n---\n", "s.md")!.description).toBe(
      "x".repeat(119) + "…",
    );
  });

  it("slugs an empty filename to 'skill'", () => {
    expect(parseSkillMeta("body only", "")).toEqual({ name: "skill", description: "body only" });
  });
});
