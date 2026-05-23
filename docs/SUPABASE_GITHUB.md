# Supabase + GitHub setup

## Project

| | |
|---|---|
| **Name** | `djscla` |
| **Ref** | `pmdfdkhfkjyuvucsfsoe` |
| **Region** | Northeast Asia (Tokyo) |
| **Dashboard** | https://supabase.com/dashboard/project/pmdfdkhfkjyuvucsfsoe |
| **GitHub repo** | https://github.com/djstour/djscla |

## Done via CLI

- [x] Supabase project `djscla` created and linked locally
- [x] Migration `translations` table pushed to remote
- [x] GitHub Actions workflow `.github/workflows/supabase-migrations.yml`

## Bind GitHub in Dashboard (one-time)

Supabase must install its GitHub App on your account/org. The CLI cannot complete this step.

1. Sign in: https://supabase.com/dashboard/sign-in  
   (return URL: [Integrations](https://supabase.com/dashboard/project/pmdfdkhfkjyuvucsfsoe/settings/integrations))

2. Under **GitHub integration**, click **Connect** / **Authorize**.

3. Select repository: **`djstour/djscla`**.

4. Enable **Deploy to production** (or equivalent) so `main` applies migrations from `supabase/migrations/`.

## CI secrets (GitHub repo `djstour/djscla`)

```bash
gh secret set SUPABASE_DB_PASSWORD --repo djstour/djscla
gh secret set SUPABASE_ACCESS_TOKEN --repo djstour/djscla
```

`SUPABASE_DB_PASSWORD` is the database password set at project creation (see local `.env`).  
`SUPABASE_ACCESS_TOKEN` from https://supabase.com/dashboard/account/tokens

## Local env

Copy `.env.example` → `.env` and fill keys from  
**Project Settings → API** in the dashboard. Never commit `.env`.
