/**
 * Sidebar.tsx — Collapsible Chat History Side Panel.
 * Smoothly slides in/out from the left side of the workspace.
 */

import React, { useState } from "react";
import { useAppStore } from "../store/useAppStore";

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
  const skills = useAppStore((s) => s.skills);
  const shortcuts = useAppStore((s) => s.shortcuts);

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filtered = sessions.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
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
        width: isSidebarOpen ? "272px" : "0px",
        minWidth: isSidebarOpen ? "272px" : "0px",
        opacity: isSidebarOpen ? 1 : 0,
        overflow: "hidden",
        borderRight: isSidebarOpen ? "1px solid var(--border-color)" : "none",
        background: "var(--input-bg)",
        backdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.22s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease",
        flexShrink: 0,
        zIndex: 30,
      }}
    >
      <div
        style={{
          width: "272px",
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
            padding: "12px 12px 10px 14px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="history" size={17} style={{ color: "var(--primary)" }} />
            <span
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "var(--text-color)",
                letterSpacing: "-0.01em",
              }}
            >
              History
            </span>
            <span
              style={{
                fontSize: "10.5px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--text-color-muted)",
                background: "var(--bg-color)",
                padding: "1px 6px",
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
                gap: "4px",
                padding: "4px 9px",
                borderRadius: "7px",
                border: "none",
                background: "var(--primary)",
                color: "white",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Icon name="add" size={14} />
              <span>New</span>
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              title={`Hide History (${shortcuts.toggleHistory})`}
              style={{
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "7px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-color)",
                color: "var(--text-color-muted)",
                cursor: "pointer",
              }}
            >
              <Icon name="left_panel_close" size={16} />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div style={{ padding: "8px 10px 6px 10px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 10px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-color)",
            }}
          >
            <Icon name="search" size={15} style={{ color: "var(--text-color-muted)" }} />
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
                fontSize: "12.5px",
                fontFamily: "'Crimson Pro', serif",
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
                <Icon name="close" size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Session list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "4px 10px 12px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "28px 12px",
                color: "var(--text-color-muted)",
                fontSize: "13px",
                fontStyle: "italic",
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
                    padding: "7px 10px",
                    borderRadius: "9px",
                    border: isActive
                      ? "1px solid var(--primary)"
                      : "1px solid transparent",
                    background: isActive ? "var(--bg-color)" : "transparent",
                    cursor: "pointer",
                    gap: "8px",
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
                          fontSize: "13px",
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
                            fontSize: "13.5px",
                            fontWeight: isActive ? 700 : 500,
                            color: isActive ? "var(--primary)" : "var(--text-color)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            lineHeight: 1.25,
                          }}
                        >
                          {session.title}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "10px",
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "var(--text-color-muted)",
                            marginTop: "2px",
                          }}
                        >
                          <span>{formatDate(session.updatedAt)}</span>
                          <span>•</span>
                          <span>{session.messages.length} msgs</span>
                          {skillName && (
                            <>
                              <span>•</span>
                              <span
                                style={{
                                  color: "var(--tertiary)",
                                  maxWidth: "85px",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
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
                        onClick={(e) => startRename(session.id, session.title, e)}
                        title="Rename Chat"
                        style={{
                          width: "22px",
                          height: "22px",
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
                        <Icon name="edit" size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                        }}
                        title="Delete Chat"
                        style={{
                          width: "22px",
                          height: "22px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "5px",
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
                        <Icon name="delete" size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Clear All */}
        {sessions.length > 0 && (
          <div
            style={{
              padding: "8px 10px",
              borderTop: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "10.5px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--text-color-muted)",
              }}
            >
              {shortcuts.toggleHistory} to toggle
            </span>
            <button
              onClick={() => {
                if (confirm("Clear all chat session history?")) clearAllSessions();
              }}
              style={{
                padding: "4px 9px",
                borderRadius: "6px",
                fontSize: "11px",
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
      </div>
    </aside>
  );
};

export default Sidebar;
