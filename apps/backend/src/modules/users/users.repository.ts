import { ConflictError } from '../../common/errors/domain-error.js';

/** A user as the application sees it, independent of Prisma's generated types. */
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string | null;
  createdAt: Date;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  displayName: string | null;
}

export class EmailAlreadyRegisteredError extends ConflictError {
  constructor() {
    super('An account with this email already exists.');
  }
}

/**
 * Port: what the application needs from user storage. An abstract class (not an interface)
 * so it can double as the Nest injection token. Prisma implements it in production, an
 * in-memory map in tests.
 */
export abstract class UsersRepository {
  abstract findById(id: string): Promise<UserRecord | null>;
  abstract findByEmail(email: string): Promise<UserRecord | null>;
  /** @throws EmailAlreadyRegisteredError */
  abstract create(user: NewUser): Promise<UserRecord>;
}
