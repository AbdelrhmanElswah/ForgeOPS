import { randomUUID } from 'node:crypto';

import {
  EmailAlreadyRegisteredError,
  GitHubAccountAlreadyLinkedError,
  type NewUser,
  type UserRecord,
  UsersRepository,
} from '../../src/modules/users/users.repository.js';

/** In-memory adapter for the UsersRepository port. Same contract, no database. */
export class InMemoryUsersRepository extends UsersRepository {
  readonly rows = new Map<string, UserRecord>();

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve([...this.rows.values()].find((u) => u.email === email) ?? null);
  }

  async create(user: NewUser): Promise<UserRecord> {
    if (await this.findByEmail(user.email)) {
      throw new EmailAlreadyRegisteredError();
    }
    const record: UserRecord = {
      id: randomUUID(),
      createdAt: new Date(),
      githubUserId: null,
      ...user,
    };
    this.rows.set(record.id, record);
    return record;
  }

  linkGitHubAccount(userId: string, githubUserId: number): Promise<void> {
    const holder = [...this.rows.values()].find((u) => u.githubUserId === githubUserId);
    if (holder && holder.id !== userId) {
      return Promise.reject(new GitHubAccountAlreadyLinkedError());
    }
    const user = this.rows.get(userId);
    if (user) user.githubUserId = githubUserId;
    return Promise.resolve();
  }
}
