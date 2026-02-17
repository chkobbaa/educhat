# EduChat

EduChat is a standalone chat product repository built from the former chat direction in `tradesk`, with a new UX-first foundation.

Current build includes:
- iMessage-inspired visual language (soft depth, rounded bubbles, calm hierarchy)
- high-retention chat layout (fast scanning sidebar + immersive message canvas)
- persistent per-device identity with shareable 6-character user IDs (no login)
- DB-backed multi-user contacts, messages, attachments, typing presence, and push subscriptions
- realtime transport via WebSocket server + polling fallback
- production-grade project baseline (lint, typecheck, build all clean)

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS 4
- ESLint 9

## Scripts

- `npm run dev` — start dev server
- `npm run realtime` — start WebSocket realtime server (default `ws://localhost:3001`)
- `npm run build` — production build
- `npm run start` — run production server
- `npm run lint` — lint checks
- `npm run typecheck` — TypeScript checks

## Run Locally

```bash
npm install
npm run realtime
npm run dev
```

App runs at `http://localhost:3000`.

## Environment Variables

Create `.env.local` from `.env.example` and set:

- `TURSO_DATABASE_URL` (optional, defaults to local `file:educhat.db`)
- `TURSO_AUTH_TOKEN` (optional, for hosted Turso)
- `NEXT_PUBLIC_WS_URL` (frontend websocket URL, example `ws://localhost:3001`)
- `WS_PORT` (websocket server port, default `3001`)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (required for push notifications)
- `VAPID_PRIVATE_KEY` (required for push notifications)
- `VAPID_SUBJECT` (contact URI, e.g. `mailto:admin@bahroun.me`)

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

Implemented UX direction:
- low-friction compose flow
- immediate conversational readability
- emotionally warm visual system
- clear interaction affordances with minimal cognitive load

Implemented backend/realtime scope:
- auth identity via persistent device cookie/header mapping
- contacts CRUD (add/list)
- message send/load + incoming incremental sync
- attachment upload + streaming endpoint
- typing presence API
- push subscription + web-push send on message
- websocket relay server for typing + new message events

