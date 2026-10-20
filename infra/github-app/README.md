# ForgeOps GitHub App

ForgeOps talks to GitHub as a **GitHub App**, not with a personal access token. The difference matters:

|                   | Personal access token                    | GitHub App (ForgeOps)                                      |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Identity          | Acts as _you_, on everything you can see | Its own identity, only on repositories you install it on   |
| Credential        | Long-lived secret                        | Private key → installation tokens that expire after 1 hour |
| Scope per request | Fixed when created                       | Each token can be narrowed to one repository + permissions |
| Audit trail       | Actions look like yours                  | Actions are attributed to the app                          |

## Create the app (local development, ~2 minutes)

```bash
cp apps/backend/.env.example apps/backend/.env   # if you haven't already
pnpm github:create-app                           # or: pnpm github:create-app --org <your-org>
```

1. Your browser opens on GitHub's "Create GitHub App" page, pre-filled from a manifest.
2. Click **Create GitHub App**.
3. The script stores the credentials:
   - the private key in `apps/backend/secrets/github-app.pem` (gitignored),
   - the app id, client id/secret and webhook secret in `apps/backend/.env` (gitignored).
4. Follow the printed link to **install** the app on a test repository. Pick
   "Only select repositories" and choose one or two throwaway repos.

## Permissions and why

| Permission    | Access     | Used for                                                                     |
| ------------- | ---------- | ---------------------------------------------------------------------------- |
| Metadata      | Read       | Mandatory for every app: repository names, default branch, visibility        |
| Contents      | Read/Write | Read: clone the code. Write: create the fix branch and commit (never `main`) |
| Pull requests | Read/Write | Open the pull request and follow its state                                   |
| _Event_       |            | `pull_request`: notice when a ForgeOps PR is merged or closed                |

Deliberately **not** requested: Administration, Workflows, Actions, Secrets, Issues, or merge rights.
ForgeOps can propose changes; only a human can merge them.

Within these app permissions, every operation asks GitHub for a token narrowed further to one
repository and only the permissions that step needs. Cloning gets `contents:read`, and only the
publisher gets `contents:write` and `pull_requests:write`. See
`apps/backend/src/modules/github/application/github-app.client.ts`.

## Webhooks on localhost

GitHub can't reach `localhost`, so the app sends webhooks to a [smee.io](https://smee.io) channel.
A relay forwards them to the API (set up in step 2.4). Every delivery is still verified with the
webhook secret (HMAC-SHA256), so the relay is never trusted.

## Production

- Create a separate app with your production URLs (don't reuse the dev app).
- Provide the private key through a secret manager as `GITHUB_APP_PRIVATE_KEY`
  (newlines may be written as `\n`), not as a file in the image.
- Rotate the private key and webhook secret from the app's settings page; both can have
  two valid values during a rotation.
