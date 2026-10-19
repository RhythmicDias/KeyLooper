/**
 * KeyRotator.test.ts — Unit tests for KeyRotator, buildPayload, and shortcut matching.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { KeyRotator } from "../lib/KeyRotator";
import type { ApiKeyEntry } from "../lib/KeyRotator";
import { buildPayload } from "../lib/geminiClient";
import {
  formatShortcutFromEvent,
  matchesShortcut,
  formatShortcutForDisplay,
  DEFAULT_MODEL_CONFIG,
} from "../store/useAppStore";

const makeKey = (id: string, name: string): ApiKeyEntry => ({
  id,
  name,
  status: "unchecked",
});

describe("KeyRotator", () => {
  let keys: ApiKeyEntry[];

  beforeEach(() => {
    keys = [
      makeKey("1", "Key A"),
      makeKey("2", "Key B"),
      makeKey("3", "Key C"),
    ];
  });

  it("returns null when no keys are provided", () => {
    const rotator = new KeyRotator([]);
    expect(rotator.getNextKey()).toBeNull();
    expect(rotator.getActiveKey()).toBeNull();
  });

  it("does not mutate the external input array in-place", () => {
    const rotator = new KeyRotator(keys);
    rotator.reportInvalid("1");
    expect(keys[0].status).toBe("unchecked");
    expect(rotator.pool[0].status).toBe("invalid");
  });

  it("cycles through keys in round-robin order (Unlimited mode)", () => {
    const rotator = new KeyRotator(keys);
    expect(rotator.getNextKey()?.id).toBe("1");
    expect(rotator.getNextKey()?.id).toBe("2");
    expect(rotator.getNextKey()?.id).toBe("3");
    expect(rotator.getNextKey()?.id).toBe("1");
  });

  it("getActiveKey returns the top-most healthy active key (Normal mode)", () => {
    const rotator = new KeyRotator(keys);
    expect(rotator.getActiveKey()?.id).toBe("1");
    expect(rotator.getActiveKey()?.id).toBe("1");
    expect(rotator.getActiveKey()?.id).toBe("1");
  });

  it("skips rate-limited keys in round-robin", () => {
    const rotator = new KeyRotator(keys);
    rotator.reportRateLimit("1", 999_999);
    expect(rotator.getNextKey()?.id).toBe("2");
    expect(rotator.getNextKey()?.id).toBe("3");
    expect(rotator.getNextKey()?.id).toBe("2");
  });

  it("skips invalid keys", () => {
    const rotator = new KeyRotator(keys);
    rotator.reportInvalid("2");
    const results = [
      rotator.getNextKey()?.id,
      rotator.getNextKey()?.id,
      rotator.getNextKey()?.id,
    ];
    expect(results).not.toContain("2");
  });

  it("reinstates a key after reportValid", () => {
    const rotator = new KeyRotator(keys);
    rotator.reportRateLimit("1", 999_999);
    rotator.reportValid("1");
    const results = new Set([
      rotator.getNextKey()?.id,
      rotator.getNextKey()?.id,
      rotator.getNextKey()?.id,
    ]);
    expect(results.has("1")).toBe(true);
  });

  it("returns null when all keys are invalid", () => {
    const rotator = new KeyRotator(keys);
    rotator.reportInvalid("1");
    rotator.reportInvalid("2");
    rotator.reportInvalid("3");
    expect(rotator.getNextKey()).toBeNull();
    expect(rotator.getActiveKey()).toBeNull();
  });

  it("reports correct healthy key count", () => {
    const rotator = new KeyRotator(keys);
    expect(rotator.healthyCount).toBe(3);
    rotator.reportInvalid("1");
    expect(rotator.healthyCount).toBe(2);
    rotator.reportRateLimit("2", 999_999);
    expect(rotator.healthyCount).toBe(1);
  });

  it("fairly rotates across 5 keys without starving any key", () => {
    const fiveKeys = [
      makeKey("1", "Personal Gmail"),
      makeKey("2", "Storememory"),
      makeKey("3", "DevineHum"),
      makeKey("4", "GreenParkSteve"),
      makeKey("5", "PediaScribe"),
    ];
    const rotator = new KeyRotator(fiveKeys);

    // Call 15 times (3 full cycles)
    const usageCounts: Record<string, number> = {};
    for (let i = 0; i < 15; i++) {
      const key = rotator.getNextKey();
      expect(key).not.toBeNull();
      if (key) {
        usageCounts[key.name] = (usageCounts[key.name] || 0) + 1;
      }
    }

    // Every single one of the 5 keys must be used exactly 3 times
    expect(usageCounts["Personal Gmail"]).toBe(3);
    expect(usageCounts["Storememory"]).toBe(3);
    expect(usageCounts["DevineHum"]).toBe(3);
    expect(usageCounts["GreenParkSteve"]).toBe(3);
    expect(usageCounts["PediaScribe"]).toBe(3);
  });

  it("reactivates all keys with reactivateAll", () => {
    const rotator = new KeyRotator(keys);
    rotator.reportInvalid("1");
    rotator.reportRateLimit("2", 999_999);
    expect(rotator.healthyCount).toBe(1);

    rotator.reactivateAll();
    expect(rotator.healthyCount).toBe(3);
  });
});

describe("buildPayload & Shortcut Matching", () => {
  it("wires thinkingLevel, temperature, and safetySettings into payload", () => {
    const payload = buildPayload(
      "gemini-2.5-flash",
      [],
      [{ text: "Hello" }],
      undefined,
      {
        ...DEFAULT_MODEL_CONFIG,
        thinkingLevel: "High",
        temperature: 0.4,
        advanced: {
          ...DEFAULT_MODEL_CONFIG.advanced,
          safetySettings: "Block Most",
          outputLength: 4096,
        },
      }
    );

    expect(payload.generationConfig.temperature).toBe(0.4);
    expect(payload.generationConfig.maxOutputTokens).toBe(4096);
    expect(payload.generationConfig.thinkingConfig).toEqual({
      thinkingBudget: 24576,
    });
    expect(payload.safetySettings?.[0]?.threshold).toBe("BLOCK_LOW_AND_ABOVE");
  });

  it("does not inject create_html_file tool merely because historical messages mention html", () => {
    const payload = buildPayload(
      "gemini-2.5-flash",
      [{ role: "user", parts: [{ text: "How do I parse html in Python?" }] }],
      [{ text: "Thanks, now explain regex." }],
      undefined,
      DEFAULT_MODEL_CONFIG
    );
    expect(payload.tools).toBeUndefined();
  });

  it("matches Ctrl+N and custom shortcuts accurately", () => {
    const fakeEvent = {
      key: "n",
      code: "KeyN",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    } as unknown as KeyboardEvent;

    expect(formatShortcutFromEvent(fakeEvent)).toBe("Ctrl+N");
    expect(matchesShortcut(fakeEvent, "Ctrl+N")).toBe(true);
    expect(matchesShortcut(fakeEvent, "Ctrl+Shift+N")).toBe(false);
  });

  it("handles macOS Meta (Cmd) modifier seamlessly for shortcuts", () => {
    const fakeMacEvent = {
      key: "n",
      code: "KeyN",
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: false,
    } as unknown as KeyboardEvent;

    expect(formatShortcutFromEvent(fakeMacEvent)).toBe("Ctrl+N");
    expect(matchesShortcut(fakeMacEvent, "Ctrl+N")).toBe(true);
  });

  it("formats shortcuts correctly without throwing", () => {
    expect(formatShortcutForDisplay("")).toBe("");
    expect(formatShortcutForDisplay("Enter")).toBe("Enter");
    expect(typeof formatShortcutForDisplay("Ctrl+N")).toBe("string");
  });
});
