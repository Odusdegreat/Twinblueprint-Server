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
- **CRM** (admin-only): Leads, Companies, Notifications — full CRUD
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
| `CLIENT_URL` | No | Frontend origin for CORS |

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
| `GET` | `/api/auth/me` | Yes | Get current user |
| `POST` | `/api/auth/logout` | Yes | Logout |
| `GET` | `/api/leads` | Yes | List leads (paginated) |
| `POST` | `/api/leads` | Yes | Create lead |
| `GET` | `/api/leads/:id` | Yes | Get lead |
| `PATCH` | `/api/leads/:id` | Yes | Update lead |
| `DELETE` | `/api/leads/:id` | Admin | Delete lead |
| `PATCH` | `/api/leads/:id/assign` | Yes | Assign lead |
| `GET` | `/api/companies` | Yes | List companies (paginated) |
| `POST` | `/api/companies` | Yes | Create company |
| `GET` | `/api/companies/:id` | Yes | Get company |
| `PATCH` | `/api/companies/:id` | Yes | Update company |
| `DELETE` | `/api/companies/:id` | Admin | Delete company |
| `GET` | `/api/notifications` | Yes | List notifications (paginated) |
| `POST` | `/api/notifications` | Admin | Create notification |
| `PATCH` | `/api/notifications/:id/read` | Yes | Mark as read |
| `DELETE` | `/api/notifications/:id` | Yes | Delete notification |

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
│   ├── company.controller.ts
│   ├── demo.controller.ts
│   ├── lead.controller.ts
│   └── notification.controller.ts
├── middleware/
│   ├── auth.ts               # JWT verification
│   ├── authorize.ts          # Role-based access
│   ├── errorHandler.ts       # Global error handler
│   ├── security.ts           # Request ID, XSS sanitization
│   └── validate.ts           # Zod validation
├── routes/
│   ├── auth.routes.ts
│   ├── company.routes.ts
│   ├── demo.routes.ts
│   ├── lead.routes.ts
│   └── notification.routes.ts
├── services/
│   ├── auth.service.ts
│   ├── company.service.ts
│   ├── demo.service.ts
│   ├── email.service.ts
│   ├── lead.service.ts
│   └── notification.service.ts
├── types/
│   ├── auth.types.ts
│   ├── company.types.ts
│   ├── demo.types.ts
│   ├── lead.types.ts
│   └── notification.types.ts
└── validations/
    ├── auth.validation.ts
    ├── company.validation.ts
    ├── demo.validation.ts
    ├── lead.validation.ts
    └── notification.validation.ts
```
