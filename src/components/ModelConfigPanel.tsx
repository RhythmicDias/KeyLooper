import React, { useState } from "react";
import {
  useAppStore,
  ModelConfig,
  DEFAULT_MODEL_CONFIG,
  selectAvailableModels,
} from "../store/useAppStore";

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  onChange,
}) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    style={{
      width: "34px",
      height: "18px",
      borderRadius: "999px",
      background: checked ? "var(--primary)" : "var(--border-color)",
      position: "relative",
      border: "none",
      cursor: "pointer",
      transition: "background 0.2s",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        background: "#fff",
        position: "absolute",
        top: "2px",
        left: checked ? "18px" : "2px",
        transition: "left 0.2s",
      }}
    />
  </button>
);

export const ModelConfigPanel: React.FC = () => {
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setModel = useAppStore((s) => s.setModel);
  const modelConfigs = useAppStore((s) => s.modelConfigs);
  const updateModelConfig = useAppStore((s) => s.updateModelConfig);
  const availableModels = useAppStore(selectAvailableModels);
  const customModels = useAppStore((s) => s.customModels);
  const deletedModels = useAppStore((s) => s.deletedModels);
  const addCustomModel = useAppStore((s) => s.addCustomModel);
  const deleteModel = useAppStore((s) => s.deleteModel);
  const restoreDefaultsModels = useAppStore((s) => s.restoreDefaultsModels);

  const [newModelInput, setNewModelInput] = useState("");

  const handleAddCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newModelInput.trim();
    if (!trimmed) return;
    addCustomModel(trimmed);
    setModel(trimmed);
    setNewModelInput("");
  };

  const handleRemoveModel = (modelName: string) => {
    const nextAvailable = availableModels.find((m) => m !== modelName);
    if (!nextAvailable) {
      alert("Cannot delete the only available model.");
      return;
    }
    deleteModel(modelName);
    if (selectedModel === modelName) {
      setModel(nextAvailable);
    }
  };

  const rawConfig = modelConfigs[selectedModel];
  const config: ModelConfig = {
    ...DEFAULT_MODEL_CONFIG,
    ...rawConfig,
    tools: {
      ...DEFAULT_MODEL_CONFIG.tools,
      ...(rawConfig?.tools || {}),
    },
    advanced: {
      ...DEFAULT_MODEL_CONFIG.advanced,
      ...(rawConfig?.advanced || {}),
    },
  };

  const updateTool = (key: keyof ModelConfig["tools"], value: boolean) => {
    updateModelConfig(selectedModel, {
      tools: { ...config.tools, [key]: value },
    });
  };

  const updateAdvanced = (key: keyof ModelConfig["advanced"], value: any) => {
    updateModelConfig(selectedModel, {
      advanced: { ...config.advanced, [key]: value },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} className="fade-in">
      {/* Models Bar & Compact Selector Grid */}
      <div
        style={{
          padding: "14px 16px",
          background: "var(--input-bg)",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
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
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-color)", margin: 0 }}>
              Active & Custom Models ({availableModels.length})
            </h3>
            <p style={{ fontSize: "12px", color: "var(--text-color-muted)", margin: 0 }}>
              Click a model to select and configure its parameters below.
            </p>
          </div>

          <form onSubmit={handleAddCustomModel} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Add model ID (e.g. gemini-2.5-pro)"
              value={newModelInput}
              onChange={(e) => setNewModelInput(e.target.value)}
              style={{
                width: "210px",
                padding: "5px 10px",
                borderRadius: "7px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-color)",
                color: "var(--text-color)",
                fontSize: "12px",
                fontFamily: "'JetBrains Mono', monospace",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={!newModelInput.trim()}
              style={{
                padding: "5px 11px",
                background: "var(--primary)",
                color: "white",
                borderRadius: "7px",
                fontSize: "12px",
                fontWeight: 600,
                border: "none",
                cursor: newModelInput.trim() ? "pointer" : "not-allowed",
                opacity: newModelInput.trim() ? 1 : 0.5,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                add
              </span>
              Add
            </button>
            {deletedModels.length > 0 && (
              <button
                type="button"
                onClick={restoreDefaultsModels}
                title="Restore hidden built-in models"
                style={{
                  padding: "5px 9px",
                  background: "var(--bg-color)",
                  color: "var(--text-color-muted)",
                  borderRadius: "7px",
                  fontSize: "11px",
                  border: "1px solid var(--border-color)",
                  cursor: "pointer",
                }}
              >
                Restore ({deletedModels.length})
              </button>
            )}
          </form>
        </div>

        {/* Compact Model Pills Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))",
            gap: "8px",
          }}
        >
          {availableModels.map((m) => {
            const isSelected = selectedModel === m;
            const isCustom = customModels.includes(m);
            return (
              <div
                key={m}
                onClick={() => setModel(m)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  borderRadius: "9px",
                  border: isSelected
                    ? "1.5px solid var(--primary)"
                    : "1px solid var(--border-color)",
                  background: isSelected ? "var(--bg-color)" : "transparent",
                  cursor: "pointer",
                  gap: "6px",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: "12.5px",
                      fontWeight: isSelected ? 700 : 500,
                      color: isSelected ? "var(--primary)" : "var(--text-color)",
                      fontFamily: "'JetBrains Mono', monospace",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {m}
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--text-color-muted)",
                      display: "flex",
                      gap: "6px",
                    }}
                  >
                    <span>{isCustom ? "Custom" : "Built-in"}</span>
                    {isSelected && <span style={{ color: "var(--primary)", fontWeight: 600 }}>• Active</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveModel(m);
                  }}
                  title={`Remove ${m}`}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--text-color-muted)",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    borderRadius: "4px",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                    close
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Parameters & System Instructions for Selected Model */}
      <div
        style={{
          padding: "14px 16px",
          background: "var(--input-bg)",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "17px", color: "var(--primary)" }}>
              tune
            </span>
            <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-color)" }}>
              Configuration for{" "}
              <code style={{ color: "var(--primary)", fontFamily: "'JetBrains Mono', monospace", fontSize: "12.5px" }}>
                {selectedModel}
              </code>
            </span>
          </div>
        </div>

        {/* System Instructions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label
            style={{
              fontSize: "10.5px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--text-color-muted)",
            }}
          >
            SYSTEM INSTRUCTIONS (DEFAULT PERSONA)
          </label>
          <textarea
            value={config.systemInstructions}
            onChange={(e) =>
              updateModelConfig(selectedModel, { systemInstructions: e.target.value })
            }
            placeholder="Optional default system instructions for this model..."
            rows={2}
            style={{
              padding: "7px 10px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-color)",
              color: "var(--text-color)",
              fontSize: "13px",
              outline: "none",
              resize: "vertical",
              width: "100%",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* 4-column Generation Controls */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <label
              style={{
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--text-color-muted)",
              }}
            >
              THINKING BUDGET (2.5+)
            </label>
            <select
              value={config.thinkingLevel}
              onChange={(e) =>
                updateModelConfig(selectedModel, {
                  thinkingLevel: e.target.value as ModelConfig["thinkingLevel"],
                })
              }
              style={{
                padding: "6px 8px",
                borderRadius: "7px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-color)",
                color: "var(--text-color)",
                fontSize: "12.5px",
                outline: "none",
              }}
            >
              <option value="Off">Off (Fastest)</option>
              <option value="Low">Low (1K tokens)</option>
              <option value="Medium">Medium (8K tokens)</option>
              <option value="High">High (24K tokens)</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <label
              style={{
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--text-color-muted)",
              }}
            >
              TEMPERATURE ({(config.temperature ?? 1.0).toFixed(1)})
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature ?? 1.0}
              onChange={(e) =>
                updateModelConfig(selectedModel, { temperature: parseFloat(e.target.value) })
              }
              style={{ accentColor: "var(--primary)", marginTop: "6px", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <label
              style={{
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--text-color-muted)",
              }}
            >
              SAFETY FILTER
            </label>
            <select
              value={config.advanced.safetySettings}
              onChange={(e) => updateAdvanced("safetySettings", e.target.value)}
              style={{
                padding: "6px 8px",
                borderRadius: "7px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-color)",
                color: "var(--text-color)",
                fontSize: "12.5px",
                outline: "none",
              }}
            >
              <option value="Block None">Block None</option>
              <option value="Block Few">Block Few (High Only)</option>
              <option value="Block Some">Block Some (Default)</option>
              <option value="Block Most">Block Most (Strict)</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <label
              style={{
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--text-color-muted)",
              }}
            >
              MAX OUTPUT TOKENS
            </label>
            <input
              type="number"
              min={64}
              max={65536}
              value={config.advanced.outputLength}
              onChange={(e) => updateAdvanced("outputLength", Number(e.target.value))}
              style={{
                padding: "5px 8px",
                borderRadius: "7px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-color)",
                color: "var(--text-color)",
                fontSize: "12.5px",
                fontFamily: "'JetBrains Mono', monospace",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Stop Sequences */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <label
            style={{
              fontSize: "10px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--text-color-muted)",
              whiteSpace: "nowrap",
            }}
          >
            STOP SEQUENCES (CSV):
          </label>
          <input
            type="text"
            placeholder="Optional, e.g. END_TURN, ###"
            value={config.advanced.stopSequences}
            onChange={(e) => updateAdvanced("stopSequences", e.target.value)}
            style={{
              flex: 1,
              padding: "5px 10px",
              borderRadius: "7px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-color)",
              color: "var(--text-color)",
              fontSize: "12px",
              fontFamily: "'JetBrains Mono', monospace",
              outline: "none",
            }}
          />
        </div>

        {/* Built-in Tools Grid */}
        <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "10px" }}>
          <div
            style={{
              fontSize: "10.5px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--text-color-muted)",
              marginBottom: "6px",
            }}
          >
            MODEL TOOLS & INTEGRATIONS
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "8px",
            }}
          >
            {[
              {
                label: "Google Search Grounding",
                desc: "Live web search results",
                key: "groundingGoogleSearch" as const,
              },
              {
                label: "Python Code Execution",
                desc: "Run sandboxed calculations",
                key: "codeExecution" as const,
              },
              {
                label: "URL Context Fetching",
                desc: "Read URLs mentioned in prompt",
                key: "urlContext" as const,
              },
              {
                label: "Local DOCX / HTML Export",
                desc: "Save generated files to disk",
                key: "localFileExport" as const,
              },
            ].map((tool) => (
              <div
                key={tool.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-color)",
                }}
              >
                <div>
                  <div style={{ fontSize: "12.5px", color: "var(--text-color)", fontWeight: 600 }}>
                    {tool.label}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-color-muted)" }}>
                    {tool.desc}
                  </div>
                </div>
                <Toggle
                  checked={Boolean(config.tools[tool.key])}
                  onChange={(v) => updateTool(tool.key, v)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
