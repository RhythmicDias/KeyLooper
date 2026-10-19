/**
 * geminiClient.ts
 * Wrapper around the Gemini REST API with retry + key-rotation + secure OS Keyring support.
 */

import { invoke } from "@tauri-apps/api/core";
import { KeyRotator } from "./KeyRotator";
import type { ModelConfig } from "../store/useAppStore";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RETRIES = 3;

export type ChatRole = "user" | "model";

export interface ChatPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
  uploadKeyId?: string;
}

export interface ChatMessage {
  role: ChatRole;
  parts: ChatPart[];
  modelName?: string;
  apiKeyName?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
  };
}

export interface SendMessageOptions {
  model: string;
  history: ChatMessage[];
  userParts: ChatPart[];
  rotator: KeyRotator;
  mode: "normal" | "unlimited" | "pro";
  systemPrompt?: string;
  modelConfig?: ModelConfig;
  proApiKeyId?: string | null;
  proApiKeyName?: string;
  agentWorkspace?: string | null;
  onToolActivity?: (activity: string) => void;
}

export interface GeminiResponse {
  text: string;
  usedKeyName: string;
  usedKeyId: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const SAFETY_THRESHOLD_MAP: Record<string, string> = {
  "Block None": "BLOCK_NONE",
  "Block Few": "BLOCK_ONLY_HIGH",
  "Block Some": "BLOCK_MEDIUM_AND_ABOVE",
  "Block Most": "BLOCK_LOW_AND_ABOVE",
};

/** Build the request body for the Gemini generateContent endpoint. */
export function buildPayload(
  model: string,
  history: ChatMessage[],
  userParts: ChatPart[],
  systemPrompt?: string,
  modelConfig?: ModelConfig,
  agentWorkspace?: string | null,
  customContents?: any[]
) {
  const fullConversationContext = [
    systemPrompt || "",
    ...history.slice(-6).flatMap((m) => m.parts.map((p) => p.text || "")),
    ...userParts.map((p) => p.text || ""),
  ]
    .join(" ")
    .toLowerCase();

  const isDocxSkill = Boolean(
    systemPrompt &&
      /(docx|word document|\.docx|document generator)/i.test(systemPrompt)
  );

  const mentionsExplicitDocxOrWord =
    /(docx|\.docx|word document|word file|as a word doc|in word format|export to word|save to word|download word|create word|create a word|export docx|save as docx|download docx|make docx|generate docx|downloadable document|downloadable file|export to file)/i.test(
      fullConversationContext
    );

  const wantsDocxExport =
    (modelConfig?.tools?.localFileExport ?? true) &&
    (isDocxSkill || mentionsExplicitDocxOrWord);

  const wantsHtmlExport =
    (modelConfig?.tools?.localFileExport ?? true) &&
    /(export\s+html|save\s+as\s+html|download\s+html|create\s+(?:a\s+|an\s+)?html\s+file|make\s+(?:a\s+|an\s+)?html\s+file|single\s+html\s+file|\.html)/i.test(
      fullConversationContext
    );

  const functionDeclarations: any[] = [];

  if (wantsDocxExport) {
    functionDeclarations.push({
      name: "create_docx_file",
      description:
        "Generate and save a .docx Word document to the user's computer. Use this when the user asks for a Word document, .docx file, or downloadable file export.",
      parameters: {
        type: "OBJECT",
        properties: {
          filename: {
            type: "STRING",
            description:
              "The suggested filename, ending in .docx (e.g. 'pediatric_neuro_report.docx')",
          },
          content: {
            type: "STRING",
            description:
              "The complete formatted text content for the document with headings, bullet points, and clinical sections.",
          },
        },
        required: ["filename", "content"],
      },
    });
  }

  if (wantsHtmlExport) {
    functionDeclarations.push({
      name: "create_html_file",
      description:
        "Generate and save a single-file standalone .html document to the user's computer. Use this when the user explicitly requests to create or export an HTML file.",
      parameters: {
        type: "OBJECT",
        properties: {
          filename: {
            type: "STRING",
            description: "The suggested filename, ending in .html",
          },
          html_content: {
            type: "STRING",
            description:
              "The complete self-contained HTML code string, including <!DOCTYPE html>, <html>, <head> with styles, and <body>",
          },
        },
        required: ["filename", "html_content"],
      },
    });
  }

  // Autonomous Local File Agent Tools (active workspace scoped)
  if (agentWorkspace) {
    functionDeclarations.push(
      {
        name: "list_directory",
        description:
          "List files and directories in the local project workspace. Returns names, relative paths, types, and sizes. Subpath is relative to workspace root (use '' or '.' for root).",
        parameters: {
          type: "OBJECT",
          properties: {
            subpath: {
              type: "STRING",
              description: "Relative directory path to list. Omit or empty for workspace root.",
            },
          },
        },
      },
      {
        name: "read_file",
        description:
          "Read the full text content of a file in the workspace. Path must be relative to the workspace root.",
        parameters: {
          type: "OBJECT",
          properties: {
            file_path: {
              type: "STRING",
              description: "Relative path of the file to read (e.g. 'src/App.tsx' or 'package.json').",
            },
          },
          required: ["file_path"],
        },
      },
      {
        name: "write_file",
        description:
          "Create or update a file in the workspace with given content. Parent directories are created automatically.",
        parameters: {
          type: "OBJECT",
          properties: {
            file_path: {
              type: "STRING",
              description: "Relative path of the file to write.",
            },
            content: {
              type: "STRING",
              description: "The complete content to write into the file.",
            },
          },
          required: ["file_path", "content"],
        },
      },
      {
        name: "create_safety_backup",
        description:
          "Manually refresh the safety backup folder of the entire workspace with '__BACKUP_FOLDER' appended.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "restore_backup",
        description:
          "Restore the workspace from the '__BACKUP_FOLDER' safety backup in case of issues.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      }
    );
  }

  const tools: any[] = [];
  if (functionDeclarations.length > 0) {
    tools.push({ functionDeclarations });
  }

  // Built-in Gemini tools:
  // Note: Gemini API returns HTTP 400 if code_execution is combined with custom functionDeclarations.
  // Therefore, only attach code_execution when no functionDeclarations are active.
  if (modelConfig?.tools?.codeExecution && functionDeclarations.length === 0) {
    tools.push({ code_execution: {} });
  }
  if (modelConfig?.tools?.groundingGoogleSearch) {
    tools.push({ googleSearch: {} });
  }
  if (modelConfig?.tools?.urlContext) {
    tools.push({ url_context: {} });
  }

  let finalSystemPrompt = systemPrompt || modelConfig?.systemInstructions;

  if (wantsDocxExport) {
    const docxInstructions = `\n\n[LOCAL WORD/DOCX FILE EXPORT AVAILABLE]\nYou have the tool "create_docx_file" available to generate and save Microsoft Word (.docx) documents to the user's computer.\nCRITICAL INSTRUCTION:\n1. When the user explicitly requests to create, export, save, or download a Word document (.docx) or file, you MUST invoke the \`create_docx_file\` tool.\n2. Pass the full, beautifully structured document text in the \`content\` parameter, and a clean suggested filename ending with \`.docx\` in the \`filename\` parameter.\n3. For general clinical queries, questions, or summaries where the user does not request a downloadable document, answer normally in chat without invoking the tool.\n4. NEVER output raw Python code, python-docx scripts, or code blocks to generate the file. Always call \`create_docx_file\` directly when file creation is requested.`;
    finalSystemPrompt = (finalSystemPrompt || "") + docxInstructions;
  }

  if (agentWorkspace) {
    const workspaceInstructions = `\n\n[AUTONOMOUS LOCAL FILE AGENT ACTIVE]\nYou are scoped to workspace: "${agentWorkspace}".\nSafety policy: A safety backup folder "${agentWorkspace}__BACKUP_FOLDER" is maintained in the parent folder.\nYou have tools to list_directory, read_file, and write_file. Always use relative paths from the workspace root. Before claiming an edit is complete, verify files by reading or listing them if needed.`;
    finalSystemPrompt = (finalSystemPrompt || "") + workspaceInstructions;
  }

  const stopSequences = modelConfig?.advanced?.stopSequences
    ? modelConfig.advanced.stopSequences
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const safetySettingChoice = modelConfig?.advanced?.safetySettings;
  const threshold = safetySettingChoice ? SAFETY_THRESHOLD_MAP[safetySettingChoice] : undefined;
  const safetySettings = threshold
    ? [
        { category: "HARM_CATEGORY_HARASSMENT", threshold },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold },
      ]
    : undefined;

  // Map thinkingLevel to thinkingConfig for Gemini 2.5 models
  let thinkingConfig: { thinkingBudget: number } | undefined;
  if (model.includes("2.5") && modelConfig?.thinkingLevel) {
    const isPro = model.includes("pro");
    const budgetMap: Record<string, number> = {
      Off: isPro ? 128 : 0,
      Low: 1024,
      Medium: 8192,
      High: 24576,
    };
    const budget = budgetMap[modelConfig.thinkingLevel];
    if (budget !== undefined) {
      thinkingConfig = { thinkingBudget: budget };
    }
  }

  const sanitizeParts = (parts: ChatPart[]) =>
    parts.map(({ uploadKeyId, ...rest }) => rest);

  const contents = customContents || [
    ...history.map((msg) => ({ role: msg.role, parts: sanitizeParts(msg.parts) })),
    { role: "user", parts: sanitizeParts(userParts) },
  ];

  return {
    ...(finalSystemPrompt
      ? { systemInstruction: { parts: [{ text: finalSystemPrompt }] } }
      : {}),
    contents,
    ...(tools.length > 0 ? { tools } : {}),
    ...(safetySettings ? { safetySettings } : {}),
    generationConfig: {
      temperature: modelConfig?.temperature ?? 1.0,
      topP: 0.95,
      maxOutputTokens: modelConfig?.advanced?.outputLength || 8192,
      ...(stopSequences && stopSequences.length > 0 ? { stopSequences } : {}),
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
  };
}

/** Send a message to Gemini with automatic retry on rate-limits. */
export async function sendMessage(
  opts: SendMessageOptions
): Promise<GeminiResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // A specific key is ONLY required if the payload actually contains a Gemini File API fileUri
    const hasActiveFileUri =
      opts.userParts.some((p) => p.fileData?.fileUri) ||
      opts.history.some((m) => m.parts.some((p) => p.fileData?.fileUri));

    const requiredKeyId = hasActiveFileUri
      ? opts.userParts.find((p) => p.uploadKeyId)?.uploadKeyId ||
        opts.history.flatMap((m) => m.parts).find((p) => p.uploadKeyId)?.uploadKeyId
      : undefined;

    let entry;
    if (opts.mode === "pro") {
      if (!opts.proApiKeyId) {
        throw new Error(
          "Pro Mode is selected, but no Pro API Key is configured in Settings."
        );
      }
      entry = {
        id: opts.proApiKeyId,
        name: opts.proApiKeyName || "Pro Key",
        status: "valid" as const,
      };
    } else {
      entry = requiredKeyId
        ? opts.rotator.getKeyById(requiredKeyId)
        : opts.mode === "unlimited"
        ? opts.rotator.getNextKey()
        : opts.rotator.getActiveKey();

      if (requiredKeyId && !entry) {
        throw new Error(
          "The API key used to upload files in this conversation is missing or invalid. Please start a new chat."
        );
      }

      if (!entry) {
        throw new Error(
          "No active API keys available. Please add or configure your keys in Settings."
        );
      }
    }

    // Load actual key string securely from OS Keyring
    let rawKeyValue = "";
    try {
      rawKeyValue = await invoke<string>("load_api_key", { keyId: entry.id });
    } catch (e) {
      if (opts.mode !== "pro") opts.rotator.reportInvalid(entry.id);
      lastError = new Error(`Failed to load key from secure storage: ${e}`);
      continue;
    }

    if (!rawKeyValue || rawKeyValue.trim() === "") {
      if (opts.mode !== "pro") opts.rotator.reportInvalid(entry.id);
      lastError = new Error(
        `API key "${entry.name}" is empty or not configured in OS storage.`
      );
      continue;
    }

    const url = `${GEMINI_BASE}/${opts.model}:generateContent`;

    // Auto-enable Google Search grounding if in Pro mode
    const effectiveModelConfig = {
      ...opts.modelConfig,
      tools: {
        ...opts.modelConfig?.tools,
        groundingGoogleSearch:
          opts.mode === "pro"
            ? true
            : opts.modelConfig?.tools?.groundingGoogleSearch,
      },
    } as ModelConfig;

    const sanitizeParts = (parts: ChatPart[]) =>
      parts.map(({ uploadKeyId, ...rest }) => rest);

    const currentContents: any[] = [
      ...opts.history.map((msg) => ({ role: msg.role, parts: sanitizeParts(msg.parts) })),
      { role: "user", parts: sanitizeParts(opts.userParts) },
    ];

    let finalText = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    const executedToolLogs: string[] = [];

    const MAX_TOOL_STEPS = 12;

    try {
      for (let step = 0; step < MAX_TOOL_STEPS; step++) {
        const body = buildPayload(
          opts.model,
          opts.history,
          opts.userParts,
          opts.systemPrompt,
          effectiveModelConfig,
          opts.agentWorkspace,
          currentContents
        );

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": rawKeyValue,
          },
          body: JSON.stringify(body),
        });

