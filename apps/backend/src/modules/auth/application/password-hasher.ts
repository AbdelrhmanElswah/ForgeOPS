/** Port for password hashing, so the algorithm can change without touching auth logic. */
export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  /** Never throws for a wrong password or malformed hash; returns false. */
  abstract verify(hash: string, password: string): Promise<boolean>;
}
