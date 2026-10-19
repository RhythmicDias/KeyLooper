/**
 * KeyRotator — Fair sequential API key rotation engine (Metadata-only).
 * Stores only metadata, actual keys are fetched from the OS keyring dynamically.
 * Implements Least-Recently-Used (LRU) monotonic fair round-robin scheduling across all healthy keys.
 */

export type KeyStatus = "unchecked" | "valid" | "invalid" | "rate-limited";

export interface ApiKeyEntry {
  id: string;
  name: string;
  status: KeyStatus;
  /** Timestamp (ms) when a rate-limited key can be retried */
  cooldownUntil?: number;
  /** Monotonic sequence counter or timestamp when the key was last used in an API call */
  lastUsed?: number;
}

export class KeyRotator {
  private keys: ApiKeyEntry[];
  private currentIndex: number = 0;
  private callCounter: number;

  constructor(keys: ApiKeyEntry[]) {
    this.keys = keys.map((k) => ({ ...k }));
    // Initialize monotonic counter from highest existing lastUsed or current time
    const maxExisting = this.keys.reduce(
      (max, k) => Math.max(max, k.lastUsed ?? 0),
      0
    );
    this.callCounter = Math.max(maxExisting, Date.now());
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
   * Return the next key entry in sequential round-robin order across all healthy keys.
   * Uses currentIndex synchronized with persistent store to guarantee strict cyclic rotation
   * (Key 0 -> Key 1 -> Key 2 -> ... -> Key 0).
   */
  getNextKey(): ApiKeyEntry | null {
    const active = this.activeKeys;
    if (active.length === 0) return null;

    // Pick active key at currentIndex
    const safeIndex =
      (this.currentIndex >= 0 ? this.currentIndex : 0) % active.length;
    const selectedKey = active[safeIndex];

    // Monotonically advance pointer for the next call
    this.currentIndex = (safeIndex + 1) % active.length;

    this.callCounter = Math.max(this.callCounter + 1, Date.now());
    selectedKey.lastUsed = this.callCounter;

    const poolEntry = this.keys.find((k) => k.id === selectedKey.id);
    if (poolEntry) {
      poolEntry.lastUsed = this.callCounter;
    }

    return poolEntry ?? selectedKey;
  }

  /**
   * Return the active key for Normal mode (the top-most healthy active key in the list).
   * Does not advance the round-robin pointer.
   */
  getActiveKey(): ApiKeyEntry | null {
    const active = this.activeKeys;
    if (active.length === 0) return null;

    const key = active[0];
    this.callCounter = Math.max(this.callCounter + 1, Date.now());
    key.lastUsed = this.callCounter;

    const poolEntry = this.keys.find((k) => k.id === key.id);
    if (poolEntry) {
      poolEntry.lastUsed = this.callCounter;
    }

    return poolEntry ?? key;
  }

  /**
   * Return a specific key by its ID.
   */
  getKeyById(id: string): ApiKeyEntry | null {
    return this.keys.find((k) => k.id === id) ?? null;
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

  /**
   * Reactivate all keys in the pool back to valid status.
   */
  reactivateAll(): void {
    for (const key of this.keys) {
      key.status = "valid";
      key.cooldownUntil = undefined;
    }
  }
}
