/**
 * KeyRotator — Sequential API key rotation engine (Metadata-only).
 * Stores only metadata, actual keys are fetched from the OS keyring dynamically.
 */

export type KeyStatus = "unchecked" | "valid" | "invalid" | "rate-limited";

export interface ApiKeyEntry {
  id: string;
  name: string;
  status: KeyStatus;
  /** Timestamp (ms) when a rate-limited key can be retried */
  cooldownUntil?: number;
}

export class KeyRotator {
  private keys: ApiKeyEntry[];
  private currentIndex: number = 0;

  constructor(keys: ApiKeyEntry[]) {
    this.keys = keys.map((k) => ({ ...k }));
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  setCurrentIndex(index: number): void {
    this.currentIndex = index;
  }

  /** Returns the pool of all registered keys. */
  get pool(): ApiKeyEntry[] {
    return this.keys;
  }

  /** Returns only the active (non-invalid, non-rate-limited) keys. */
  private get activeKeys(): ApiKeyEntry[] {
    const now = Date.now();
    return this.keys.filter(
      (k) =>
        k.status !== "invalid" &&
        (k.status !== "rate-limited" || (k.cooldownUntil ?? 0) < now)
    );
  }

  /** Count of healthy (usable) keys. */
  get healthyCount(): number {
    return this.activeKeys.length;
  }

  /**
   * Normal Mode: return the first active key entry.
   */
  getActiveKey(): ApiKeyEntry | null {
    return this.activeKeys[0] ?? null;
  }

  /**
   * Unlimited Mode: return the next key entry in round-robin order.
   */
  getNextKey(): ApiKeyEntry | null {
    const active = this.activeKeys;
    if (active.length === 0) return null;

    this.currentIndex = this.currentIndex % active.length;
    const entry = active[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % active.length;
    return entry;
  }

  /**
   * Return a specific key by its ID.
   */
  getKeyById(id: string): ApiKeyEntry | null {
    return this.keys.find(k => k.id === id) ?? null;
  }

  /**
   * Mark a key by ID as rate-limited and set a cooldown period.
   */
  reportRateLimit(id: string, cooldownMs = 60_000): void {
    const entry = this.keys.find((k) => k.id === id);
    if (entry) {
      entry.status = "rate-limited";
      entry.cooldownUntil = Date.now() + cooldownMs;
    }
  }

  /**
   * Mark a key by ID as invalid.
   */
  reportInvalid(id: string): void {
    const entry = this.keys.find((k) => k.id === id);
    if (entry) entry.status = "invalid";
  }

  /**
   * Mark a key by ID as valid.
   */
  reportValid(id: string): void {
    const entry = this.keys.find((k) => k.id === id);
    if (entry) {
      entry.status = "valid";
      entry.cooldownUntil = undefined;
    }
  }
}
