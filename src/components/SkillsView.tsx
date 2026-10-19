import React, { useState } from "react";
import { useAppStore } from "../store/useAppStore";

const Icon = ({ name, className = "", size = 20, style }: { name: string; className?: string; size?: number; style?: React.CSSProperties; }) => (
  <span className={`material-symbols-outlined ${className}`} style={{ fontSize: `${size}px`, ...style }}>{name}</span>
);

const SkillsView: React.FC = () => {
  const skills = useAppStore((s) => s.skills);
  const createSkill = useAppStore((s) => s.createSkill);
  const updateSkill = useAppStore((s) => s.updateSkill);
  const deleteSkill = useAppStore((s) => s.deleteSkill);
  const setView = useAppStore((s) => s.setView);
  const createSession = useAppStore((s) => s.createSession);
  const selectSession = useAppStore((s) => s.selectSession);

  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const toggleCollapse = (id: string) => {
    setExpandedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPrompt.trim()) return;
    createSkill(newName.trim(), newPrompt.trim());
    setNewName("");
    setNewPrompt("");
    setIsCreating(false);
  };

  const startEdit = (skill: any) => {
    setEditingId(skill.id);
    setEditName(skill.name);
    setEditPrompt(skill.systemPrompt);
  };

  const handleSaveEdit = (id: string) => {
    if (!editName.trim() || !editPrompt.trim()) return;
    updateSkill(id, editName.trim(), editPrompt.trim());
    setEditingId(null);
  };

  const handleChatWithSkill = (skillId: string) => {
    const sessionId = createSession(skillId);
    selectSession(sessionId);
    setView("chat");
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
      {/* Back navigation & Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <button
          onClick={() => setView("chat")}
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
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--border-color)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--input-bg)";
          }}
        >
          <Icon name="arrow_back" size={16} />
        </button>
        <div>
          <h2 style={{ fontSize: "19px", fontWeight: 700, color: "var(--text-color)", margin: 0, lineHeight: 1.15 }}>
            Skills & Agents
          </h2>
          <p style={{ fontSize: "12px", color: "var(--text-color-muted)", margin: 0 }}>
            Create and manage specialized persona prompts and AI skills
          </p>
        </div>
      </div>

      {/* Main Content Container */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Create Agent / Skill Section Card */}
        <div style={{ padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--border-color)", background: "var(--input-bg)", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-color)", margin: "0 0 2px 0" }}>
                {isCreating ? "New Agent Persona" : "Create Agent Persona"}
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-color-muted)", margin: 0 }}>
                Define targeted system instructions for specialized agent tasks.
              </p>
            </div>
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                style={{
                  padding: "8px 16px",
                  background: "var(--primary)",
                  color: "white",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Icon name="add" size={16} />
                <span>New Agent</span>
              </button>
            )}
          </div>

          {isCreating && (
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid var(--border-color)", paddingTop: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-color-muted)" }}>AGENT / SKILL NAME</label>
                <input
                  type="text"
                  placeholder="e.g. Code Reviewer, Medical Summary Assistant"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-color)",
                    color: "var(--text-color)",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-color-muted)" }}>SYSTEM PROMPT / INSTRUCTIONS</label>
                <textarea
                  placeholder="System instructions detailing behavior, constraints, and tone..."
                  rows={4}
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-color)",
                    color: "var(--text-color)",
                    fontSize: "13px",
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit"
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    border: "1px solid var(--border-color)",
                    background: "transparent",
                    color: "var(--text-color-muted)",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || !newPrompt.trim()}
                  style={{
                    padding: "6px 16px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    border: "none",
                    background: "var(--primary)",
                    color: "white",
                    cursor: (!newName.trim() || !newPrompt.trim()) ? "not-allowed" : "pointer",
                    opacity: (!newName.trim() || !newPrompt.trim()) ? 0.5 : 1
                  }}
                >
                  Save Agent
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Configured Agents Card Section */}
        <div style={{ padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--border-color)", background: "var(--input-bg)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-color)", margin: "0 0 2px 0" }}>
              Active Agents & Skills ({skills.length})
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-color-muted)", margin: 0 }}>
              Launch dedicated chat sessions pre-configured with agent instructions.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {skills.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", borderRadius: "12px", border: "1px dashed var(--border-color)", background: "var(--bg-color)" }}>
                <p style={{ color: "var(--text-color-muted)", fontSize: "14px", margin: 0, fontStyle: "italic" }}>No agent skills created yet.</p>
              </div>
            ) : (
              skills.map((skill) => (
                <div
                  key={skill.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-color)",
                    gap: "10px"
                  }}
                >
                  {editingId === skill.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <label style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-color-muted)" }}>EDIT AGENT NAME</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-color)", fontSize: "13px" }}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <label style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-color-muted)" }}>EDIT INSTRUCTIONS</label>
                        <textarea
                          rows={4}
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-color)", fontSize: "13px", resize: "vertical", fontFamily: "inherit" }}
                        />
                      </div>
                      <div style={{ display: "flex", justifySelf: "flex-end", gap: "8px", justifyContent: "flex-end" }}>
                        <button onClick={() => setEditingId(null)} style={{ padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-color-muted)", cursor: "pointer" }}>
                          Cancel
                        </button>
                        <button onClick={() => handleSaveEdit(skill.id)} style={{ padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, border: "none", background: "var(--primary)", color: "white", cursor: "pointer" }}>
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                          <Icon name="smart_toy" size={20} style={{ color: "var(--primary)", flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <h4 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-color)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {skill.name}
                            </h4>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                          <button
                            onClick={() => handleChatWithSkill(skill.id)}
                            style={{
                              padding: "4px 12px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              background: "var(--primary)",
                              color: "white",
                              border: "none",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px"
                            }}
                          >
                            <Icon name="chat" size={14} />
                            <span>Chat</span>
                          </button>

                          <button
                            onClick={() => startEdit(skill)}
                            style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px", background: "transparent", border: "none", color: "var(--text-color-muted)", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                            title="Edit Agent"
                          >
                            <Icon name="edit" size={16} />
                          </button>

                          <button
                            onClick={() => deleteSkill(skill.id)}
                            style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px", background: "transparent", border: "none", color: "var(--text-color-muted)", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(186,26,26,0.1)"; e.currentTarget.style.color = "#ba1a1a"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-color-muted)"; }}
                            title="Delete Agent"
                          >
                            <Icon name="delete" size={16} />
                          </button>

                          <button
                            onClick={() => toggleCollapse(skill.id)}
                            style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px", background: "transparent", border: "none", color: "var(--text-color-muted)", cursor: "pointer" }}
                            title={expandedIds.includes(skill.id) ? "Collapse instructions" : "Expand instructions"}
                          >
                            <Icon name={expandedIds.includes(skill.id) ? "expand_less" : "expand_more"} size={18} />
                          </button>
                        </div>
                      </div>

                      {expandedIds.includes(skill.id) && (
                        <div style={{ fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-color-muted)", whiteSpace: "pre-wrap", background: "var(--input-bg)", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                          {skill.systemPrompt}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillsView;
