/**
 * updater.ts
 * Manages in-app updates for KeyLooper via @tauri-apps/plugin-updater and @tauri-apps/plugin-process.
 */

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateProgress {
  status: "idle" | "checking" | "available" | "up-to-date" | "downloading" | "ready" | "error";
  currentVersion: string;
  newVersion?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  error?: string;
}

/** Check GitHub release endpoint for available updates. */
export async function checkForAppUpdate(): Promise<{
  update: Update | null;
  error?: string;
}> {
  try {
    const update = await check();
    return { update };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return { update: null, error: msg };
  }
}

/** Download and install the update with real-time percentage progress, then optionally restart. */
export async function installAppUpdate(
  update: Update,
  onProgress?: (percent: number) => void
): Promise<void> {
  let totalBytes = 0;
  let downloadedBytes = 0;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        totalBytes = event.data.contentLength ?? 0;
        downloadedBytes = 0;
        onProgress?.(0);
        break;
      case "Progress":
        downloadedBytes += event.data.chunkLength;
        if (totalBytes > 0) {
          const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
          onProgress?.(pct);
        }
        break;
      case "Finished":
        onProgress?.(100);
        break;
    }
  });
}

/** Relaunch the application to finalize update installation. */
export async function restartApp(): Promise<void> {
  await relaunch();
}
