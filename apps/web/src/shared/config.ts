/** The API origin. The browser calls it directly; auth travels in httpOnly cookies. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Where unauthenticated visitors are sent, and where a fresh login lands by default. */
export const LOGIN_PATH = '/login';
export const HOME_PATH = '/dashboard';

/**
 * Only same-site relative paths may be used as a post-login redirect. Anything else
 * ("https://evil.example", "//evil.example") would turn the login page into an open redirect.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return HOME_PATH;
  }
  return value;
}
