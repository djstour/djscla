# Supabase + GitHub setup

## Project

| | |
|---|---|
| **Name** | `auralis-design-system` |
| **Ref** | `htyjvmkujdgtrlusteoj` |
| **Region** | Northeast Asia (Tokyo) |
| **Dashboard** | https://supabase.com/dashboard/project/htyjvmkujdgtrlusteoj |
| **GitHub repo** | https://github.com/sgc58413/auralis-design-system |

## Done via CLI

- [x] Supabase project created and linked locally
- [x] Migration `translations` table pushed to remote
- [x] GitHub Actions workflow `.github/workflows/supabase-migrations.yml`
- [x] GitHub secret `SUPABASE_DB_PASSWORD` (for CI `db push`)

## Bind GitHub in Dashboard (one-time)

Supabase must install its GitHub App on your account/org. The CLI cannot complete this step.

1. Sign in: https://supabase.com/dashboard/sign-in  
   (return URL: [Integrations](https://supabase.com/dashboard/project/htyjvmkujdgtrlusteoj/settings/integrations))

2. Under **GitHub integration**, click **Connect** / **Authorize**.

3. Select repository: **`sgc58413/auralis-design-system`**.

4. Enable **Deploy to production** (or equivalent) so `main` applies migrations from `supabase/migrations/`.

## CI secret still needed

Add a [Supabase access token](https://supabase.com/dashboard/account/tokens) to GitHub:

```bash
gh secret set SUPABASE_ACCESS_TOKEN --repo sgc58413/auralis-design-system
# paste token when prompted
```

Or: GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** → name `SUPABASE_ACCESS_TOKEN`.

## Local env

Copy `.env.example` → `.env` and fill keys from  
**Project Settings → API** in the dashboard. Never commit `.env`.
