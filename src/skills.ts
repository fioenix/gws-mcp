import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SkillMeta {
  name: string;
  description: string;
  cliHelp?: string;
  version?: string;
  filePath: string;
}

export interface Skill extends SkillMeta {
  body: string;
  raw: string;
}

interface FrontMatter {
  data: Record<string, unknown>;
  body: string;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontMatter(raw: string): FrontMatter {
  const m = FM_RE.exec(raw);
  if (!m) return { data: {}, body: raw };
  return { data: parseYamlSubset(m[1]), body: m[2] };
}

/**
 * Minimal YAML reader for the frontmatter shape used by skills:
 *   scalar `key: value`
 *   nested maps via 2-space indentation
 *   lists `- item` under a key
 * Values are returned as strings (no number/bool coercion needed here).
 */
function parseYamlSubset(src: string): Record<string, unknown> {
  const lines = src.split(/\r?\n/);
  const root: Record<string, unknown> = {};
  const stack: { indent: number; container: Record<string, unknown> | unknown[] }[] = [
    { indent: -1, container: root },
  ];

  const popTo = (indent: number) => {
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.match(/^ */)![0].length;
    const trimmed = line.slice(indent);

    if (trimmed.startsWith("- ")) {
      popTo(indent);
      const parent = stack[stack.length - 1].container;
      if (!Array.isArray(parent)) continue;
      parent.push(unquote(trimmed.slice(2).trim()));
      continue;
    }

    const kv = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(trimmed);
    if (!kv) continue;
    const [, key, rest] = kv;
    popTo(indent);
    const parent = stack[stack.length - 1].container;
    if (Array.isArray(parent)) continue;

    if (rest === "") {
      // Peek: if next non-empty line has deeper indent and starts with "- ", it's a list, else map.
      // We default to map; lists are detected lazily when first child arrives.
      const obj: Record<string, unknown> = {};
      parent[key] = obj;
      stack.push({ indent, container: obj });
    } else {
      parent[key] = unquote(rest);
    }
  }

  // Second pass: any map that only contains "-" prefixed items would have been routed via array
  // detection above; nothing more to do here since openclaw frontmatter shape is map-of-maps.

  return root;
}

function unquote(s: string): string {
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

function deepGet(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else return undefined;
  }
  return cur;
}

export function resolveSkillsDir(input: string | undefined): string {
  if (!input) return join(homedir(), ".agents", "skills");
  if (input.startsWith("~/")) return join(homedir(), input.slice(2));
  return input;
}

export async function loadSkills(skillsDir: string, prefix = "gws-"): Promise<Skill[]> {
  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch {
    return [];
  }
  const skills: Skill[] = [];
  for (const entry of entries.sort()) {
    if (!entry.startsWith(prefix)) continue;
    const dirPath = join(skillsDir, entry);
    let st;
    try {
      st = await stat(dirPath);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const skillFile = join(dirPath, "SKILL.md");
    let raw: string;
    try {
      raw = await readFile(skillFile, "utf8");
    } catch {
      continue;
    }
    const { data, body } = parseFrontMatter(raw);
    const name = (deepGet(data, ["name"]) as string | undefined) ?? entry;
    const description = (deepGet(data, ["description"]) as string | undefined) ?? "";
    const cliHelp = deepGet(data, ["metadata", "openclaw", "cliHelp"]) as string | undefined;
    const version = deepGet(data, ["metadata", "version"]) as string | undefined;

    skills.push({
      name,
      description,
      cliHelp,
      version,
      filePath: skillFile,
      body: body.trim(),
      raw,
    });
  }
  return skills;
}
