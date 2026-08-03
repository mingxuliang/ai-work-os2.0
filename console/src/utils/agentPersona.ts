/** Helpers for agent persona (SOUL.md / PROFILE.md) form fields. */

const SECTION_TITLES_SOUL = ["核心", "Core"];
const SECTION_TITLES_PROFILE = ["身份与职责", "身份", "Identity", "Role"];

/** Strip YAML frontmatter from a markdown file. */
export function stripFrontmatter(md: string): string {
  const text = md ?? "";
  if (!text.startsWith("---")) return text.trim();
  const end = text.indexOf("\n---", 3);
  if (end < 0) return text.trim();
  return text.slice(end + 4).trim();
}

/**
 * Extract the main body under a known section header for form editing.
 * Falls back to full body (minus frontmatter) if no section matches.
 */
export function extractPersonaBody(
  md: string,
  sectionTitles: string[],
): string {
  const body = stripFrontmatter(md);
  if (!body) return "";
  for (const title of sectionTitles) {
    const re = new RegExp(
      `^##\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n+`,
      "im",
    );
    const match = body.match(re);
    if (match && match.index !== undefined) {
      return body.slice(match.index + match[0].length).trim();
    }
  }
  return body;
}

export function extractSoulBody(md: string): string {
  return extractPersonaBody(md, SECTION_TITLES_SOUL);
}

export function extractProfileBody(md: string): string {
  return extractPersonaBody(md, SECTION_TITLES_PROFILE);
}

/** Build SOUL.md content from plain-text form input (frontend edit path). */
export function buildSoulMarkdown(
  soul: string,
  agentName: string,
  language = "zh",
): string {
  const name = agentName.trim() || "Agent";
  const body = soul.trim();
  if (language.toLowerCase().startsWith("zh")) {
    return `---\nsummary: "${name} — 气质与原则"\n---\n\n## 核心\n\n${body}\n`;
  }
  return `---\nsummary: "${name} — persona & principles"\n---\n\n## Core\n\n${body}\n`;
}

/** Build PROFILE.md content from plain-text form input (frontend edit path). */
export function buildProfileMarkdown(
  profile: string,
  agentName: string,
  language = "zh",
): string {
  const name = agentName.trim() || "Agent";
  const body = profile.trim();
  if (language.toLowerCase().startsWith("zh")) {
    return `---\nsummary: "${name} — 身份与职责"\n---\n\n## 身份与职责\n\n${body}\n`;
  }
  return `---\nsummary: "${name} — identity & role"\n---\n\n## Identity\n\n${body}\n`;
}
