import type { User } from '@forgeops/contracts';

import type { UserRecord } from './users.repository.js';

/** The only way a user leaves the API: an explicit allowlist, so `passwordHash` can never leak. */
export function toUserDto(user: UserRecord): User {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}
