- **Opportunities**: Standalone supplier opportunities with optional lead, project, and bid links
- **Outreach sequences**: Persistent four-touch follow-ups, manual activity, and scheduled email delivery. See [sequence API and deployment instructions](scripts/outreach-sequences-api.md). Apply `scripts/outreach-sequences-migration.sql`, then set `OUTREACH_SCHEDULER_ENABLED=true` on a running backend instance.
- **Outreach cards**: LinkedIn sent, response rate, and meetings booked share one reporting period. See [stats, manual replies, and meetings API](scripts/outreach-stats-api.md); apply `scripts/outreach-activity-migration.sql` to enable tracking.

### Supplier opportunities

Run `scripts/supplier-migration.sql` after the base CRM migrations. All opportunity reads require authentication; create, edit, delete, and supplier-link operations require the `admin` role.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/suppliers/:supplierId/opportunities?page=1&limit=20` | Paginated supplier opportunities |
| `GET` | `/api/opportunities?search=airport&page=1&limit=20` | Search all opportunities for selectors |
| `POST` | `/api/opportunities` | Create an opportunity |
| `GET` | `/api/opportunities/:id` | Get an opportunity |
| `PATCH` | `/api/opportunities/:id` | Edit an opportunity |
| `DELETE` | `/api/opportunities/:id` | Delete an opportunity |
| `PUT` | `/api/opportunities/:id/suppliers/:supplierId` | Link another supplier |
| `DELETE` | `/api/opportunities/:id/suppliers/:supplierId` | Unlink a supplier |

Create example:

```json
{
  "supplier_id": "supplier-uuid",
  "project_id": "project-uuid",
  "name": "Airport expansion",
  "insight": "Early design influence",
  "status": "open",
  "value": 2500000,
  "currency": "USD"
}
```

`status` must be `open`, `qualified`, `won`, or `lost`. `value` accepts a number, `0`, or `null`; omitted nullable fields are stored as `null`. Supplier detail responses expose the compact `opportunities` array with `id`, `name`, `project`, `value`, `currency`, `insight`, and `status`.

Projects can be linked to suppliers by ID with `PUT /api/projects/:id/suppliers/:supplierId` and unlinked with the corresponding `DELETE` route. Supplier responses include active projects from these links and also support legacy project `suppliers` name arrays using trimmed, case-insensitive matching.
# TwinBlueprint Server

REST API server for TwinBlueprint — a public website + CRM system. Built with Bun, Express, and TypeScript.

## Tech Stack

- [Bun](https://bun.sh) — JavaScript runtime
- Express.js — Web framework
- Supabase (PostgreSQL) — Database
- Resend — Email notifications
- Zod v4 — Request validation
- JWT — Admin authentication
- Swagger/OpenAPI — API documentation

## Features

- **Public**: Demo request submission (`POST /api/demo`) — no auth required
- **CRM** (admin-only): Leads, Bids, Projects, Campaigns — full CRUD
- **Auth**: Admin login with JWT (username + password)
- **Security**: Helmet, CORS, rate limiting, input sanitization, request IDs
- **Email**: Lead notification emails via Resend
- **Docs**: Swagger UI at `/api-docs`

## Prerequisites

- [Bun](https://bun.sh) v1.2+
- Supabase project (PostgreSQL)
- Resend API key

## Installation

```bash
bun install
cp .env.example .env   # fill in your values
bun run seed:admin      # create admin user
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase anon key |
| `SUPABASE_SECRET_KEY` | Yes | Supabase service-role key |
| `JWT_SECRET` | Yes | Min 32 chars |
| `FROM_EMAIL` | Yes | Sender address |
| `RESEND_API_KEY` | No | Required for email sending |
| `PORT` | No | Default `5000` |
| `CLIENT_URL` | No | Frontend origin for CORS; fallback when `CLIENT_URLS` is unset |
| `CLIENT_URLS` | No | Comma-separated approved CORS origins; the production origins `https://twinblueprint.com`, `https://www.twinblueprint.com`, `https://crm.twinblueprint.com` and the preview origin `https://twinblueprint.vercel.app` are always included |

### Cross-origin auth

The API is served from its own host, so it is a different site than `twinblueprint.com`.
The `token` cookie is therefore host-only for the API host — do not add a `Domain`
attribute for the frontend domains, browsers would reject it and the frontend hosts never
read the cookie. Sessions are shared between the main site and the `crm` subdomain because
both call the same API host. A deployed API must send the cookie as `SameSite=None; Secure`
so browsers attach it to those cross-site calls; `authenticate` compensates by rejecting
unsafe methods that are authenticated by cookie from an unapproved `Origin`. Clients that
send `Authorization: Bearer` instead are unaffected.

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes in production | `production` enables the cross-site cookie settings and combined request logs |
| `AUTH_COOKIE_SAME_SITE` | No | Overrides the cookie `SameSite`; use `none` for a cross-site API |
| `AUTH_COOKIE_SECURE` | No | Overrides the cookie `Secure` flag; `true` is required whenever `SameSite=None` |

`NODE_ENV=production` is the intended configuration. The overrides exist so a deployed
service that reports another `NODE_ENV` can still persist sessions, and the process logs a
warning at startup when `RENDER=true` but the cookie would not survive a cross-site call.
Setting `AUTH_COOKIE_SAME_SITE=none` without `AUTH_COOKIE_SECURE=true` fails at boot,
because browsers reject that combination.

