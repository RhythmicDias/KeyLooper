/**
 * useAppStore.ts
 * Central Zustand store for KeyLooper — manages API keys, sessions, mode, shortcuts, and settings.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type { ApiKeyEntry, KeyStatus } from "../lib/KeyRotator";
import type { ChatMessage } from "../lib/geminiClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppMode = "normal" | "unlimited" | "pro";

export const SUPPORTED_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
] as const;

const DEPRECATED_OR_INVALID_MODELS = new Set([
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-robotics-er-1.6-preview",
]);

export type GeminiModel = (typeof SUPPORTED_MODELS)[number];

export type ShortcutAction =
  | "newChat"
  | "sendMessage"
  | "toggleHistory"
  | "openSettings"
  | "openSkills"
  | "toggleTheme"
  | "toggleDock"
  | "toggleVoice"
  | "switchModel"
  | "cycleMode"
  | "clearChat"
  | "focusInput"
  | "openGeminiWeb"
  | "selectWorkspace";

export type ShortcutMap = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  newChat: "Ctrl+N",
  sendMessage: "Enter",
  toggleHistory: "Ctrl+H",
  openSettings: "Ctrl+,",
  openSkills: "Alt+A",
  toggleTheme: "Ctrl+Shift+D",
  toggleDock: "Ctrl+B",
  toggleVoice: "Alt+M",
  switchModel: "Alt+G",
  cycleMode: "Ctrl+Shift+M",
  clearChat: "Ctrl+L",
  focusInput: "Ctrl+/",
  openGeminiWeb: "Alt+W",
  selectWorkspace: "Ctrl+O",
};

export const SHORTCUT_LABELS: Record<ShortcutAction, { label: string; description: string }> = {
  newChat: { label: "New Chat", description: "Start a fresh chat session" },
  sendMessage: { label: "Send Message", description: "Submit prompt in chat box (Enter or Ctrl+Enter)" },
  toggleHistory: { label: "Toggle History Panel", description: "Show or hide the collapsible chat history sidebar" },
  openSettings: { label: "Open Settings", description: "Switch to the Settings view" },
  openSkills: { label: "Open Agents & Skills", description: "Switch to the Agents / Skills view" },
  toggleTheme: { label: "Toggle Theme", description: "Switch between Light and Dark mode" },
  toggleDock: { label: "Toggle Bottom Dock", description: "Show or hide the floating navigation dock" },
  toggleVoice: { label: "Voice Dictation", description: "Start or stop microphone speech recognition" },
  switchModel: { label: "Select Model", description: "Focus and open the active model selector" },
  cycleMode: { label: "Cycle Routing Mode", description: "Switch between Normal, Unlimited, and Pro modes" },
  clearChat: { label: "Clear Active Chat", description: "Clear all messages in the current session" },
  focusInput: { label: "Focus Prompt Input", description: "Jump cursor directly to the chat input box" },
  openGeminiWeb: { label: "Google Gemini Web", description: "Open official Google Gemini web app window" },
  selectWorkspace: { label: "Select Workspace Folder", description: "Choose local workspace directory for Autonomous File Agent" },
};

/** Convert a KeyboardEvent into a normalized shortcut string like "Ctrl+Shift+D" or "Ctrl+N". */
export function formatShortcutFromEvent(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const rawKey = e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(rawKey)) return null;

  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  const code = e.code || "";
  let keyName = rawKey;
  if (code.startsWith("Key") && code.length === 4) {
    keyName = code.slice(3).toUpperCase();
  } else if (code.startsWith("Digit") && code.length === 6) {
    keyName = code.slice(5);
  } else if (rawKey === " ") {
    keyName = "Space";
  } else if (rawKey === "Escape") {
    keyName = "Esc";
  } else if (rawKey === "ArrowUp") {
    keyName = "Up";
  } else if (rawKey === "ArrowDown") {
    keyName = "Down";
  } else if (rawKey === "ArrowLeft") {
    keyName = "Left";
  } else if (rawKey === "ArrowRight") {
    keyName = "Right";
  } else if (rawKey.length === 1) {
    keyName = rawKey.toUpperCase();
  }

  return [...mods, keyName].join("+");
}

