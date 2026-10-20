# ForgeOps — Implementation Roadmap

Each phase ends with something **runnable and demoable**. Each step is small enough to build,
review, and explain in one sitting. The workflow for every step:

1. **Plan:** what we build and why (short).
2. **Implement:** the code.
3. **Explain:** a walkthrough of the files, the patterns used, and how to verify the step.
4. **Commit:** one conventional commit per step (`feat(tasks): …`), so the git history tells the story.

Architecture reference: [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Phase 0 — Environment (½ day) — pnpm ✅, Docker ⏳

| Step | Build                                                                                           | Done when                                   |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 0.1  | Install Docker Desktop (WSL2 backend) and pnpm (`npm i -g pnpm`). Pin the Node LTS in `.nvmrc`. | `docker run hello-world` and `pnpm -v` work |
| 0.2  | `git init`, `.gitignore`, `.editorconfig`, LICENSE, README skeleton, create the GitHub repo     | first commit pushed                         |

## Phase 1 — Foundation (week 1) ✅

> **Status:** code complete. The CI `database` job verifies 1.5 (migrations + seed) on a real Postgres;
> 1.2 (Docker Compose) still needs a local run once Docker Desktop is installed: `pnpm infra:up && pnpm db:migrate && pnpm db:seed`.

**Goal:** monorepo, infrastructure, and an authenticated, documented API.

| Step | Build                                                                                            | Concepts                       | Done when                                            |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------- |
| 1.1  | pnpm workspace + Turborepo + shared `tsconfig` / `eslint-config` / Prettier                      | monorepo, task pipelines       | `pnpm lint` and `pnpm typecheck` run across packages |
| 1.2  | `infra/docker/docker-compose.yml`: Postgres, Redis (+ optional MinIO, Jaeger)                    | local infra                    | `docker compose up` → healthy services               |
| 1.3  | `packages/contracts` with the first schemas (`TaskStatus`, `CreateTaskRequest`, problem+json)    | contract-first                 | builds and is importable from apps                   |
| 1.4  | `apps/backend` skeleton: two entrypoints, `ApiModule` / `WorkerModule`, Zod-validated config     | modular monolith               | `pnpm dev:api` and `pnpm dev:worker` both boot       |
| 1.5  | Prisma schema (users, sessions, installations, repositories, tasks) + first migration + seed     | migrations, repository pattern | `prisma migrate dev` works, seed user exists         |
| 1.6  | Cross-cutting: Pino logging + redaction, exception filter (problem+json), Swagger, health checks | filters, interceptors          | `/api/docs` and `/health` work                       |
| 1.7  | Auth module: register/login, access JWT + refresh rotation in httpOnly cookies, global guard     | guards, token rotation         | e2e test: login → protected route → refresh          |
| 1.8  | CI: GitHub Actions running lint, typecheck, test, build                                          | CI                             | green check on push                                  |

**Demo:** log in through Swagger and call protected endpoints.

## Phase 2 — GitHub integration (week 2) ✅

> **Status:** code complete, tested against a fake GitHub (nock + scriptable fake). Still to do by hand:
> `pnpm github:create-app`, install the app on a test repo, and confirm the install callback
> round-trip against real GitHub.

**Goal:** connect GitHub safely and read repositories.

| Step | Build                                                                                                        | Concepts                         | Done when                            |
| ---- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------ |
| 2.1  | Register the GitHub App (manifest in `infra/github-app/`), with the private key loaded from a file or secret | least privilege                  | App installed on a test repo         |
| 2.2  | `GitHubTokenService` (App JWT → installation token, cached) + `GitHubClient` adapter                         | adapter, short-lived credentials | unit tests with `nock`               |
| 2.3  | Installation flow: setup callback → verify ownership → store installation + repos                            | OAuth/App install                | `GET /github/installations` lists it |
| 2.4  | Webhooks: HMAC verification, delivery dedupe, install/repo events                                            | webhook security                 | forged signature → 401               |
| 2.5  | Repositories API: list, details, branches, settings (test command, limits)                                   | ownership-scoped queries         | IDOR test passes                     |

**Demo:** install the App and see your repositories and branches in the API.

## Phase 3 — Sandbox & workspace (week 3)

**Goal:** safely materialise a repository on disk and run its tests. (This comes _before_ the agents
because the agents' tools read from the workspace.)

| Step | Build                                                                                                    | Concepts                   | Done when                                               |
| ---- | -------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| 3.1  | Sandbox image(s) (Node first) + `DockerSandboxRunner` (dockerode) with full hardening                    | container isolation        | test proves no network access and that timeouts kill    |
| 3.2  | `WorkspaceManager`: create volume, safe clone at a SHA, strip credentials, cleanup job                   | hook-free clone, lifecycle | workspace for the fixture repo is created and destroyed |
| 3.3  | Workspace file tools: tree, read (ranged), search (ripgrep), edit (search/replace), diff + **PathGuard** | path security              | traversal/symlink tests are blocked                     |
| 3.4  | `runTests` with output capture/truncation + JUnit/exit-code parsing                                      | deterministic verification | fixture repo test results parsed                        |
| 3.5  | `evals/fixtures/checkout-api`: a small demo repo with seeded bugs                                        | test fixtures              | used by all later phases                                |

**Demo:** a CLI script clones the fixture repo into a sandbox, runs its tests, and prints results.

## Phase 4 — Agent orchestrator, part 1 (week 4) ✅

> **Status:** code complete and tested with fakes (scripted LLM, in-memory workspace, in-memory
> checkpointer, in-memory events). Not yet run against real Postgres, Redis or the Claude API;
> the workspace is a placeholder until Phase 3 (Docker).

**Goal:** task in → plan + root-cause findings out, live.

| Step | Build                                                                                        | Concepts                              | Done when                                              |
| ---- | -------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| 4.1  | `packages/agents` skeleton: state annotation, ports, `FakeLlmClient`                         | ports & adapters                      | package tests run with no infrastructure               |
| 4.2  | `LlmClient` port + Claude adapter (official SDK, per-role models) + cost ledger              | adapter + strategy                    | real model answers a structured-output call            |
| 4.3  | Tool registry + `ToolPolicy` pipeline + budgets                                              | chain of responsibility               | policy unit tests                                      |
| 4.4  | `planner` node (structured `Plan`, Zod-validated, retry on invalid output)                   | structured outputs                    | plan produced for the fixture bug                      |
| 4.5  | `investigator` node (bounded tool loop, evidence-backed `Findings`)                          | ReAct loop with limits                | finds the seeded root cause                            |
| 4.6  | Tasks module: `POST /tasks` (idempotency key) → BullMQ `run.start` → 202; task state machine | queue, state machine, optimistic lock | task moves through `queued → planning → investigating` |
| 4.7  | `AgentOrchestratorService` + `PostgresSaver` checkpointer; kill-the-worker resume test       | checkpoints                           | worker killed mid-run → resumes from checkpoint        |
| 4.8  | Event store + Redis pub/sub + SSE endpoint with `Last-Event-ID` replay                       | outbox-lite, SSE                      | `curl` streams live events                             |

**Demo:** POST a task, then watch the planner and investigator events stream in the terminal.

## Phase 5 — Implement, verify, review (week 5)

| Step | Build                                                                              | Concepts            | Done when                               |
| ---- | ---------------------------------------------------------------------------------- | ------------------- | --------------------------------------- |
| 5.1  | `implementer` node (edit tools only, minimal-change prompt)                        | role-scoped tools   | fixture bug is patched in the workspace |
| 5.2  | `verifier` node (deterministic): run tests, DiffGuard, diff → artifact, `diffHash` | deterministic gates | pass/fail recorded as artifacts         |
| 5.3  | Conditional routing: retry → implementer, re-investigate, or fail after the limit  | conditional edges   | unit tests for every route              |
| 5.4  | `reviewer` node (risk review on diff + results)                                    | LLM-as-reviewer     | review attached to the task             |
| 5.5  | Cancellation (between nodes + `AbortSignal`)                                       | cooperative cancel  | cancel mid-run → `cancelled`            |

**Demo:** the full loop up to `awaiting_approval`, with the diff and green tests.

## Phase 6 — Approval & publishing (week 6)

| Step | Build                                                                                                | Concepts                    | Done when                  |
| ---- | ---------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------- |
| 6.1  | `await_approval` interrupt + approvals module (`approve` / `reject` bound to `diffHash` + `baseSha`) | human-in-the-loop           | a wrong hash is rejected   |
| 6.2  | `run.resume` job → `Command({ resume })`                                                             | interrupt/resume            | approved run continues     |
| 6.3  | `publisher` node: Git Data API commit, deterministic branch, look-before-create PR                   | idempotent saga             | run publish twice → one PR |
| 6.4  | Stale-base detection + audit logs                                                                    | consistency, accountability | moved base → `stale_base`  |

**Demo:** the first real PR created on GitHub after you approve it. 🎉

## Phase 7 — Frontend dashboard (week 7)

| Step | Build                                                                                | Done when                     |
| ---- | ------------------------------------------------------------------------------------ | ----------------------------- |
| 7.1  | Next.js app, Tailwind + shadcn/ui, layout, typed API client, auth pages + middleware | login works in the browser    |
| 7.2  | Repositories + integrations pages (install App link)                                 | repos visible                 |
| 7.3  | New task form + task list + dashboard stats                                          | task created from the UI      |
| 7.4  | Task timeline with `useTaskEvents` (SSE → TanStack Query cache)                      | live updates without refresh  |
| 7.5  | Review page: diff viewer, test results, review risk, cost, Approve/Reject            | approve from the UI → PR link |

**Demo:** the complete product flow in the browser.

## Phase 8 — Reliability, evals & delivery (week 8)

| Step | Build                                                                                                         | Done when                  |
| ---- | ------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 8.1  | Integration tests (Testcontainers) + Playwright e2e with fake LLM/GitHub                                      | CI green                   |
| 8.2  | Failure tests: expired token, Redis drop, worker crash, prompt-injection fixtures                             | documented results         |
| 8.3  | OpenTelemetry traces (Jaeger locally) + cost dashboard numbers                                                | trace per task visible     |
| 8.4  | Eval runner over seeded bugs → metrics table (completion rate, cost, time, duplicate PRs)                     | real numbers in the README |
| 8.5  | Production Dockerfiles, deploy the demo (strict budgets), polished README + architecture diagram + demo video | public demo                |

---

## Out of scope for v1 (backlog)

Organisations/teams, multiple language sandboxes (Python, Go), a GitHub Checks integration loop,
gVisor runtime, prompt/version A/B testing, PR comment follow-ups ("fix review comments").
