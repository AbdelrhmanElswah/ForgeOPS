import type { Tone } from '@forgeops/ui';

export interface ConnectResultMessage {
  tone: Exclude<Tone, 'neutral'>;
  title: string;
  description?: string;
}

/**
 * The API's install callback redirects here with ?github=…&reason=<error code>. Every outcome
 * the backend can produce gets one human message, defined in one place.
 */
const ERROR_MESSAGES: Record<string, Omit<ConnectResultMessage, 'tone'>> = {
  forbidden: {
    title: 'GitHub refused the connection',
    description: 'The GitHub account you signed in with cannot access that installation.',
  },
  conflict: {
    title: 'Already connected elsewhere',
    description:
      'That installation or GitHub account is linked to another ForgeOps account. Sign in with that account, or ask its owner to remove it.',
  },
  missing_state: {
    title: 'Start the installation from ForgeOps',
    description:
      'For your security, installs started on github.com can’t be linked. Use the button below.',
  },
  invalid_callback: {
    title: 'The link from GitHub was incomplete',
    description: 'Please start the installation again.',
  },
  service_unavailable: {
    title: 'GitHub is not configured on this server',
    description: 'An administrator needs to set up the ForgeOps GitHub App first.',
  },
  unauthenticated: {
    title: 'Your session ended during the installation',
    description: 'Sign in and start the installation again.',
  },
};

const FALLBACK_ERROR = {
  title: 'Could not connect GitHub',
  description: 'Something went wrong. Please try again.',
};

export function connectResultMessage(
  result: string | null,
  reason: string | null,
): ConnectResultMessage | null {
  switch (result) {
    case 'connected':
      return {
        tone: 'success',
        title: 'GitHub connected',
        description: 'Your repositories are now available.',
      };
    case 'updated':
      return {
        tone: 'info',
        title: 'Installation updated on GitHub',
        description: 'Repository changes appear here within a few seconds.',
      };
    case 'error':
      return { tone: 'danger', ...(ERROR_MESSAGES[reason ?? ''] ?? FALLBACK_ERROR) };
    default:
      return null;
  }
}
