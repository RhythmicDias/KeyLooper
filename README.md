# KeyLooper

<img src="app-icon.svg" width="120" align="right" alt="KeyLooper Icon" />

**Unlimited Gemini API desktop client powered by secure, local sequential key rotation.**

> A premium local-first LLM workspace built with Tauri + React, designed to maximize the utility of free Gemini API keys through intelligent round-robin rotation.

---

## Key Features

- **Sequential API Key Rotation** — Pool up to 20+ free-tier Gemini keys and rotate them automatically, so you effectively never hit a rate limit.
- **Dual-Mode Operation** — Toggle between **Normal** (single active key) and **Unlimited** (full round-robin rotation) with an animated glowing switch.
- **Custom Model Management** — Easily add, configure, and manage custom Gemini AI models directly from the Settings interface.
- **Auto-Focus Chat Input** — Continuous focus management ensuring the prompt textarea automatically regains focus after the AI responds.
- **Native Keyboard Shortcuts** — Full cross-platform keyboard shortcut support (Windows & macOS) for quick navigation, sending messages, and controlling sessions.
- **HTML Artifact Generation & Auto-Download** — Automatically generate HTML files/artifacts with instant client-side download triggers.
- **Google AI Studio Quick Link** — Dedicated `API` dock button to open Google AI Studio (`https://aistudio.google.com/`) directly in your browser for fast API key retrieval.
- **Secure OS Keyring Integration** — API keys are stored securely using your operating system's native credential manager.
- **Seamless Dark & Light Themes** — Modern color-scheme aware theme engine with full dark mode support, glassmorphism panels, and customized native dropdown menus.
- **Audio Upload & Speech Transcription** — Upload audio files (MP3, WAV, M4A, OGG, AAC, WEBP audio) for automated AI audio transcription, translation, and analysis.
- **Multi-Format Upload & Docx Processing** — Drag-and-drop support for PDFs, DOCX documents, audio files, images (PNG, JPEG, WEBP), plain text, and CSV files.
- **Custom AI Skills & Agents** — Create and manage distinct personas with custom system prompts for specialized tasks (e.g., Code Review, Writing Assistance).
- **Advanced Model Configuration** — Fine-tune AI behavior with adjustable thinking levels (Low, Medium, High), output lengths, safety settings, and grounding tools.
- **Detailed Usage Statistics** — Track token consumption with comprehensive metrics broken down by day, model, and individual API key.
- **Session Management** — Organize workflows into multiple concurrent chat sessions with auto-generated titles and local persistence.
- **Local-First Privacy** — API keys and chat history live exclusively on your device; nothing is sent to third-party tracking servers.

---

## Keyboard Shortcuts (Fully Customizable in Settings)

| Default Shortcut (Win) | Default Shortcut (macOS) | Action |
|---|---|---|
| `Enter` / `Ctrl + Enter` | `Enter` / `Cmd + Enter` | Send message |
| `Ctrl + N` | `Cmd + N` | New chat session |
| `Ctrl + H` | `Cmd + H` | Toggle History side panel |
| `Ctrl + ,` | `Cmd + ,` | Open / close Settings |
| `Alt + A` | `Option + A` | Open Agents & Skills |
| `Ctrl + Shift + D` | `Cmd + Shift + D` | Toggle Dark / Light mode |
| `Ctrl + B` | `Cmd + B` | Show / hide bottom dock |
| `Alt + M` | `Option + M` | Toggle voice dictation |
| `Alt + G` | `Option + G` | Select active model |
| `Ctrl + Shift + M` | `Cmd + Shift + M` | Cycle routing mode (Normal / Unlimited / Pro) |
| `Ctrl + L` | `Cmd + L` | Clear active chat messages |
| `Ctrl + /` | `Cmd + /` | Focus chat input |

---

## Installation & Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [Rust](https://rustup.rs/) (stable)
- WebView2 (Windows — pre-installed on Win 10/11)

### Steps

```bash
# Step 1: Clone the repository
git clone https://github.com/RhythmicDias/KeyLooper.git
cd KeyLooper

# Step 2: Install dependencies
npm install

# Step 3: Launch in development mode
npm run tauri dev
```

---

## How It Works — Routing & Rotation

KeyLooper uses a rotation engine to distribute your API requests based on your selected mode:

### 1. Normal Mode (Single Active Key)
In Normal mode, the app uses the **first healthy key** in your list. 
- If a rate limit is hit, that key goes on a 60-second cooldown, and the app temporarily falls back to the next key.
- If you pause for 2-3 minutes (allowing the cooldown to expire), the app immediately routes back through the primary key on your next request.

### 2. Unlimited Mode (Round-Robin)
In Unlimited mode, the app uses strict **sequential round-robin** rotation to balance the load equally across all your accounts.
- The app maintains a global index pointer that remembers exactly which key it used last. 
- Even if you pause for several minutes or hours, the app remembers where it left off and routes your next message through the *next* key in the sequence, not starting over from the top.

```text
User sends message M1 → Key A (index 0) → index becomes 1
User sends message M2 → Key B (index 1) → index becomes 2
User sends message M3 → Key C (index 2) → index becomes 3
User sends message M4 → Key A (index 0) → wraps back to 0
```

**Graceful Failure Handling (Both Modes):**
1. Key returns `429 Rate Limited` → marked as rate-limited (60s cooldown) → skipped automatically
2. Key returns `400/401/403 Invalid` → marked as invalid → skipped permanently until manually fixed
3. Retries up to **3 times** across different keys before surfacing an error dialog

---

## Color Palette

| Token | Hex | Role |
|---|---|---|
| Charcoal Gray | `#35302c` | App background (Dark) |
| Terracotta Accent | `#b1624d` | Primary buttons, toggles, accents |
| Warm Taupe | `#8c7d6e` | Secondary UI elements |
| Muted Gray | `#d5cdc5` | Secondary text |
| Off-White | `#f8f5f1` | Primary text, App background (Light) |

---

## Project Structure

```
KeyLooper/
├── src-tauri/         # Rust backend (Tauri windowing & OS keyring)
├── src/
│   ├── components/    # UI components (Sidebar, ChatBubble, InputPanel, etc.)
│   ├── lib/           # KeyRotator, Gemini client, file processor
│   ├── store/         # Zustand global state management
│   ├── styles/        # Global CSS + Tailwind theme & dark mode tokens
│   └── __tests__/     # Vitest unit tests
├── index.html
├── package.json
└── FUTURE_UPDATE.md   # Architectural roadmap & future feature specs
```

---

## License

MIT © [RhythmicDias](https://github.com/RhythmicDias)
