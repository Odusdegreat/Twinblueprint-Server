# twinblueprint-server

A REST API server built with Bun, Express, and TypeScript for handling TwinBlueprint demo requests. Captures lead information, stores it in MongoDB, and sends email notifications.

## Features

- Demo request submission API (lead generation)
- MongoDB persistence with Mongoose (prevents duplicate leads by email)
- Email notifications via Gmail (Nodemailer)
- CORS enabled for cross-origin requests
- Full TypeScript with strict mode
- Clean architecture: controllers, services, models, routes

## Tech Stack

- [Bun](https://bun.com) v1.2.20+ - JavaScript runtime
- Express.js - Web framework
- MongoDB + Mongoose - Database
- Nodemailer - Email sending
- TypeScript - Type safety

## Prerequisites

- [Bun](https://bun.com) installed
- MongoDB instance (Atlas or local)
- Gmail account with App Password for email notifications

## Installation

```bash
bun install
```

## Environment Variables

Create a `.env` file in the root directory:

```
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/<database>
PORT=5000
EMAIL_USER=your-gmail-address@gmail.com
EMAIL_PASS=your-gmail-app-password
CLIENT_URL=http://localhost:3000
NODE_ENV=development
```

> **Note:** For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833), not your regular password.

## Running the Server

**Development (with auto-reload):**
```bash
bun run dev
```

**Production:**
```bash
bun run start
```

Server starts on `http://localhost:5000` (or the `PORT` set in `.env`).

## API Endpoints

### POST `/api/demo`

Submit a demo request.

**Request Body:**
```json
{
  "fullName": "John Doe",
  "workEmail": "john@company.com",
  "company": "Acme Inc.",
  "jobTitle": "CTO",
  "phone": "+1234567890",
  "industry": "Technology"
}
```

**Responses:**
- `201 Created` - Demo request submitted successfully
- `400 Bad Request` - Missing required fields (`fullName`, `workEmail`)
- `409 Conflict` - Lead with this email already exists
- `500 Internal Server Error` - Server error

## Project Structure

```
src/
├── app.ts              # Express app setup
├── config/
│   ├── db.config.ts    # MongoDB connection
│   └── env.config.ts   # Environment variables
├── controllers/
│   └── demo.controller.ts
├── models/
│   └── demo.model.ts   # Mongoose schema
├── routes/
│   └── demo.routes.ts
├── services/
│   ├── demo.service.ts
│   └── email.service.ts
└── types/
    └── demo.types.ts
```
