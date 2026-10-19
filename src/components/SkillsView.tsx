import React, { useState, useRef, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { parseSkillMarkdown, exportSkillToMarkdown } from "../lib/skillParser";

const Icon = ({
  name,
  className = "",
  size = 20,
  style,
}: {
  name: string;
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}) => (
  <span
    className={`material-symbols-outlined ${className}`}
    style={{ fontSize: `${size}px`, ...style }}
  >
    {name}
  </span>
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
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const toggleCollapse = (id: string) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPrompt.trim()) return;
    createSkill(newName.trim(), newPrompt.trim());
    setNewName("");
    setNewPrompt("");
    setIsCreating(false);
    setToast({ text: `Created agent "${newName.trim()}"`, type: "success" });
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
    setToast({ text: `Updated agent "${editName.trim()}"`, type: "success" });
  };

  const handleChatWithSkill = (skillId: string) => {
    const sessionId = createSession(skillId);
    selectSession(sessionId);
    setView("chat");
  };

  const processImportFiles = async (files: FileList | File[]) => {
    const mdFiles = Array.from(files).filter(
      (f) =>
        f.name.endsWith(".md") ||
        f.name.endsWith(".markdown") ||
        f.name.endsWith(".txt")
    );

    if (mdFiles.length === 0) {
      setToast({
        text: "Please select Markdown (.md) or text files.",
        type: "error",
      });
      return;
    }

    try {
      if (mdFiles.length === 1 && isCreating) {
        // Pre-fill the open creation form
        const text = await mdFiles[0].text();
        const parsed = parseSkillMarkdown(mdFiles[0].name, text);
        setNewName(parsed.name);
        setNewPrompt(parsed.systemPrompt);
        setToast({
          text: `Loaded "${parsed.name}" into form. Review and click Save.`,
          type: "success",
        });
      } else if (mdFiles.length === 1 && !isCreating) {
        // Open the form pre-filled with the single imported skill
        const text = await mdFiles[0].text();
        const parsed = parseSkillMarkdown(mdFiles[0].name, text);
        setNewName(parsed.name);
        setNewPrompt(parsed.systemPrompt);
        setIsCreating(true);
        setToast({
          text: `Imported "${parsed.name}". Review and save your agent.`,
          type: "success",
        });
      } else {
        // Multiple files: import all directly into skills list
        let count = 0;
        for (const file of mdFiles) {
          const text = await file.text();
          const parsed = parseSkillMarkdown(file.name, text);
          if (parsed.name && parsed.systemPrompt) {
            createSkill(parsed.name, parsed.systemPrompt);
            count++;
          }
        }
        setIsCreating(false);
        setToast({
          text: `Imported ${count} skill${count > 1 ? "s" : ""} from Markdown.`,
          type: "success",
        });
      }
    } catch (err: any) {
      setToast({
        text: `Failed to import skill: ${err?.message || err}`,
        type: "error",
      });
    }
  };

  const handleExportSkill = (skill: { name: string; systemPrompt: string }) => {
    const md = exportSkillToMarkdown(skill.name, skill.systemPrompt);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${skill.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ text: `Exported "${skill.name}.md"`, type: "success" });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      processImportFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
        position: "relative",
      }}
      className="fade-in"
    >
      {/* Hidden file input for importing .md files */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            processImportFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Drag & drop overlay indicator */}
      {isDragging && (
        <div
          style={{
            position: "absolute",
            inset: "12px",
            background: "rgba(177, 98, 77, 0.12)",
            border: "2px dashed var(--primary)",
            borderRadius: "16px",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            backdropFilter: "blur(2px)",
            pointerEvents: "none",
          }}
        >
          <Icon
            name="upload_file"
            size={40}
            style={{ color: "var(--primary)" }}
          />
          <p
            style={{
              fontSize: "15px",
              fontWeight: 700,
              color: "var(--text-color)",
              margin: 0,
            }}
          >
            Drop Markdown (.md) skill files here to import
          </p>
        </div>
      )}

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
          <h2
            style={{
              fontSize: "19px",
              fontWeight: 700,
              color: "var(--text-color)",
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            Skills & Agents
          </h2>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-color-muted)",
              margin: 0,
            }}
          >
            Create and manage specialized persona prompts and AI skills
          </p>
        </div>
      </div>

      {/* Main Content Container */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Create Agent / Skill Section Card */}
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
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "var(--text-color)",
                  margin: "0 0 2px 0",
                }}
              >
                {isCreating ? "New Agent Persona" : "Create Agent Persona"}
              </h3>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-color-muted)",
                  margin: 0,
                }}
              >
                Define targeted system instructions for specialized agent tasks.
              </p>
            </div>
            {!isCreating && (
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: "8px 14px",
                    background: "var(--tertiary-fixed)",
                    color: "var(--text-color)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                  title="Import skills from Markdown (.md) files"
                >
                  <Icon name="upload_file" size={16} />
                  <span>Import .md</span>
                </button>
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
                    gap: "6px",
                  }}
                >
                  <Icon name="add" size={16} />
                  <span>New Agent</span>
                </button>
              </div>
            )}
          </div>

          {isCreating && (
            <form
              onSubmit={handleCreate}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                borderTop: "1px solid var(--border-color)",
                paddingTop: "14px",
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <label
                    style={{
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "var(--text-color-muted)",
                    }}
                  >
                    AGENT / SKILL NAME
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      background: "transparent",
                      border: "1px dashed var(--border-color)",
                      borderRadius: "6px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      color: "var(--primary)",
                      cursor: "pointer",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                    title="Populate fields from a Markdown (.md) skill file"
                  >
                    <Icon name="upload_file" size={13} />
                    <span>Import from .md</span>
                  </button>
                </div>
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
                    outline: "none",
                  }}
                />
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <label
                  style={{
                    fontSize: "11px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "var(--text-color-muted)",
                  }}
                >
                  SYSTEM PROMPT / INSTRUCTIONS
                </label>
                <textarea
                  placeholder="System instructions detailing behavior, constraints, and tone..."
                  rows={5}
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
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--text-color-muted)",
                    fontStyle: "italic",
                  }}
                >
                  Drag & drop any .md file directly onto this card to populate
                  instructions.
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewName("");
                      setNewPrompt("");
                    }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      border: "1px solid var(--border-color)",
                      background: "transparent",
                      color: "var(--text-color-muted)",
                      cursor: "pointer",
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
                      cursor:
                        !newName.trim() || !newPrompt.trim()
                          ? "not-allowed"
                          : "pointer",
                      opacity: !newName.trim() || !newPrompt.trim() ? 0.5 : 1,
                    }}
                  >
                    Save Agent
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Configured Agents Card Section */}
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
          <div>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--text-color)",
                margin: "0 0 2px 0",
              }}
            >
              Active Agents & Skills ({skills.length})
            </h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-color-muted)",
                margin: 0,
              }}
            >
              Launch dedicated chat sessions pre-configured with agent
              instructions, or export skills as Markdown.
            </p>
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {skills.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px 0",
                  borderRadius: "12px",
                  border: "1px dashed var(--border-color)",
                  background: "var(--bg-color)",
                }}
              >
                <p
                  style={{
                    color: "var(--text-color-muted)",
                    fontSize: "14px",
                    margin: 0,
                    fontStyle: "italic",
                  }}
                >
                  No agent skills created yet. Click "New Agent" or "Import .md"
                  to start.
                </p>
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
                    gap: "10px",
                  }}
                >
                  {editingId === skill.id ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <label
                          style={{
                            fontSize: "11px",
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "var(--text-color-muted)",
                          }}
                        >
                          EDIT AGENT NAME
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-color)",
                            background: "var(--input-bg)",
                            color: "var(--text-color)",
                            fontSize: "13px",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <label
                          style={{
                            fontSize: "11px",
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "var(--text-color-muted)",
                          }}
                        >
                          EDIT INSTRUCTIONS
                        </label>
                        <textarea
                          rows={5}
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-color)",
                            background: "var(--input-bg)",
                            color: "var(--text-color)",
                            fontSize: "13px",
                            resize: "vertical",
                            fontFamily: "inherit",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: "8px",
                        }}
                      >
                        <button
                          onClick={() => setEditingId(null)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: "1px solid var(--border-color)",
                            background: "transparent",
                            color: "var(--text-color-muted)",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(skill.id)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: "none",
                            background: "var(--primary)",
                            color: "white",
                            cursor: "pointer",
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
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
                          <Icon
                            name="smart_toy"
                            size={20}
                            style={{
                              color: "var(--primary)",
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <h4
                              style={{
                                fontSize: "15px",
                                fontWeight: 600,
                                color: "var(--text-color)",
                                margin: 0,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {skill.name}
                            </h4>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexShrink: 0,
                          }}
                        >
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
                              gap: "4px",
                            }}
                          >
                            <Icon name="chat" size={14} />
                            <span>Chat</span>
                          </button>

                          <button
                            onClick={() => handleExportSkill(skill)}
                            style={{
                              width: "28px",
                              height: "28px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "6px",
                              background: "transparent",
                              border: "none",
                              color: "var(--text-color-muted)",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "var(--input-bg)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                            title="Export Skill as Markdown (.md)"
                          >
                            <Icon name="download" size={16} />
                          </button>

                          <button
                            onClick={() => startEdit(skill)}
                            style={{
                              width: "28px",
                              height: "28px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "6px",
                              background: "transparent",
                              border: "none",
                              color: "var(--text-color-muted)",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "var(--input-bg)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                            title="Edit Agent"
                          >
                            <Icon name="edit" size={16} />
                          </button>

                          <button
                            onClick={() => deleteSkill(skill.id)}
                            style={{
                              width: "28px",
                              height: "28px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "6px",
                              background: "transparent",
                              border: "none",
                              color: "var(--text-color-muted)",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "rgba(186,26,26,0.1)";
                              e.currentTarget.style.color = "#ba1a1a";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color =
                                "var(--text-color-muted)";
                            }}
                            title="Delete Agent"
                          >
                            <Icon name="delete" size={16} />
                          </button>

                          <button
                            onClick={() => toggleCollapse(skill.id)}
                            style={{
                              width: "28px",
                              height: "28px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "6px",
                              background: "transparent",
                              border: "none",
                              color: "var(--text-color-muted)",
                              cursor: "pointer",
                            }}
                            title={
                              expandedIds.includes(skill.id)
                                ? "Collapse instructions"
                                : "Expand instructions"
                            }
                          >
                            <Icon
                              name={
                                expandedIds.includes(skill.id)
                                  ? "expand_less"
                                  : "expand_more"
                              }
                              size={18}
                            />
                          </button>
                        </div>
                      </div>

                      {expandedIds.includes(skill.id) && (
                        <div
                          style={{
                            fontSize: "12px",
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "var(--text-color-muted)",
                            whiteSpace: "pre-wrap",
                            background: "var(--input-bg)",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-color)",
                          }}
                        >
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

      {/* Floating Center-Bottom Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "28px",
            left: "50%",
            transform: "translateX(-50%)",
            background:
              toast.type === "error" ? "var(--error)" : "var(--primary)",
            color: "white",
            padding: "8px 18px",
            borderRadius: "20px",
            fontSize: "12px",
            fontFamily: "'JetBrains Mono', monospace",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            zIndex: 1000,
          }}
          className="fade-in"
        >
          <Icon
            name={toast.type === "error" ? "error" : "check_circle"}
            size={16}
          />
          <span>{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              display: "flex",
              padding: 0,
              marginLeft: "4px",
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default SkillsView;
