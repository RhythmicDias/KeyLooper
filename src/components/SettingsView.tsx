/**
 * SettingsView.tsx — Compact, high-density settings screen.
 * Tabs: API Keys, Models, Shortcuts, Privacy, Usage.
 */

import React, { useState, useEffect } from "react";
import {
  useAppStore,
  SHORTCUT_LABELS,
  DEFAULT_SHORTCUTS,
  formatShortcutFromEvent,
  formatShortcutForDisplay,
  type ShortcutAction,
} from "../store/useAppStore";
import { testKey } from "../lib/geminiClient";
import type { KeyStatus } from "../lib/KeyRotator";
import { invoke } from "@tauri-apps/api/core";
import { ModelConfigPanel } from "./ModelConfigPanel";
import {
  checkForAppUpdate,
  installAppUpdate,
  restartApp,
} from "../lib/updater";
import type { Update } from "@tauri-apps/plugin-updater";

const STATUS_CFG: Record<KeyStatus, { label: string; color: string; dot: string }> = {
  unchecked: { label: "Unchecked", color: "#8a817a", dot: "#8a817a" },
  valid: { label: "Valid", color: "#344e40", dot: "#6b8a7a" },
  invalid: { label: "Invalid", color: "#ba1a1a", dot: "#ba1a1a" },
  "rate-limited": { label: "Cooldown", color: "#7a5c00", dot: "#c9a227" },
};

const Icon = ({
  name,
  className = "",
  size = 18,
  style,
}: {
  name: string;
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}) => (
  <span
    className={`material-symbols-outlined select-none ${className}`}
    style={{ fontSize: `${size}px`, ...style }}
  >
    {name}
  </span>
);

