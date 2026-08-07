# Pixel Ape

Pixel Ape is a web application: a browser pixel-art workspace that will let people save, reopen, and share sprite projects.

## Run locally

```bash
npm install
npm run dev
```

The frontend runs at `http://127.0.0.1:5174`.

## Backend setup

Pixel Ape uses Supabase Auth, Postgres, and Row Level Security. Without Supabase environment variables the editor remains fully usable in local guest mode.

1. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Run the SQL files in `supabase/migrations/` in timestamp order in the Supabase SQL editor. If the initial migration is already installed, run only the newer migrations.
3. In Supabase Auth URL Configuration, set the site URL and add local and deployed redirect URLs.
4. Enable Google and GitHub under Auth Providers and supply their OAuth credentials.
5. Connect Loops SMTP and publish the confirmation and password-reset transactional templates.

Never put the Supabase service-role key or Loops API key in a `VITE_*` variable.

## Deployment architecture

```text
React frontend → Supabase Auth + Data API → PostgreSQL with RLS
```
