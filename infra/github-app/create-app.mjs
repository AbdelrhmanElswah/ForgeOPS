#!/usr/bin/env node
/**
 * Creates the ForgeOps GitHub App for local development using GitHub's "manifest flow":
 * https://docs.github.com/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
 *
 *   pnpm github:create-app                 # app owned by your personal account
 *   pnpm github:create-app --org my-org    # app owned by an organisation
 *   pnpm github:create-app --force         # replace an app already configured in .env
 *
 * What it does:
 *  1. Opens a smee.io channel so GitHub can deliver webhooks to your laptop.
 *  2. Opens your browser on a pre-filled "Create GitHub App" page (minimum permissions).
 *  3. Receives GitHub's one-time code on http://localhost:3999/callback and exchanges it for
 *     the app's credentials.
 *  4. Saves the private key to apps/backend/secrets/github-app.pem (gitignored) and the
 *     ids/secrets to apps/backend/.env (gitignored). Secrets are never printed.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const PORT = 3999;
const BACKEND_DIR = resolve(import.meta.dirname, '../../apps/backend');
const ENV_FILE = join(BACKEND_DIR, '.env');
const KEY_FILE = join(BACKEND_DIR, 'secrets', 'github-app.pem');
const API_ORIGIN = 'http://localhost:3001';

const { values: args } = parseArgs({
  options: {
    org: { type: 'string' },
    name: { type: 'string' },
    force: { type: 'boolean', default: false },
  },
});

if (!existsSync(ENV_FILE)) {
  fail(`Missing ${ENV_FILE}. Copy .env.example to .env first.`);
}
if (/^GITHUB_APP_ID=\S+/m.test(readFileSync(ENV_FILE, 'utf8')) && !args.force) {
  fail('A GitHub App is already configured in apps/backend/.env (use --force to replace it).');
}

const webhookProxyUrl = await createSmeeChannel();
// App names are unique across all of GitHub, hence the random suffix.
const appName = args.name ?? `forgeops-dev-${randomBytes(3).toString('hex')}`;
const state = randomBytes(16).toString('hex');

/** Least privilege: exactly what ForgeOps needs, nothing more (see README.md for why). */
const manifest = {
  name: appName,
  url: 'https://github.com/AbdelrhmanElswah/forgeops',
  description:
    'ForgeOps (local development): AI engineering tasks that end in a reviewed pull request.',
  public: false,
  hook_attributes: { url: webhookProxyUrl, active: true },
  redirect_url: `http://localhost:${PORT}/callback`,
  callback_urls: [`${API_ORIGIN}/api/v1/github/oauth/callback`],
  request_oauth_on_install: true,
  setup_on_update: true,
  default_permissions: {
    metadata: 'read',
    contents: 'write',
    pull_requests: 'write',
  },
  default_events: ['pull_request'],
};

const createUrl = args.org
  ? `https://github.com/organizations/${encodeURIComponent(args.org)}/settings/apps/new`
  : 'https://github.com/settings/apps/new';

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(manifestForm());
    return;
  }

  if (url.pathname === '/callback') {
    handleCallback(url)
      .then((installUrl) => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(
          page(
            'GitHub App created',
            `<p>Credentials were saved to <code>apps/backend/.env</code> and <code>apps/backend/secrets/</code>.</p>
             <p><a href="${installUrl}">Install the app on a test repository →</a></p>`,
          ),
        );
        console.log(`\n✔ GitHub App "${appName}" created.`);
        console.log(`  Next: install it on a test repository: ${installUrl}`);
        server.close();
      })
      .catch((error) => {
        response.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
        response.end(page('Something went wrong', `<p>${escapeHtml(error.message)}</p>`));
        console.error(`✖ ${error.message}`);
        server.close();
        process.exitCode = 1;
      });
    return;
  }

  response.writeHead(404).end();
});

server.listen(PORT, '127.0.0.1', () => {
  const start = `http://localhost:${PORT}/`;
  console.log(`Opening ${start} to create "${appName}"…`);
  console.log('(If the browser does not open, visit that URL yourself.)');
  openBrowser(start);
});

async function handleCallback(url) {
  // `state` ties the callback to the page we served, so a forged link can't inject an app.
  if (url.searchParams.get('state') !== state) {
    throw new Error('State mismatch: ignoring a callback this script did not start.');
  }
  const code = url.searchParams.get('code');
  if (!code) throw new Error('GitHub did not return a code.');

  const response = await fetch(
    `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: 'POST',
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub rejected the manifest code (HTTP ${response.status}).`);
  }
  const app = await response.json();

  mkdirSync(join(BACKEND_DIR, 'secrets'), { recursive: true });
  writeFileSync(KEY_FILE, app.pem, { mode: 0o600 });
  try {
    chmodSync(KEY_FILE, 0o600);
  } catch {
    // Not supported on every filesystem (e.g. some Windows setups); the directory is gitignored.
  }

  upsertEnv({
    GITHUB_APP_ID: String(app.id),
    GITHUB_APP_SLUG: app.slug,
    GITHUB_APP_CLIENT_ID: app.client_id,
    GITHUB_APP_CLIENT_SECRET: app.client_secret,
    GITHUB_WEBHOOK_SECRET: app.webhook_secret,
    GITHUB_APP_PRIVATE_KEY_PATH: 'secrets/github-app.pem',
    GITHUB_WEBHOOK_PROXY_URL: webhookProxyUrl,
  });

  return `${app.html_url}/installations/new`;
}

/** smee.io relays webhooks from GitHub's servers to localhost during development. */
async function createSmeeChannel() {
  const response = await fetch('https://smee.io/new', { method: 'HEAD', redirect: 'manual' });
  const channel = response.headers.get('location');
  if (!channel?.startsWith('https://smee.io/')) {
    fail('Could not create a smee.io channel for webhooks. Check your internet connection.');
  }
  return channel;
}

function upsertEnv(entries) {
  let content = readFileSync(ENV_FILE, 'utf8');
  if (!/^# GitHub App/m.test(content)) {
    content = `${content.trimEnd()}\n\n# GitHub App (written by pnpm github:create-app)\n`;
  }
  for (const [key, value] of Object.entries(entries)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    content = pattern.test(content) ? content.replace(pattern, line) : `${content}${line}\n`;
  }
  writeFileSync(ENV_FILE, content);
}

function manifestForm() {
  return page(
    'Create the ForgeOps GitHub App',
    `<p>Submitting to GitHub…</p>
     <form id="f" method="post" action="${createUrl}?state=${state}">
       <input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">
       <noscript><button type="submit">Continue to GitHub</button></noscript>
     </form>
     <script>document.getElementById('f').submit()</script>`,
  );
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
    <body style="font-family:system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem">
    <h1>${title}</h1>${body}</body>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function openBrowser(url) {
  // Arguments are passed as an array, never through a shell string.
  const [command, commandArgs] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(command, commandArgs, { stdio: 'ignore', detached: true })
    .on('error', () => {})
    .unref();
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}
