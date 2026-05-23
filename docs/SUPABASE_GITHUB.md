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

4. Enable **Deploy to production** so `main` applies migrations from `supabase/migrations/`.
5. Leave **Supabase changes only** enabled (only `supabase/**` triggers DB deploys).

### Recommended for this prototype

| Setting | Recommendation | Why |
|---------|------------------|-----|
| **Deploy to production** | On | `main` → apply migrations |
| **Supabase changes only** | On | UI / Vercel pushes do not touch the DB |
| **Automatic branching** | **Off** | Avoid extra branching compute + billing notice |

Older self-serve projects often had branching disabled, so they never showed the yellow **Branching and billing** banner.

## Branching and billing (Dashboard warning)

If you see:

> *Branching Compute is not covered by your organization's Spend Cap. Costs should be closely monitored…*

**Cause:** **Automatic branching** is on under [GitHub integration](https://supabase.com/dashboard/project/pmdfdkhfkjyuvucsfsoe/settings/integrations). Supabase creates **preview database branches** per PR; that compute is **not** counted toward your org **Spend Cap**.

**Not caused by:** Vercel, static hosting, or a normal `db push` to production on `main`.

**What to do:**

| Goal | Action |
|------|--------|
| Prototype / single `main` DB only | Turn off **Automatic branching** → **Save** |
| Need PR preview databases | Keep it on; monitor usage in **Organization → Billing** |

Production migrations on `main` still work with branching off.

## Duplicate migration runs (pick one)

This repo can trigger migrations twice if both are enabled:

1. **Supabase GitHub integration** (Dashboard → Integrations)
2. **GitHub Actions** — `.github/workflows/supabase-migrations.yml`

Use **one** path for `supabase/migrations/`:

- **Dashboard integration only** → disable or delete the Actions workflow, or  
- **Actions only** → turn off **Deploy to production** on the Supabase GitHub integration

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

## Vercel

Static UI deploy: see [VERCEL.md](./VERCEL.md) (`https://djscla.vercel.app`).  
Link project **`djscla`** under Supabase → Integrations → **Vercel** → **Manage** if env sync is needed later.
