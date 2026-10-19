import React, { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMac } from "../store/useAppStore";

const TitleBar: React.FC = () => {
  const [trafficHovered, setTrafficHovered] = useState(false);

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
        // Fallback to data-tauri-drag-region if startDragging is not available
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
      {isMac ? (
        /* macOS Layout: Traffic lights on left, Centered Title */
        <>
          <div
            className="flex items-center gap-2 pl-3 h-full flex-shrink-0"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            onMouseEnter={() => setTrafficHovered(true)}
            onMouseLeave={() => setTrafficHovered(false)}
          >
            {/* Close */}
            <button
              aria-label="Close"
              className="flex items-center justify-center rounded-full transition-transform active:scale-95"
              style={{
                width: "12px",
                height: "12px",
                background: "#ff5f56",
                border: "1px solid #e0443e",
                cursor: "default",
                padding: 0,
              }}
              onClick={async () => {
                const win = getCurrentWindow();
                await win.close();
              }}
            >
              <span
                style={{
                  fontSize: "9px",
                  lineHeight: "1",
                  fontWeight: 700,
                  color: "#4c0000",
                  opacity: trafficHovered ? 0.8 : 0,
                  transition: "opacity 0.15s ease",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              >
                ✕
              </span>
            </button>

            {/* Minimize */}
            <button
              aria-label="Minimize"
              className="flex items-center justify-center rounded-full transition-transform active:scale-95"
              style={{
                width: "12px",
                height: "12px",
                background: "#ffbd2e",
                border: "1px solid #dea123",
                cursor: "default",
                padding: 0,
              }}
              onClick={() => getCurrentWindow().minimize()}
            >
              <span
                style={{
                  fontSize: "11px",
                  lineHeight: "1",
                  fontWeight: 700,
                  color: "#5c4000",
                  opacity: trafficHovered ? 0.8 : 0,
                  transition: "opacity 0.15s ease",
                  userSelect: "none",
                  pointerEvents: "none",
                  marginTop: "-1px",
                }}
              >
                −
              </span>
            </button>

            {/* Maximize / Zoom */}
            <button
              aria-label="Zoom"
              className="flex items-center justify-center rounded-full transition-transform active:scale-95"
              style={{
                width: "12px",
                height: "12px",
                background: "#27c93f",
                border: "1px solid #1aab29",
                cursor: "default",
                padding: 0,
              }}
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
              <span
                style={{
                  fontSize: "9px",
                  lineHeight: "1",
                  fontWeight: 700,
                  color: "#004d00",
                  opacity: trafficHovered ? 0.8 : 0,
                  transition: "opacity 0.15s ease",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              >
                +
              </span>
            </button>
          </div>

          {/* Centered Title */}
          <div
            data-tauri-drag-region
            className="flex items-center justify-center gap-2 flex-grow h-full"
            style={{ cursor: "default", WebkitAppRegion: "drag" } as React.CSSProperties}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "16px", color: "var(--primary)", pointerEvents: "none" }}
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

          {/* Spacer to keep center balanced */}
          <div className="w-[68px] flex-shrink-0" style={{ pointerEvents: "none" }} />
        </>
      ) : (
        /* Windows / Linux Layout: Title on left, Window Controls on right */
        <>
          <div
            data-tauri-drag-region
            className="flex items-center gap-4 w-full h-full"
            style={{ paddingLeft: "24px", cursor: "default", WebkitAppRegion: "drag" } as React.CSSProperties}
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
                fontSize: "16px",
                fontWeight: 600,
                letterSpacing: "0.02em",
                pointerEvents: "none",
              }}
            >
              KeyLooper
            </span>
          </div>

          <div
            className="flex items-center h-full flex-shrink-0 gap-1 pr-4"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <button
              className="h-full px-3 flex items-center justify-center transition-colors rounded-md my-1"
              style={{ cursor: "default", width: "42px" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--input-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onClick={() => getCurrentWindow().minimize()}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px", pointerEvents: "none" }}>
                minimize
              </span>
            </button>
            <button
              className="h-full px-3 flex items-center justify-center transition-colors rounded-md my-1"
              style={{ cursor: "default", width: "42px" }}
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
              className="h-full px-3 flex items-center justify-center transition-colors rounded-md my-1"
              style={{ cursor: "default", width: "42px" }}
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
        </>
      )}
    </div>
  );
};

export default TitleBar;
