# ForgeOps

**AI-powered software engineering automation.** Describe a bug or feature in plain language, and
ForgeOps plans, investigates, implements, and tests the change in an isolated sandbox. It then opens
a Pull Request on GitHub, but only after a human approves the exact diff.

> 🚧 Work in progress. See the [roadmap](docs/ROADMAP.md) for current status.

## How it works

```
Task → Planner → Investigator → Implementer → Verifier (real tests) → Reviewer
     → ⏸ Human approval (bound to diff hash) → Publisher → Pull Request
```

- **Stateful agent graph** (LangGraph.js) with Postgres checkpoints: crash-safe and resumable.
- **Sandboxed execution:** tests run in network-less, non-root, resource-limited Docker containers.
- **GitHub App** with scoped permissions and short-lived tokens. Never auto-merges.
- **Idempotent publishing:** retries never create duplicate branches or PRs.

## Tech stack

| Layer    | Tech                                                               |
| -------- | ------------------------------------------------------------------ |
| Backend  | NestJS, TypeScript, Prisma, PostgreSQL, Redis, BullMQ              |
| Agents   | LangGraph.js, LangChain model adapters, Zod structured outputs     |
| Frontend | Next.js (App Router), Tailwind CSS, shadcn/ui, TanStack Query, SSE |
| Infra    | Docker, GitHub App + Octokit, OpenTelemetry, Pino, GitHub Actions  |
| Monorepo | pnpm workspaces, Turborepo                                         |

## Repository layout

```
apps/backend        NestJS API + Worker (one codebase, two processes)
apps/web            Next.js dashboard
packages/agents     LangGraph agent graph (framework-agnostic)
packages/contracts  Zod schemas shared by backend, agents, and web
packages/tsconfig   Shared TypeScript configs
packages/eslint-config  Shared lint rules + architecture boundaries
infra/              Docker Compose, sandbox images, GitHub App setup
evals/              Fixture repos with seeded bugs + eval runner
docs/               Architecture, roadmap, ADRs
```

## Getting started

Requirements: Node.js ≥ 22 (24 LTS recommended), pnpm ≥ 10, Docker.

```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): design, patterns, and security model
- [Roadmap](docs/ROADMAP.md): build plan and progress

## License

[MIT](LICENSE)
