# Net Worth Tracker

Personal & marriage net-worth dashboard. Built with Next.js 16, Supabase, and Tailwind.

## Local setup

1. `cp .env.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. In your Supabase project, open SQL Editor → New query → paste contents of `supabase/schema.sql` → Run.
3. `npm install`
4. `npm run dev` and open http://localhost:3000

## Deploy

- Push this repo to GitHub.
- Import into [Vercel](https://vercel.com/new). Add the same env vars in Vercel project settings.
- Vercel deploys automatically on every push to main.

## Phases

- [x] **Phase 1** — Auth, two workspaces, empty dashboard
- [ ] **Phase 2** — Manual asset CRUD + seeded data
- [ ] **Phase 3** — Auto pricing (Yahoo Finance + Thai RMF/SSF NAV)
- [ ] **Phase 4** — PDF statement ingestion via Claude API
- [ ] **Phase 5** — History charts and allocation drift
