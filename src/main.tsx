import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// ─── Custom right-click context menu (replaces browser default) ───────────────
(() => {
  let menu: HTMLDivElement | null = null;

  const dismiss = () => {
    if (menu) {
      menu.remove();
      menu = null;
    }
  };

  const isTextArea = (el: HTMLElement): boolean => {
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return true;
    if (el.closest(".bubble-user, .bubble-ai, pre, code")) return true;
    if (el.isContentEditable) return true;
    if (window.getSelection()?.toString()) return true;
    return false;
  };

  const isEditable = (el: HTMLElement): boolean => {
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
  };

  /** Update a React-controlled input/textarea value at selection range and trigger React onChange. */
  const replaceEditableSelection = (
    el: HTMLInputElement | HTMLTextAreaElement,
    replacement: string
  ) => {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const nextValue = el.value.slice(0, start) + replacement + el.value.slice(end);
    const proto =
      el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(el, nextValue);
    } else {
      el.value = nextValue;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const cursor = start + replacement.length;
    el.setSelectionRange(cursor, cursor);
  };

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    dismiss();

    const target = e.target as HTMLElement;
    if (!isTextArea(target)) return;

    const editable = isEditable(target);
    const selectedText = window.getSelection()?.toString() || "";
    const hasSelection = selectedText.length > 0;

    const items: {
      label: string;
      shortcut: string;
      action: () => void;
      disabled: boolean;
    }[] = [
      {
        label: "Cut",
        shortcut: "Ctrl+X",
        disabled: !editable || !hasSelection,
        action: async () => {
          if (!selectedText) return;
          await navigator.clipboard.writeText(selectedText);
          if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
            replaceEditableSelection(
              target as HTMLInputElement | HTMLTextAreaElement,
              ""
            );
          }
        },
      },
      {
        label: "Copy",
        shortcut: "Ctrl+C",
        disabled: !hasSelection,
        action: async () => {
          if (selectedText) {
            await navigator.clipboard.writeText(selectedText);
          }
        },
      },
      {
        label: "Paste",
        shortcut: "Ctrl+V",
        disabled: !editable,
        action: async () => {
          try {
            const clipText = await navigator.clipboard.readText();
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
              replaceEditableSelection(
                target as HTMLInputElement | HTMLTextAreaElement,
                clipText
              );
            }
          } catch {}
        },
      },
      {
        label: "Select All",
        shortcut: "Ctrl+A",
        disabled: false,
        action: () => {
          if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
            (target as HTMLInputElement).select();
          } else {
            const range = document.createRange();
            range.selectNodeContents(target);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        },
      },
    ];

    menu = document.createElement("div");
    menu.style.cssText = `
      position:fixed; z-index:99999;
      min-width:170px; padding:4px 0;
      background:var(--bg-color, #fff); border:1px solid var(--border-color, #ddd);
      border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.18);
      font-family:'Crimson Pro',serif; font-size:14px;
      color:var(--text-color, #333); user-select:none;
    `;

    items.forEach((item, i) => {
      if (i === 3) {
        const sep = document.createElement("div");
        sep.style.cssText =
          "height:1px; margin:4px 8px; background:var(--border-color, #ddd);";
        menu!.appendChild(sep);
      }

      const row = document.createElement("div");
      row.style.cssText = `
        display:flex; align-items:center; justify-content:space-between;
        padding:6px 14px; cursor:${item.disabled ? "default" : "pointer"};
        opacity:${item.disabled ? "0.35" : "1"};
        transition:background 0.1s;
      `;
      row.innerHTML = `
        <span>${item.label}</span>
        <span style="font-size:11px;color:var(--text-color-muted,#999);font-family:'JetBrains Mono',monospace">${item.shortcut}</span>
      `;

      if (!item.disabled) {
        row.addEventListener("mouseenter", () => {
          row.style.background = "var(--input-bg, #f5f5f5)";
        });
        row.addEventListener("mouseleave", () => {
          row.style.background = "transparent";
        });
        row.addEventListener("click", () => {
          dismiss();
          target.focus();
          item.action();
        });
      }

      menu!.appendChild(row);
    });

    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    let x = e.clientX,
      y = e.clientY;
    if (x + rect.width > window.innerWidth)
      x = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight)
      y = window.innerHeight - rect.height - 4;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  });

  document.addEventListener("click", dismiss);
  document.addEventListener("scroll", dismiss, true);
  window.addEventListener("blur", dismiss);
})();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