        if (res.status === 429) {
          let errText = "";
          try {
            const json = await res.json();
            if (json.error && json.error.message) errText = json.error.message;
          } catch {}
          if (opts.mode !== "pro") opts.rotator.reportRateLimit(entry.id, 60_000);
          lastError = new Error(
            `Rate limit exceeded for key "${entry.name}". ${errText}`
          );
          if (requiredKeyId) {
            throw new Error(
              `Rate limit exceeded for key "${entry.name}". This conversation is locked to this key because of file attachments. Please wait before retrying.`
            );
          }
          break;
        }

        if (res.status === 400 || res.status === 401 || res.status === 403) {
          let errText = "";
          try {
            const raw = await res.text();
            try {
              errText = JSON.parse(raw)?.error?.message || raw;
            } catch {
              errText = raw;
            }
          } catch {
            errText = "Unknown API error";
          }
          const isKeyInvalid =
            res.status === 401 ||
            /API_KEY_INVALID|API key not valid|CREDENTIAL_UNAUTHORIZED/i.test(errText);
          if (opts.mode !== "pro") {
            if (isKeyInvalid) {
              opts.rotator.reportInvalid(entry.id);
            } else if (res.status === 403) {
              // 403 or quota limits get placed on cooldown rather than permanent death
              opts.rotator.reportRateLimit(entry.id, 120_000);
            }
          }
          if (!isKeyInvalid && res.status === 400) {
            throw new Error(`Gemini API request error (400): ${errText}`);
          }
          lastError = new Error(
            `Key "${entry.name}" encountered error (attempt ${
              attempt + 1
            }/${MAX_RETRIES}): ${errText}`
          );
          break;
        }

