# Absurdissimo website

Public website for [Absurdissimo](https://ibalashov.github.io/absurdissimo/),
the iOS vocabulary app. This repo serves two things at once:

| Path | What | Served by |
|------|------|-----------|
| `/` (repo root: `index.html`, `privacy.html`, images) | Legacy static marketing site | GitHub Pages (main branch, root) |
| `site/` | Next.js (App Router) app — the permanent frontend | Vercel (`absurdissimo.vercel.app`) |

## Why both exist

The App Store listing references the GitHub Pages URLs
(`https://ibalashov.github.io/absurdissimo/` and `…/privacy.html`), so the
root static files must stay exactly where they are until those references are
updated. The Next.js app therefore lives in the `site/` subdirectory — Vercel's
**Root Directory** project setting points at it, and GitHub Pages keeps serving
the root untouched. A `.nojekyll` file disables Jekyll processing on Pages so
the added `site/` sources can never break the Pages build; the static files are
served as-is, same as before.

The Next.js app ports the same content: home page (`/`) mirrors `index.html`,
`/privacy` mirrors `privacy.html`. It also reserves the phase-1 routing
skeleton — `/{pair}/{word}` (e.g. `/it-en/gatto`) — which 404s until word-pair
card pages ship.

## Constraints (by design)

- **Stateless frontend.** All future data lives behind the private server's
  public JSON API; the site holds no state of its own.
- **No Vercel-proprietary services** — no KV, Edge Config, Blob, or Vercel
  cron. Plain Next.js only, so the site stays portable to Cloudflare, Netlify,
  or a container.
- **No custom domain yet.** `absurdissimo.vercel.app` is the deliberate
  phase-0 end state; domain purchase is deferred until the phase-2 indexing
  gate.

## Local development

```bash
cd site
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Vercel setup (one-time, manual)

1. Go to <https://vercel.com/new> and import the `ibalashov/absurdissimo`
   GitHub repo.
2. Set **Project Name** to `absurdissimo` (this makes the deployment URL
   `absurdissimo.vercel.app`).
3. Set **Root Directory** to `site`. Framework preset should auto-detect
   as Next.js; leave build/output settings at their defaults.
4. No environment variables are needed.
5. Deploy. Production deploys track the `main` branch automatically;
   PRs get preview deployments.

Do **not** add a custom domain and do not enable any Vercel storage/cron
add-ons (see constraints above).