export const isMac =
  typeof navigator !== "undefined" &&
  /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform);

/** Format a shortcut string for display, converting to macOS symbols (⌘, ⌥, ⇧) on Mac. */
export function formatShortcutForDisplay(binding: string | undefined): string {
  if (!binding) return "";
  if (!isMac) return binding;
  return binding
    .replace(/\bCtrl\b/g, "⌘")
    .replace(/\bAlt\b/g, "⌥")
    .replace(/\bShift\b/g, "⇧")
    .replace(/\+/g, "");
}

/** Check if a KeyboardEvent matches a configured shortcut string. */
export function matchesShortcut(
  e: KeyboardEvent | React.KeyboardEvent,
  binding: string | undefined
): boolean {
  if (!binding) return false;
  const formatted = formatShortcutFromEvent(e);
  if (!formatted) return false;
  return formatted.toLowerCase() === binding.trim().toLowerCase();
}

const extractTitle = (message: ChatMessage): string => {
  const text = message.parts.find((p) => p.text && p.text.trim().length > 0)?.text;
  if (text) return text.trim().substring(0, 40);
  const fileMime =
    message.parts.find((p) => p.fileData)?.fileData?.mimeType ||
    message.parts.find((p) => p.inlineData)?.inlineData?.mimeType;
  if (fileMime) return `[${fileMime.split("/")[0]} attached]`;
  return "New Chat";
};

export interface ModelConfig {
  systemInstructions: string;
  thinkingLevel: "Off" | "Low" | "Medium" | "High";
  temperature: number;
  tools: {
    codeExecution: boolean;
    groundingGoogleSearch: boolean;
    urlContext: boolean;
    localFileExport: boolean;
  };
  advanced: {
    safetySettings: "Block None" | "Block Few" | "Block Some" | "Block Most";
    stopSequences: string;
    outputLength: number;
  };
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  systemInstructions: "",
  thinkingLevel: "Medium",
  temperature: 1.0,
  tools: {
    codeExecution: false,
    groundingGoogleSearch: false,
    urlContext: false,
    localFileExport: true,
  },
  advanced: {
    safetySettings: "Block Some",
    stopSequences: "",
    outputLength: 8192,
  },
};

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  skillId?: string;
  workspacePath?: string;
}

export interface Skill {
  id: string;
  name: string;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: "skill-docx-assistant",
    name: "DOCX Assistant",
    systemPrompt:
      "You are an expert document generator and DOCX assistant. Format, write, and structure documents, reports, templates, and clinical letters with clean headings, tables, bullet points, and professional formatting ready for export to Word (.docx). When asked to create or export a document or report, invoke the create_docx_file tool with the complete formatted text and a suggested filename ending in .docx. Never output raw Python code or python-docx scripts.",
    createdAt: 1720600000000,
    updatedAt: 1720600000000,
  },
  {
    id: "skill-appointment-list-maker",
    name: "Appointment List Maker",
    systemPrompt:
      "You are a clinical scheduling and appointment list assistant. Organize, format, and parse patient schedules, clinic appointments, consultation times, and follow-up lists into clean, structured tables with dates, times, patient details, and action items.",
    createdAt: 1720600000000,
    updatedAt: 1720600000000,
  },
  {
    id: "default-code-architect",
    name: "Code Architect",
    systemPrompt:
      "You are an expert software engineer and code architect. Provide clean, modular, efficient code solutions following SOLID principles.",
    createdAt: 1721860000000,
    updatedAt: 1721860000000,
  },
  {
    id: "default-medical-summarizer",
    name: "Pediatric & Medical Summarizer",
    systemPrompt:
      "You are a clinical documentation assistant. Summarize medical information concisely with high precision, clear headings, and evidence-based clinical context.",
    createdAt: 1721860000000,
    updatedAt: 1721860000000,
  },
  {
    id: "default-creative-writer",
    name: "Creative Content Specialist",
    systemPrompt:
      "You are an engaging creative writer. Craft polished, compelling content tailored to the audience's tone and requirements.",
    createdAt: 1721860000000,
    updatedAt: 1721860000000,
  },
];

