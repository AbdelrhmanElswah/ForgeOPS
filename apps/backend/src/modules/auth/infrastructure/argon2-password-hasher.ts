import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

import { PasswordHasher } from '../application/password-hasher.js';

/**
 * argon2id (the library default) with OWASP's recommended minimum parameters:
 * 19 MiB of memory, 2 iterations, 1 lane. Memory-hard hashing makes GPU cracking of a
 * leaked database expensive. Parameters are stored inside each hash, so they can be raised
 * later without invalidating existing passwords.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
