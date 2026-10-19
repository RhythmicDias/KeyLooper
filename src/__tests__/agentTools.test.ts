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
});
