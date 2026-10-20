/**
 * Sidebar.tsx — Collapsible Chat History Side Panel.
 * Smoothly slides in/out from the left side of the workspace.
 */

import React, { useState } from "react";
import {
  useAppStore,
  ChatSession,
  formatShortcutForDisplay,
} from "../store/useAppStore";

const Icon = ({
  name,
  size = 18,
  style,
}: {
  name: string;
  size?: number;
  style?: React.CSSProperties;
}) => (
  <span
    className="material-symbols-outlined select-none"
    style={{ fontSize: `${size}px`, ...style }}
  >
    {name}
  </span>
);

interface SidebarProps {
  onNewChat: () => void;
}

function getSessionWorkspaceInfo(session: ChatSession): {
  workspacePath: string | null;
  folderName: string | null;
} {
  if (session.workspacePath) {
    const folderName =
      session.workspacePath.split(/[\\/]/).filter(Boolean).pop() || "Workspace";
    return { workspacePath: session.workspacePath, folderName };
  }
  for (const msg of session.messages) {
    for (const part of msg.parts) {
      if (part.text) {
        const match = part.text.match(/Active Workspace:\s*`?([^\n`]+)`?/i);
        if (match && match[1]) {
          const workspacePath = match[1].trim();
          const folderName =
            workspacePath.split(/[\\/]/).filter(Boolean).pop() || "Workspace";
          return { workspacePath, folderName };
        }
      }
    }
  }
  return { workspacePath: null, folderName: null };
}

function getSessionDisplayTitle(
  session: ChatSession,
  folderName: string | null
): string {
  if (session.title && session.title !== "New Chat") {
    return session.title;
  }
  const firstUser = session.messages.find((m) => m.role === "user");
  const userText = firstUser?.parts.find((p) => p.text?.trim())?.text?.trim();
  if (userText) {
    const summary = userText.substring(0, 36);
    return folderName ? `${folderName}: ${summary}` : summary;
  }
  if (folderName) {
    return folderName;
  }
  return session.title || "New Chat";
}

const Sidebar: React.FC<SidebarProps> = ({ onNewChat }) => {
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const selectSession = useAppStore((s) => s.selectSession);
  const deleteSession = useAppStore((s) => s.deleteSession);
  const renameSession = useAppStore((s) => s.renameSession);
  const clearAllSessions = useAppStore((s) => s.clearAllSessions);
  const setView = useAppStore((s) => s.setView);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const skills = useAppStore((s) => s.skills);
  const shortcuts = useAppStore((s) => s.shortcuts);
  const updateAvailable = useAppStore((s) => s.updateAvailable);

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filtered = sessions.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const { folderName } = getSessionWorkspaceInfo(s);
    return (
      s.title.toLowerCase().includes(q) ||
      (folderName && folderName.toLowerCase().includes(q)) ||
      s.messages.some((m) =>
        m.parts.some((p) => p.text?.toLowerCase().includes(q))
      )
    );
  });

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const startRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const commitRename = (id: string) => {
    if (editTitle.trim()) {
      renameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <aside
      style={{
        width: isSidebarOpen ? "260px" : "0px",
        minWidth: isSidebarOpen ? "260px" : "0px",
        opacity: isSidebarOpen ? 1 : 0,
        overflow: "hidden",
        borderRight: isSidebarOpen ? "1px solid var(--border-color)" : "none",
        background: "var(--input-bg)",
        backdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
        transition:
          "width 0.22s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease",
        flexShrink: 0,
        zIndex: 30,
      }}
    >
      <div
        style={{
          width: "260px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top bar: Title + New Chat + Collapse */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 10px 8px 12px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="history" size={16} style={{ color: "var(--primary)" }} />
            <span
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "var(--text-color)",
                letterSpacing: "-0.01em",
              }}
            >
              History
            </span>
            <span
              style={{
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--text-color-muted)",
                background: "var(--bg-color)",
                padding: "1px 5px",
                borderRadius: "999px",
                border: "1px solid var(--border-color)",
              }}
            >
              {sessions.length}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              onClick={onNewChat}
              title={`New Chat (${shortcuts.newChat})`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                padding: "3px 8px",
                borderRadius: "6px",
                border: "none",
                background: "var(--primary)",
                color: "white",
                fontSize: "11.5px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Icon name="add" size={13} />
              <span>New</span>
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              title={`Hide History (${shortcuts.toggleHistory})`}
              style={{
                width: "26px",
                height: "26px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-color)",
                color: "var(--text-color-muted)",
                cursor: "pointer",
              }}
            >
              <Icon name="left_panel_close" size={15} />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div style={{ padding: "6px 8px 4px 8px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-color)",
            }}
          >
            <Icon name="search" size={14} style={{ color: "var(--text-color-muted)" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter conversations..."
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--text-color)",
                fontSize: "12px",
                fontFamily: "inherit",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--text-color-muted)",
                  cursor: "pointer",
                  display: "flex",
                }}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Session list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "2px 6px 6px 6px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "18px 8px",
                color: "var(--text-color-muted)",
                fontSize: "12px",
              }}
            >
              {search ? "No matching chats found." : "No chat sessions yet."}
            </div>
          ) : (
            filtered.map((session) => {
              const isActive = session.id === activeSessionId;
              const isEditing = editingId === session.id;
              const skillName = session.skillId
                ? skills.find((sk) => sk.id === session.skillId)?.name
                : null;
              const { folderName } = getSessionWorkspaceInfo(session);
              const displayTitle = getSessionDisplayTitle(session, folderName);

              return (
                <div
                  key={session.id}
                  onClick={() => {
                    selectSession(session.id);
                    setView("chat");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 8px",
                    borderRadius: "7px",
                    border: isActive
                      ? "1px solid var(--primary)"
                      : "1px solid transparent",
                    background: isActive ? "var(--bg-color)" : "transparent",
                    cursor: "pointer",
                    gap: "6px",
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--bg-color)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(session.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={() => commitRename(session.id)}
                        style={{
                          width: "100%",
                          padding: "2px 6px",
                          fontSize: "12.5px",
                          borderRadius: "5px",
                          border: "1px solid var(--primary)",
                          background: "var(--input-bg)",
                          color: "var(--text-color)",
                          outline: "none",
                        }}
                      />
                    ) : (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          <Icon
                            name={
                              folderName
                                ? "folder_open"
                                : skillName
                                ? "smart_toy"
                                : "chat_bubble_outline"
                            }
                            size={14}
                            style={{
                              color: folderName
                                ? "var(--primary)"
                                : skillName
                                ? "var(--tertiary)"
                                : "var(--text-color-muted)",
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: "12.5px",
                              fontWeight: isActive ? 600 : 500,
                              color: isActive
                                ? "var(--primary)"
                                : "var(--text-color)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              lineHeight: 1.25,
                            }}
                            title={displayTitle}
                          >
                            {displayTitle}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "9.5px",
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "var(--text-color-muted)",
                            marginTop: "2px",
                            paddingLeft: "19px",
                          }}
                        >
                          <span>{formatDate(session.updatedAt)}</span>
                          <span>•</span>
                          <span>{session.messages.length} msgs</span>
                          {folderName && (
                            <>
                              <span>•</span>
                              <span
                                style={{
                                  color: "var(--primary)",
                                  fontWeight: 600,
                                  maxWidth: "80px",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={`Workspace: ${folderName}`}
                              >
                                {folderName}
                              </span>
                            </>
                          )}
                          {skillName && (
                            <>
                              <span>•</span>
                              <span
                                style={{
                                  color: "var(--tertiary)",
                                  maxWidth: "70px",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={`Skill: ${skillName}`}
                              >
                                {skillName}
                              </span>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                        flexShrink: 0,
                      }}
                    >
                      <button
                        onClick={(e) =>
                          startRename(session.id, session.title || displayTitle, e)
                        }
                        title="Rename Chat"
                        style={{
                          width: "20px",
                          height: "20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "4px",
                          border: "none",
                          background: "transparent",
                          color: "var(--text-color-muted)",
                          cursor: "pointer",
                        }}
                      >
                        <Icon name="edit" size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                        }}
                        title="Delete Chat"
                        style={{
                          width: "20px",
                          height: "20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "4px",
                          border: "none",
                          background: "transparent",
                          color: "var(--text-color-muted)",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#ba1a1a")}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = "var(--text-color-muted)")
                        }
                      >
                        <Icon name="delete" size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Session count & App info */}
        <div
          style={{
            padding: "8px 10px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            background: "var(--bg-color)",
          }}
        >
          {sessions.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "var(--text-color-muted)",
                }}
              >
                {formatShortcutForDisplay(shortcuts.toggleHistory)} to toggle
              </span>
              <button
                onClick={() => {
                  if (confirm("Clear all chat session history?")) clearAllSessions();
                }}
                style={{
                  padding: "2px 7px",
                  borderRadius: "5px",
                  fontSize: "10.5px",
                  fontFamily: "'JetBrains Mono', monospace",
                  border: "1px solid rgba(186,26,26,0.25)",
                  color: "#ba1a1a",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                Clear All
              </button>
            </div>
          )}

          {/* App & Developer credit link */}
          <button
            onClick={() => {
              setSettingsTab(updateAvailable ? "updates" : "about");
              setView("settings");
            }}
            title={updateAvailable ? `Update available: v${updateAvailable} (Click to update)` : "About KeyLooper & Developer Info"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "4px 6px",
              borderRadius: "6px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--input-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Icon name="spa" size={14} style={{ color: "var(--primary)" }} />
              <span
                style={{
                  fontFamily: "'Crimson Pro', serif",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-color)",
                }}
              >
                KeyLooper <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-color-muted)" }}>v0.2.2</span>
                {updateAvailable && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "var(--primary)",
                      marginLeft: "4px",
                    }}
                  >
                    • v{updateAvailable}
                  </span>
                )}
              </span>
            </div>
            <span
              style={{
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--text-color-muted)",
              }}
            >
              by Stephen Dias
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