export function syncCustomSkillsToDisk(skills: Skill[]) {
  if (typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)) {
    try {
      const customSkills = skills.filter(
        (sk) => !DEFAULT_SKILLS.some((d) => d.id === sk.id)
      );
      invoke("save_custom_skills", {
        skillsJson: JSON.stringify(customSkills),
      }).catch(() => {});
    } catch (_) {}
  }
}

export interface UsageRecord {
  id: string;
  apiKeyId: string;
  apiKeyName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;
}

const MAX_USAGE_RECORDS = 2000;

interface AppState {
  // API Keys
  apiKeys: ApiKeyEntry[];
  addApiKey: (name: string) => string;
  removeApiKey: (id: string) => void;
  updateKeyStatus: (id: string, status: KeyStatus, cooldownUntil?: number) => void;
  syncApiKeys: (keys: ApiKeyEntry[]) => void;
  updateKeyName: (id: string, name: string) => void;
  reorderApiKeys: (startIndex: number, endIndex: number) => void;
  reactivateAllKeys: () => void;

  // Pro API Key
  proApiKey: ApiKeyEntry | null;
  setProApiKey: (entry: ApiKeyEntry | null) => void;

  // Mode
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  // Models
  modelConfigs: Record<string, ModelConfig>;
  updateModelConfig: (model: string, config: Partial<ModelConfig>) => void;
  customModels: string[];
  deletedModels: string[];
  addCustomModel: (model: string) => void;
  deleteModel: (model: string) => void;
  restoreDefaultsModels: () => void;

  // Selected Model
  selectedModel: string;
  setModel: (model: string) => void;

  // Sessions
  sessions: ChatSession[];
  activeSessionId: string | null;
  createSession: (skillId?: string) => string;
  deleteSession: (id: string) => void;
  selectSession: (id: string) => void;
  setSessionSkill: (sessionId: string, skillId?: string) => void;
  setSessionWorkspace: (id: string, workspacePath: string | null) => void;
  appendMessage: (sessionId: string, message: ChatMessage) => void;
  renameSession: (id: string, title: string) => void;
  clearAllSessions: () => void;
  clearSessionMessages: (id: string) => void;
  updateMessageText: (sessionId: string, messageIndex: number, text: string) => void;
  updateMessageMetadata: (
    sessionId: string,
    messageIndex: number,
    metadata: Partial<ChatMessage>
  ) => void;
  removeSubsequentMessages: (sessionId: string, fromIndex: number) => void;

  // Skills
  skills: Skill[];
  createSkill: (name: string, systemPrompt: string) => void;
  updateSkill: (id: string, name: string, systemPrompt: string) => void;
  deleteSkill: (id: string) => void;

  // Usage
  usageRecords: UsageRecord[];
  recordUsage: (record: Omit<UsageRecord, "id" | "timestamp">) => void;
  clearUsageRecords: () => void;

  // Shortcuts
  shortcuts: ShortcutMap;
  setShortcut: (action: ShortcutAction, binding: string) => void;
  resetShortcut: (action: ShortcutAction) => void;
  resetAllShortcuts: () => void;

  // Settings
  historyEnabled: boolean;
  setHistoryEnabled: (enabled: boolean) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  rotationIndex: number;
  setRotationIndex: (idx: number) => void;
  autoCheckUpdates: boolean;
  setAutoCheckUpdates: (enabled: boolean) => void;
  updateAvailable: string | null;
  setUpdateAvailable: (version: string | null) => void;