        if (!res.ok) {
          let errText = "";
          try {
            const raw = await res.text();
            try {
              errText = JSON.parse(raw)?.error?.message || raw;
            } catch {
              errText = raw;
            }
          } catch {}
          throw new Error(
            `Gemini API error ${res.status}: ${errText || res.statusText}`
          );
        }

        const json = await res.json();
        const parts = json?.candidates?.[0]?.content?.parts ?? [];
        const stepText = parts
          .map((p: any) => p.text)
          .filter(Boolean)
          .join("");

        if (stepText) {
          finalText = finalText ? `${finalText}\n\n${stepText}` : stepText;
        }

        promptTokens += json?.usageMetadata?.promptTokenCount ?? 0;
        completionTokens += json?.usageMetadata?.candidatesTokenCount ?? 0;
        totalTokens += json?.usageMetadata?.totalTokenCount ?? 0;

        const functionCallPart = parts.find((p: any) => p.functionCall);
        if (!functionCallPart) {
          break;
        }

        const call = functionCallPart.functionCall;
        if (call.name === "create_docx_file") {
          try {
            const { Document, Packer, Paragraph, TextRun } = await import("docx");
            const { save } = await import("@tauri-apps/plugin-dialog");
            const { writeFile } = await import("@tauri-apps/plugin-fs");

            const doc = new Document({
              sections: [
                {
                  properties: {},
                  children: (call.args.content || "")
                    .split("\n")
                    .map(
                      (line: string) =>
                        new Paragraph({ children: [new TextRun(line)] })
                    ),
                },
              ],
            });

            const blob = await Packer.toBlob(doc);
            const buffer = await blob.arrayBuffer();

            // Release active input focus and let WebView2 settle cursor state before opening modal
            if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            await new Promise((r) => setTimeout(r, 60));

            const filePath = await save({
              filters: [{ name: "Word Document", extensions: ["docx"] }],
              defaultPath: (() => {
                let name = (call.args.filename || "document.docx")
                  .replace(/[/\\]/g, "_")
                  .replace(/\.\./g, "_")
                  .replace(/[<>:"|?*]/g, "_")
                  .trim();
                if (!name.toLowerCase().endsWith(".docx")) name += ".docx";
                return name;
              })(),
            });

            const contentText = (call.args.content || "").trim();
            const preview = contentText ? `${contentText}\n\n` : "";
            if (filePath) {
              await writeFile(filePath, new Uint8Array(buffer));
              finalText = `${preview}✅ **Success!** I generated the Word document and you saved it to \`${filePath}\`.`;
            } else {
              finalText = `${preview}❌ **Cancelled:** You cancelled saving the Word document.`;
            }
          } catch (e: any) {
            console.error(e);
            finalText += `\n\n❌ **Error:** Failed to generate Word document. ${
              e?.message || String(e)
            }`;
          }
          break;
        }

        if (call.name === "create_html_file") {
          try {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const { writeFile } = await import("@tauri-apps/plugin-fs");

            const htmlContent =
              call.args.html_content ||
              call.args.content ||
              "<html><body></body></html>";

            // Release active input focus and let WebView2 settle cursor state before opening modal
            if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            await new Promise((r) => setTimeout(r, 60));

            const filePath = await save({
              filters: [{ name: "HTML Document", extensions: ["html", "htm"] }],
              defaultPath: (() => {
                let name = (call.args.filename || "index.html")
                  .replace(/[/\\]/g, "_")
                  .replace(/\.\./g, "_")
                  .replace(/[<>:"|?*]/g, "_")
                  .trim();
                if (
                  !name.toLowerCase().endsWith(".html") &&
                  !name.toLowerCase().endsWith(".htm")
                )
                  name += ".html";
                return name;
              })(),
            });

            if (filePath) {
              const encoder = new TextEncoder();
              await writeFile(filePath, encoder.encode(htmlContent));
              finalText += `\n\n✅ **Success!** I generated the HTML file and you saved it to \`${filePath}\`.`;
            } else {
              finalText += `\n\n❌ **Cancelled:** You cancelled saving the HTML file.`;
            }
          } catch (e: any) {
            console.error(e);
            finalText += `\n\n❌ **Error:** Failed to generate HTML file. ${
              e?.message || String(e)
            }`;
          }
          break;
        }

        if (opts.agentWorkspace) {
          let toolResult: any;
          try {
            if (call.name === "list_directory") {
              const subpath = call.args?.subpath || "";
              opts.onToolActivity?.(`Inspecting directory "${subpath || "."}"...`);
              const entries = await invoke("agent_list_directory", {
                workspacePath: opts.agentWorkspace,
                subpath: subpath || null,
              });
              toolResult = { entries };
              executedToolLogs.push(`📂 Listed directory \`${subpath || "/"}\``);
            } else if (call.name === "read_file") {
              const relPath = call.args?.file_path || "";
              opts.onToolActivity?.(`Reading file "${relPath}"...`);
              const content = await invoke("agent_read_file", {
                workspacePath: opts.agentWorkspace,
                relPath,
              });
              toolResult = { file_path: relPath, content };
              executedToolLogs.push(`📖 Read file \`${relPath}\``);
            } else if (call.name === "write_file") {
              const relPath = call.args?.file_path || "";
              const content = call.args?.content || "";
              opts.onToolActivity?.(`Writing file "${relPath}"...`);
              await invoke("agent_write_file", {
                workspacePath: opts.agentWorkspace,
                relPath,
                content,
              });
              toolResult = { success: true, file_path: relPath, bytesWritten: content.length };
              executedToolLogs.push(`✍️ Wrote file \`${relPath}\``);
            } else if (call.name === "create_safety_backup") {
              opts.onToolActivity?.("Creating safety backup...");
              const backupPath = await invoke<string>("agent_create_backup", {
                workspacePath: opts.agentWorkspace,
              });
              toolResult = { success: true, backup_path: backupPath };
              executedToolLogs.push(`📦 Created backup \`${backupPath}\``);
            } else if (call.name === "restore_backup") {
              opts.onToolActivity?.("Restoring from safety backup...");
              const msg = await invoke<string>("agent_restore_backup", {
                workspacePath: opts.agentWorkspace,
              });
              toolResult = { success: true, message: msg };
              executedToolLogs.push(`⏪ Restored workspace from backup`);
            } else {
              toolResult = { error: `Unknown tool: ${call.name}` };
            }
          } catch (e: any) {
            toolResult = { error: e?.message || String(e) };
            executedToolLogs.push(`⚠️ Error in \`${call.name}\`: ${toolResult.error}`);
          }

          currentContents.push({
            role: "model",
            parts,
          });
          currentContents.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: call.name,
                  response: toolResult,
                },
              },
            ],
          });
          continue;
        }

        finalText += `\n\n*[Called tool: ${call.name}]*`;
        break;
      }

      if (lastError && !finalText) {
        continue;
      }

      if (executedToolLogs.length > 0 && !finalText.includes("Agent Action")) {
        const actionsSummary =
          "\n\n> 🛠️ **Agent Actions:**\n" +
          executedToolLogs.map((log) => `> - ${log}`).join("\n");
        finalText = finalText ? `${finalText}${actionsSummary}` : actionsSummary;
      }

      if (!finalText.trim()) {
        finalText = "*[Agent completed operations successfully]*";
      }

      if (opts.mode !== "pro") {
        opts.rotator.reportValid(entry.id);
      }

      return {
        text: finalText,
        usedKeyName: entry.name,
        usedKeyId: entry.id,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
      };
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.startsWith("Gemini API") ||
          err.message.includes("locked to this key"))
      ) {
        throw err;
      }
      lastError = err as Error;
    }
  }

  throw lastError ?? new Error("Failed to get a response after max retries.");
}

