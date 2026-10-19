import { describe, it, expect } from "vitest";
import { buildPayload } from "../lib/geminiClient";

describe("Autonomous Local File Agent Payload", () => {
  it("injects workspace tools and backup safety instructions when agentWorkspace is set", () => {
    const payload = buildPayload(
      "gemini-2.5-flash",
      [],
      [{ text: "List the files in this project" }],
      undefined,
      undefined,
      "D:/TestProjects/MyProject"
    );

    expect(payload.systemInstruction?.parts[0]?.text).toContain("AUTONOMOUS LOCAL FILE AGENT ACTIVE");
    expect(payload.systemInstruction?.parts[0]?.text).toContain("D:/TestProjects/MyProject");
    expect(payload.systemInstruction?.parts[0]?.text).toContain("__BACKUP_FOLDER");

    const tools = payload.tools?.[0]?.functionDeclarations;
    expect(tools).toBeDefined();

    const toolNames = tools.map((t: any) => t.name);
    expect(toolNames).toContain("list_directory");
    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("write_file");
    expect(toolNames).toContain("rename_file");
    expect(toolNames).toContain("delete_file");
    expect(toolNames).toContain("create_safety_backup");
    expect(toolNames).toContain("restore_backup");
  });

  it("does not inject filesystem tools when agentWorkspace is null", () => {
    const payload = buildPayload(
      "gemini-2.5-flash",
      [],
      [{ text: "Hello" }],
      undefined,
      undefined,
      null
    );

    expect(payload.systemInstruction).toBeUndefined();
    expect(payload.tools).toBeUndefined();
  });

  it("injects create_docx_file tool and anti-python instructions for DOCX Assistant", () => {
    const docxPrompt =
      "You are an expert document generator and DOCX assistant. Format, write, and structure documents, reports, templates, and clinical letters with clean headings, tables, bullet points, and professional formatting ready for export to Word (.docx).";
    const payload = buildPayload(
      "gemini-2.5-flash",
      [],
      [{ text: "Generate the pediatric neurology report for this patient." }],
      docxPrompt
    );

    expect(payload.systemInstruction?.parts[0]?.text).toContain("LOCAL WORD/DOCX FILE EXPORT AVAILABLE");
    expect(payload.systemInstruction?.parts[0]?.text).toContain("NEVER output raw Python code");

    const tools = payload.tools?.[0]?.functionDeclarations;
    expect(tools).toBeDefined();
    const docxTool = tools.find((t: any) => t.name === "create_docx_file");
    expect(docxTool).toBeDefined();
  });

  it("does not inject create_docx_file for general conversation or report queries without Word/docx requests", () => {
    const payload = buildPayload(
      "gemini-2.5-flash",
      [],
      [{ text: "Give me a brief clinical report on this patient's head circumference." }],
      "You are a helpful medical assistant."
    );

    const tools = payload.tools?.[0]?.functionDeclarations;
    const docxTool = tools?.find((t: any) => t.name === "create_docx_file");
    expect(docxTool).toBeUndefined();
  });
});
