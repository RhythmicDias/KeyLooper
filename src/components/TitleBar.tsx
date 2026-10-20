import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const TitleBar: React.FC = () => {
  const handleDoubleClick = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const win = getCurrentWindow();
    const isMax = await win.isMaximized();
    if (isMax) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    // Only drag with primary left mouse button, and ignore clicks on buttons/inputs
    if (e.button === 0 && !(e.target as HTMLElement).closest("button, input, select, textarea")) {
      const win = getCurrentWindow();
      try {
        await win.startDragging();
      } catch (err) {
        // Fallback to data-tauri-drag-region
      }
    }
  };

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className="flex items-center justify-between select-none"
      style={{
        height: "36px",
        background: "var(--bg-color)",
        color: "var(--text-color-muted)",
        display: "flex",
        userSelect: "none",
        flexShrink: 0,
        position: "relative",
        zIndex: 9999,
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-3 w-full h-full"
        style={{ paddingLeft: "20px", cursor: "default", WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "18px", color: "var(--primary)", pointerEvents: "none" }}
        >
          spa
        </span>
        <span
          style={{
            fontFamily: "'Crimson Pro', serif",
            fontSize: "15px",
            fontWeight: 600,
            letterSpacing: "0.02em",
            pointerEvents: "none",
          }}
        >
          KeyLooper
        </span>
      </div>

      <div
        className="flex items-center h-full flex-shrink-0 gap-1"
        style={{ paddingRight: "24px", WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          aria-label="Minimize"
          className="h-full px-3 flex items-center justify-center transition-colors rounded-md my-1"
          style={{ cursor: "default", width: "40px" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--input-bg)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          onClick={() => getCurrentWindow().minimize()}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px", pointerEvents: "none" }}>
            minimize
          </span>
        </button>
        <button
          aria-label="Maximize"
          className="h-full px-3 flex items-center justify-center transition-colors rounded-md my-1"
          style={{ cursor: "default", width: "40px" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--input-bg)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          onClick={async () => {
            const win = getCurrentWindow();
            const isMax = await win.isMaximized();
            if (isMax) {
              await win.unmaximize();
            } else {
              await win.maximize();
            }
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px", pointerEvents: "none" }}>
            crop_square
          </span>
        </button>
        <button
          aria-label="Close"
          className="h-full px-3 flex items-center justify-center transition-colors rounded-md my-1"
          style={{ cursor: "default", width: "40px" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#e81123";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-color-muted)";
          }}
          onClick={async () => {
            const win = getCurrentWindow();
            await win.close();
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px", pointerEvents: "none" }}>
            close
          </span>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