const SettingsView: React.FC = () => {
  const apiKeys = useAppStore((s) => s.apiKeys);
  const addApiKey = useAppStore((s) => s.addApiKey);
  const removeApiKey = useAppStore((s) => s.removeApiKey);
  const updateKeyName = useAppStore((s) => s.updateKeyName);
  const updateKeyStatus = useAppStore((s) => s.updateKeyStatus);
  const reorderApiKeys = useAppStore((s) => s.reorderApiKeys);
  const reactivateAllKeys = useAppStore((s) => s.reactivateAllKeys);
  const historyEnabled = useAppStore((s) => s.historyEnabled);
  const setHistoryEnabled = useAppStore((s) => s.setHistoryEnabled);
  const sessions = useAppStore((s) => s.sessions);
  const clearAllSessions = useAppStore((s) => s.clearAllSessions);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setView = useAppStore((s) => s.setView);
  const usageRecords = useAppStore((s) => s.usageRecords);
  const clearUsageRecords = useAppStore((s) => s.clearUsageRecords);

  const proApiKey = useAppStore((s) => s.proApiKey);
  const setProApiKey = useAppStore((s) => s.setProApiKey);

  const shortcuts = useAppStore((s) => s.shortcuts);
  const setShortcut = useAppStore((s) => s.setShortcut);
  const resetShortcut = useAppStore((s) => s.resetShortcut);
  const resetAllShortcuts = useAppStore((s) => s.resetAllShortcuts);

  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const agentWorkspace = useAppStore((s) => s.agentWorkspace);
  const setAgentWorkspace = useAppStore((s) => s.setAgentWorkspace);
  const setSessionWorkspace = useAppStore((s) => s.setSessionWorkspace);
  const agentBackupPath = useAppStore((s) => s.agentBackupPath);
  const setAgentBackupPath = useAppStore((s) => s.setAgentBackupPath);

  // Form states
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const activeTab = useAppStore((s) => s.settingsTab);
  const setActiveTab = useAppStore((s) => s.setSettingsTab);
  const [agentNotice, setAgentNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit states for existing keys
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editKey, setEditKey] = useState("");

  const [newProName, setNewProName] = useState("");
  const [newProKey, setNewProKey] = useState("");

  // Updater states & settings
  const autoCheckUpdates = useAppStore((s) => s.autoCheckUpdates);
  const setAutoCheckUpdates = useAppStore((s) => s.setAutoCheckUpdates);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const setUpdateAvailable = useAppStore((s) => s.setUpdateAvailable);

  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error"
  >("idle");
  const [updateObj, setUpdateObj] = useState<Update | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const { update, error } = await checkForAppUpdate();
      if (error) {
        setUpdateStatus("error");
        setUpdateError(error);
        setUpdateAvailable(null);
      } else if (update) {
        setUpdateObj(update);
        setUpdateStatus("available");
        setUpdateAvailable(update.version);
      } else {
        setUpdateStatus("up-to-date");
        setUpdateAvailable(null);
      }
    } catch (err: any) {
      setUpdateStatus("error");
      setUpdateError(err?.message || String(err));
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateObj) return;
    setUpdateStatus("downloading");
    setDownloadProgress(0);
    setUpdateError(null);
    try {
      await installAppUpdate(updateObj, (pct) => {
        setDownloadProgress(pct);
      });
      setUpdateStatus("ready");
    } catch (err: any) {
      setUpdateStatus("error");
      setUpdateError(err?.message || String(err));
    }
  };

  const handleRestart = async () => {
    try {
      await restartApp();
    } catch (err: any) {
      setUpdateError(`Restart failed: ${err?.message || err}`);
    }
  };

  // Shortcut recording state
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(
    null
  );

  useEffect(() => {
    if (!recordingAction) return;
    const handleRecordKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingAction(null);
        return;
      }
      const combo = formatShortcutFromEvent(e);
      if (!combo) return;

      // For non-sendMessage actions, require a modifier key (Ctrl/Alt/Shift) or F-key so plain typing isn't hijacked
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key);
      if (recordingAction !== "sendMessage" && !hasModifier) {
        setFormError(
          `Shortcut "${combo}" must include Ctrl, Alt, or a Function key (F1-F12) so normal typing isn't blocked.`
        );
        return;
      }

      setFormError(null);
      setShortcut(recordingAction, combo);
      setRecordingAction(null);
    };
    window.addEventListener("keydown", handleRecordKeyDown, true);
    return () => window.removeEventListener("keydown", handleRecordKeyDown, true);
  }, [recordingAction, setShortcut]);

  const handleAddKey = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setFormError(null);
    const trimmedName = newName.trim();
    const trimmedKey = newKey.trim();

    if (!trimmedName || !trimmedKey) {
      setFormError("Both Key Name and API Key are required.");
      return;
    }

    const id = addApiKey(trimmedName);
    try {
      await invoke("save_api_key", { keyId: id, keyValue: trimmedKey });
      setNewName("");
      setNewKey("");
    } catch (err) {
      removeApiKey(id);
      setFormError(`Failed to save key securely: ${err}`);
    }
  };

  const handleAddProKey = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setFormError(null);
    const trimmedName = newProName.trim() || "Pro API Key";
    const trimmedKey = newProKey.trim();

    if (!trimmedKey) {
      setFormError("Pro API Key is required.");
      return;
    }

    try {
      const id = crypto.randomUUID();
      await invoke("save_api_key", { keyId: id, keyValue: trimmedKey });

      if (proApiKey) {
        try {
          await invoke("delete_api_key", { keyId: proApiKey.id });
        } catch {}
      }

      setProApiKey({ id, name: trimmedName, status: "unchecked" });
      setNewProName("");
      setNewProKey("");
    } catch (err) {
      setFormError(`Failed to save Pro key securely: ${err}`);
    }
  };

  const handleRemoveProKey = async () => {
    if (proApiKey) {
      try {
        await invoke("delete_api_key", { keyId: proApiKey.id });
      } catch {}
      setProApiKey(null);
    }
  };

  const handleTestProKey = async () => {
    if (!proApiKey) return;
    setTesting((p) => new Set([...p, proApiKey.id]));
    try {
      const rawKey = await invoke<string>("load_api_key", { keyId: proApiKey.id });
      const status = rawKey ? await testKey(rawKey, selectedModel) : "invalid";
      setProApiKey({ ...proApiKey, status });
    } catch {
      setProApiKey({ ...proApiKey, status: "invalid" });
    } finally {
      setTesting((p) => {
        const n = new Set(p);
        n.delete(proApiKey.id);
        return n;
      });
    }
  };

  const handleUpdateKey = async (id: string) => {
    setFormError(null);
    const trimmedName = editName.trim();
    const trimmedKey = editKey.trim();

    if (!trimmedName) {
      setFormError("Key name cannot be empty.");
      return;
    }

    try {
      updateKeyName(id, trimmedName);
      if (trimmedKey) {
        await invoke("save_api_key", { keyId: id, keyValue: trimmedKey });
        updateKeyStatus(id, "unchecked");
      }
      setEditingId(null);
      setEditName("");
      setEditKey("");
    } catch (err) {
      setFormError(`Failed to update key securely: ${err}`);
    }
  };

  const handleTestKey = async (id: string) => {
    setTesting((p) => new Set([...p, id]));
    try {
      const rawKey = await invoke<string>("load_api_key", { keyId: id });
      if (!rawKey) {
        updateKeyStatus(id, "invalid");
        return;
      }
      const result = await testKey(rawKey, selectedModel);
      updateKeyStatus(id, result);
    } catch {
      updateKeyStatus(id, "invalid");
    } finally {
      setTesting((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    }
  };

  const handleTestAllKeys = async () => {
    await Promise.all(apiKeys.map((k) => handleTestKey(k.id)));
  };

  const handleAgentSelectFolder = async () => {
    setFormError(null);
    setAgentNotice(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Local Project Workspace",
      });
      if (!selected || typeof selected !== "string") return;

      setAgentWorkspace(selected);
      if (activeSessionId) {
        setSessionWorkspace(activeSessionId, selected);
      }
      try {
        const backupPath = await invoke<string>("agent_create_backup", {
          workspacePath: selected,
        });
        setAgentBackupPath(backupPath);
        setAgentNotice(
          `Workspace connected! Safety backup was created at: "${backupPath}"`
        );
      } catch (e: any) {
        setFormError(`Workspace set, but backup failed: ${e?.message || e}`);
      }
    } catch (e: any) {
      setFormError(`Could not open folder picker: ${e?.message || e}`);
    }
  };

  const handleAgentRefreshBackup = async () => {
    if (!agentWorkspace) return;
    setFormError(null);
    setAgentNotice(null);
    try {
      const backupPath = await invoke<string>("agent_create_backup", {
        workspacePath: agentWorkspace,
      });
      setAgentBackupPath(backupPath);
      setAgentNotice(`Safety backup successfully refreshed at: "${backupPath}"`);
    } catch (e: any) {
      setFormError(`Failed to refresh backup: ${e?.message || e}`);
    }
  };

  const handleAgentRestoreBackup = async () => {
    if (!agentWorkspace) return;
    setFormError(null);
    setAgentNotice(null);
    const ok = window.confirm(
      `Are you sure you want to restore workspace "${agentWorkspace}" from its safety backup?\nAll files will be reverted to the snapshot.`
    );
    if (!ok) return;
    try {
      const msg = await invoke<string>("agent_restore_backup", {
        workspacePath: agentWorkspace,
      });
      setAgentNotice(msg);
    } catch (e: any) {
      setFormError(`Failed to restore backup: ${e?.message || e}`);
    }
  };

  const handleAgentDisconnect = () => {
    setAgentWorkspace(null);
    setAgentBackupPath(null);
    setAgentNotice("Workspace disconnected. Local file agent disabled.");
  };

  const handleExportJSON = () => {
    if (
      !confirm(
        "Export will include all chat messages and metadata. Proceed with export?"
      )
    )
      return;
    const sanitized = sessions.map((s) => ({
      ...s,
      messages: s.messages.map((m) => ({
        ...m,
        parts: m.parts.map((p) =>
          p.inlineData?.data
            ? {
                ...p,
                inlineData: {
                  mimeType: p.inlineData.mimeType,
                  data: "[stripped]",
                },
              }
            : p
        ),
      })),
    }));
    const blob = new Blob([JSON.stringify(sanitized, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `keylooper-history-${Date.now()}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMd = () => {
    if (!confirm("Export will include all chat messages. Proceed with export?"))
      return;
    let md = "# KeyLooper Chat Export\n\n";
    for (const s of sessions) {
      md += `## ${s.title}\n\n`;
      for (const m of s.messages) {
        md += `**${m.role === "user" ? "You" : "Assistant"}**:\n\n${
          m.parts.find((p) => p.text)?.text ?? ""
        }\n\n---\n\n`;
      }
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `keylooper-history-${Date.now()}.md`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "820px",
        margin: "0 auto",
        padding: "16px 20px 40px 20px",
        overflowY: "auto",
        fontFamily: "'Crimson Pro', serif",
        gap: "12px",
      }}
      className="fade-in"
    >
      {/* Compact Header + Tabs Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={() => setView("chat")}
            title="Back to Chat"
            style={{
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "9px",
              border: "1px solid var(--border-color)",
              color: "var(--text-color-muted)",
              background: "var(--input-bg)",
              cursor: "pointer",
            }}
          >
            <Icon name="arrow_back" size={16} />
          </button>
          <div>
            <h2
              style={{
                fontSize: "19px",
                fontWeight: 700,
                color: "var(--text-color)",
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              Settings
            </h2>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-color-muted)",
                margin: 0,
              }}
            >
              API credentials, models, keyboard shortcuts & usage metrics
            </p>
          </div>
        </div>

        {/* Segmented Tabs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "3px",
            padding: "3px",
            borderRadius: "10px",
            border: "1px solid var(--border-color)",
            background: "var(--input-bg)",
          }}
        >
          {(
            [
              { id: "api", label: "API Keys", icon: "key" },
              { id: "model", label: "Models", icon: "tune" },
              { id: "shortcuts", label: "Shortcuts", icon: "keyboard" },
              { id: "agent", label: "File Agent", icon: "folder_open" },
              { id: "privacy", label: "Privacy", icon: "shield" },
              { id: "usage", label: "Usage", icon: "analytics" },
              { id: "updates", label: "Updates", icon: "system_update" },
              { id: "about", label: "About", icon: "info" },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            const hasUpdate = tab.id === "updates" && Boolean(updateAvailable);
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setFormError(null);
                  setRecordingAction(null);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "5px 11px",
                  borderRadius: "7px",
                  fontSize: "12.5px",
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  background: isActive ? "var(--bg-color)" : "transparent",
                  border: isActive
                    ? "1px solid var(--border-color)"
                    : "1px solid transparent",
                  color: isActive ? "var(--primary)" : "var(--text-color-muted)",
                  transition: "all 0.15s",
                  position: "relative",
                }}
              >
                <Icon name={tab.icon} size={15} />
                <span>{tab.label}</span>
                {hasUpdate && (
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "var(--primary)",
                      display: "inline-block",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {formError && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "9px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(249,218,214,0.9)",
            border: "1px solid rgba(186,26,26,0.25)",
          }}
        >
          <Icon name="error" size={16} style={{ color: "#ba1a1a" }} />
          <p style={{ flex: 1, fontSize: "13px", color: "#ba1a1a", margin: 0 }}>
            {formError}
          </p>
          <button
            onClick={() => setFormError(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#ba1a1a",
              cursor: "pointer",
              display: "flex",
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* ── TAB 1: API KEYS ── */}
      {activeTab === "api" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Add Rotation Key + Configured Keys Combined Card */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--input-bg)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "14.5px",
                    fontWeight: 700,
                    color: "var(--text-color)",
                    margin: 0,
                  }}
                >
                  Rotation Key Pool ({apiKeys.length})
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-color-muted)",
                    margin: 0,
                  }}
                >
                  Stored in your native OS Keyring. Used in Normal & Unlimited modes.
                </p>
              </div>
              {apiKeys.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    onClick={() => {
                      reactivateAllKeys();
                      setAgentNotice("All API keys reactivated to active pool.");
                    }}
                    title="Clear rate-limit cooldowns and restore all keys to active pool"
                    style={{
                      padding: "4px 10px",
                      borderRadius: "7px",
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', monospace",
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-color)",
                      color: "var(--text-color)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Icon name="refresh" size={14} style={{ color: "var(--primary)" }} />
                    <span>Reset All to Active</span>
                  </button>
                  <button
                    onClick={handleTestAllKeys}
                    disabled={testing.size > 0}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "7px",
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', monospace",
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-color)",
                      color: "var(--text-color)",
                      cursor: testing.size > 0 ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Icon name="verified" size={14} style={{ color: "var(--primary)" }} />
                    <span>{testing.size > 0 ? "Testing..." : "Test All"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Inline Add Key Form */}
            <form
              onSubmit={handleAddKey}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.4fr auto",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Key Nickname (e.g. Account 1)"
                style={{
                  padding: "6px 10px",
                  borderRadius: "7px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-color)",
                  color: "var(--text-color)",
                  fontSize: "12.5px",
                  outline: "none",
                }}
              />
              <input
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Gemini API Key (AIzaSy...)"
                style={{
                  padding: "6px 10px",
                  borderRadius: "7px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-color)",
                  color: "var(--text-color)",
                  fontSize: "12.5px",
                  fontFamily: "'JetBrains Mono', monospace",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "6px 14px",
                  borderRadius: "7px",
                  fontWeight: 600,
                  fontSize: "12.5px",
                  background: "var(--primary)",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  whiteSpace: "nowrap",
                }}
              >
                <Icon name="add" size={15} />
                <span>Add Key</span>
              </button>
            </form>

            {/* Key Pool List */}
            {apiKeys.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px dashed var(--border-color)",
                  background: "var(--bg-color)",
                  color: "var(--text-color-muted)",
                  fontSize: "12.5px",
                }}
              >
                No API keys in pool yet. Add a key above to start chatting.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {apiKeys.map((key, idx) => {
                  const isCooldownOver =
                    key.cooldownUntil && Date.now() > key.cooldownUntil;
                  const displayStatus =
                    key.status === "rate-limited" && isCooldownOver
                      ? "unchecked"
                      : key.status;
                  const cfg = STATUS_CFG[displayStatus];
                  const isT = testing.has(key.id);
                  const isEditing = editingId === key.id;

                  return (
                    <div
                      key={key.id}
                      style={{
                        padding: "7px 10px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-color)",
                      }}
                    >
                      {isEditing ? (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1.2fr auto auto",
                            gap: "6px",
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Nickname"
                            style={{
                              padding: "5px 8px",
                              borderRadius: "6px",
                              border: "1px solid var(--border-color)",
                              background: "var(--input-bg)",
                              color: "var(--text-color)",
                              fontSize: "12px",
                            }}
                          />
                          <input
                            type="password"
                            value={editKey}
                            onChange={(e) => setEditKey(e.target.value)}
                            placeholder="New API key (leave blank to keep)"
                            style={{
                              padding: "5px 8px",
                              borderRadius: "6px",
                              border: "1px solid var(--border-color)",
                              background: "var(--input-bg)",
                              color: "var(--text-color)",
                              fontSize: "12px",
                              fontFamily: "monospace",
                            }}
                          />
                          <button
                            onClick={() => handleUpdateKey(key.id)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: "6px",
                              fontSize: "11.5px",
                              fontWeight: 600,
                              border: "none",
                              background: "var(--primary)",
                              color: "white",
                              cursor: "pointer",
                            }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            style={{
                              padding: "5px 8px",
                              borderRadius: "6px",
                              fontSize: "11.5px",
                              border: "1px solid var(--border-color)",
                              background: "transparent",
                              color: "var(--text-color-muted)",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: "11px",
                                color: "var(--text-color-muted)",
                                width: "18px",
                              }}
                            >
                              #{idx + 1}
                            </span>
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
                              {key.name}
                            </span>
                            <span
                              style={{
                                fontSize: "10.5px",
                                color: "var(--text-color-muted)",
                                fontFamily: "'JetBrains Mono', monospace",
                              }}
                            >
                              ({key.id.slice(0, 6)})
                            </span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "5px",
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                                padding: "2px 8px",
                                borderRadius: "999px",
                                background: "var(--input-bg)",
                                border: "1px solid var(--border-color)",
                              }}
                            >
                              <span
                                style={{
                                  width: "6px",
                                  height: "6px",
                                  borderRadius: "999px",
                                  background: cfg.dot,
                                }}
                              />
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: "10px",
                                  color: cfg.color,
                                  fontWeight: 500,
                                }}
                              >
                                {cfg.label}
                              </span>
                            </div>

                            <button
                              onClick={() => handleTestKey(key.id)}
                              disabled={isT}
                              style={{
                                padding: "2px 8px",
                                borderRadius: "5px",
                                fontSize: "10.5px",
                                fontFamily: "'JetBrains Mono', monospace",
                                border: "1px solid var(--border-color)",
                                color: "var(--text-color-muted)",
                                background: "transparent",
                                cursor: isT ? "not-allowed" : "pointer",
                              }}
                            >
                              {isT ? "…" : "Test"}
                            </button>

                            <button
                              onClick={() => idx > 0 && reorderApiKeys(idx, idx - 1)}
                              disabled={idx === 0}
                              title="Move Up"
                              style={{
                                background: "transparent",
                                border: "none",
                                cursor: idx === 0 ? "default" : "pointer",
                                color:
                                  idx === 0
                                    ? "var(--border-color)"
                                    : "var(--text-color-muted)",
                                display: "flex",
                                padding: "2px",
                              }}
                            >
                              <Icon name="keyboard_arrow_up" size={16} />
                            </button>
                            <button
                              onClick={() =>
                                idx < apiKeys.length - 1 &&
                                reorderApiKeys(idx, idx + 1)
                              }
                              disabled={idx === apiKeys.length - 1}
                              title="Move Down"
                              style={{
                                background: "transparent",
                                border: "none",
                                cursor:
                                  idx === apiKeys.length - 1
                                    ? "default"
                                    : "pointer",
                                color:
                                  idx === apiKeys.length - 1
                                    ? "var(--border-color)"
                                    : "var(--text-color-muted)",
                                display: "flex",
                                padding: "2px",
                              }}
                            >
                              <Icon name="keyboard_arrow_down" size={16} />
                            </button>

                            <button
                              onClick={() => {
                                setEditingId(key.id);
                                setEditName(key.name);
                                setEditKey("");
                              }}
                              title="Edit Key"
                              style={{
                                width: "24px",
                                height: "24px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: "5px",
                                background: "transparent",
                                border: "none",
                                color: "var(--text-color-muted)",
                                cursor: "pointer",
                              }}
                            >
                              <Icon name="edit" size={14} />
                            </button>

                            <button
                              onClick={() => {
                                if (confirm(`Remove key "${key.name}"?`))
                                  removeApiKey(key.id);
                              }}
                              title="Remove Key"
                              style={{
                                width: "24px",
                                height: "24px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: "5px",
                                background: "transparent",
                                border: "none",
                                color: "var(--text-color-muted)",
                                cursor: "pointer",
                              }}
                            >
                              <Icon name="delete" size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dedicated Pro API Key Card (Compact) */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--input-bg)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3
                  style={{
                    fontSize: "14.5px",
                    fontWeight: 700,
                    color: "var(--text-color)",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Icon name="workspace_premium" size={17} style={{ color: "#d4af37" }} />
                  Dedicated Pro Mode Key
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-color-muted)",
                    margin: 0,
                  }}
                >
                  Used exclusively when "Pro" mode is selected (with automatic Google Search grounding).
                </p>
              </div>
            </div>

            {proApiKey ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-color)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-color)" }}>
                    {proApiKey.name}
                  </span>
                  <span
                    style={{
                      fontSize: "10.5px",
                      color: STATUS_CFG[proApiKey.status || "unchecked"].color,
                      fontFamily: "'JetBrains Mono', monospace",
                      background: "var(--input-bg)",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {STATUS_CFG[proApiKey.status || "unchecked"].label}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    onClick={handleTestProKey}
                    disabled={testing.has(proApiKey.id)}
                    style={{
                      padding: "3px 9px",
                      borderRadius: "5px",
                      fontSize: "10.5px",
                      fontFamily: "'JetBrains Mono', monospace",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-color-muted)",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    {testing.has(proApiKey.id) ? "…" : "Test"}
                  </button>
                  <button
                    onClick={handleRemoveProKey}
                    title="Remove Pro Key"
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border-color)",
                      borderRadius: "5px",
                      padding: "4px",
                      cursor: "pointer",
                      color: "var(--text-color-muted)",
                      display: "flex",
                    }}
                  >
                    <Icon name="delete" size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleAddProKey}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.4fr auto",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <input
                  type="text"
                  value={newProName}
                  onChange={(e) => setNewProName(e.target.value)}
                  placeholder="Pro Key Label (e.g. Paid Tier)"
                  style={{
                    padding: "6px 10px",
                    borderRadius: "7px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-color)",
                    color: "var(--text-color)",
                    fontSize: "12.5px",
                    outline: "none",
                  }}
                />
                <input
                  type="password"
                  value={newProKey}
                  onChange={(e) => setNewProKey(e.target.value)}
                  placeholder="Pro Gemini API Key (AIzaSy...)"
                  style={{
                    padding: "6px 10px",
                    borderRadius: "7px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-color)",
                    color: "var(--text-color)",
                    fontSize: "12.5px",
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: "6px 14px",
                    borderRadius: "7px",
                    fontWeight: 600,
                    fontSize: "12.5px",
                    background: "var(--primary)",
                    color: "white",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon name="save" size={15} />
                  <span>Save Pro Key</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: MODELS ── */}
      {activeTab === "model" && <ModelConfigPanel />}

      {/* ── TAB 3: KEYBOARD SHORTCUTS ── */}
      {activeTab === "shortcuts" && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
            background: "var(--input-bg)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
          className="fade-in"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: "14.5px",
                  fontWeight: 700,
                  color: "var(--text-color)",
                  margin: 0,
                }}
              >
                Custom Keyboard Shortcuts
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-color-muted)",
                  margin: 0,
                }}
              >
                Click any shortcut badge and press your desired key combination (press Esc to cancel).
              </p>
            </div>
            <button
              onClick={resetAllShortcuts}
              style={{
                padding: "5px 10px",
                borderRadius: "7px",
                fontSize: "11.5px",
                fontFamily: "'JetBrains Mono', monospace",
                border: "1px solid var(--border-color)",
                background: "var(--bg-color)",
                color: "var(--text-color-muted)",
                cursor: "pointer",
              }}
            >
              Reset All Defaults
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: "8px",
            }}
          >
            {(Object.keys(SHORTCUT_LABELS) as ShortcutAction[]).map((action) => {
              const meta = SHORTCUT_LABELS[action];
              const currentBinding = shortcuts[action] || DEFAULT_SHORTCUTS[action];
              const isRecording = recordingAction === action;
              const isModified = currentBinding !== DEFAULT_SHORTCUTS[action];

              return (
                <div
                  key={action}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 11px",
                    borderRadius: "8px",
                    border: isRecording
                      ? "1.5px solid var(--primary)"
                      : "1px solid var(--border-color)",
                    background: "var(--bg-color)",
                    gap: "10px",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--text-color)",
                      }}
                    >
                      {meta.label}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-color-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {meta.description}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() =>
                        setRecordingAction(isRecording ? null : action)
                      }
                      style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        border: isRecording
                          ? "1px solid var(--primary)"
                          : "1px solid var(--border-color)",
                        background: isRecording
                          ? "var(--primary)"
                          : "var(--input-bg)",
                        color: isRecording ? "white" : "var(--text-color)",
                        cursor: "pointer",
                        minWidth: "92px",
                        textAlign: "center",
                      }}
                      title="Click to record a new shortcut"
                    >
                      {isRecording ? "Press keys…" : formatShortcutForDisplay(currentBinding)}
                    </button>

                    {isModified && (
                      <button
                        type="button"
                        onClick={() => resetShortcut(action)}
                        title={`Reset to default (${DEFAULT_SHORTCUTS[action]})`}
                        style={{
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "5px",
                          border: "none",
                          background: "transparent",
                          color: "var(--text-color-muted)",
                          cursor: "pointer",
                        }}
                      >
                        <Icon name="restart_alt" size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 4: PRIVACY & DATA ── */}
      {activeTab === "privacy" && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
            background: "var(--input-bg)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
          className="fade-in"
        >
          {/* Row 1: Save History */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "10px",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-color)", margin: 0 }}>
                Save Chat History Locally
              </h3>
              <p style={{ fontSize: "12px", color: "var(--text-color-muted)", margin: 0 }}>
                Persist conversation sessions across app restarts (binary attachments are stripped before saving).
              </p>
            </div>
            <button
              onClick={() => setHistoryEnabled(!historyEnabled)}
              style={{
                position: "relative",
                width: "38px",
                height: "20px",
                borderRadius: "9999px",
                background: historyEnabled ? "var(--primary)" : "var(--secondary)",
                border: "none",
                cursor: "pointer",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: historyEnabled ? "20px" : "2px",
                  width: "16px",
                  height: "16px",
                  background: "white",
                  borderRadius: "9999px",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>

          {/* Row 2: Export Data */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "10px",
              borderBottom: "1px solid var(--border-color)",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-color)", margin: 0 }}>
                Export Conversations ({sessions.length} sessions)
              </h3>
              <p style={{ fontSize: "12px", color: "var(--text-color-muted)", margin: 0 }}>
                Download all stored sessions as structured JSON or readable Markdown.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleExportJSON}
                disabled={sessions.length === 0}
                style={{
                  padding: "6px 12px",
                  borderRadius: "7px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "11.5px",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-color)",
                  background: "var(--bg-color)",
                  cursor: sessions.length === 0 ? "not-allowed" : "pointer",
                  opacity: sessions.length === 0 ? 0.4 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Icon name="download" size={14} />
                <span>JSON</span>
              </button>
              <button
                onClick={handleExportMd}
                disabled={sessions.length === 0}
                style={{
                  padding: "6px 12px",
                  borderRadius: "7px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "11.5px",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-color)",
                  background: "var(--bg-color)",
                  cursor: sessions.length === 0 ? "not-allowed" : "pointer",
                  opacity: sessions.length === 0 ? 0.4 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Icon name="download" size={14} />
                <span>Markdown</span>
              </button>
            </div>
          </div>

          {/* Row 3: Danger Zone */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#ba1a1a", margin: 0 }}>
                Purge Local History
              </h3>
              <p style={{ fontSize: "12px", color: "var(--text-color-muted)", margin: 0 }}>
                Permanently delete all stored chat sessions from this device.
              </p>
            </div>
            <button
              onClick={() => {
                if (confirm("Delete all chat history? This cannot be undone."))
                  clearAllSessions();
              }}
              style={{
                padding: "6px 14px",
                borderRadius: "7px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "11.5px",
                border: "1px solid rgba(186,26,26,0.3)",
                color: "#ba1a1a",
                background: "rgba(249,218,214,0.35)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Clear All History
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: AUTONOMOUS LOCAL FILE AGENT ── */}
      {activeTab === "agent" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {agentNotice && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "9px",
                border: "1px solid rgba(107, 138, 122, 0.4)",
                background: "rgba(107, 138, 122, 0.12)",
                color: "var(--text-color)",
                fontSize: "12.5px",
              }}
            >
              <Icon name="check_circle" size={16} style={{ color: "#6b8a7a" }} />
              <span style={{ flex: 1 }}>{agentNotice}</span>
              <button
                onClick={() => setAgentNotice(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-color-muted)",
                }}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          )}

          {/* Active Workspace Card */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--input-bg)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon
                  name="folder_open"
                  size={20}
                  style={{ color: "var(--primary)" }}
                />
                <div>
                  <h3
                    style={{
                      fontSize: "14.5px",
                      fontWeight: 700,
                      color: "var(--text-color)",
                      margin: 0,
                    }}
                  >
                    Workspace Directory
                  </h3>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--text-color-muted)",
                      margin: 0,
                    }}
                  >
                    Folder KeyLooper is granted access to read and write files
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={handleAgentSelectFolder}
                  className="cursor-pointer"
                  style={{
                    padding: "6px 14px",
                    borderRadius: "8px",
                    border: "1px solid var(--primary)",
                    background: "var(--primary)",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {agentWorkspace ? "Change Folder..." : "Select Folder..."}
                </button>
                {agentWorkspace && (
                  <button
                    onClick={handleAgentDisconnect}
                    className="cursor-pointer"
                    style={{
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      background: "transparent",
                      color: "var(--text-color-muted)",
                      fontSize: "12px",
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            {agentWorkspace ? (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "var(--bg-color)",
                  border: "1px solid var(--border-color)",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "12px",
                  color: "var(--text-color)",
                  wordBreak: "break-all",
                }}
              >
                {agentWorkspace}
              </div>
            ) : (
              <p
                style={{
                  fontStyle: "italic",
                  fontSize: "12px",
                  color: "var(--text-color-muted)",
                  margin: 0,
                }}
              >
                No workspace folder connected. Connect a folder to enable
                autonomous file editing with Gemini tools.
              </p>
            )}
          </div>

          {/* Safety Backup Guarantee Card */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--input-bg)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon
                name="verified_user"
                size={20}
                style={{ color: "#6b8a7a" }}
              />
              <div>
                <h3
                  style={{
                    fontSize: "14.5px",
                    fontWeight: 700,
                    color: "var(--text-color)",
                    margin: 0,
                  }}
                >
                  Safety Snapshot Guarantee (__BACKUP_FOLDER)
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-color-muted)",
                    margin: 0,
                  }}
                >
                  A full copy of your original project folder is created before
                  any file operations occur
                </p>
              </div>
            </div>

            {agentBackupPath ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: "var(--bg-color)",
                    border: "1px solid rgba(107, 138, 122, 0.4)",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "12px",
                    color: "var(--text-color)",
                    wordBreak: "break-all",
                  }}
                >
                  <span style={{ color: "#6b8a7a", fontWeight: 600 }}>
                    Active Backup:{" "}
                  </span>
                  {agentBackupPath}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={handleAgentRefreshBackup}
                    className="cursor-pointer"
                    style={{
                      padding: "6px 12px",
                      borderRadius: "7px",
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-color)",
                      color: "var(--text-color)",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <Icon name="refresh" size={14} />
                    <span>Refresh Backup Now</span>
                  </button>
                  <button
                    onClick={handleAgentRestoreBackup}
                    className="cursor-pointer"
                    style={{
                      padding: "6px 12px",
                      borderRadius: "7px",
                      border: "1px solid rgba(186, 26, 26, 0.3)",
                      background: "rgba(249, 218, 214, 0.3)",
                      color: "#ba1a1a",
                      fontSize: "12px",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <Icon name="history" size={14} />
                    <span>Restore Original Project</span>
                  </button>
                </div>
              </div>
            ) : (
              <p
                style={{
                  fontStyle: "italic",
                  fontSize: "12px",
                  color: "var(--text-color-muted)",
                  margin: 0,
                }}
              >
                When you connect a workspace folder, KeyLooper automatically
                snapshots the folder to <code>[folder]__BACKUP_FOLDER</code> in
                the parent folder.
              </p>
            )}
          </div>

          {/* Security & Scoping Info */}
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              background: "var(--input-bg)",
              fontSize: "12px",
              color: "var(--text-color-muted)",
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                color: "var(--text-color)",
                marginBottom: "4px",
              }}
            >
              🔒 Security & Directory Boundary
            </div>
            File operations (reading, listing, writing) are locked strictly to the
            selected workspace. Any relative directory traversal attempting to
            break out of the folder boundary (e.g., <code>../..</code>) is
            validated and rejected by native Rust security checks.
          </div>
        </div>
      )}

      {/* ── TAB 5: USAGE ── */}
      {activeTab === "usage" &&
        (() => {
          const totals = usageRecords.reduce(
            (acc, r) => {
              acc.prompt += r.promptTokens;
              acc.completion += r.completionTokens;
              acc.total += r.totalTokens;
              return acc;
            },
            { prompt: 0, completion: 0, total: 0 }
          );

          const modelStats = usageRecords.reduce((acc, r) => {
            if (!acc[r.model]) acc[r.model] = { prompt: 0, completion: 0, total: 0 };
            acc[r.model].prompt += r.promptTokens;
            acc[r.model].completion += r.completionTokens;
            acc[r.model].total += r.totalTokens;
            return acc;
          }, {} as Record<string, { prompt: number; completion: number; total: number }>);

          const keyStats = usageRecords.reduce((acc, r) => {
            const keyLabel = r.apiKeyName || "Unnamed Key";
            if (!acc[keyLabel]) acc[keyLabel] = { prompt: 0, completion: 0, total: 0 };
            acc[keyLabel].prompt += r.promptTokens;
            acc[keyLabel].completion += r.completionTokens;
            acc[keyLabel].total += r.totalTokens;
            return acc;
          }, {} as Record<string, { prompt: number; completion: number; total: number }>);

          // Group by ISO YYYY-MM-DD for reliable locale-independent chronological sorting
          const dayStats = usageRecords.reduce((acc, r) => {
            const d = new Date(r.timestamp);
            const isoDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
              2,
              "0"
            )}-${String(d.getDate()).padStart(2, "0")}`;
            if (!acc[isoDay]) acc[isoDay] = { prompt: 0, completion: 0, total: 0 };
            acc[isoDay].prompt += r.promptTokens;
            acc[isoDay].completion += r.completionTokens;
            acc[isoDay].total += r.totalTokens;
            return acc;
          }, {} as Record<string, { prompt: number; completion: number; total: number }>);

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} className="fade-in">
              {/* Summary Strip */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px" }}>
                {[
                  { label: "PROMPT TOKENS", value: totals.prompt, icon: "arrow_upward" },
                  { label: "COMPLETION TOKENS", value: totals.completion, icon: "arrow_downward" },
                  { label: "TOTAL TOKENS", value: totals.total, icon: "toll" },
                ].map((card) => (
                  <div
                    key={card.label}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-color)",
                      background: "var(--input-bg)",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "8px",
                        background: "var(--bg-color)",
                        border: "1px solid var(--border-color)",
                        color: "var(--primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name={card.icon} size={16} />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "9.5px",
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "var(--text-color-muted)",
                        }}
                      >
                        {card.label}
                      </div>
                      <div
                        style={{
                          fontSize: "16px",
                          fontWeight: 700,
                          color: "var(--text-color)",
                        }}
                      >
                        {card.value.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => {
                    if (confirm("Clear all token usage records?")) clearUsageRecords();
                  }}
                  disabled={usageRecords.length === 0}
                  style={{
                    padding: "0 14px",
                    borderRadius: "10px",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "11px",
                    border: "1px solid rgba(186,26,26,0.25)",
                    color: "#ba1a1a",
                    background: "rgba(249,218,214,0.25)",
                    cursor: usageRecords.length === 0 ? "not-allowed" : "pointer",
                    opacity: usageRecords.length === 0 ? 0.4 : 1,
                    fontWeight: 600,
                  }}
                >
                  Reset Stats
                </button>
              </div>

              {/* Side-by-side Model & API Key Breakdown */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid var(--border-color)",
                    background: "var(--input-bg)",
                  }}
                >
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-color)", margin: "0 0 8px 0" }}>
                    By Model
                  </h3>
                  {Object.keys(modelStats).length === 0 ? (
                    <p style={{ fontStyle: "italic", color: "var(--text-color-muted)", fontSize: "12px", margin: 0 }}>
                      No usage recorded yet.
                    </p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                          <th style={{ padding: "5px 4px", color: "var(--text-color-muted)" }}>Model</th>
                          <th style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>In</th>
                          <th style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>Out</th>
                          <th style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(modelStats).map(([model, s]) => (
                          <tr key={model} style={{ borderBottom: "1px solid var(--border-color)" }}>
                            <td style={{ padding: "5px 4px", fontWeight: 600 }}>{model}</td>
                            <td style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>
                              {s.prompt.toLocaleString()}
                            </td>
                            <td style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>
                              {s.completion.toLocaleString()}
                            </td>
                            <td style={{ padding: "5px 4px", color: "var(--primary)", fontWeight: 700, textAlign: "right" }}>
                              {s.total.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid var(--border-color)",
                    background: "var(--input-bg)",
                  }}
                >
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-color)", margin: "0 0 8px 0" }}>
                    By API Key
                  </h3>
                  {Object.keys(keyStats).length === 0 ? (
                    <p style={{ fontStyle: "italic", color: "var(--text-color-muted)", fontSize: "12px", margin: 0 }}>
                      No usage recorded yet.
                    </p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                          <th style={{ padding: "5px 4px", color: "var(--text-color-muted)" }}>Key</th>
                          <th style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>In</th>
                          <th style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>Out</th>
                          <th style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(keyStats).map(([keyName, s]) => (
                          <tr key={keyName} style={{ borderBottom: "1px solid var(--border-color)" }}>
                            <td style={{ padding: "5px 4px", fontWeight: 600 }}>{keyName}</td>
                            <td style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>
                              {s.prompt.toLocaleString()}
                            </td>
                            <td style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>
                              {s.completion.toLocaleString()}
                            </td>
                            <td style={{ padding: "5px 4px", color: "var(--primary)", fontWeight: 700, textAlign: "right" }}>
                              {s.total.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Daily Usage Breakdown */}
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  background: "var(--input-bg)",
                }}
              >
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-color)", margin: "0 0 8px 0" }}>
                  Daily Token Consumption
                </h3>
                {Object.keys(dayStats).length === 0 ? (
                  <p style={{ fontStyle: "italic", color: "var(--text-color-muted)", fontSize: "12px", margin: 0 }}>
                    No daily usage recorded yet.
                  </p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                        <th style={{ padding: "5px 4px", color: "var(--text-color-muted)" }}>Date</th>
                        <th style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>Prompt</th>
                        <th style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>Completion</th>
                        <th style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(dayStats)
                        .sort(([a], [b]) => b.localeCompare(a))
                        .map(([isoDay, s]) => (
                          <tr key={isoDay} style={{ borderBottom: "1px solid var(--border-color)" }}>
                            <td style={{ padding: "5px 4px", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}>
                              {isoDay}
                            </td>
                            <td style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>
                              {s.prompt.toLocaleString()}
                            </td>
                            <td style={{ padding: "5px 4px", color: "var(--text-color-muted)", textAlign: "right" }}>
                              {s.completion.toLocaleString()}
                            </td>
                            <td style={{ padding: "5px 4px", color: "var(--primary)", fontWeight: 700, textAlign: "right" }}>
                              {s.total.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })()}

      {activeTab === "about" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Main App Hero Card */}
          <div
            style={{
              padding: "20px 24px",
              borderRadius: "12px",
              background: "var(--bg-color)",
              border: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "16px",
                  background: "var(--tertiary-fixed)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--border-color)",
                  boxShadow: "0 4px 12px var(--card-shadow)",
                }}
              >
                <Icon name="spa" size={32} style={{ color: "var(--primary)" }} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h2
                    style={{
                      fontFamily: "'Crimson Pro', serif",
                      fontSize: "26px",
                      fontWeight: 700,
                      color: "var(--text-color)",
                      margin: 0,
                      lineHeight: "1.1",
                    }}
                  >
                    KeyLooper
                  </h2>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 600,
                      background: "rgba(177,98,77,0.12)",
                      color: "var(--primary)",
                      border: "1px solid rgba(177,98,77,0.25)",
                    }}
                  >
                    v0.2.2
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "12.5px",
                    color: "var(--text-color-muted)",
                    margin: "4px 0 0 0",
                    maxWidth: "520px",
                    lineHeight: "1.4",
                  }}
                >
                  Intelligent rate-limit pool rotator, local workspace file agent, and zero-slop clinical documentation engine for Google Gemini.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { openUrl } = await import("@tauri-apps/plugin-opener");
                    await openUrl("https://aistudio.google.com/");
                  } catch {
                    window.open("https://aistudio.google.com/", "_blank");
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                  background: "var(--input-bg)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-color)",
                  cursor: "pointer",
                }}
              >
                <Icon name="key" size={15} style={{ color: "var(--primary)" }} />
                <span>Google AI Studio</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("updates");
                  handleCheckUpdate();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                  background: "var(--input-bg)",
                  border: "1px solid var(--border-color)",
                  color: "var(--primary)",
                  cursor: "pointer",
                }}
              >
                <Icon name="system_update" size={15} />
                <span>Check for Updates</span>
              </button>
            </div>
          </div>

          {/* Developer & Creator Profile */}
          <div
            style={{
              padding: "18px 20px",
              borderRadius: "12px",
              background: "var(--bg-color)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <Icon name="person" size={18} style={{ color: "var(--primary)" }} />
              <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--text-color)" }}>
                Creator & Architecture
              </h3>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                fontSize: "12.5px",
                lineHeight: "1.5",
                color: "var(--text-color)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--primary)" }}>
                  Stephen Dias
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-color-muted)" }}>
                  Medical Scribe/Application Developer
                </span>
              </div>
              <p style={{ margin: 0, color: "var(--text-color-muted)" }}>
                Developed to bridge high-throughput AI assistance with clinical workflow precision and zero-interruption developer productivity. KeyLooper automates round-robin Gemini API key cycling to eliminate 429 rate-limit cutoffs during lengthy consult reports, code reviews, and local workspace tasks.
              </p>
            </div>
          </div>

          {/* Architecture & Engineering Highlights */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "12px",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "10px",
                background: "var(--bg-color)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <Icon name="sync" size={16} style={{ color: "var(--tertiary)" }} />
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-color)" }}>
                  Key Rotation Engine
                </span>
              </div>
              <p style={{ fontSize: "11.5px", color: "var(--text-color-muted)", margin: 0, lineHeight: "1.4" }}>
                Round-robin rotation with exponential backoff cooldown handling, ensuring quota continuity across Gemini Pro, Flash, and Flash-Lite models.
              </p>
            </div>

            <div
              style={{
                padding: "14px 16px",
                borderRadius: "10px",
                background: "var(--bg-color)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <Icon name="shield" size={16} style={{ color: "#6b8a7a" }} />
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-color)" }}>
                  OS-Level Security
                </span>
              </div>
              <p style={{ fontSize: "11.5px", color: "var(--text-color-muted)", margin: 0, lineHeight: "1.4" }}>
                Zero plain-text secret storage. Keys are directly secured via Apple macOS Keychain and Windows Credential Manager using the native OS keyring.
              </p>
            </div>

            <div
              style={{
                padding: "14px 16px",
                borderRadius: "10px",
                background: "var(--bg-color)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <Icon name="description" size={16} style={{ color: "var(--primary)" }} />
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-color)" }}>
                  Document Generator
                </span>
              </div>
              <p style={{ fontSize: "11.5px", color: "var(--text-color-muted)", margin: 0, lineHeight: "1.4" }}>
                Direct compilation to native Microsoft Word (.docx) and HTML clinical documents without python-code leakage, paired with safety workspace backups.
              </p>
            </div>

            <div
              style={{
                padding: "14px 16px",
                borderRadius: "10px",
                background: "var(--bg-color)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <Icon name="laptop_mac" size={16} style={{ color: "var(--secondary)" }} />
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-color)" }}>
                  Native Cross-Platform
                </span>
              </div>
              <p style={{ fontSize: "11.5px", color: "var(--text-color-muted)", margin: 0, lineHeight: "1.4" }}>
                Tauri v2 + Rust core compiled for macOS (Apple Silicon M-series & Intel DMG) and Windows (MSI & NSIS installer).
              </p>
            </div>
          </div>

          {/* Privacy & System Diagnostics */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "10px",
              background: "var(--input-bg)",
              border: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              fontSize: "11px",
              color: "var(--text-color-muted)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <div>
              <span>Environment: </span>
              <span style={{ color: "var(--text-color)", fontWeight: 600 }}>
                {typeof navigator !== "undefined" ? navigator.platform || "Desktop" : "Desktop"}
              </span>
              {" • "}
              <span>Storage: </span>
              <span style={{ color: "#6b8a7a", fontWeight: 600 }}>Encrypted Local Keyring</span>
            </div>
            <div>
              <span>KeyLooper • Built with care for Clinical & Dev Productivity</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Updates Tab ────────────────────────────────────────────── */}
      {activeTab === "updates" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Version & Status Card */}
          <div
            style={{
              padding: "18px 20px",
              borderRadius: "12px",
              background: "var(--input-bg)",
              border: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "rgba(107, 138, 122, 0.12)",
                    border: "1px solid rgba(107, 138, 122, 0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--primary)",
                  }}
                >
                  <Icon name="system_update" size={24} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--text-color)" }}>
                      KeyLooper
                    </h3>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600,
                        background: "var(--bg-color)",
                        border: "1px solid var(--border-color)",
                        color: "var(--primary)",
                      }}
                    >
                      v0.2.2
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--text-color-muted)" }}>
                    Official Distribution • Release Channel: GitHub Releases
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={updateStatus === "checking" || updateStatus === "downloading"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "7px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: updateStatus === "checking" || updateStatus === "downloading" ? "not-allowed" : "pointer",
                  background: "var(--primary)",
                  color: "#ffffff",
                  border: "none",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                  transition: "opacity 0.15s",
                  opacity: updateStatus === "checking" || updateStatus === "downloading" ? 0.7 : 1,
                }}
              >
                <Icon
                  name={updateStatus === "checking" ? "sync" : "refresh"}
                  size={16}
                  style={updateStatus === "checking" ? { animation: "spin 1s linear infinite" } : undefined}
                />
                <span>{updateStatus === "checking" ? "Checking Releases..." : "Check for Updates"}</span>
              </button>
            </div>

            {/* Status Feedback Box */}
            {updateStatus === "up-to-date" && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  background: "rgba(107, 138, 122, 0.12)",
                  border: "1px solid rgba(107, 138, 122, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  color: "#344e40",
                  fontSize: "12.5px",
                }}
              >
                <Icon name="check_circle" size={18} style={{ color: "#6b8a7a" }} />
                <span><strong>KeyLooper is up to date!</strong> You are running the latest version (v0.2.2).</span>
              </div>
            )}

            {updateStatus === "available" && updateObj && (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "10px",
                  background: "rgba(122, 92, 0, 0.08)",
                  border: "1px solid rgba(201, 162, 39, 0.35)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icon name="new_releases" size={20} style={{ color: "#c9a227" }} />
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-color)" }}>
                      New Version Available: v{updateObj.version}
                    </span>
                    {updateObj.date && (
                      <span style={{ fontSize: "11.5px", color: "var(--text-color-muted)" }}>
                        ({new Date(updateObj.date).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleInstallUpdate}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 14px",
                      borderRadius: "7px",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      background: "#344e40",
                      color: "#ffffff",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Icon name="download" size={16} />
                    <span>Download & Install</span>
                  </button>
                </div>
                {updateObj.body && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-color-muted)",
                      background: "var(--bg-color)",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                      whiteSpace: "pre-wrap",
                      maxHeight: "150px",
                      overflowY: "auto",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {updateObj.body}
                  </div>
                )}
              </div>
            )}

            {updateStatus === "downloading" && (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "10px",
                  background: "rgba(107, 138, 122, 0.08)",
                  border: "1px solid rgba(107, 138, 122, 0.25)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-color)" }}>
                    Downloading and verifying update package...
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--primary)" }}>
                    {downloadProgress}%
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "6px",
                    background: "var(--border-color)",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${downloadProgress}%`,
                      height: "100%",
                      background: "var(--primary)",
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
              </div>
            )}

            {updateStatus === "ready" && (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "10px",
                  background: "rgba(52, 78, 64, 0.12)",
                  border: "1px solid rgba(52, 78, 64, 0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Icon name="task_alt" size={22} style={{ color: "#344e40" }} />
                  <div>
                    <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-color)" }}>
                      Update Installed Successfully!
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-color-muted)" }}>
                      Restart KeyLooper now to complete the update and launch the new version.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRestart}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 700,
                    background: "var(--primary)",
                    color: "#ffffff",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Icon name="restart_alt" size={16} />
                  <span>Restart App</span>
                </button>
              </div>
            )}

            {updateStatus === "error" && updateError && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  background: "rgba(249, 218, 214, 0.9)",
                  border: "1px solid rgba(186, 26, 26, 0.25)",
                  color: "#ba1a1a",
                  fontSize: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
                  <Icon name="info" size={16} />
                  <span>Update check completed:</span>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", opacity: 0.9 }}>
                  {updateError}
                </div>
                <div style={{ fontSize: "11.5px", marginTop: "4px", color: "#5c1d1d" }}>
                  Note: If you haven't published a release on GitHub yet, this is expected. Once you push a tag (e.g. <code>v0.1.0</code>) and GitHub Actions compiles the release assets, updates will check and download seamlessly.
                </div>
              </div>
            )}
          </div>

          {/* Preferences Card */}
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "12px",
              background: "var(--input-bg)",
              border: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <h4 style={{ margin: 0, fontSize: "13.5px", fontWeight: 700, color: "var(--text-color)" }}>
              Update Preferences
            </h4>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={autoCheckUpdates}
                onChange={(e) => setAutoCheckUpdates(e.target.checked)}
                style={{
                  width: "16px",
                  height: "16px",
                  accentColor: "var(--primary)",
                  cursor: "pointer",
                }}
              />
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-color)" }}>
                  Check for updates automatically on startup
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--text-color-muted)" }}>
                  Periodically checks GitHub Releases in the background and notifies you when a new release is available.
                </div>
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsView;