/** Send a lightweight test prompt to verify a key is valid. */
export async function testKey(
  apiKey: string,
  _model = "gemini-2.5-flash"
): Promise<"valid" | "invalid" | "rate-limited"> {
  // Always verify against a standard, guaranteed Gemini model
  const testModel = "gemini-2.5-flash";
  const url = `${GEMINI_BASE}/${testModel}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "hi" }] }],
        generationConfig: { maxOutputTokens: 2 },
      }),
    });

    if (res.status === 429) return "rate-limited";
    if (res.ok) return "valid";

    let errMsg = "";
    try {
      const errJson = await res.json();
      errMsg = errJson?.error?.message || "";
    } catch {}

    // Only mark invalid if credentials are explicitly rejected
    if (
      res.status === 401 ||
      /API_KEY_INVALID|API key not valid|CREDENTIAL_UNAUTHORIZED/i.test(errMsg)
    ) {
      return "invalid";
    }

    if (res.status === 403) {
      return "rate-limited";
    }

    return "rate-limited";
  } catch {
    return "rate-limited";
  }
}

/**
 * Upload a file using Gemini File API (multipart upload) to track progress.
 * Returns the file URI and MIME type.
 */
export function uploadFileToGemini(
  file: File,
  apiKey: string,
  onProgress?: (percent: number) => void
): Promise<{ fileUri: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart`;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);

    const boundary =
      "------UploadBoundary" + Math.random().toString(36).substring(2);
    xhr.setRequestHeader(
      "Content-Type",
      "multipart/related; boundary=" + boundary
    );
    xhr.setRequestHeader("x-goog-api-key", apiKey);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve({
            fileUri: response.file.uri,
            mimeType: response.file.mimeType,
          });
        } catch {
          reject(new Error("Failed to parse upload response"));
        }
      } else {
        let errText = xhr.responseText;
        try {
          const json = JSON.parse(xhr.responseText);
          if (json.error && json.error.message) errText = json.error.message;
        } catch {}
        reject(new Error(`Upload failed: ${errText}`));
      }
    };

    xhr.onerror = () =>
      reject(new Error("Upload failed due to network/CORS error."));

    const metadata = JSON.stringify({ file: { display_name: file.name } });

    const preBlob = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${
        file.type || "application/octet-stream"
      }\r\n\r\n`,
    ]);
    const postBlob = new Blob([`\r\n--${boundary}--\r\n`]);

    const body = new Blob([preBlob, file, postBlob]);

    xhr.send(body);
  });
}
