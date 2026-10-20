# ForgeOps — Frontend architecture

The dashboard (`apps/web`) is built so that **every visual element exists exactly once** and
every API call goes through **one typed client**. These rules are enforced by tooling, not only by
convention.

## Layers

```
packages/ui                 @forgeops/ui: the design system (the only place visuals are defined)
├─ src/styles/tokens.css    colours, radii, fonts as CSS variables; light + dark
├─ src/primitives/          Button, Input, Textarea, Label, Card, Badge, Alert, Spinner, Skeleton
└─ src/patterns/            Field, PageHeader, Shell, NavItem, EmptyState, ErrorState

apps/web/src
├─ app/                     routes only: thin pages composing features (no styling of their own)
├─ features/<name>/         one folder per domain (auth, shell, tasks, repositories…)
│  ├─ api.ts                TanStack Query hooks + query keys: the only code calling the API
│  ├─ components/           feature UI, built from @forgeops/ui
│  ├─ (model.ts)            pure logic, e.g. task status → badge tone
│  └─ index.ts              the feature's public API
└─ shared/                  api client, query provider, config: knows nothing about features
```

Dependency direction: `app → features → shared → contracts`, and everything visual → `ui`.

## Rules (and what enforces them)

| Rule                                                      | Why                                                          | Enforced by                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Visual components come only from `@forgeops/ui`           | One button, one card, one badge: a change applies everywhere | `apps/web` may not import `radix-ui`, `class-variance-authority`, `tailwind-merge` (lint) |
| `ui` is presentation only                                 | Reusable by any screen; no hidden data fetching              | `packages/ui` may not import app code, contracts, Next.js, TanStack Query or Zod (lint)   |
| Features are imported through their `index.ts`            | Internals can change without breaking other features         | `@/features/*/*` deep imports are forbidden (lint)                                        |
| Colours and spacing come from tokens                      | Theming and dark mode are a token edit                       | Components use semantic classes (`bg-card`, `text-danger`), never raw colours (review)    |
| Domain → visual mappings are defined once                 | A "failed" task looks the same on every screen               | Mapping lives in the feature's `model.ts` (review)                                        |
| Every response is validated against `@forgeops/contracts` | Backend and frontend can't drift silently                    | `api.request(path, { schema })` requires a schema (types)                                 |

## Design-system API conventions

- **Composition over configuration.** `Button asChild` puts button styles on a Next.js `Link`;
  `NavItem` wraps any link. The design system never depends on a router.
- **Accessibility built in once.** `Field` wires label, hint and error to its control
  (`aria-describedby`, `aria-invalid`). Forms never repeat this wiring.
- **Tones, not colours.** `Badge` and `Alert` take a `tone`
  (neutral/info/warning/success/danger), each with one fixed meaning.
- **Overrides are safe.** `cn()` resolves Tailwind conflicts, so a caller's `className` wins.

## Data and session

- **One API client** (`shared/api/client.ts`): cookies included, CSRF header on unsafe methods,
  response validated with the contract, problem details turned into `ApiError` (with field errors
  and the server's trace id).
- **Transparent session refresh:** an expired access token is refreshed **once** (single flight,
  so parallel requests don't trip the server's refresh-token reuse detection) and the request is
  retried. If the refresh fails, the client announces it and `SessionGate` redirects to sign-in.
- **Why no edge auth check (Next.js Proxy):** the access cookie lives 15 minutes, while the session
  (refresh cookie) lives 30 days and is only sent to the API's `/auth` path. A cookie check in Proxy
  would bounce users with a valid session. The API is the authority; `SessionGate` asks it.
- **TanStack Query** owns server state: query keys sit next to their hooks, 4xx errors are not
  retried, and sign-out clears the whole cache so the next user never sees stale data.

## Testing

- `packages/ui`: behaviour and accessibility of primitives and patterns (Vitest + Testing Library).
- `apps/web`: the API client (refresh, single flight, contract violations), forms (same validation
  as the server, server field errors, open-redirect protection), and pure feature logic.
- `next build` is part of CI, so routing, prerendering and the Tailwind pipeline are checked too.
