/**
 * App.tsx — Main KeyLooper workspace with collapsible History Sidebar,
 * customizable keyboard shortcuts, unified Gemini dispatch, and lower-center error toast.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import ChatBubble from "./components/ChatBubble";
import SettingsView from "./components/SettingsView";
import SkillsView from "./components/SkillsView";
import Sidebar from "./components/Sidebar";
import TitleBar from "./components/TitleBar";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  useAppStore,
  selectActiveSession,
  selectAvailableModels,
  selectHealthyKeyCount,
  matchesShortcut,
  formatShortcutForDisplay,
  isMac,
} from "./store/useAppStore";
import { KeyRotator } from "./lib/KeyRotator";
import { sendMessage, uploadFileToGemini } from "./lib/geminiClient";
import type { ChatPart, ChatMessage } from "./lib/geminiClient";
import {
  processFile,
  getPreviewUrl,
  requiresGeminiFileApi,
} from "./lib/fileProcessor";
import { checkForAppUpdate } from "./lib/updater";

function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "early bird";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night owl";
}

// ─── Icon helper ───────────────────────────────────────────
const Icon = ({
  name,
  className = "",
  filled = false,
  thin = false,
  size = 22,
  style: extraStyle,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  thin?: boolean;
  size?: number;
  style?: React.CSSProperties;
}) => (
  <span
    className={`material-symbols-outlined select-none ${className}`}
    style={{
      fontSize: `${size}px`,
      fontVariationSettings: filled
        ? "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24"
        : thin
        ? "'FILL' 0, 'wght' 100, 'GRAD' 0, 'opsz' 24"
        : "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
      color: "inherit",
      ...extraStyle,
    }}
  >
    {name}
  </span>
);


// ─── Dock item ─────────────────────────────────────────────
const DockItem: React.FC<{
  icon: string;
  label: string;
  active?: boolean;
  filled?: boolean;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}> = ({ icon, label, active, filled, title, onClick, onContextMenu }) => (
  <button
    onClick={onClick}
    onContextMenu={onContextMenu}
    title={title}
    className="flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all gap-0.5"
    style={{
      background: active ? "rgba(177,98,77,0.12)" : "transparent",
      color: active ? "var(--primary)" : "var(--text-color-muted)",
      border: "none",
      cursor: "pointer",
    }}
    onMouseEnter={(e) => {
      if (!active) {
        e.currentTarget.style.background = "var(--input-bg)";
        e.currentTarget.style.color = "var(--primary)";
      }
    }}
    onMouseLeave={(e) => {
      if (!active) {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-color-muted)";
      }
    }}
  >
    <Icon name={icon} filled={filled} size={22} />
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "9px",
        fontWeight: 500,
        letterSpacing: "0.05em",
        marginTop: "2px",
      }}
    >
      {label}
    </span>
  </button>
);

// ─── Attachment type ───────────────────────────────────────
interface AttachedFile {
  file: File;
  previewUrl: string | null;
  parts: ChatPart[];
  uploadProgress?: number;
}

const MODEL_LABELS: Record<string, string> = {
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-2.0-flash-lite": "Gemini 2.0 Flash-Lite",
};

const modelLabel = (m: string) => MODEL_LABELS[m] || m;

// ══════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════
const App: React.FC = () => {
  const createSession = useAppStore((s) => s.createSession);
  const activeSession = useAppStore(selectActiveSession);
  const appendMessage = useAppStore((s) => s.appendMessage);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const apiKeys = useAppStore((s) => s.apiKeys);
  const syncApiKeys = useAppStore((s) => s.syncApiKeys);
  const healthyKeyCount = useAppStore(selectHealthyKeyCount);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setModel = useAppStore((s) => s.setModel);
  const isLoading = useAppStore((s) => s.isLoading);
  const setLoading = useAppStore((s) => s.setLoading);
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const recordUsage = useAppStore((s) => s.recordUsage);
  const setRotationIndex = useAppStore((s) => s.setRotationIndex);
  const clearSessionMessages = useAppStore((s) => s.clearSessionMessages);
  const updateMessageText = useAppStore((s) => s.updateMessageText);
  const updateMessageMetadata = useAppStore((s) => s.updateMessageMetadata);
  const removeSubsequentMessages = useAppStore((s) => s.removeSubsequentMessages);
  const skills = useAppStore((s) => s.skills);
  const setSessionSkill = useAppStore((s) => s.setSessionSkill);
  const availableModels = useAppStore(selectAvailableModels);
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const shortcuts = useAppStore((s) => s.shortcuts);
  const agentWorkspace = useAppStore((s) => s.agentWorkspace);
  const setAgentWorkspace = useAppStore((s) => s.setAgentWorkspace);
  const setSessionWorkspace = useAppStore((s) => s.setSessionWorkspace);
  const agentBackupPath = useAppStore((s) => s.agentBackupPath);
  const setAgentBackupPath = useAppStore((s) => s.setAgentBackupPath);
  const autoCheckUpdates = useAppStore((s) => s.autoCheckUpdates);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const setUpdateAvailable = useAppStore((s) => s.setUpdateAvailable);

  const activeSkill = activeSession?.skillId
    ? skills.find((s) => s.id === activeSession.skillId)
    : null;

  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const filteredSkills = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase().trim();
    if (!q) return skills;
    return skills.filter(
      (sk) =>
        sk.name.toLowerCase().includes(q) ||
        sk.systemPrompt.toLowerCase().includes(q)
    );
  }, [skills, mentionQuery]);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isDockVisible, setIsDockVisible] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [agentActivity, setAgentActivity] = useState<string | null>(null);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null);
  const modelSelectRef = useRef<HTMLSelectElement>(null);

  const clearAttachments = () => {
    setAttachments((prev) => {
      for (const att of prev) {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      }
      return [];
    });
  };

  const handleOpenGeminiWeb = async (forceBrowser = false) => {
    // On macOS, Google's OAuth engine strictly blocks sign-in inside embedded WKWebView.
    // Opening directly in their default browser (Safari/Chrome) lets them use their existing Google session seamlessly.
    if (forceBrowser || isMac) {
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl("https://gemini.google.com/app");
      } catch (err: any) {
        setLocalError(`Failed to open in browser: ${err?.message || err}`);
      }
      return;
    }

    try {
      await invoke("open_gemini_web_window");
    } catch (e: any) {
      console.warn("Embedded Gemini Web window failed, falling back to browser:", e);
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl("https://gemini.google.com/app");
      } catch (browserErr: any) {
        setLocalError(`Failed to open Gemini Web: ${browserErr?.message || browserErr}`);
      }
    }
  };

  const handleSelectWorkspace = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Local Project Workspace",
      });
      if (!selected || typeof selected !== "string") return;

      setAgentWorkspace(selected);
      setLocalError(null);

      // By default after permission is granted, KeyLooper first creates a backup
      // of the original folder with __BACKUP_FOLDER appended before working inside it
      try {
        const backupPath = await invoke<string>("agent_create_backup", {
          workspacePath: selected,
        });
        setAgentBackupPath(backupPath);

        let curSessionId = activeSessionId;
        if (!curSessionId) {
          curSessionId = createSession();
        }
        setSessionWorkspace(curSessionId, selected);

        appendMessage(curSessionId, {
          role: "model",
          parts: [
            {
              text: `🛡️ **Workspace Connected & Safety Backup Created**\n\n• **Active Workspace:** \`${selected}\`\n• **Safety Backup:** \`${backupPath}\`\n\nKeyLooper has secured your project with a complete \`__BACKUP_FOLDER\` snapshot before any operations begin. The autonomous agent is now scoped to read and edit files in this folder. You can restore your project snapshot at any time.`,
            },
          ],
        });
      } catch (backupErr: any) {
        console.error("Backup creation error:", backupErr);
        setLocalError(
          `Workspace connected, but backup creation failed: ${
            backupErr?.message || backupErr
          }`
        );
      }
    } catch (err: any) {
      console.error("Directory selection error:", err);
      setLocalError(`Could not open directory picker: ${err?.message || err}`);
    }
  };

  const handleRefreshBackup = async () => {
    if (!agentWorkspace) return;
    try {
      const backupPath = await invoke<string>("agent_create_backup", {
        workspacePath: agentWorkspace,
      });
      setAgentBackupPath(backupPath);
      if (activeSessionId) {
        appendMessage(activeSessionId, {
          role: "model",
          parts: [
            {
              text: `📦 **Safety Backup Refreshed**\n\nUpdated snapshot at:\n\`${backupPath}\``,
            },
          ],
        });
      }
    } catch (err: any) {
      setLocalError(`Failed to refresh backup: ${err?.message || err}`);
    }
  };

  const handleRestoreBackup = async () => {
    if (!agentWorkspace) return;
    const confirmed = window.confirm(
      `Are you sure you want to restore workspace "${agentWorkspace}" from its "__BACKUP_FOLDER"?\nThis will restore all files to the safety snapshot.`
    );
    if (!confirmed) return;
    try {
      const msg = await invoke<string>("agent_restore_backup", {
        workspacePath: agentWorkspace,
      });
      if (activeSessionId) {
        appendMessage(activeSessionId, {
          role: "model",
          parts: [
            {
              text: `⏪ **Workspace Restored Successfully**\n\n${msg}`,
            },
          ],
        });
      }
    } catch (err: any) {
      setLocalError(`Failed to restore backup: ${err?.message || err}`);
    }
  };

  const handleDisconnectWorkspace = () => {
    setAgentWorkspace(null);
    setAgentBackupPath(null);
    if (activeSessionId) {
      appendMessage(activeSessionId, {
        role: "model",
        parts: [
          {
            text: `📁 **Workspace Disconnected**\n\nAutonomous local file access has been removed.`,
          },
        ],
      });
    }
  };

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    listen("open-settings", () => setView("settings"))
      .then((fn) => {
        unlistenFn = fn;
      })
      .catch(() => {});
    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [setView]);

  const toggleRecording = () => {
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setLocalError("Speech recognition is not supported in this browser environment.");
        return;
      }
      if (isRecording) {
        recognitionRef.current?.stop();
        setIsRecording(false);
      } else {
        if (!recognitionRef.current) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "en-US";

          recognition.onstart = () => setIsRecording(true);
          recognition.onend = () => setIsRecording(false);
          recognition.onerror = (e: any) => {
            console.error("Speech recognition error:", e);
            setIsRecording(false);
          };
          recognition.onresult = (e: any) => {
            let finalSegment = "";
            for (let i = e.resultIndex; i < e.results.length; ++i) {
              if (e.results[i].isFinal) {
                finalSegment += e.results[i][0].transcript;
              }
            }
            if (finalSegment) {
              setText(
                (prev) => prev + (prev && !prev.endsWith(" ") ? " " : "") + finalSegment
              );
            }
          };
          recognitionRef.current = recognition;
        }
        recognitionRef.current.start();
        setIsRecording(true);
      }
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      setIsRecording(false);
      setLocalError("Speech recognition could not be started in this environment.");
    }
  };

  const handleNewChat = () => {
    createSession();
    setLocalError(null);
    setText("");
    clearAttachments();
    setView("chat");
    setTimeout(() => inputTextareaRef.current?.focus(), 40);
  };

  // Global Keyboard Shortcuts (Driven by customizable store bindings)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (matchesShortcut(e, shortcuts.newChat)) {
        e.preventDefault();
        handleNewChat();
      } else if (matchesShortcut(e, shortcuts.toggleHistory)) {
        e.preventDefault();
        toggleSidebar();
      } else if (matchesShortcut(e, shortcuts.openSettings)) {
        e.preventDefault();
        setView(currentView === "settings" ? "chat" : "settings");
      } else if (matchesShortcut(e, shortcuts.openSkills)) {
        e.preventDefault();
        setView(currentView === "skills" ? "chat" : "skills");
      } else if (matchesShortcut(e, shortcuts.toggleTheme)) {
        e.preventDefault();
        toggleTheme();
      } else if (matchesShortcut(e, shortcuts.toggleDock)) {
        e.preventDefault();
        setIsDockVisible((v) => !v);
      } else if (matchesShortcut(e, shortcuts.toggleVoice)) {
        e.preventDefault();
        toggleRecording();
      } else if (matchesShortcut(e, shortcuts.openGeminiWeb)) {
        e.preventDefault();
        handleOpenGeminiWeb();
      } else if (matchesShortcut(e, shortcuts.selectWorkspace)) {
        e.preventDefault();
        handleSelectWorkspace();
      } else if (matchesShortcut(e, shortcuts.switchModel)) {
        e.preventDefault();
        const sel = modelSelectRef.current;
        if (sel) {
          sel.focus();
          if (typeof (sel as any).showPicker === "function") {
            try {
              (sel as any).showPicker();
            } catch {
              sel.click();
            }
          } else {
            sel.click();
          }
        }
      } else if (matchesShortcut(e, shortcuts.cycleMode)) {
        e.preventDefault();
        const order: ("normal" | "unlimited" | "pro")[] = ["normal", "unlimited", "pro"];
        const nextMode = order[(order.indexOf(mode) + 1) % order.length];
        setMode(nextMode);
      } else if (matchesShortcut(e, shortcuts.clearChat)) {
        e.preventDefault();
        if (activeSessionId) {
          clearSessionMessages(activeSessionId);
          setLocalError(null);
        }
      } else if (matchesShortcut(e, shortcuts.focusInput)) {
        e.preventDefault();
        if (currentView !== "chat") setView("chat");
        setTimeout(() => inputTextareaRef.current?.focus(), 30);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    shortcuts,
    currentView,
    mode,
    activeSessionId,
    toggleSidebar,
    setView,
    toggleTheme,
    setMode,
    clearSessionMessages,
    agentWorkspace,
  ]);

  // Sync theme
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Auto-resize textarea dynamically
  useEffect(() => {
    const el = inputTextareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [text, currentView, activeSession?.messages.length]);

  useEffect(() => {
    if (!isLoading && currentView === "chat") {
      inputTextareaRef.current?.focus();
    }
  }, [isLoading, currentView]);

  useEffect(() => {
    if (!activeSessionId) createSession();
  }, [activeSessionId, createSession]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages.length]);

  // Check for software updates on app startup if enabled
  useEffect(() => {
    if (!autoCheckUpdates) return;
    const timer = setTimeout(() => {
      checkForAppUpdate()
        .then(({ update }) => {
          if (update) {
            setUpdateAvailable(update.version);
          }
        })
        .catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, [autoCheckUpdates, setUpdateAvailable]);

  // Restore custom skills from OS app data directory (recovers custom skills if webview cache was reset on app update)
  useEffect(() => {
    if (typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)) {
      invoke<string>("load_custom_skills")
        .then((json) => {
          if (!json || json === "[]") return;
          try {
            const diskSkills = JSON.parse(json);
            if (Array.isArray(diskSkills) && diskSkills.length > 0) {
              useAppStore.setState((s) => {
                const currentIds = new Set(s.skills.map((sk) => sk.id));
                const missing = diskSkills.filter((sk: any) => sk && sk.id && !currentIds.has(sk.id));
                if (missing.length > 0) {
                  return { skills: [...s.skills, ...missing] };
                }
                return s;
              });
            }
          } catch (_) {}
        })
        .catch(() => {});
    }
  }, []);

  const handleAttach = async (files: FileList | File[]) => {
    setIsAttaching(true);
    setLocalError(null);
    for (const file of Array.from(files)) {
      try {
        if (requiresGeminiFileApi(file)) {
          setAttachments((prev) => [
            ...prev,
            { file, previewUrl: null, parts: [], uploadProgress: 0 },
          ]);

          const state = useAppStore.getState();
          let uploadKeyId: string;
          if (state.mode === "pro") {
            if (!state.proApiKey) {
              throw new Error(
                "Pro Mode is active, but no Pro API Key is configured in Settings."
              );
            }
            uploadKeyId = state.proApiKey.id;
          } else {
            const rotator = new KeyRotator(state.apiKeys);
            rotator.setCurrentIndex(state.rotationIndex);
            const entry =
              state.mode === "unlimited"
                ? rotator.getNextKey()
                : rotator.getActiveKey();
            if (!entry)
              throw new Error(
                "No active API key available to upload media/PDF files."
              );
            uploadKeyId = entry.id;
          }

          const rawKeyValue = await invoke<string>("load_api_key", {
            keyId: uploadKeyId,
          });
          if (!rawKeyValue) {
            throw new Error("Selected API key is empty in OS Keyring.");
          }

          const { fileUri, mimeType } = await uploadFileToGemini(
            file,
            rawKeyValue,
            (prog) => {
              setAttachments((prev) =>
                prev.map((a) =>
                  a.file === file ? { ...a, uploadProgress: prog } : a
                )
              );
            }
          );

          setAttachments((prev) =>
            prev.map((a) =>
              a.file === file
                ? {
                    ...a,
                    uploadProgress: 100,
                    parts: [{ fileData: { mimeType, fileUri }, uploadKeyId }],
                  }
                : a
            )
          );
        } else {
          const parts = await processFile(file);
          setAttachments((prev) => [
            ...prev,
            { file, previewUrl: getPreviewUrl(file), parts },
          ]);
        }
      } catch (e) {
        console.error(e);
        setLocalError(
          e instanceof Error
            ? `Attachment failed: ${e.message}`
            : "Failed to attach file."
        );
        setAttachments((prev) => prev.filter((a) => a.file !== file));
      }
    }
    setIsAttaching(false);
  };

  const removeAttachment = (i: number) => {
    setAttachments((prev) => {
      const r = prev[i];
      if (r?.previewUrl) URL.revokeObjectURL(r.previewUrl);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData?.items) {
      const files: File[] = [];
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        if (e.clipboardData.items[i].kind === "file") {
          const file = e.clipboardData.items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        handleAttach(files);
      }
    }
  };

  /** Unified Gemini API dispatcher used by Send, Edit, and Resend. */
  const executeConversationTurn = async (
    sessionId: string,
    userMsgIndex: number,
    history: ChatMessage[],
    userParts: ChatPart[]
  ) => {
    setLoading(true);
    setLocalError(null);

    const state = useAppStore.getState();
    const rotator = new KeyRotator(state.apiKeys);
    rotator.setCurrentIndex(state.rotationIndex);

    try {
      const modelConfig = state.modelConfigs[state.selectedModel];
      const sessionObj = state.sessions.find((s) => s.id === sessionId);
      const skill = sessionObj?.skillId
        ? state.skills.find((s) => s.id === sessionObj.skillId)
        : undefined;
      const systemPrompt = skill?.systemPrompt;
      const startTime = Date.now();

      const response = await sendMessage({
        model: state.selectedModel,
        history,
        userParts,
        rotator,
        mode: state.mode,
        modelConfig,
        systemPrompt,
        proApiKeyId: state.proApiKey?.id,
        proApiKeyName: state.proApiKey?.name,
        agentWorkspace: state.agentWorkspace,
        onToolActivity: (act) => setAgentActivity(act),
      });

      const latencyMs = Date.now() - startTime;

      if (userMsgIndex >= 0) {
        updateMessageMetadata(sessionId, userMsgIndex, {
          modelName: state.selectedModel,
          apiKeyName: response.usedKeyName,
          ...(response.usage
            ? { usage: { promptTokens: response.usage.promptTokens } }
            : {}),
        });
      }

      appendMessage(sessionId, {
        role: "model",
        parts: [{ text: response.text }],
        modelName: state.selectedModel,
        apiKeyName: response.usedKeyName,
        usage: {
          completionTokens: response.usage?.completionTokens,
          totalTokens: response.usage?.totalTokens,
          latencyMs,
        },
      });

      if (response.usage) {
        recordUsage({
          apiKeyId: response.usedKeyId,
          apiKeyName: response.usedKeyName,
          model: state.selectedModel,
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        });
      }
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setAgentActivity(null);
      // Always persist rotator status mutations (rate-limit cooldowns / invalid flags) & index
      syncApiKeys(rotator.pool);
      setRotationIndex(rotator.getCurrentIndex());
      setLoading(false);
    }
  };

  const handleSend = async (prefill?: string) => {
    const msg = (prefill ?? text).trim();
    if (!msg && attachments.length === 0) return;

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      currentSessionId = createSession();
    }

    if (msg.toLowerCase() === "/clear") {
      clearSessionMessages(currentSessionId);
      appendMessage(currentSessionId, {
        role: "model",
        parts: [{ text: "Memory cleared. How can I help you today?" }],
      });
      setText("");
      clearAttachments();
      return;
    }

    const currentSession = useAppStore
      .getState()
      .sessions.find((s) => s.id === currentSessionId);

    // If message starts with or mentions a skill name (@SkillName), bind it to session
    const directMentionMatch = msg.match(/^@([a-zA-Z0-9_\-\s]{2,30}?)(?:\s|$)/);
    if (directMentionMatch && !currentSession?.skillId) {
      const candidate = directMentionMatch[1].trim().toLowerCase();
      const matchedSkill = skills.find(
        (sk) => sk.name.toLowerCase() === candidate
      );
      if (matchedSkill) {
        setSessionSkill(currentSessionId, matchedSkill.id);
      }
    }

    const history = (currentSession?.messages ?? []).slice(-20);
    const userMsgIndex = currentSession ? currentSession.messages.length : 0;

    const userParts: ChatPart[] = [
      ...attachments.flatMap((a) => a.parts),
      ...(msg ? [{ text: msg }] : []),
    ];

    appendMessage(currentSessionId, { role: "user", parts: userParts });
    setText("");
    setMentionQuery(null);
    clearAttachments();

    await executeConversationTurn(
      currentSessionId,
      userMsgIndex,
      history,
      userParts
    );
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    const cursorPos = e.target.selectionStart ?? val.length;
    const textUpToCursor = val.slice(0, cursorPos);

    const match = textUpToCursor.match(/(?:^|\s)@([a-zA-Z0-9_\-\s]{0,30})$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const selectMentionSkill = (skill: (typeof skills)[number]) => {
    let curSessionId = activeSessionId;
    if (!curSessionId) {
      curSessionId = createSession(skill.id);
    } else {
      setSessionSkill(curSessionId, skill.id);
    }

    const el = inputTextareaRef.current;
    const cursorPos = el ? el.selectionStart : text.length;
    const textUpToCursor = text.slice(0, cursorPos);
    const textAfterCursor = text.slice(cursorPos);

    const match = textUpToCursor.match(/(?:^|\s)@([a-zA-Z0-9_\-\s]{0,30})$/);
    if (match) {
      const atIdx = textUpToCursor.lastIndexOf("@");
      const prefix = text.slice(0, atIdx);
      const replacement = `@${skill.name} `;
      const newFullText = prefix + replacement + textAfterCursor;
      setText(newFullText);

      const newPos = prefix.length + replacement.length;
      setTimeout(() => {
        if (inputTextareaRef.current) {
          inputTextareaRef.current.focus();
          inputTextareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 20);
    }

    setMentionQuery(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) =>
          filteredSkills.length > 0 ? (i + 1) % filteredSkills.length : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) =>
          filteredSkills.length > 0
            ? (i - 1 + filteredSkills.length) % filteredSkills.length
            : 0
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (filteredSkills.length > 0) {
          e.preventDefault();
          selectMentionSkill(filteredSkills[mentionIndex] || filteredSkills[0]);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    const sendBinding = shortcuts.sendMessage || "Enter";
    if (
      matchesShortcut(e, sendBinding) ||
      (e.key === "Enter" && (e.ctrlKey || e.metaKey))
    ) {
      e.preventDefault();
      handleSend();
    }
  };

  const messages = activeSession?.messages ?? [];
  const hasChat = messages.length > 0;
  const canSend =
    (text.trim().length > 0 || attachments.length > 0) &&
    !isLoading &&
    attachments.every(
      (a) => a.uploadProgress === undefined || a.uploadProgress === 100
    );

  // Reusable Input Box (shared between Welcome and Active Chat views)
  const renderInputCard = (isWelcome: boolean) => (
    <div style={{ maxWidth: "760px", margin: "0 auto", width: "100%" }}>
      {attachments.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "10px",
          }}
        >
          {attachments.map((att, i) => (
            <div
              key={i}
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: "14px",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {att.previewUrl ? (
                <img
                  src={att.previewUrl}
                  alt=""
                  style={{ height: "54px", width: "54px", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    height: "54px",
                    width: "96px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--input-bg)",
                    position: "relative",
                  }}
                >
                  {att.uploadProgress !== undefined &&
                    att.uploadProgress < 100 && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          height: "4px",
                          background: "var(--primary)",
                          width: `${att.uploadProgress}%`,
                          transition: "width 0.2s",
                        }}
                      />
                    )}
                  <Icon name="description" size={18} />
                  <p
                    style={{
                      fontSize: "9px",
                      color: "var(--text-color-muted)",
                      marginTop: "2px",
                      maxWidth: "82px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      margin: 0,
                    }}
                  >
                    {att.uploadProgress !== undefined &&
                    att.uploadProgress < 100
                      ? `${att.uploadProgress}%`
                      : att.file.name}
                  </p>
                </div>
              )}
              <button
                onClick={() => removeAttachment(i)}
                style={{
                  position: "absolute",
                  top: "4px",
                  right: "4px",
                  width: "18px",
                  height: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.5)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Icon
                  name="close"
                  size={11}
                  style={{ color: "white" } as React.CSSProperties}
                />
              </button>
            </div>
          ))}
        </div>
      )}

      {agentActivity && (
        <div
          className="flex items-center justify-center gap-2 mb-2 px-3.5 py-1.5 rounded-full text-xs mx-auto w-fit shadow-md animate-pulse"
          style={{
            background: "var(--input-bg)",
            border: "1px solid var(--border-color)",
            color: "var(--primary)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <Icon name="sync" size={14} className="animate-spin" />
          <span>{agentActivity}</span>
        </div>
      )}

      <div
        className="input-card"
        style={{
          padding: isWelcome ? "16px 20px 12px 20px" : "10px 16px",
          position: "relative",
        }}
      >
        {/* Mention popup for @ skill selection */}
        {mentionQuery !== null && (
          <div
            className="mention-popup fade-in"
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: 0,
              right: 0,
              maxHeight: "270px",
              overflowY: "auto",
              background: "var(--input-bg)",
              border: "1px solid var(--border-color)",
              borderRadius: "14px",
              boxShadow: "0 12px 36px rgba(0,0,0,0.28)",
              zIndex: 100,
              padding: "6px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              backdropFilter: "blur(14px)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 10px 4px 10px",
                borderBottom: "1px solid var(--border-color)",
                marginBottom: "4px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Icon
                  name="smart_toy"
                  size={15}
                  style={{ color: "var(--primary)" }}
                />
                <span
                  style={{
                    fontSize: "11px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "var(--text-color-muted)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Agent Skills ({filteredSkills.length})
                </span>
              </div>
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "var(--text-color-muted)",
                }}
              >
                ↑↓ Navigate • ↵ Select • Esc Close
              </span>
            </div>

            {filteredSkills.length === 0 ? (
              <div
                style={{
                  padding: "16px 12px",
                  textAlign: "center",
                  color: "var(--text-color-muted)",
                  fontSize: "13px",
                }}
              >
                No agent matching "{mentionQuery}".
                <div style={{ marginTop: "6px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMentionQuery(null);
                      setView("skills");
                    }}
                    style={{
                      padding: "4px 12px",
                      borderRadius: "6px",
                      background: "var(--primary)",
                      color: "white",
                      border: "none",
                      fontSize: "11px",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    + Create or Import Skill
                  </button>
                </div>
              </div>
            ) : (
              filteredSkills.map((sk, idx) => {
                const isFocused = idx === mentionIndex;
                return (
                  <div
                    key={sk.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectMentionSkill(sk);
                    }}
                    onMouseEnter={() => setMentionIndex(idx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      background: isFocused
                        ? "var(--border-color)"
                        : "transparent",
                      transition: "background 0.1s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "7px",
                          background: isFocused
                            ? "var(--primary)"
                            : "rgba(177,98,77,0.15)",
                          color: isFocused ? "white" : "var(--primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon name="smart_toy" size={16} />
                      </div>
                      <div
                        style={{
                          minWidth: 0,
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--text-color)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {sk.name}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--text-color-muted)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "460px",
                          }}
                        >
                          {sk.systemPrompt}
                        </span>
                      </div>
                    </div>
                    {isFocused && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontFamily: "'JetBrains Mono', monospace",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: "var(--primary)",
                          color: "white",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        ↵ Select
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Active Attached Skill Badge */}
        {activeSkill && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "2px 8px",
              borderRadius: "20px",
              background: "var(--primary)",
              color: "white",
              width: "fit-content",
              marginBottom: "6px",
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
            }}
          >
            <Icon name="smart_toy" size={13} />
            <span>Agent: {activeSkill.name}</span>
            <button
              onClick={() => {
                if (activeSessionId)
                  setSessionSkill(activeSessionId, undefined);
              }}
              title="Detach agent persona"
              style={{
                background: "transparent",
                border: "none",
                color: "white",
                cursor: "pointer",
                padding: "0 2px",
                display: "flex",
                alignItems: "center",
                opacity: 0.8,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "0.8";
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        )}

        <textarea
          ref={inputTextareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            setTimeout(() => setMentionQuery(null), 180);
          }}
          disabled={isLoading}
          placeholder={
            isWelcome
              ? "How can I help you today? (Type @ to invoke an agent skill)"
              : "Continue the conversation… (Type @ for agents)"
          }
          rows={1}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            fontFamily: "'Crimson Pro', serif",
            fontSize: isWelcome ? "17px" : "15.5px",
            lineHeight: isWelcome ? "25px" : "22px",
            color: "var(--text-color)",
            caretColor: "var(--primary)",
          }}
        />

        <div
          className="flex items-center justify-between"
          style={{ marginTop: isWelcome ? "10px" : "6px" }}
        >
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isAttaching}
            title="Attach file (or paste from clipboard)"
            className={`flex items-center justify-center rounded-full transition-colors ${
              isAttaching ? "animate-pulse" : ""
            }`}
            style={{
              width: "34px",
              height: "34px",
              border: "1px solid var(--border-color)",
              color: isAttaching ? "var(--primary)" : "var(--text-color-muted)",
              background: "transparent",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              if (!isAttaching) e.currentTarget.style.background = "var(--input-bg)";
            }}
            onMouseLeave={(e) => {
              if (!isAttaching) e.currentTarget.style.background = "transparent";
            }}
          >
            <Icon name="add" size={18} />
          </button>

          <div
            className="flex items-center"
            style={{ gap: "8px" }}
          >
            {/* Model selector pill */}
            <div
              className="relative flex items-center rounded-full cursor-pointer transition-colors"
              style={{
                padding: "4px 10px 4px 10px",
                background: "var(--bg-color)",
                border: "1px solid var(--border-color)",
                gap: "5px",
              }}
              title={`Select Model (${formatShortcutForDisplay(shortcuts.switchModel)})`}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "11.5px",
                  fontWeight: 500,
                  color: "var(--text-color-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {modelLabel(selectedModel)}
              </span>
              <select
                ref={modelSelectRef}
                value={selectedModel}
                onChange={(e) => setModel(e.target.value)}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: 0,
                  cursor: "pointer",
                  width: "100%",
                  height: "100%",
                }}
              >
                {availableModels.map((m) => (
                  <option
                    key={m}
                    value={m}
                    style={{
                      background: "var(--bg-color)",
                      color: "var(--text-color)",
                    }}
                  >
                    {modelLabel(m)}
                  </option>
                ))}
              </select>
              <Icon
                name="expand_more"
                size={14}
                style={{ color: "var(--text-color-muted)" }}
              />
            </div>

            {/* Mic */}
            <button
              onClick={toggleRecording}
              title={`Voice Dictation (${formatShortcutForDisplay(shortcuts.toggleVoice)})`}
              className="flex items-center justify-center rounded-full transition-colors"
              style={{
                width: "34px",
                height: "34px",
                border: "1px solid var(--border-color)",
                color: isRecording ? "var(--primary)" : "var(--text-color-muted)",
                background: isRecording ? "var(--glow-color)" : "transparent",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                if (!isRecording)
                  e.currentTarget.style.background = "var(--input-bg)";
              }}
              onMouseLeave={(e) => {
                if (!isRecording) e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon
                name={isRecording ? "mic" : "mic_none"}
                size={17}
              />
            </button>

            {/* Send */}
            <button
              onClick={() => handleSend()}
              disabled={!canSend}
              title={`Send Message (${formatShortcutForDisplay(shortcuts.sendMessage)})`}
              className="flex items-center justify-center rounded-full transition-all"
              style={{
                width: "34px",
                height: "34px",
                background: canSend ? "#b1624d" : "rgba(177,98,77,0.25)",
                color: "white",
                border: "none",
                boxShadow: canSend
                  ? "0 3px 10px rgba(177,98,77,0.25)"
                  : "none",
                cursor: canSend ? "pointer" : "not-allowed",
              }}
            >
              <Icon name="send" filled size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden ${isMac ? "macos-window-frame" : ""}`}
      style={{
        backgroundColor: "var(--bg-color)",
        backgroundImage: "var(--bg-image)",
        color: "var(--text-color)",
        fontFamily: "'Crimson Pro', Georgia, serif",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files.length) handleAttach(e.dataTransfer.files);
      }}
    >
      <TitleBar />

      {/* ════════════════════════════════════════════════
          HEADER — Sidebar toggle + Logo + Mode Switcher + Key Health + Theme
      ════════════════════════════════════════════════ */}
      <header
        data-tauri-drag-region
        onMouseDown={async (e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest("button, input, select, textarea, a")) {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            try { await getCurrentWindow().startDragging(); } catch (_) {}
          }
        }}
        className="flex-shrink-0 flex items-center justify-between"
        style={{
          borderBottom: "1px solid var(--border-color)",
          paddingLeft: "20px",
          paddingRight: "24px",
          height: "60px",
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
      >
        {/* Left: Sidebar Toggle + Logo + Workspace Chip */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            title={`${isSidebarOpen ? "Hide" : "Show"} History (${formatShortcutForDisplay(shortcuts.toggleHistory)})`}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
            style={{
              border: "1px solid var(--border-color)",
              background: isSidebarOpen ? "var(--input-bg)" : "transparent",
              color: isSidebarOpen ? "var(--primary)" : "var(--text-color-muted)",
              cursor: "pointer",
            }}
          >
            <Icon
              name={isSidebarOpen ? "left_panel_close" : "left_panel_open"}
              size={19}
            />
          </button>

          <span
            onClick={() => setView("chat")}
            style={{
              fontFamily: "'Crimson Pro', serif",
              fontSize: "24px",
              fontWeight: 700,
              fontStyle: "italic",
              color: "var(--primary)",
              letterSpacing: "-0.01em",
              cursor: "pointer",
            }}
          >
            KeyLooper
          </span>

          {/* Active Workspace / Local File Agent Badge */}
          {agentWorkspace ? (
            <div className="relative">
              <button
                onClick={() => setShowWorkspaceMenu((v) => !v)}
                title={`Active Workspace: ${agentWorkspace}\nClick to manage backup & actions`}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors"
                style={{
                  border: "1px solid var(--border-color)",
                  background: "var(--input-bg)",
                  color: "var(--text-color)",
                  cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "11px",
                }}
              >
                <Icon name="folder_open" size={15} style={{ color: "var(--primary)" }} />
                <span className="font-semibold max-w-[120px] truncate">
                  {agentWorkspace.split(/[\\/]/).filter(Boolean).pop()}
                </span>
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "999px",
                    background: "#6b8a7a",
                  }}
                  title="Backup Protected"
                />
                <Icon
                  name="expand_more"
                  size={14}
                  style={{ color: "var(--text-color-muted)" }}
                />
              </button>

              {showWorkspaceMenu && (
                <div
                  className="absolute left-0 mt-2 z-50 rounded-xl shadow-xl p-3 flex flex-col gap-2 fade-in"
                  style={{
                    width: "300px",
                    background: "var(--bg-color)",
                    border: "1px solid var(--border-color)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <div className="text-[11px] text-[var(--text-color-muted)] leading-tight">
                    <div className="font-bold text-[var(--text-color)] mb-1">
                      Active Local Workspace
                    </div>
                    <div className="truncate text-[10px] select-all bg-[var(--input-bg)] p-1 rounded font-mono border border-[var(--border-color)]">
                      {agentWorkspace}
                    </div>
                    {agentBackupPath && (
                      <div className="mt-1.5">
                        <div className="font-semibold text-[#6b8a7a] flex items-center gap-1">
                          <Icon name="verified_user" size={13} />
                          <span>Backup Created</span>
                        </div>
                        <div className="truncate text-[9.5px] select-all bg-[var(--input-bg)] p-1 rounded font-mono border border-[var(--border-color)] mt-0.5">
                          {agentBackupPath}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="h-px bg-[var(--border-color)] my-0.5" />
                  <button
                    onClick={() => {
                      setShowWorkspaceMenu(false);
                      handleRefreshBackup();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-[var(--input-bg)] transition-colors cursor-pointer text-left"
                  >
                    <Icon name="refresh" size={15} />
                    <span>Refresh Safety Backup</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowWorkspaceMenu(false);
                      handleRestoreBackup();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-[var(--input-bg)] text-[#ba1a1a] transition-colors cursor-pointer text-left"
                  >
                    <Icon name="history" size={15} />
                    <span>Restore Original Project</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowWorkspaceMenu(false);
                      handleSelectWorkspace();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-[var(--input-bg)] transition-colors cursor-pointer text-left"
                  >
                    <Icon name="drive_file_move" size={15} />
                    <span>Switch Folder...</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowWorkspaceMenu(false);
                      handleDisconnectWorkspace();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-[var(--input-bg)] text-[var(--text-color-muted)] transition-colors cursor-pointer text-left"
                  >
                    <Icon name="close" size={15} />
                    <span>Disconnect Workspace</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleSelectWorkspace}
              title={`Connect Local Project Workspace (${formatShortcutForDisplay(shortcuts.selectWorkspace)})`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors"
              style={{
                border: "1px dashed var(--border-color)",
                background: "transparent",
                color: "var(--text-color-muted)",
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "11px",
              }}
            >
              <Icon name="folder_open" size={15} />
              <span>+ Workspace</span>
            </button>
          )}
        </div>

        {/* Center: Normal / Unlimited / Pro mode switcher */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "var(--switcher-bg)",
            border: "1px solid var(--switcher-border)",
            borderRadius: "9999px",
            padding: "3px",
          }}
        >
          {(["normal", "unlimited", "pro"] as const).map((m, idx) => (
            <React.Fragment key={m}>
              {idx > 0 && (
                <span
                  style={{
                    color: "var(--switcher-border)",
                    margin: "0 4px",
                    userSelect: "none",
                    fontSize: "11px",
                  }}
                >
                  |
                </span>
              )}
              <button
                onClick={() => setMode(m)}
                className={mode === m ? "shadow-sm glow-unlimited" : ""}
                style={{
                  fontFamily: "'Crimson Pro', serif",
                  fontSize: "13px",
                  fontWeight: mode === m ? 600 : 500,
                  color:
                    mode === m
                      ? m === "pro"
                        ? "#d4af37"
                        : "var(--switcher-btn-color)"
                      : "var(--text-color-muted)",
                  background:
                    mode === m ? "var(--switcher-btn-bg)" : "transparent",
                  border: "none",
                  borderRadius: "9999px",
                  padding: "4px 14px",
                  cursor: mode === m ? "default" : "pointer",
                  lineHeight: "1",
                }}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Right: Gemini Web + Healthy key counter + Light/Dark Mode toggler */}
        <div className="flex items-center gap-2.5">
          {/* Gemini Web Button */}
          <button
            onClick={(e) => handleOpenGeminiWeb(e.shiftKey || e.ctrlKey)}
            onContextMenu={(e) => {
              e.preventDefault();
              handleOpenGeminiWeb(true);
            }}
            title={`Open Google Gemini Web (${formatShortcutForDisplay(shortcuts.openGeminiWeb)}) — Right-click or Shift-click to open in external browser`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all hover:scale-105 active:scale-95 shadow-sm"
            style={{
              border: "1px solid var(--border-color)",
              background: "var(--tertiary-fixed)",
              color: "var(--text-color)",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            <Icon name="auto_awesome" size={15} style={{ color: "var(--primary)" }} />
            <span>Gemini Web</span>
          </button>

          <button
            onClick={() => setView("settings")}
            title="Active API Keys in Pool (Click to configure)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "999px",
              border: "1px solid var(--border-color)",
              background: "var(--input-bg)",
              cursor: "pointer",
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--text-color-muted)",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "999px",
                background:
                  healthyKeyCount === 0
                    ? "#ba1a1a"
                    : healthyKeyCount < apiKeys.length
                    ? "#c9a227"
                    : "#6b8a7a",
              }}
            />
            <span>
              {healthyKeyCount}/{apiKeys.length} keys
            </span>
          </button>

          <button
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-colors"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--text-color-muted)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--tertiary-fixed)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            title={`Toggle Theme (${formatShortcutForDisplay(shortcuts.toggleTheme)})`}
          >
            <Icon
              name={theme === "light" ? "light_mode" : "dark_mode"}
              size={20}
            />
          </button>
        </div>
      </header>

      {/* ════════════════════════════════════════════════
          BODY — Collapsible Left History Panel + Main View
      ════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar onNewChat={handleNewChat} />

        <main
          className="flex-1 overflow-y-auto flex flex-col relative"
          style={{ paddingBottom: currentView === "chat" ? "0px" : "96px" }}
        >
          {currentView === "settings" ? (
            <SettingsView />
          ) : currentView === "skills" ? (
            <SkillsView />
          ) : !hasChat ? (
            /* ──────────────────────────────────────────
               WELCOME VIEW — vertically centered
            ────────────────────────────────────────── */
            <div
              className="flex-1 flex flex-col items-center justify-center fade-in"
              style={{
                minHeight: "100%",
                paddingLeft: isSidebarOpen ? "32px" : "24px",
                paddingRight: "24px",
                paddingBottom: "96px",
                transition: "padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <div style={{ color: "var(--tertiary)", marginBottom: "18px" }}>
                <Icon
                  name="spa"
                  thin
                  size={68}
                  className="illustrative-icon"
                />
              </div>

              <h1
                className="text-center fade-in-delay-1"
                style={{
                  fontFamily: "'Crimson Pro', serif",
                  fontSize: "clamp(38px, 5.5vw, 60px)",
                  fontWeight: 700,
                  lineHeight: 1.1,
                  letterSpacing: "-0.04em",
                  color: "var(--text-color)",
                  marginBottom: activeSkill ? "14px" : "32px",
                }}
              >
                Hello,{" "}
                <span
                  style={{
                    fontStyle: "italic",
                    fontWeight: 300,
                    color: "var(--tertiary)",
                  }}
                >
                  {getTimeBasedGreeting()}
                </span>
              </h1>

              {activeSkill && (
                <div
                  className="fade-in-delay-1 flex items-center justify-center gap-2"
                  style={{ marginBottom: "28px" }}
                >
                  <span
                    className="rounded-full text-[14px] font-medium bg-[var(--primary)] text-white inline-flex items-center gap-2 shadow-sm whitespace-nowrap"
                    style={{ padding: "6px 24px" }}
                  >
                    <Icon name="robot_2" size={17} />
                    Chatting with {activeSkill.name}
                  </span>
                </div>
              )}

              <div
                className="w-full fade-in-delay-1"
                style={{ maxWidth: "760px" }}
              >
                {renderInputCard(true)}
              </div>
            </div>
          ) : (
            /* ──────────────────────────────────────────
               ACTIVE CHAT VIEW
            ────────────────────────────────────────── */
            <div className="flex-1 relative overflow-hidden">
              <div
                className="absolute inset-0 overflow-y-auto pt-6"
                style={{
                  paddingLeft: isSidebarOpen ? "32px" : "24px",
                  paddingRight: "24px",
                  paddingBottom: isDockVisible ? "220px" : "140px",
                  transition: "padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                <div
                  style={{
                    maxWidth: "760px",
                    margin: "0 auto",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {messages.map((msg, i) => {
                    const isLast = i === messages.length - 1;
                    const nextMsg = messages[i + 1];
                    const hasErr =
                      isLast && msg.role === "user" && localError !== null;

                    const handleEditMessage = async (newText: string) => {
                      if (!activeSessionId) return;
                      updateMessageText(activeSessionId, i, newText);
                      removeSubsequentMessages(activeSessionId, i);
                      const updatedSession = useAppStore
                        .getState()
                        .sessions.find((s) => s.id === activeSessionId);
                      const userMsg = updatedSession?.messages[i];
                      if (!userMsg) return;
                      const history = (
                        updatedSession?.messages.slice(0, i) ?? []
                      ).slice(-20);
                      await executeConversationTurn(
                        activeSessionId,
                        i,
                        history,
                        userMsg.parts
                      );
                    };

                    const handleResendMessage = async () => {
                      if (!activeSessionId) return;
                      removeSubsequentMessages(activeSessionId, i);
                      const updatedSession = useAppStore
                        .getState()
                        .sessions.find((s) => s.id === activeSessionId);
                      const userMsg = updatedSession?.messages[i];
                      if (!userMsg) return;
                      const history = (
                        updatedSession?.messages.slice(0, i) ?? []
                      ).slice(-20);
                      await executeConversationTurn(
                        activeSessionId,
                        i,
                        history,
                        userMsg.parts
                      );
                    };

                    return (
                      <ChatBubble
                        key={i}
                        message={msg}
                        isLastMessage={
                          isLast || (msg.role === "user" && !nextMsg)
                        }
                        hasError={hasErr}
                        onEdit={
                          msg.role === "user" ? handleEditMessage : undefined
                        }
                        onResend={
                          msg.role === "user" ? handleResendMessage : undefined
                        }
                      />
                    );
                  })}

                  {isLoading && (
                    <div
                      style={{
                        display: "flex",
                        gap: "14px",
                        alignItems: "flex-start",
                        padding: "8px 0",
                      }}
                    >
                      <div
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "9999px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: "4px",
                          background: "var(--tertiary-fixed)",
                          color: "var(--tertiary)",
                        }}
                      >
                        <Icon name="spa" thin size={15} />
                      </div>
                      <div className="bubble-ai" style={{ padding: "14px 18px" }}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {[0, 1, 2].map((j) => (
                            <span
                              key={j}
                              className="animate-bounce"
                              style={{
                                width: "7px",
                                height: "7px",
                                borderRadius: "9999px",
                                background: "rgba(138,129,122,0.45)",
                                animationDelay: `${j * 0.15}s`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEnd} />
                </div>
              </div>

              {/* Active Chat Input Bar */}
              <div
                className="absolute bottom-0 left-0 right-0 pointer-events-none flex flex-col justify-end"
                style={{
                  paddingLeft: isSidebarOpen ? "32px" : "24px",
                  paddingRight: "24px",
                  paddingBottom: isDockVisible ? "78px" : "20px",
                  paddingTop: "16px",
                  zIndex: 10,
                  transition: "padding-bottom 0.35s ease, padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                <div className="pointer-events-auto">
                  {renderInputCard(false)}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ════════════════════════════════════════════════
          LOWER-CENTER ERROR BANNER / TOAST
      ════════════════════════════════════════════════ */}
      {localError && (
        <div
          className="fade-in"
          style={{
            position: "fixed",
            left: isSidebarOpen ? "calc(50% + 130px)" : "50%",
            transform: "translateX(-50%)",
            bottom:
              currentView === "chat" && hasChat
                ? isDockVisible
                  ? "168px"
                  : "110px"
                : isDockVisible
                ? "88px"
                : "28px",
            zIndex: 60,
            maxWidth: "620px",
            width: "calc(100% - 40px)",
            padding: "11px 16px",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "rgba(186, 26, 26, 0.94)",
            color: "#ffffff",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            backdropFilter: "blur(10px)",
          }}
        >
          <Icon name="error" size={19} style={{ color: "#fff", flexShrink: 0 }} />
          <p
            style={{
              flex: 1,
              fontSize: "14px",
              lineHeight: 1.35,
              margin: 0,
              color: "#fff",
              fontFamily: "'Crimson Pro', serif",
            }}
          >
            {localError}
          </p>
          <button
            onClick={() => setLocalError(null)}
            title="Dismiss error"
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              borderRadius: "6px",
              width: "24px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,text/*,.txt,.csv,.md,.json,.ts,.tsx,.js,.jsx,.py,.rs,.html,.css,audio/*,application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
        className="hidden"
        onClick={(e) => {
          (e.target as HTMLInputElement).value = "";
        }}
        onChange={(e) => e.target.files && handleAttach(e.target.files)}
      />

      {/* Drag overlay */}
      {isDragOver && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: "rgba(53, 48, 44, 0.55)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="flex flex-col items-center gap-3 px-10 py-7 rounded-3xl"
            style={{
              border: "2px dashed var(--primary)",
              background: "var(--bg-color)",
            }}
          >
            <Icon
              name="cloud_upload"
              size={40}
              style={{ color: "var(--primary)" }}
            />
            <p
              style={{
                fontFamily: "'Crimson Pro', serif",
                fontSize: "18px",
                color: "var(--primary)",
                fontWeight: 600,
              }}
            >
              Drop files to attach
            </p>
          </div>
        </div>
      )}

      {/* Expand Dock Button */}
      <button
        onClick={() => setIsDockVisible(true)}
        title={`Show Dock (${formatShortcutForDisplay(shortcuts.toggleDock)})`}
        className="fixed z-50 flex items-center justify-center rounded-full shadow-lg transition-all duration-500"
        style={{
          bottom: "16px",
          left: isDockVisible ? "-60px" : "20px",
          width: "44px",
          height: "44px",
          background: "var(--input-bg)",
          border: "1px solid var(--border-color)",
          color: "var(--text-color)",
          opacity: isDockVisible ? 0 : 1,
          backdropFilter: "blur(8px)",
          cursor: "pointer",
        }}
      >
        <Icon name="chevron_right" size={26} />
      </button>

      {/* ════════════════════════════════════════════════
          FLOATING BOTTOM DOCK
      ════════════════════════════════════════════════ */}
      <nav
        className="fixed flex items-center floating-dock rounded-2xl shadow-2xl z-40 transition-all duration-500"
        style={{
          bottom: "16px",
          left: isSidebarOpen ? "calc(50% + 130px)" : "50%",
          transform: isDockVisible ? "translateX(-50%)" : "translateX(-150vw)",
          opacity: isDockVisible ? 1 : 0,
          pointerEvents: isDockVisible ? "auto" : "none",
          padding: "5px 10px",
          gap: "4px",
        }}
      >
        <button
          onClick={() => setIsDockVisible(false)}
          title={`Hide Dock (${formatShortcutForDisplay(shortcuts.toggleDock)})`}
          className="absolute flex items-center justify-center rounded-full shadow transition-colors"
          style={{
            top: "-8px",
            right: "-8px",
            width: "20px",
            height: "20px",
            background: "var(--bg-color)",
            border: "1px solid var(--border-color)",
            color: "var(--text-color-muted)",
            cursor: "pointer",
            zIndex: 10,
          }}
        >
          <Icon name="close" size={12} />
        </button>

        <DockItem
          icon="chat"
          label="CHAT"
          active={currentView === "chat"}
          filled={currentView === "chat"}
          onClick={() => setView("chat")}
        />
        <DockItem
          icon="add"
          label="NEW"
          title={`New Chat (${formatShortcutForDisplay(shortcuts.newChat)})`}
          onClick={handleNewChat}
        />
        <DockItem
          icon="history"
          label="HISTORY"
          active={isSidebarOpen}
          title={`Toggle History Sidebar (${formatShortcutForDisplay(shortcuts.toggleHistory)})`}
          onClick={toggleSidebar}
        />
        <DockItem
          icon="deployed_code"
          label="AGENTS"
          active={currentView === "skills"}
          title={`Agents & Skills (${formatShortcutForDisplay(shortcuts.openSkills)})`}
          onClick={() => setView("skills")}
        />
        <DockItem
          icon="auto_awesome"
          label="WEB"
          title={`Google Gemini Web App (${formatShortcutForDisplay(shortcuts.openGeminiWeb)}) — Right-click or Shift-click to open in external browser`}
          onClick={(e) => handleOpenGeminiWeb(e?.shiftKey || e?.ctrlKey)}
          onContextMenu={(e) => {
            e.preventDefault();
            handleOpenGeminiWeb(true);
          }}
        />

        <div
          style={{
            width: "1px",
            height: "20px",
            background: "var(--border-color)",
            margin: "0 6px",
          }}
        />

        {/* Google AI Studio button */}
        <button
          onClick={async () => {
            try {
              const { openUrl } = await import("@tauri-apps/plugin-opener");
              await openUrl("https://aistudio.google.com/");
            } catch {
              window.open("https://aistudio.google.com/", "_blank");
            }
          }}
          title="Open Google AI Studio (Get API Keys)"
          className="flex items-center justify-center rounded-full font-bold cursor-pointer select-none transition-all hover:scale-105 active:scale-95 shadow-sm"
          style={{
            minWidth: "34px",
            height: "34px",
            padding: "0 8px",
            background: "var(--tertiary-fixed)",
            color: "var(--text-color)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "10.5px",
            fontWeight: 700,
            border: "1px solid var(--border-color)",
            letterSpacing: "0.02em",
          }}
        >
          API
        </button>

        {/* Settings */}
        <button
          onClick={() => setView("settings")}
          title={`Settings (${formatShortcutForDisplay(shortcuts.openSettings)})${updateAvailable ? " • Update Available!" : ""}`}
          className="flex items-center justify-center rounded-full transition-colors"
          style={{
            width: "36px",
            height: "36px",
            color:
              currentView === "settings"
                ? "var(--primary)"
                : "var(--text-color-muted)",
            background:
              currentView === "settings"
                ? "rgba(177,98,77,0.12)"
                : "transparent",
            border: "none",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <Icon name="settings" size={21} />
          {updateAvailable && (
            <span
              style={{
                position: "absolute",
                top: "4px",
                right: "4px",
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "var(--primary)",
                border: "1.5px solid var(--input-bg)",
              }}
            />
          )}
        </button>
      </nav>
    </div>
  );
};

export default App;
