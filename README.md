# KeyLooper

<img src="app-icon.svg" width="120" align="right" alt="KeyLooper Icon" />

**Unlimited Gemini API desktop client powered by secure, local sequential key rotation and autonomous local file agents.**

> A local-first LLM workspace built with Tauri v2 + React, designed to maximize the utility of free Gemini API keys through intelligent round-robin rotation, multimodal file intelligence, and secure project-scoped agentic workflows.

---

## Key Features

- **Sequential API Key Rotation** — Pool up to 20+ free-tier Gemini keys and rotate them automatically, so you effectively never hit a rate limit.
- **Tri-Mode Operation** — Switch seamlessly between:
  - **Normal Mode**: Dedicated single active key with automatic temporary fallback on rate limits.
  - **Unlimited Mode**: Continuous, persistent round-robin load balancing across all healthy keys.
  - **Pro Mode**: Dedicated Pro API key with automatic Google Search grounding enabled.
- **Autonomous Local File Agent with Safety Snapshots** — Connect any local project workspace folder with scoped tool calling (`list_directory`, `read_file`, `write_file`). KeyLooper automatically snapshots your project to a secure `__BACKUP_FOLDER` before any operation begins, with one-click snapshot restore.
- **Google Gemini Web Companion** — Integrated Gemini Web launcher in the header and dock (`Alt + W`). Opens in a dedicated clean desktop window, with instant Shift-click / Right-click fallback to your default browser for authenticated Google Pro/Advanced sessions.
- **Collapsible History Sidebar** — Dedicated slide-over history drawer (`Ctrl + H`) with real-time search filtering, session rename, and delete actions.
- **Custom Keyboard Shortcuts Manager** — Fully customizable hotkeys for every major action (new chat, history, settings, voice, model switching) with an interactive shortcut recorder in Settings.
- **Center-Bottom Floating Toasts** — Non-intrusive status, error, and safety alert toasts anchored at the lower center of the screen with auto-dismiss.
- **Audio Intelligence & Multimodal File Uploads** — Drag-and-drop support for audio (MP3, WAV, M4A, OGG, AAC), documents (PDF, DOCX, TXT, CSV), and images (PNG, JPEG, WEBP) with automated Gemini File API uploads for large media.
- **Document Generation (.docx & .html)** — Prompt Gemini to produce Word documents or interactive single-file HTML apps with automatic client-side download triggers.
- **Custom Skills & System Personas** — Build and switch between tailored system prompts (Coding, Medical Analysis, Creative Writing, Translation).
- **Google AI Studio Quick Link** — Dedicated `API` dock button to quickly open Google AI Studio (`https://aistudio.google.com/`) in your browser to grab fresh keys.
- **Secure OS Keyring Storage** — Raw API keys never touch disk in plain text; all credentials are stored in your operating system's native secure keyring (Windows Credential Manager / macOS Keychain / Secret Service).
- **Dark & Light Themes** — Contrast-tuned theme engine with smooth transitions, custom scrollbars, and customized dropdowns.
- **Token Usage Analytics** — Track token consumption, latency, and request volume broken down by model, day, and individual API key.

---

## Keyboard Shortcuts (Fully Customizable in Settings)

| Default Shortcut (Win/Linux) | Default Shortcut (macOS) | Action |
|---|---|---|
| `Enter` / `Ctrl + Enter` | `Enter` / `Cmd + Enter` | Send message |
| `Ctrl + N` | `Cmd + N` | Create new chat session |
| `Ctrl + H` | `Cmd + H` | Toggle History side panel |
| `Ctrl + ,` | `Cmd + ,` | Open / close Settings |
| `Alt + A` | `Option + A` | Open Agents & Skills |
| `Alt + W` | `Option + W` | Open Gemini Web (Window / Browser) |
| `Ctrl + O` | `Cmd + O` | Select Local Project Workspace |
| `Ctrl + Shift + D` | `Cmd + Shift + D` | Toggle Dark / Light theme |
| `Ctrl + B` | `Cmd + B` | Show / hide bottom dock |
| `Alt + M` | `Option + M` | Toggle voice dictation |
| `Alt + G` | `Option + G` | Open model picker |
| `Ctrl + Shift + M` | `Cmd + Shift + M` | Cycle routing mode (Normal / Unlimited / Pro) |
| `Ctrl + L` | `Cmd + L` | Clear active chat messages |
| `Ctrl + /` | `Cmd + /` | Focus chat input textarea |

