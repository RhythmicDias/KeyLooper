export interface ParsedSkill {
  name: string;
  systemPrompt: string;
}

/**
 * Parses markdown content into a skill name and system instructions.
 * Supports:
 * - YAML frontmatter with `name` / `title` and optional `description`
 * - Markdown `# Title` heading
 * - Filename fallback
 */
export function parseSkillMarkdown(filename: string, content: string): ParsedSkill {
  const normalized = content.replace(/\r\n/g, "\n");
  let name = "";
  let prompt = normalized.trim();

  // 1. Check for YAML frontmatter (e.g. --- name: ... ---)
  const frontmatterMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (frontmatterMatch) {
    const yamlBlock = frontmatterMatch[1];
    const body = frontmatterMatch[2].trim();

    const nameMatch = yamlBlock.match(/(?:^|\n)\s*(?:name|title)\s*:\s*["']?([^"'\n\r]+)["']?/i);
    if (nameMatch) {
      name = nameMatch[1].trim();
    }

    const descMatch = yamlBlock.match(/(?:^|\n)\s*description\s*:\s*["']?([^"'\n\r]+)["']?/i);
    const desc = descMatch ? descMatch[1].trim() : "";

    if (body) {
      prompt = body;
    } else if (desc) {
      prompt = desc;
    }
  }

  // 2. If name not found in frontmatter, extract first # Heading
  if (!name) {
    const headingMatch = prompt.match(/^#\s+([^\n\r]+)/m);
    if (headingMatch) {
      name = headingMatch[1].trim();
      prompt = prompt.replace(/^#\s+[^\n\r]+\n*/, "").trim();
    }
  }

  // 3. Fallback to cleaned filename
  if (!name) {
    const baseName = filename.replace(/\.(md|markdown|txt)$/i, "");
    name = baseName
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim() || "Imported Skill";
  }

  // Fallback to original content if prompt is empty
  if (!prompt) {
    prompt = normalized.trim();
  }

  return { name, systemPrompt: prompt };
}

/**
 * Formats a skill into a clean Markdown string with YAML frontmatter.
 */
export function exportSkillToMarkdown(name: string, systemPrompt: string): string {
  return `---\nname: ${name}\n---\n\n${systemPrompt.trim()}\n`;
}
