import { describe, it, expect } from "vitest";
import { parseSkillMarkdown, exportSkillToMarkdown } from "../lib/skillParser";

describe("Skill Markdown Parser", () => {
  it("parses YAML frontmatter with name and prompt body", () => {
    const md = `---
name: Pediatric Neurologist Assistant
description: Clinical assistant for pediatric EEG and neurological reviews
---

You are an expert pediatric neurology assistant. Evaluate developmental milestones and EEG patterns.`;

    const parsed = parseSkillMarkdown("pediatric-assistant.md", md);
    expect(parsed.name).toBe("Pediatric Neurologist Assistant");
    expect(parsed.systemPrompt).toContain("You are an expert pediatric neurology assistant.");
  });

  it("parses YAML frontmatter with single/double quotes around name", () => {
    const md = `---
name: 'Python Code Architect'
---
Write clean, modular code.`;

    const parsed = parseSkillMarkdown("SKILL.md", md);
    expect(parsed.name).toBe("Python Code Architect");
    expect(parsed.systemPrompt).toBe("Write clean, modular code.");
  });

  it("parses title from first level-1 heading if no frontmatter exists", () => {
    const md = `# Medical Summarizer
Summarize complex patient histories into bullet points.`;

    const parsed = parseSkillMarkdown("summarizer.md", md);
    expect(parsed.name).toBe("Medical Summarizer");
    expect(parsed.systemPrompt).toBe("Summarize complex patient histories into bullet points.");
  });

  it("falls back to humanized filename if no title or frontmatter exists", () => {
    const md = `You are a helpful assistant for data analysis.`;

    const parsed = parseSkillMarkdown("clinical_data_analyzer.md", md);
    expect(parsed.name).toBe("Clinical Data Analyzer");
    expect(parsed.systemPrompt).toBe("You are a helpful assistant for data analysis.");
  });

  it("handles Windows CRLF line endings gracefully", () => {
    const md = "---\r\nname: Windows Skill\r\n---\r\n\r\nPrompt content\r\n";
    const parsed = parseSkillMarkdown("skill.md", md);
    expect(parsed.name).toBe("Windows Skill");
    expect(parsed.systemPrompt).toBe("Prompt content");
  });

  it("exports a skill to markdown with frontmatter", () => {
    const exported = exportSkillToMarkdown("Test Skill", "Instruction body");
    expect(exported).toContain("name: Test Skill");
    expect(exported).toContain("Instruction body");
  });
});
