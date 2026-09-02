<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Zebra Mission Control

Project management hub for Zebra Consulting — tracks projects, contracts, expectations, and customer-facing commitments.

## Stack

- Next.js 16 (App Router) + React 19
- Tailwind 4 (via `@tailwindcss/postcss`)
- TypeScript strict mode
- Vitest (unit) + Playwright (e2e)
- Geist font, lucide-react icons

## Design

Slack-inspired chrome (dark sidebar `#1D1C1D` + accent gradient). Multi-tenant color schemes via `data-scheme` attribute on `<html>`; light/dark mode via `data-mode`. Default scheme: `zebra-yellow`. See `src/lib/schemes.ts` and `src/app/globals.css`.

## Conventions

- Branch from `dev`, target `dev` in PRs (never `main` directly).
- Run `npm run lint && npm run typecheck && npm test` before pushing.
- E2E tests use `localhost:3000` by default; set `PLAYWRIGHT_BASE_URL` to test against a deployed preview.

## Answer style (Rune, 23 Jul — permanent)

- Every chat answer: a few short bullet points. Nothing more — no headers, no intros, no outros.
- Each bullet is a complete sentence in plain layman's terms — short, but never choppy or cryptic, and it carries its own context so no earlier message is needed to understand it.
- The only exception: numbered step-by-step recipes.
