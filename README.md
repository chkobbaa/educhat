# EduChat

EduChat is a standalone chat product repository built from the former chat direction in `tradesk`, with a new UX-first foundation.

Current build includes:
- iMessage-inspired visual language (soft depth, rounded bubbles, calm hierarchy)
- high-retention chat layout (fast scanning sidebar + immersive message canvas)
- responsive interaction patterns (search, quick replies, typing state, delivery state)
- production-grade project baseline (lint, typecheck, build all clean)

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS 4
- ESLint 9

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — run production server
- `npm run lint` — lint checks
- `npm run typecheck` — TypeScript checks

## Run Locally

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

## Deploy to educhat.bahroun.me

1. Deploy this repo to Vercel (recommended for Next.js).
2. In Vercel project settings, add custom domain: `educhat.bahroun.me`.
3. Add DNS record at your DNS provider for `bahroun.me`:
	- Type: `CNAME`
	- Name/Host: `educhat`
	- Target/Value: `cname.vercel-dns.com`
	- Proxy: DNS only (if using Cloudflare)
4. Wait for SSL issuance and domain verification in Vercel.

After propagation, production URL will be:
- `https://educhat.bahroun.me`

## Product Direction

The UX is intentionally optimized for session length and return usage:
- low-friction compose flow
- immediate conversational readability
- emotionally warm visual system
- clear interaction affordances with minimal cognitive load

Next milestones:
- realtime websocket transport
- identity/auth + contacts graph
- media/voice composer suite
- notification and re-engagement loops
- message actions (reply/thread/reaction/forward)

