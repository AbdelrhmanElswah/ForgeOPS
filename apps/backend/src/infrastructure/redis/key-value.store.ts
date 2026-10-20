import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from './redis.constants.js';

/**
 * Port for short-lived keys with atomic semantics: one-time OAuth `state` values, webhook
 * delivery dedupe, and (later) idempotency keys. Atomicity matters: two concurrent requests
 * must never both "win" a setIfAbsent or both "take" the same value.
 */
export abstract class KeyValueStore {
  /** Stores the value only if the key doesn't exist yet. Returns true if this call stored it. */
  abstract setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** Reads and deletes in one step, so a value can be consumed exactly once. */
  abstract take(key: string): Promise<string | null>;
  abstract delete(key: string): Promise<void>;
}

@Injectable()
export class RedisKeyValueStore extends KeyValueStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    // SET key value EX ttl NX: one atomic command, unlike a racy GET-then-SET.
    return (await this.redis.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  take(key: string): Promise<string | null> {
    return this.redis.getdel(key);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
