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

async function capture(name, viewport, { baseline = false } = {}) {
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
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${outDir}/${name}-command.png`, fullPage: false });

  const metrics = await page.evaluate(() => {
    const rail = document.querySelector('.service-command-rail');
    const nav = document.querySelector('.side-nav');
    const map = document.querySelector('.service-board-stage');
    const alerts = document.querySelector('.actionable-alerts');
    const rect = (el) => el ? el.getBoundingClientRect().toJSON() : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      body: { scrollWidth: document.body.scrollWidth, clientWidth: document.documentElement.clientWidth },
      rail: rect(rail),
      nav: rect(nav),
      map: rect(map),
      alerts: rect(alerts),
      activeElement: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? null,
    };
  });
  await writeFile(`${outDir}/${name}-metrics.json`, JSON.stringify(metrics, null, 2));
  await context.close();
}

await capture('wide-1440x1000', { width: 1440, height: 1000 }, { baseline: true });
await capture('medium-900x1000', { width: 900, height: 1000 });
await capture('mobile-390x844', { width: 390, height: 844 });
await writeFile(`${outDir}/browser-console.txt`, logs.join('\n') || 'No browser warnings/errors captured.');
await browser.close();
