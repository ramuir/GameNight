#!/usr/bin/env node
// Regenerates GameNight/assets/gamenight-landing-demo.gif.
// Usage: node scripts/capture-landing-demo.mjs [--keep-temp]

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const uiDir = path.join(repoRoot, 'src', 'gamenight-ui');
const assetsDir = path.join(repoRoot, 'assets');
const outputGif = path.join(assetsDir, 'gamenight-landing-demo.gif');

const requireFromUi = createRequire(path.join(uiDir, 'package.json'));
const { chromium } = requireFromUi('playwright');
const ffmpegPath = requireFromUi('ffmpeg-static');

const PORT = 4175;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const VIEWPORT = { width: 1280, height: 720 };
const BLINK_CYCLE_MS = 4800; // .home-focus-title neon-flicker duration
const SLIDES = 3; // kingsInTheCorner, connectFour, liverpool
const MAX_BYTES = 5_000_000; // "under 5 MB" in the strictest (decimal) reading

// Progressively cheaper encodes; first one under MAX_BYTES wins.
const ENCODE_LADDER = [
  { width: 960, fps: 12 },
  { width: 900, fps: 10 },
  { width: 800, fps: 10 },
  { width: 720, fps: 8 },
  { width: 640, fps: 8 },
  { width: 560, fps: 6 },
];

const keepTemp = process.argv.includes('--keep-temp');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-demo-'));

function log(message) {
  process.stdout.write(`[capture] ${message}\n`);
}

async function waitForServer(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Dev server did not respond at ${BASE_URL} within ${timeoutMs}ms`);
}

function startDevServer() {
  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: uiDir, shell: process.platform === 'win32', stdio: 'ignore' },
  );
  child.unref();
  return child;
}

async function recordVideo() {
  const videoDir = path.join(tmpRoot, 'video');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });
  const recordingStart = Date.now();
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.locator('.home-focus-title').waitFor({ state: 'visible' });
  await page.locator('.slot-carousel').waitFor({ state: 'visible' });
  // Everything before this point is a blank frame; trim it out of the GIF.
  const leadInMs = Date.now() - recordingStart;

  const nextButton = page.getByRole('button', { name: 'Next game' });
  for (let slide = 0; slide < SLIDES; slide += 1) {
    // Hold long enough for a full title blink cycle on every game.
    await page.waitForTimeout(BLINK_CYCLE_MS + 400);
    if (slide < SLIDES - 1) {
      await nextButton.click();
      await page.waitForTimeout(600);
    }
  }

  await context.close();
  await browser.close();

  const [video] = fs.readdirSync(videoDir).filter((name) => name.endsWith('.webm'));
  if (!video) throw new Error('Playwright produced no video file');
  return { video: path.join(videoDir, video), leadInMs };
}

function encodeGif(sourceVideo, startOffsetSeconds, { width, fps }) {
  const palette = path.join(tmpRoot, `palette-${width}-${fps}.png`);
  const filters = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  const seek = ['-ss', startOffsetSeconds.toFixed(2)];

  const paletteRun = spawnSync(
    ffmpegPath,
    ['-y', ...seek, '-i', sourceVideo, '-vf', `${filters},palettegen=stats_mode=diff`, palette],
    { stdio: 'ignore' },
  );
  if (paletteRun.status !== 0) throw new Error('ffmpeg palettegen failed');

  const gifRun = spawnSync(
    ffmpegPath,
    [
      '-y',
      ...seek,
      '-i', sourceVideo,
      '-i', palette,
      '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
      '-loop', '0',
      outputGif,
    ],
    { stdio: 'ignore' },
  );
  if (gifRun.status !== 0) throw new Error('ffmpeg paletteuse failed');

  return fs.statSync(outputGif).size;
}

let devServer;
try {
  fs.mkdirSync(assetsDir, { recursive: true });

  let reusedServer = false;
  try {
    await waitForServer(1500);
    reusedServer = true;
    log(`reusing dev server already listening on ${BASE_URL}`);
  } catch {
    log(`starting dev server on ${BASE_URL}`);
    devServer = startDevServer();
    await waitForServer();
  }
  if (reusedServer) devServer = undefined;

  log('recording landing page');
  const { video, leadInMs } = await recordVideo();
  const startOffsetSeconds = Math.max(0, leadInMs / 1000 - 0.2);

  let finalSize = 0;
  let finalSettings = null;
  for (const settings of ENCODE_LADDER) {
    finalSize = encodeGif(video, startOffsetSeconds, settings);
    finalSettings = settings;
    log(`encoded ${settings.width}px @ ${settings.fps}fps -> ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
    if (finalSize <= MAX_BYTES) break;
  }

  if (finalSize > MAX_BYTES) {
    throw new Error(`Could not get under ${MAX_BYTES} bytes; smallest attempt was ${finalSize}`);
  }

  log(`wrote ${path.relative(repoRoot, outputGif)} (${finalSettings.width}px @ ${finalSettings.fps}fps, ${(finalSize / 1024 / 1024).toFixed(2)} MB)`);
} finally {
  if (devServer) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(devServer.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      devServer.kill('SIGTERM');
    }
  }
  if (keepTemp) {
    log(`temp files kept at ${tmpRoot}`);
  } else {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}
