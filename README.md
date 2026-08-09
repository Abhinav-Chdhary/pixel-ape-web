# Pixel Ape

Pixel Ape is a browser pixel-art workspace for creating, saving, reopening, and exporting sprite projects.

Production URL: [pixelape.abhinavs.org](https://pixelape.abhinavs.org/)

## Run locally

```bash
npm install
npm run dev
```

The frontend runs at `http://127.0.0.1:5174`.

## Backend setup

Pixel Ape uses Supabase Auth, Postgres, and Row Level Security. Without Supabase environment variables the editor remains fully usable in local guest mode.

1. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Run the SQL files in `supabase/migrations/` in timestamp order in the Supabase SQL editor. This includes the publications migration used by the public gallery. If the initial migration is already installed, run only the newer migrations.
3. In Supabase Auth URL Configuration, set the site URL and add local and deployed redirect URLs.
4. Enable Google and GitHub under Auth Providers and supply their OAuth credentials.
5. Connect Loops SMTP and publish the confirmation and password-reset transactional templates.

Never put the Supabase service-role key or Loops API key in a `VITE_*` variable.

## Public sharing and gallery

Signed-in creators can publish a saved sprite as either an unlisted public link or a gallery entry. Every publication is a server-created snapshot: private edits remain private until the creator generates the link again.

The Vite app needs `VITE_API_URL` at build time. The Express service in `api/` needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ALLOWED_ORIGIN` at runtime. The API service-role key must only be configured in Zerops; it must never be added to browser variables or committed files.

Run the API locally with a server-only environment file:

```bash
cd api
cp .env.example .env
# Fill in the Supabase URL and service-role key in api/.env.
npm install
npm run dev
```

## Deployment architecture

```text
React frontend → Zerops Express publication API → Supabase Auth + PostgreSQL with RLS
```

The frontend is built by Zerops and served as a static site. The API is a second Zerops Node.js service named `api`; create that runtime service in the Zerops project before deploying the matching second entry in `zerops.yaml`.
