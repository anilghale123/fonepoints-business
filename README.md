# Fonepoints Business

The merchant portal that hosts OMS. Angular 22, standalone components, signals.

This exists to answer one question ahead of time: **does embedding OMS in the Fonepoints portal
via an iframe actually work, and does the merchant end up with two sets of navigation?** It is an
integration spike, not the production portal — Customers, Payments, Offers, Reports and Settings
are placeholders. Only **OMS** is wired up.

## Running it

OMS must be running first, because this portal only frames it.

```bash
# 1. OMS (separate repo)
cd ../oms-frontend && npm run dev          # http://localhost:3000

# 2. this portal
npm install
npm start                                   # http://localhost:4200
```

Open <http://localhost:4200> and click **OMS** in the sidebar.

## How the embed works

| Piece | Where |
|---|---|
| The iframe and its loading / failure states | `src/app/pages/oms/oms-page.ts` |
| OMS origin and embed URL | `src/app/core/config.ts` |
| Sidebar entries | `src/app/core/nav.ts` |
| Portal chrome (sidebar, top bar) | `src/app/app.ts`, `app.html`, `app.scss` |

The division of responsibility:

- **The portal owns all chrome** — sidebar, top bar, merchant identity. It gives the embedded app
  its entire content area and nothing else: no card, no padding, no heading.
- **OMS serves `/embed/*`**, a surface that renders its page header and table but deliberately no
  sidebar or header of its own. Standalone OMS at `/orders` is unchanged and still has both.
- Links inside the frame stay on `/embed/*`, so navigating between orders never escapes the
  embedded surface.

## Two things that make or break it

1. **`frame-ancestors`.** A browser refuses to frame a page unless the page's CSP names the host
   origin. OMS allows `http://localhost:4200` by default and reads
   `NEXT_PUBLIC_EMBED_HOST_ORIGINS` for other environments. OMS's *other* surfaces stay
   `frame-ancestors 'self'`, so the standalone dashboard and the rider portal cannot be framed.
2. **A refused frame is silent.** The browser fires no error event the host can catch, so
   `OmsPage` falls back to a timeout and shows a retry. If you change origins or ports, expect
   that state rather than a blank panel.

## Known, and deliberate for now

- **No authentication.** Neither app has it yet. When it lands, the portal will need to pass a
  token into the frame (`postMessage`) and OMS will need to accept it; `src/app/core/config.ts`
  is where the host side will start.
- **The portal URL does not reflect the OMS route.** Navigating to an order inside the frame
  leaves the browser on `/oms`, so an order cannot be deep-linked or bookmarked, and a refresh
  returns to the queue. Fixable by syncing frame state to the parent URL via `postMessage`.
- **The frame does not auto-size.** It fills the content area and OMS scrolls internally, which
  is the robust choice; height-reporting via `postMessage` is the alternative if a
  single-page-scroll feel is wanted.
