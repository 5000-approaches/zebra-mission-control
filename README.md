# Zebra Mission Control

Project management hub for Zebra Consulting.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tests

```bash
npm test           # unit (Vitest)
npm run test:e2e   # end-to-end (Playwright)
npm run typecheck
npm run lint
```

## Deploy

Pushes to `dev` deploy to a preview at `zebra-mission-control-git-dev-zebra-consulting.vercel.app`. Pushes to `main` deploy to production.

See `AGENTS.md` for stack details and conventions.