  // UI state
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  currentView: "chat" | "settings" | "skills";
  setView: (view: "chat" | "settings" | "skills") => void;
  settingsTab: "api" | "model" | "shortcuts" | "agent" | "privacy" | "usage" | "about" | "updates";
  setSettingsTab: (tab: "api" | "model" | "shortcuts" | "agent" | "privacy" | "usage" | "about" | "updates") => void;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;

  // Autonomous Local File Agent
  agentWorkspace: string | null;
  agentBackupPath: string | null;
  pendingWorkspacePrompt: string | null;
  setAgentWorkspace: (path: string | null) => void;
  setAgentBackupPath: (path: string | null) => void;
  setPendingWorkspacePrompt: (path: string | null) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // ── API Keys ──────────────────────────────────────────────────────────
      apiKeys: [],
      addApiKey: (name) => {
        const id = crypto.randomUUID();
        set((s) => ({
          apiKeys: [...s.apiKeys, { id, name, status: "unchecked" as KeyStatus }],
        }));
        return id;
      },
      removeApiKey: (id) => {
        invoke("delete_api_key", { keyId: id }).catch((e) => console.error(e));
        set((s) => ({ apiKeys: s.apiKeys.filter((k) => k.id !== id) }));
      },
      updateKeyStatus: (id, status, cooldownUntil) =>
        set((s) => ({
          apiKeys: s.apiKeys.map((k) =>
            k.id === id ? { ...k, status, cooldownUntil } : k
          ),
        })),
      syncApiKeys: (keys) =>
        set(() => ({
          apiKeys: keys.map((k) => ({ ...k })),
        })),
      updateKeyName: (id, name) =>
        set((s) => ({
          apiKeys: s.apiKeys.map((k) => (k.id === id ? { ...k, name } : k)),
        })),
      reorderApiKeys: (startIndex, endIndex) =>
        set((s) => {
          const result = Array.from(s.apiKeys);
          const [removed] = result.splice(startIndex, 1);
          result.splice(endIndex, 0, removed);
          return { apiKeys: result };
        }),
      reactivateAllKeys: () =>
        set((s) => ({
          apiKeys: s.apiKeys.map((k) => ({
            ...k,
            status: "unchecked" as KeyStatus,
            cooldownUntil: undefined,
          })),
        })),

      // ── Pro API Key ────────────────────────────────────────────────────────
      proApiKey: null,
      setProApiKey: (entry) => set({ proApiKey: entry }),

      // ── Mode ──────────────────────────────────────────────────────────────
      mode: "unlimited",
      setMode: (mode) => set({ mode }),

      // ── Models ────────────────────────────────────────────────────────────
      modelConfigs: {},
      updateModelConfig: (model, config) =>
        set((s) => {
          const prev = s.modelConfigs[model] || DEFAULT_MODEL_CONFIG;
          return {
            modelConfigs: {
              ...s.modelConfigs,
              [model]: {
                ...DEFAULT_MODEL_CONFIG,
                ...prev,
                ...config,
                tools: {
                  ...DEFAULT_MODEL_CONFIG.tools,
                  ...(prev.tools || {}),
                  ...(config.tools || {}),
                },
                advanced: {
                  ...DEFAULT_MODEL_CONFIG.advanced,
                  ...(prev.advanced || {}),
                  ...(config.advanced || {}),
                },
              },
            },
          };
        }),
      customModels: [],
      deletedModels: [],
      addCustomModel: (model) => {
        const trimmed = model.trim();
        if (!trimmed) return;
        set((s) => ({
          customModels: s.customModels.includes(trimmed)
            ? s.customModels
            : [...s.customModels, trimmed],
          deletedModels: s.deletedModels.filter((m) => m !== trimmed),
        }));
      },
      deleteModel: (model) =>
        set((s) => ({
          customModels: s.customModels.filter((m) => m !== model),
          deletedModels: s.deletedModels.includes(model)
            ? s.deletedModels
            : [...s.deletedModels, model],
        })),
      restoreDefaultsModels: () => set({ deletedModels: [] }),
      selectedModel: "gemini-2.5-flash",
      setModel: (model) => set({ selectedModel: model }),