---

## Installation & Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [Rust](https://rustup.rs/) (stable)
- WebView2 (Windows — pre-installed on Windows 10 & 11)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/RhythmicDias/KeyLooper.git
cd KeyLooper

# 2. Install dependencies
npm install

# 3. Launch in development mode
npm run tauri dev

# 4. Build desktop release package
npm run tauri build
```

---

## How It Works — Routing & Rotation Engine

KeyLooper distributes Gemini API requests based on your active routing strategy:

```
                      ┌──────────────────────┐
                      │   User Prompt Turn   │
                      └──────────┬───────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌───────────────────┐           ┌───────────────────┐
       │   Normal Mode     │           │  Unlimited Mode   │
       │ (Primary + Backup)│           │   (Round-Robin)   │
       └─────────┬─────────┘           └─────────┬─────────┘
                 │                               │
                 │ Routes through Key [0]        │ Key [i] → Pointer increments
                 │ (Falls back if 429)           │ (Rotates Key 0 → 1 → 2 → 0)
                 └───────────────┬───────────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ Gemini API Endpoint   │
                     └───────────────────────┘
```

1. **Normal Mode**: Prioritizes your primary key. If a `429 Rate Limit` occurs, the key is placed on a 60-second cooldown and KeyLooper temporarily routes through the next healthy key in the pool until the cooldown elapses.
2. **Unlimited Mode**: Rotates sequentially across all healthy keys with persistent index tracking so subsequent requests continue round-robin distribution even after idle periods.
3. **Pro Mode**: Routes directly to your high-throughput or billing-enabled Gemini API key and automatically enables Google Search Grounding for live web queries.
4. **Failure Recovery**:
   - `429 Too Many Requests`: Marks key as cooldown-locked (60s), rotates immediately to next key.
   - `400 / 401 / 403 Invalid`: Flags key as invalid in local state and permanently excludes it from rotation.
   - Automatically retries up to **3 consecutive times** before bubbling errors to the UI.

---

## Color Palette

| Token | Hex | Role |
|---|---|---|
| Charcoal Background | `#35302c` | Dark mode background |
| Terracotta Accent | `#b1624d` | Primary buttons, active tabs, glowing toggles |
| Warm Taupe | `#8c7d6e` | Secondary borders and mute indicators |
| Muted Gray | `#d5cdc5` | Secondary text and meta captions |
| Off-White | `#f8f5f1` | Light mode surface & dark mode primary text |

---

## Project Structure

```
KeyLooper/
├── src-tauri/
│   ├── src/lib.rs          # Rust Tauri backend (OS keyring, workspace file agent, windowing)
│   ├── tauri.conf.json     # Tauri app configuration & security settings
│   └── Cargo.toml          # Rust crate dependencies
├── src/
│   ├── components/
│   │   ├── Sidebar.tsx            # Collapsible chat history drawer & search
│   │   ├── ChatBubble.tsx         # Message rendering, code copy, markdown, usage badges
│   │   ├── SettingsView.tsx       # Key management, shortcuts editor, usage metrics, models
│   │   ├── ModelConfigPanel.tsx   # Temperature, thinking budgets, safety thresholds
│   │   └── SkillsView.tsx         # Custom AI personas & system prompt presets
│   ├── lib/
│   │   ├── KeyRotator.ts          # Round-robin key rotation and cooldown engine
│   │   ├── geminiClient.ts        # Gemini API integration, tool definitions, file uploads
│   │   └── fileProcessor.ts       # Audio, PDF, DOCX, and image parsing
│   ├── store/
│   │   └── useAppStore.ts         # Zustand store with persistent local storage
│   ├── styles/                    # Global CSS, theme variables, and Tailwind config
│   ├── __tests__/                 # Vitest test suite (KeyRotator & AgentTools)
│   ├── App.tsx                    # Main layout, input composer, and action bar
│   └── main.tsx                   # React root entry point
├── package.json
└── vite.config.ts
```

---

## License

MIT © [RhythmicDias](https://github.com/RhythmicDias)
