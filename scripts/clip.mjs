/* clip.mjs — turns a browser run into the proof pair: a self-playing GIF and
   a crisp mp4. Installed by /repo-ready (master copy: AI-Pipeline
   .rig/tools/masters/).

   This used to exist only as PROSE inside the builders' prompts ("Playwright
   recordVideo, then ffmpeg, 480px, 10fps, palette-optimized"). Prose holds
   when an agent remembers it; this script is the same recipe as a thing that
   runs.

   Usage:
     node scripts/clip.mjs <url> <outdir> [name] [--state <auth.json>] [--seconds N] [--script <steps.mjs>]

   Records <seconds> (default 8) of the page — scrolling gently so something
   moves — then writes <outdir>/<name>.gif (480px wide, 10fps, palette-
   optimized, autoplays inline) and <name>.mp4 (the crisp copy). --script
   points at a module exporting `run(page)` to drive real interactions
   instead of the default scroll. --state reuses a signed-in storageState.

   ffmpeg: $FFMPEG, the machine's own, or Playwright's bundled copy. */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flags = { seconds: 8 };
for (let i = args.length - 1; i >= 0; i--) {
  if (args[i] === '--state') { flags.state = args[i + 1]; args.splice(i, 2); }
  if (args[i] === '--seconds') { flags.seconds = Number(args[i + 1]) || 8; args.splice(i, 2); }
  if (args[i] === '--script') { flags.script = args[i + 1]; args.splice(i, 2); }
}
const [url, outdir = 'screenshots', name = 'clip'] = args;
if (!url) {
  console.error('usage: clip.mjs <url> <outdir> [name] [--state auth.json] [--seconds N] [--script steps.mjs]');
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

// What this ffmpeg can actually do — asked, never assumed. Playwright ships
// its own ffmpeg built with --disable-everything: it can write the webm
// Playwright records and nothing else. Picking it by name would produce no
// GIF and no mp4, which is exactly the silent-nothing this tool exists to
// stop, so a build that cannot encode is not "an ffmpeg" here.
function capabilities(bin) {
  try {
    const enc = execFileSync(bin, ['-encoders'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const flt = execFileSync(bin, ['-filters'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const gif = /^\s*\S*V\S*\s+gif\s/m.test(enc);
    const h264 = /\slibx264\s/.test(enc);
    const mpeg4 = /^\s*\S*V\S*\s+mpeg4\s/m.test(enc);
    if (!gif || !(h264 || mpeg4)) return null;
    return { bin, palette: /\spalettegen\s/.test(flt) && /\spaletteuse\s/.test(flt), h264 };
  } catch { return null; }
}

function findFfmpeg() {
  const tried = [];
  const candidates = [];
  if (process.env.FFMPEG) candidates.push(process.env.FFMPEG);
  candidates.push('ffmpeg');
  for (const root of ['/opt/pw-browsers', join(process.env.HOME || '', '.cache/ms-playwright')]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => /^ffmpeg-\d+$/.test(d))) {
      const bin = join(root, dir, 'ffmpeg-linux');
      if (existsSync(bin)) candidates.push(bin);
    }
  }
  for (const bin of candidates) {
    const cap = capabilities(bin);
    if (cap) return cap;
    tried.push(bin);
  }
  console.error('no ffmpeg here can encode a GIF and an mp4 — tried: ' + (tried.join(', ') || 'nothing'));
  console.error("Playwright's own bundled ffmpeg is built with --disable-everything and can only write webm, so it does not count.");
  console.error('Install a real one (Ubuntu: sudo apt-get install -y ffmpeg) or point FFMPEG at one.');
  return null;
}

async function loadPlaywright() {
  for (const mod of ['playwright', 'playwright-core', '@playwright/test']) {
    try { return await import(mod); } catch { /* next */ }
  }
  console.error('no Playwright package here — npm i -D playwright-core (or npx playwright install chromium first)');
  process.exit(1);
}

const FF = findFfmpeg();
if (!FF) process.exit(1);

const { chromium } = await loadPlaywright();
const executablePath = findChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
mkdirSync(outdir, { recursive: true });
const videoDir = join(outdir, '.clip-tmp');

const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
  ...(flags.state ? { storageState: flags.state } : {}),
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 }).catch(async () => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
});

if (flags.script) {
  const mod = await import(resolve(flags.script));
  await mod.run(page);
} else {
  // Default motion: a gentle scroll down and back, so the clip shows the
  // page alive rather than a still frame pretending to be a video.
  const steps = Math.max(2, Math.floor(flags.seconds / 2));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout((flags.seconds * 1000) / (steps * 2));
  }
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout((flags.seconds * 1000) / (steps * 2));
  }
}

await ctx.close(); // finalizes the webm
await browser.close();

const webm = readdirSync(videoDir).find((f) => f.endsWith('.webm'));
if (!webm) { console.error('recording produced no video'); process.exit(1); }
const src = join(videoDir, webm);
const gif = join(outdir, `${name}.gif`);
const mp4 = join(outdir, `${name}.mp4`);

// The recipe from the builders' prompts, verbatim: 480px wide, 10fps,
// palette-optimized GIF (it autoplays inline) + the crisp mp4. webm is never
// linked anywhere, so it does not survive the temp dir. A build without the
// palette filters still gets a GIF, just a plainer one.
const gifFilter = FF.palette
  ? 'fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse'
  : 'fps=10,scale=480:-1:flags=lanczos';
execFileSync(FF.bin, ['-y', '-i', src, '-vf', gifFilter, gif], { stdio: 'ignore' });
execFileSync(FF.bin, FF.h264
  ? ['-y', '-i', src, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]
  : ['-y', '-i', src, '-c:v', 'mpeg4', '-q:v', '3', mp4], { stdio: 'ignore' });
rmSync(videoDir, { recursive: true, force: true });
console.log(`wrote ${gif}`);
console.log(`wrote ${mp4}`);