      // ── Sessions ──────────────────────────────────────────────────────────
      sessions: [],
      activeSessionId: null,

      createSession: (skillId?: string) => {
        const id = crypto.randomUUID();
        const session: ChatSession = {
          id,
          title: "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          ...(skillId ? { skillId } : {}),
        };
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeSessionId: id,
        }));
        return id;
      },

      deleteSession: (id) =>
        set((s) => {
          const remaining = s.sessions.filter((sess) => sess.id !== id);
          return {
            sessions: remaining,
            activeSessionId:
              s.activeSessionId === id
                ? (remaining[0]?.id ?? null)
                : s.activeSessionId,
          };
        }),

      selectSession: (id) => set({ activeSessionId: id }),

      setSessionSkill: (sessionId, skillId) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  skillId: skillId || undefined,
                  updatedAt: Date.now(),
                }
              : sess
          ),
        })),

      setSessionWorkspace: (id, workspacePath) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== id) return sess;
            const folder = workspacePath
              ? workspacePath.split(/[\\/]/).filter(Boolean).pop() || "Workspace"
              : null;
            return {
              ...sess,
              workspacePath: workspacePath || undefined,
              title:
                (sess.title === "New Chat" || !sess.title) && folder
                  ? folder
                  : sess.title,
            };
          }),
        })),

      appendMessage: (sessionId, message) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== sessionId) return sess;
            const isFirstUserMsg =
              message.role === "user" &&
              (sess.title === "New Chat" ||
                !sess.messages.some((m) => m.role === "user"));
            let newTitle = sess.title;
            if (isFirstUserMsg) {
              const extracted = extractTitle(message);
              if (sess.workspacePath) {
                const folder =
                  sess.workspacePath.split(/[\\/]/).filter(Boolean).pop() ||
                  "Workspace";
                newTitle =
                  extracted !== "New Chat" ? `${folder}: ${extracted}` : folder;
              } else {
                newTitle = extracted;
              }
            }
            return {
              ...sess,
              messages: [...sess.messages, message],
              updatedAt: Date.now(),
              title: newTitle,
            };
          }),
        })),

      renameSession: (id, title) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === id ? { ...sess, title: title.trim() || sess.title } : sess
          ),
        })),

      clearAllSessions: () => set({ sessions: [], activeSessionId: null }),

      clearSessionMessages: (id) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === id ? { ...sess, messages: [], updatedAt: Date.now() } : sess
          ),
        })),

      updateMessageText: (sessionId, messageIndex, newText) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  messages: sess.messages.map((msg, idx) =>
                    idx === messageIndex
                      ? {
                          ...msg,
                          parts: msg.parts.map((p) =>
                            p.text !== undefined ? { ...p, text: newText } : p
                          ),
                        }
                      : msg
                  ),
                  updatedAt: Date.now(),
                }
              : sess
          ),
        })),

      updateMessageMetadata: (sessionId, messageIndex, metadata) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  messages: sess.messages.map((msg, idx) =>
                    idx === messageIndex
                      ? {
                          ...msg,
                          ...metadata,
                          usage: { ...msg.usage, ...metadata.usage },
                        }
                      : msg
                  ),
                  updatedAt: Date.now(),
                }
              : sess
          ),
        })),

      removeSubsequentMessages: (sessionId, messageIndex) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  messages: sess.messages.slice(0, messageIndex + 1),
                  updatedAt: Date.now(),
                }
              : sess
          ),
        })),

      // ── Skills ────────────────────────────────────────────────────────────
      skills: DEFAULT_SKILLS,
      createSkill: (name, systemPrompt) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        set((s) => {
          const updated = [
            ...s.skills,
            { id, name, systemPrompt, createdAt: now, updatedAt: now },
          ];
          syncCustomSkillsToDisk(updated);
          return { skills: updated };
        });
      },
      updateSkill: (id, name, systemPrompt) => {
        set((s) => {
          const updated = s.skills.map((skill) =>
            skill.id === id
              ? { ...skill, name, systemPrompt, updatedAt: Date.now() }
              : skill
          );
          syncCustomSkillsToDisk(updated);
          return { skills: updated };
        });
      },
      deleteSkill: (id) => {
        set((s) => {
          const updated = s.skills.filter((skill) => skill.id !== id);
          syncCustomSkillsToDisk(updated);
          return { skills: updated };
        });
      },

      // ── Usage ─────────────────────────────────────────────────────────────
      usageRecords: [],
      recordUsage: (record) => {
        const id = crypto.randomUUID();
        const timestamp = Date.now();
        set((s) => ({
          usageRecords: [...s.usageRecords.slice(-(MAX_USAGE_RECORDS - 1)), { ...record, id, timestamp }],
        }));
      },
      clearUsageRecords: () => set({ usageRecords: [] }),

      // ── Shortcuts ─────────────────────────────────────────────────────────
      shortcuts: { ...DEFAULT_SHORTCUTS },
      setShortcut: (action, binding) =>
        set((s) => ({
          shortcuts: { ...s.shortcuts, [action]: binding },
        })),
      resetShortcut: (action) =>
        set((s) => ({
          shortcuts: { ...s.shortcuts, [action]: DEFAULT_SHORTCUTS[action] },
        })),
      resetAllShortcuts: () => set({ shortcuts: { ...DEFAULT_SHORTCUTS } }),

      // ── Settings ──────────────────────────────────────────────────────────
      historyEnabled: true,
      setHistoryEnabled: (enabled) => set({ historyEnabled: enabled }),
      theme: "light",
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      rotationIndex: 0,
      setRotationIndex: (rotationIndex) => set({ rotationIndex }),
      autoCheckUpdates: true,
      setAutoCheckUpdates: (autoCheckUpdates) => set({ autoCheckUpdates }),
      updateAvailable: null,
      setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),

      // ── UI State ──────────────────────────────────────────────────────────
      isSidebarOpen: false,
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
      currentView: "chat",
      setView: (view) => set({ currentView: view }),
      settingsTab: "api",
      setSettingsTab: (settingsTab) => set({ settingsTab }),
      isLoading: false,
      setLoading: (loading) => set({ isLoading: loading }),

      // ── Autonomous Local File Agent ───────────────────────────────────────
      agentWorkspace: null,
      agentBackupPath: null,
      pendingWorkspacePrompt: null,
      setAgentWorkspace: (agentWorkspace) => set({ agentWorkspace }),
      setAgentBackupPath: (agentBackupPath) => set({ agentBackupPath }),
      setPendingWorkspacePrompt: (pendingWorkspacePrompt) => set({ pendingWorkspacePrompt }),
    }),
    {
      name: "keylooper-storage",
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const current = localStorage.getItem(name);
          if (current !== null) return current;
          // One-time fallback to legacy storage only when keylooper-storage does not exist yet
          return localStorage.getItem("apkirota-storage");
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch (err) {
            console.error("Failed to persist state to localStorage:", err);
          }
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      })),
      merge: (persistedState: any, currentState) => {
        try {
          const merged = { ...currentState, ...(persistedState as object) };

          const existingSkills = Array.isArray(merged.skills) ? merged.skills : [];
          const existingNames = new Set(
            existingSkills
              .filter((s) => s && typeof s.name === "string")
              .map((s: Skill) => s.name.toLowerCase())
          );
          const existingIds = new Set(
            existingSkills
              .filter((s) => s && typeof s.id === "string")
              .map((s: Skill) => s.id)
          );

          const skillsToKeep = existingSkills.map((s: Skill) => {
            if (
              s.id === "skill-docx-assistant" &&
              !s.systemPrompt.includes("create_docx_file")
            ) {
              const def = DEFAULT_SKILLS.find(
                (d) => d.id === "skill-docx-assistant"
              );
              if (def) return { ...s, systemPrompt: def.systemPrompt };
            }
            return s;
          });
          for (const defSkill of DEFAULT_SKILLS) {
            if (
              !existingNames.has(defSkill.name.toLowerCase()) &&
              !existingIds.has(defSkill.id)
            ) {
              skillsToKeep.push(defSkill);
            }
          }
          merged.skills = skillsToKeep;
          syncCustomSkillsToDisk(skillsToKeep);

          if (!Array.isArray(merged.customModels)) {
            merged.customModels = [];
          } else {
            merged.customModels = merged.customModels.filter(
              (m: string) => !DEPRECATED_OR_INVALID_MODELS.has(m)
            );
          }
          if (!Array.isArray(merged.deletedModels)) {
            merged.deletedModels = [];
          }
          if (
            !merged.selectedModel ||
            typeof merged.selectedModel !== "string" ||
            DEPRECATED_OR_INVALID_MODELS.has(merged.selectedModel)
          ) {
            merged.selectedModel = "gemini-2.5-flash";
          }

          merged.shortcuts = {
            ...DEFAULT_SHORTCUTS,
            ...(merged.shortcuts && typeof merged.shortcuts === "object"
              ? merged.shortcuts
              : {}),
          };

          if (merged.currentView === ("history" as any)) {
            merged.currentView = "chat";
          }

          return merged;
        } catch (err) {
          console.error("Storage rehydration merge error:", err);
          return currentState;
        }
      },
      partialize: (state) => {
        const sanitizeSessions = (sessions: ChatSession[]): ChatSession[] =>
          sessions.map((session) => ({
            ...session,
            messages: session.messages.map((msg) => ({
              ...msg,
              parts: msg.parts.map((part) => {
                if (part.inlineData?.data) {
                  return {
                    ...part,
                    inlineData: {
                      mimeType: part.inlineData.mimeType,
                      data: "[stripped]",
                    },
                  };
                }
                return part;
              }),
            })),
          }));

        return {
          apiKeys: state.apiKeys,
          proApiKey: state.proApiKey,
          mode: state.mode,
          selectedModel: state.selectedModel,
          sessions: state.historyEnabled ? sanitizeSessions(state.sessions) : [],
          activeSessionId: state.historyEnabled ? state.activeSessionId : null,
          skills: state.skills,
          customModels: state.customModels || [],
          deletedModels: state.deletedModels || [],
          historyEnabled: state.historyEnabled,
          theme: state.theme,
          usageRecords: state.usageRecords.slice(-MAX_USAGE_RECORDS),
          rotationIndex: state.rotationIndex,
          modelConfigs: state.modelConfigs,
          shortcuts: state.shortcuts,
          isSidebarOpen: state.isSidebarOpen,
          agentWorkspace: state.agentWorkspace,
          agentBackupPath: state.agentBackupPath,
        };
      },
    }
  )
);

// ─── Selectors ────────────────────────────────────────────────────────────────

let cachedCustomModels: string[] | undefined;
let cachedDeletedModels: string[] | undefined;
let cachedAvailableModels: string[] = [...SUPPORTED_MODELS];

export const selectAvailableModels = (s: AppState): string[] => {
  if (
    s.customModels !== cachedCustomModels ||
    s.deletedModels !== cachedDeletedModels
  ) {
    cachedCustomModels = s.customModels;
    cachedDeletedModels = s.deletedModels;
    const all = [...SUPPORTED_MODELS, ...(s.customModels || [])];
    const deletedSet = new Set(s.deletedModels || []);
    cachedAvailableModels = all.filter((m) => !deletedSet.has(m));
  }
  return cachedAvailableModels;
};

export const selectActiveSession = (s: AppState): ChatSession | null =>
  s.sessions.find((sess) => sess.id === s.activeSessionId) ?? null;

export const selectHealthyKeyCount = (s: AppState): number => {
  const now = Date.now();
  return s.apiKeys.filter(
    (k) =>
      k.status !== "invalid" &&
      (k.status !== "rate-limited" || (k.cooldownUntil ?? 0) < now)
  ).length;
};