## Running

```bash
bun run dev      # development (with --watch)
bun run start    # production
```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | No | Health check |
| `POST` | `/api/demo` | No | Submit demo request (rate: 5/hr) |
| `POST` | `/api/auth/login` | No | Admin login |
| `POST` | `/api/auth/passcode` | No | Admin passcode login (rate: 5/min/IP) |
| `GET` | `/api/auth/me` | Yes | Get current user |
| `POST` | `/api/auth/logout` | Yes | Logout |
| `GET` | `/api/leads` | Yes | List leads (paginated) |
| `POST` | `/api/leads` | Yes | Create lead |
| `GET` | `/api/leads/:id` | Yes | Get lead |
| `PATCH` | `/api/leads/:id` | Yes | Update lead |
| `DELETE` | `/api/leads/:id` | Admin | Delete lead |
| `PATCH` | `/api/leads/:id/assign` | Yes | Assign lead |

### Pagination

List endpoints support `?page=1&limit=20` query params (max 100).

Response includes:
```json
{
  "pagination": { "page": 1, "limit": 20, "total": 45, "pages": 3 }
}
```

### API Docs

Open `http://localhost:5000/api-docs` for Swagger UI.

### CRM examples

All protected CRM calls use `Authorization: Bearer <token>`. `POST /api/leads` accepts the lead fields shown in Swagger, including `industry`, `region`, `project`, `project_size`, `phase`, `lead_status`, and `archived`. `GET /api/leads` supports `search`, `industry`, `region`, `project`, `phase`, `lead_status`, `status`, `min_score`, `archived`, `page`, `limit`, `sort_by`, and `sort_order`.

`POST /api/leads/import` accepts a multipart `file` field containing a CSV with `full_name,email` headers. It responds with `{ "success": true, "data": { "created": 1, "skipped": 0, "failed": 0, "errors": [] } }`. `GET /api/leads/export?region=EMEA&phase=Bid` downloads a filtered CSV. Swagger includes request and response examples for the dashboard, regional, campaign-statistics, outreach, and webhook endpoints.

## Project Structure

```
src/
├── app.ts                    # Express app config
├── config/
│   ├── env.config.ts         # Env vars with validation
│   ├── supabase.ts           # Supabase client
│   └── cookies.ts            # Cookie config
├── controllers/
│   ├── auth.controller.ts
│   ├── demo.controller.ts
│   └── lead.controller.ts
├── middleware/
│   ├── auth.ts               # JWT verification
│   ├── authorize.ts          # Role-based access
│   ├── errorHandler.ts       # Global error handler
│   ├── security.ts           # Request ID, XSS sanitization
│   └── validate.ts           # Zod validation
├── routes/
│   ├── auth.routes.ts
│   ├── demo.routes.ts
│   └── lead.routes.ts
├── services/
│   ├── auth.service.ts
│   ├── demo.service.ts
│   ├── email.service.ts
│   └── lead.service.ts
├── types/
│   ├── auth.types.ts
│   ├── demo.types.ts
│   └── lead.types.ts
└── validations/
    ├── auth.validation.ts
    ├── demo.validation.ts
    └── lead.validation.ts
```

## API rate limiting and Render

API traffic uses separate per-client-IP budgets: GET/HEAD requests allow 600 per minute; writes allow 120 per minute. Health checks (`GET/HEAD /api/health`) and OPTIONS do not consume quota. Non-API routes do not consume API quota. Authentication requirements remain in each router. Strict limits remain on POST `/api/auth/login` (10/15 minutes), `/api/auth/passcode` (5/minute), and `/api/demo` (5/hour), in addition to the broad write budget.

Optional environment settings (validated at startup):

| Variable | Default | Meaning |
| --- | --- | --- |
| `API_RATE_LIMIT_WINDOW_MS` | `60000` | API window in milliseconds |
| `API_RATE_LIMIT_READ_MAX` | `600` | GET/HEAD requests per client IP per window |
| `API_RATE_LIMIT_WRITE_MAX` | `120` | Other requests per client IP per window |
| `TRUST_PROXY_HOPS` | `1` when `RENDER=true`, otherwise `0` | Number of trusted reverse proxy hops; zero for direct hosting |

Redeploy after changing these values. For Render's direct ingress, the default assumes one trusted hop. Verify the actual proxy path and client IP in your deployment before overriding the hop count, especially with a CDN in front. Never blindly trust every forwarded address: see [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/). Users sharing a public IP also share a budget.

The default in-memory store resets each client's count after its window expires; blocked responses do not extend that window. State is local to each server process and resets on restart. Multiple instances require a shared store if a deployment-wide quota is needed. Responses expose `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds remaining), and `RateLimit-Policy` through CORS; 429 responses also expose `Retry-After` in seconds. Sensitive endpoint windows can be longer than the general API window. See [limiter configuration](https://express-rate-limit.mintlify.app/reference/configuration).

Frontend source is not in this repository. Check its QueryClient retry policy: avoid immediate retries on 429; honor `Retry-After`. Use stable query keys, a shared QueryClient, and suitable `staleTime` for options/regions; inspect mount/focus refetches and concurrent queries with different page sizes. TanStack Query defaults to retrying failed queries three times and may refetch stale data on mount, focus, and reconnect ([defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)). These are possible traffic multipliers, not confirmed causes in this deployment.

Run limiter regression checks with `bun test scripts/rate-limit.test.ts`.
