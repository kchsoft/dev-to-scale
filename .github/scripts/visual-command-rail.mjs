import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = 'http://127.0.0.1:3000';
const outDir = 'artifacts/visual-qa';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const logs = [];

async function openGame(page) {
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      logs.push(`[${message.type()}] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack ?? error.message}`));
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /BOOT SERVICE/i }).click();
  await page.locator('#service-stage-title').waitFor();
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const rail = document.querySelector('.service-command-rail');
    const nav = document.querySelector('.side-nav');
    const map = document.querySelector('.service-board-stage');
    const alerts = document.querySelector('.actionable-alerts');
    const drawerBackdrop = document.querySelector('.drawer-backdrop');
    const drawer = document.querySelector('.node-drawer');
    const eventOverlay = document.querySelector('.event-overlay');
    const eventCard = document.querySelector('.event-card');
    const rect = (el) => el ? el.getBoundingClientRect().toJSON() : null;
    const layer = (el) => el ? {
      zIndex: getComputedStyle(el).zIndex,
      position: getComputedStyle(el).position,
      pointerEvents: getComputedStyle(el).pointerEvents,
      rect: rect(el),
    } : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      body: { scrollWidth: document.body.scrollWidth, clientWidth: document.documentElement.clientWidth },
      rail: rect(rail),
      railScroll: rail ? { scrollHeight: rail.scrollHeight, clientHeight: rail.clientHeight, scrollTop: rail.scrollTop } : null,
      nav: rect(nav),
      map: rect(map),
      alerts: rect(alerts),
      layers: {
        rail: layer(rail),
        drawerBackdrop: layer(drawerBackdrop),
        drawer: layer(drawer),
        eventOverlay: layer(eventOverlay),
        eventCard: layer(eventCard),
      },
      eventKind: eventCard?.className ?? null,
      eventTitle: eventCard?.querySelector('h2')?.textContent?.trim() ?? null,
      railStillMounted: Boolean(rail),
      drawerStillMounted: Boolean(drawer),
    };
  });
}

async function captureBrowse(name, viewport, { baseline = false } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await openGame(page);

  if (baseline) {
    await page.screenshot({ path: `${outDir}/${name}-baseline.png`, fullPage: false });
  }

  const technology = page.getByRole('button', { name: /Technology 선택 열기/i });
  await technology.waitFor();
  await technology.click();
  await page.locator('.service-command-rail').waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${name}-browse.png`, fullPage: false });
  await writeFile(`${outDir}/${name}-browse-metrics.json`, JSON.stringify(await collectMetrics(page), null, 2));
  await context.close();
}

async function captureDetail(name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await openGame(page);

  const feature = page.getByRole('button', { name: /Feature 진행 작업 열기/i });
  await feature.waitFor();
  await feature.click();
  await page.locator('.service-command-rail.detail').waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${name}-detail.png`, fullPage: false });
  await writeFile(`${outDir}/${name}-detail-metrics.json`, JSON.stringify(await collectMetrics(page), null, 2));
  await context.close();
}

async function captureLayering(name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await openGame(page);

  await page.getByRole('button', { name: /Technology 선택 열기/i }).click();
  await page.locator('.service-command-rail').waitFor();

  await page.locator('.topology-node.server-group').first().click();
  await page.locator('.node-drawer').waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${name}-command-plus-inspector.png`, fullPage: false });
  await writeFile(`${outDir}/${name}-command-plus-inspector-metrics.json`, JSON.stringify(await collectMetrics(page), null, 2));

  const dayButton = page.getByRole('button', { name: '하루 진행' });
  const eventOverlay = page.locator('.event-overlay');
  let advancedDays = 0;
  for (; advancedDays < 120; advancedDays += 1) {
    await dayButton.evaluate((button) => button.click());
    await page.waitForTimeout(20);
    if (await eventOverlay.count()) break;
  }
  if (!(await eventOverlay.count())) {
    throw new Error(`blocking event not reached after ${advancedDays} QA day advances`);
  }

  await eventOverlay.waitFor({ state: 'visible', timeout: 5_000 });
  await page.waitForTimeout(250);
  const eventMetrics = await collectMetrics(page);
  await page.screenshot({ path: `${outDir}/${name}-blocking-event-over-inspector.png`, fullPage: false });
  await writeFile(`${outDir}/${name}-blocking-event-over-inspector-metrics.json`, JSON.stringify({ advancedDays: advancedDays + 1, ...eventMetrics }, null, 2));

  await context.close();
}

for (const [name, viewport, baseline] of [
  ['desktop-2048x1649', { width: 2048, height: 1649 }, true],
  ['wide-1440x1000', { width: 1440, height: 1000 }, true],
  ['medium-900x1000', { width: 900, height: 1000 }, false],
  ['mobile-390x844', { width: 390, height: 844 }, true],
]) {
  await captureBrowse(name, viewport, { baseline });
  await captureDetail(name, viewport);
}

await captureLayering('wide-1440x1000', { width: 1440, height: 1000 });

await writeFile(`${outDir}/browser-console.txt`, logs.join('\n') || 'No browser warnings/errors captured.');
await browser.close();
