# link-like-setlist-maker-backend

Hono + Prisma backend for the Link! Like! setlist maker. The development database runtime is Supabase Cloud Postgres.

## Development setup

1. Copy `.env.example` to `.env` and fill in the shared development `Supabase Cloud` URLs, the shared `BACKEND_API_TOKEN`, plus the disposable `TEST_*` database URLs.
   Also set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `SUPABASE_JWKS_URL` for `@supabase/server`. Copy them from the Supabase dashboard `Connect` dialog and never commit a real secret key.

2. Apply Prisma migrations to the shared development database:

```bash
npm run db:migrate
```

3. Seed the catalog:

```bash
npm run db:seed
```

4. Start the API:

```bash
npm run dev
```

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run deploy -- --dry-run
```

`npm test` requires `TEST_DATABASE_URL` and uses `TEST_DIRECT_URL` when provided. Tests reset that database with `prisma migrate reset --force`, so it must point at a disposable database whose name explicitly includes `test`.

## Cloudflare Workers deployment

The API can run as a Cloudflare Worker at `https://api.link-like-setlist-maker.sukisuki.club`.
The Worker connects to Supabase Postgres through the `HYPERDRIVE` binding and uses `DATABASE_URL` as the fallback connection string for local Worker runs.

Required Worker secrets:

```bash
wrangler secret put DATABASE_URL
wrangler secret put BACKEND_API_TOKEN
```

`DATABASE_URL` should be the Supabase Postgres runtime connection string. Keep `DIRECT_URL` for local Prisma migrations, seeds, and administrative scripts; it is not required by the Worker runtime.

Required Worker bindings:

- `HYPERDRIVE`: Cloudflare Hyperdrive config for the Supabase Postgres runtime database.

Deploy:

```bash
npm run deploy
```

Local Worker runtime check:

```bash
npm run dev:worker
```

After deploying the backend Worker, update the frontend Worker secret or variable `BACKEND_API_BASE_URL` to `https://api.link-like-setlist-maker.sukisuki.club` and redeploy the frontend.

## Public API hardening

The public setlist API intentionally supports only anonymous create and ID-based read:

- `POST /api/setlists`
- `GET /api/setlists/:id`

Do not expose anonymous list, update, or delete endpoints without adding authentication and ownership checks. Set `BACKEND_API_TOKEN` to the same secret used by the frontend server; protected write and SongMedia requests without that token return `401`. Public writes are also protected by in-process rate limits; keep edge/CDN rate limits enabled in production as the outer enforcement layer. SongMedia rows are managed directly in the database and user-facing APIs must not create or update media records.

## Supabase project setup

1. Create the shared Supabase Cloud project used for development and set a database password.
2. In the dashboard, open `Connect` and copy the project URL, publishable key, secret key, JWKS URL, and Postgres connection strings.
3. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`, `BACKEND_API_TOKEN`, `DATABASE_URL`, and `DIRECT_URL` in `.env`.
4. Provision a separate disposable test database and set `TEST_DATABASE_URL` and `TEST_DIRECT_URL` in `.env`.
5. Create a Prisma role for production use:

```sql
create user "prisma" with password 'replace-me' bypassrls createdb;
grant "prisma" to "postgres";
grant usage on schema public to prisma;
grant create on schema public to prisma;
grant all on all tables in schema public to prisma;
grant all on all routines in schema public to prisma;
grant all on all sequences in schema public to prisma;
alter default privileges for role postgres in schema public grant all on tables to prisma;
alter default privileges for role postgres in schema public grant all on routines to prisma;
alter default privileges for role postgres in schema public grant all on sequences to prisma;
```

For this backend, use a direct Postgres connection by default. If deployment later moves to an IPv4-only or serverless environment, switch the application-facing `DATABASE_URL` to a pooler URL at that point while keeping `DIRECT_URL` as the direct migration connection.

## Supabase / Prisma operation policy

This project uses Supabase as the Postgres runtime and Prisma as the application-side schema and access layer. Use the following rules as the source of truth for day-to-day operation.

1. Schema changes must be managed in `prisma/schema.prisma` and `prisma/migrations/`. Do not add a separate migration flow under `supabase/`.
2. Treat `DATABASE_URL` as the application runtime connection and `DIRECT_URL` as the direct connection used for Prisma migration and other administrative commands.
3. Separate database roles by purpose in hosted environments. Migration commands may require elevated privileges, but the API runtime should use a narrower role.
4. Be careful with `npm test`. The test script runs `prisma migrate reset --force` against `TEST_DATABASE_URL`, so that URL must only point at a disposable test database.
5. Seed data is managed by Prisma. Keep catalog bootstrap data in `prisma/seed.ts` and `prisma/seed-data/`, and do not introduce a second seed flow through Supabase CLI.
6. The current backend relies on Supabase primarily as the hosted Postgres provider. Do not assume Auth, Storage, Realtime, or other Supabase features are part of the application contract unless code is added for them.
