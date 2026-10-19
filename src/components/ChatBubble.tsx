import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatMessage } from "../lib/geminiClient";
import { useAppStore } from "../store/useAppStore";

interface ChatBubbleProps {
  message: ChatMessage;
  onEdit?: (newText: string) => void;
  onResend?: () => void;
  isLastMessage: boolean;
  hasError?: boolean;
}

const Icon = ({
  name,
  style,
  size = 16,
}: {
  name: string;
  style?: React.CSSProperties;
  size?: number;
}) => (
  <span className="material-symbols-outlined" style={{ fontSize: `${size}px`, ...style }}>
    {name}
  </span>
);

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  onEdit,
  onResend,
  isLastMessage,
  hasError,
}) => {
  const theme = useAppStore((s) => s.theme);
  const isUser = message.role === "user";
  const text = message.parts.map((p) => p.text).filter(Boolean).join("") || "";
  const images = message.parts.filter(
    (p) => p.inlineData && p.inlineData.mimeType.startsWith("image/") && p.inlineData.data !== "[stripped]"
  );
  const audios = message.parts.filter(
    (p) =>
      (p.inlineData && p.inlineData.mimeType.startsWith("audio/") && p.inlineData.data !== "[stripped]") ||
      (p.fileData && p.fileData.mimeType.startsWith("audio/"))
  );
  const docs = message.parts.filter(
    (p) =>
      p.fileData &&
      !p.fileData.mimeType.startsWith("audio/") &&
      !p.fileData.mimeType.startsWith("image/") &&
      !p.fileData.mimeType.startsWith("video/")
  );

  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    if (onEdit && editText.trim() !== "" && editText !== text) {
      onEdit(editText.trim());
    }
    setIsEditing(false);
  };

  if (isUser) {
    return (
      <div
        className="fade-in"
        style={{ display: "flex", justifyContent: "flex-end", padding: "6px 0", width: "100%" }}
      >
        <div
          style={{
            maxWidth: "75%",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "6px",
          }}
        >
          {images.map((part, i) => (
            <img
              key={`img-${i}`}
              src={`data:${part.inlineData!.mimeType};base64,${part.inlineData!.data}`}
              alt="attachment"
              style={{
                maxHeight: "208px",
                borderRadius: "1rem",
                border: "1px solid var(--border-color)",
                boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
              }}
            />
          ))}
          {audios.map((part, i) => (
            <div
              key={`aud-${i}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                background: "var(--input-bg)",
                padding: "10px 14px",
                borderRadius: "1rem",
                border: "1px solid var(--border-color)",
              }}
            >
              <Icon name="audio_file" size={22} style={{ color: "var(--primary)", marginBottom: "6px" }} />
              {part.inlineData ? (
                <audio
                  controls
                  src={`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`}
                  style={{ height: "34px", maxWidth: "240px" }}
                />
              ) : (
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--text-color-muted)",
                    fontFamily: "'Crimson Pro', serif",
                  }}
                >
                  Audio File Attached
                </span>
              )}
            </div>
          ))}
          {docs.map((part, i) => (
            <div
              key={`doc-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--input-bg)",
                padding: "8px 12px",
                borderRadius: "1rem",
                border: "1px solid var(--border-color)",
              }}
            >
              <Icon name="description" size={18} style={{ color: "var(--primary)" }} />
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--text-color)",
                  fontFamily: "'Crimson Pro', serif",
                }}
              >
                {part.fileData?.mimeType.split("/")[1] || "Document"} Attached
              </span>
            </div>
          ))}
          {isEditing ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                width: "100%",
                minWidth: "300px",
              }}
            >
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "14px",
                  border: "1px solid var(--primary)",
                  background: "var(--input-bg)",
                  color: "var(--text-color)",
                  fontFamily: "'Crimson Pro', serif",
                  fontSize: "16px",
                  outline: "none",
                  resize: "vertical",
                }}
                rows={3}
              />
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setIsEditing(false)}
                  style={{
                    padding: "5px 12px",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                    color: "var(--text-color-muted)",
                    cursor: "pointer",
                    background: "transparent",
                    fontSize: "13px",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  style={{
                    padding: "5px 12px",
                    background: "var(--primary)",
                    border: "none",
                    borderRadius: "8px",
                    color: "white",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  Save & Resend
                </button>
              </div>
            </div>
          ) : (
            <>
              {text && (
                <div
                  className="bubble-user"
                  style={{
                    padding: "12px 18px",
                    fontFamily: "'Crimson Pro', serif",
                    fontSize: "17px",
                    lineHeight: "26px",
                    color: "var(--text-color)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {text}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  opacity: 0.55,
                  transition: "opacity 0.2s",
                  width: "100%",
                  alignItems: "center",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.55")}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "var(--text-color-muted)",
                    marginRight: "auto",
                  }}
                >
                  {message.modelName &&
                    message.apiKeyName &&
                    `${message.modelName} via ${message.apiKeyName} | `}
                  {message.usage?.promptTokens !== undefined &&
                    `In: ${message.usage.promptTokens}`}
                </span>
                <button
                  onClick={handleCopy}
                  title="Copy"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-color-muted)",
                  }}
                >
                  <Icon name={copied ? "check" : "content_copy"} size={15} />
                </button>
                {onEdit && (
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setEditText(text);
                    }}
                    title="Edit"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-color-muted)",
                    }}
                  >
                    <Icon name="edit" size={15} />
                  </button>
                )}
                {onResend && (isLastMessage || hasError) && (
                  <button
                    onClick={onResend}
                    title="Resend"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-color-muted)",
                    }}
                  >
                    <Icon name="refresh" size={15} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // AI bubble
  return (
    <div
      className="fade-in"
      style={{
        display: "flex",
        justifyContent: "flex-start",
        padding: "6px 0",
        gap: "12px",
        width: "100%",
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
        <Icon name="spa" size={15} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Crimson Pro', serif",
            fontSize: "17px",
            lineHeight: "28px",
            color: "var(--text-color)",
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const isInline = !match && !String(children).includes("\n");
                return isInline ? (
                  <code
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "12.5px",
                      background: "var(--tertiary-fixed)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "4px",
                      padding: "1px 6px",
                      color: "var(--tertiary)",
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                    }}
                    {...props}
                  >
                    {children}
                  </code>
                ) : (
                  <SyntaxHighlighter
                    style={theme === "dark" ? oneDark : oneLight}
                    language={match ? match[1] : "text"}
                    PreTag="div"
                    customStyle={{
                      borderRadius: "12px",
                      border: "1px solid var(--border-color)",
                      fontSize: "12.5px",
                      margin: "8px 0",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                );
              },
              a({ children, href }) {
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--tertiary)",
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                    }}
                  >
                    {children}
                  </a>
                );
              },
              table({ children }) {
                return (
                  <div
                    className="overflow-x-auto my-3 rounded-xl"
                    style={{ border: "1px solid var(--border-color)" }}
                  >
                    <table className="min-w-full text-sm">{children}</table>
                  </div>
                );
              },
              th({ children }) {
                return (
                  <th
                    style={{
                      background: "var(--input-bg)",
                      padding: "8px 14px",
                      textAlign: "left",
                      borderBottom: "1px solid var(--border-color)",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      color: "var(--text-color-muted)",
                    }}
                  >
                    {children}
                  </th>
                );
              },
              td({ children }) {
                return (
                  <td
                    style={{
                      padding: "8px 14px",
                      borderBottom: "1px solid var(--border-color)",
                      color: "var(--text-color)",
                    }}
                  >
                    {children}
                  </td>
                );
              },
            }}
          >
            {text}
          </ReactMarkdown>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            opacity: 0.55,
            transition: "opacity 0.2s",
            marginTop: "2px",
            alignItems: "center",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.55")}
        >
          <span
            style={{
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--text-color-muted)",
              marginRight: "auto",
            }}
          >
            {message.modelName &&
              message.apiKeyName &&
              `${message.modelName} via ${message.apiKeyName} | `}
            {message.usage?.completionTokens !== undefined &&
              `Out: ${message.usage.completionTokens} | Total: ${message.usage.totalTokens}`}
            {message.usage?.latencyMs !== undefined &&
              ` | ${(message.usage.latencyMs / 1000).toFixed(1)}s`}
          </span>
          <button
            onClick={handleCopy}
            title="Copy"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-color-muted)",
            }}
          >
            <Icon name={copied ? "check" : "content_copy"} size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatBubble;
