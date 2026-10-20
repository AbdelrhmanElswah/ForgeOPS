import { KeyValueStore } from '../../src/infrastructure/redis/key-value.store.js';

/** In-memory KeyValueStore. TTLs are recorded but not enforced (tests control time explicitly). */
export class InMemoryKeyValueStore extends KeyValueStore {
  readonly entries = new Map<string, { value: string; ttlSeconds: number }>();

  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.entries.has(key)) return Promise.resolve(false);
    this.entries.set(key, { value, ttlSeconds });
    return Promise.resolve(true);
  }

  take(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    return Promise.resolve(entry?.value ?? null);
  }

  delete(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }
}
