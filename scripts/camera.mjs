/* camera.mjs — the repo's screenshot camera, desktop AND mobile every time.
   Installed by /repo-ready (master copy: AI-Pipeline .rig/tools/masters/).

   The fleet's proof law says a screen change ships a PNG each of desktop and
   mobile. This is the one camera every repo shares, so "photograph it" never
   again depends on an agent improvising a viewport.

   Usage:
     node scripts/camera.mjs <url> <outdir> [name] [--state <auth.json>] [--full]

   Writes <outdir>/<name>-desktop.png (1280x800) and <name>-mobile.png
   (390x844, iPhone-ish). --state reuses a Playwright storageState file, so a
   signed-in session photographs signed-in screens. --full captures the whole
   scrollable page instead of the viewport.

   Browser: $CHROMIUM, a repo-local Playwright browser, or the machine's
   pre-installed one under /opt/pw-browsers. */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flags = {};
for (let i = args.length - 1; i >= 0; i--) {
  if (args[i] === '--full') { flags.full = true; args.splice(i, 1); }
  if (args[i] === '--state') { flags.state = args[i + 1]; args.splice(i, 2); }
}
const [url, outdir = 'screenshots', name = 'screen'] = args;
if (!url) {
  console.error('usage: camera.mjs <url> <outdir> [name] [--state auth.json] [--full]');
  process.exit(1);
}

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const roots = ['/opt/pw-browsers', join(process.env.HOME || '', '.cache/ms-playwright')];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const dir of dirs) {
      const bin = join(root, dir, 'chrome-linux', 'chrome');
      if (existsSync(bin)) return bin;
    }
  }
  return '';
}

async function loadPlaywright() {
  for (const mod of ['playwright', 'playwright-core', '@playwright/test']) {
    try { return await import(mod); } catch { /* next */ }
  }
  console.error('no Playwright package here — npm i -D playwright-core (or run npx playwright install chromium first)');
  process.exit(1);
}

const PRESETS = [
  { tag: 'desktop', viewport: { width: 1280, height: 800 } },
  { tag: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

const { chromium } = await loadPlaywright();
const executablePath = findChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
mkdirSync(outdir, { recursive: true });

for (const p of PRESETS) {
  const ctx = await browser.newContext({
    viewport: p.viewport,
    isMobile: p.isMobile || false,
    hasTouch: p.hasTouch || false,
    ...(flags.state ? { storageState: flags.state } : {}),
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 }).catch(async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  });
  const file = join(outdir, `${name}-${p.tag}.png`);
  await page.screenshot({ path: file, fullPage: !!flags.full });
  console.log(`wrote ${file}`);
  await ctx.close();
}
await browser.close();
