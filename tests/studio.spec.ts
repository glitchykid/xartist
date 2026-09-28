import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs/promises';

async function point(page: Page, x: number, y: number) {
  const r = await page.locator('#artwork').boundingBox();
  return { x: r!.x + (x * r!.width) / 1280, y: r!.y + (y * r!.height) / 900 };
}
async function stroke(page: Page, x = 200, y = 200, pressure = 1, tiltX = 0) {
  const a = await point(page, x, y),
    b = await point(page, x + 200, y);
  await page.locator('#viewport').dispatchEvent('pointerdown', {
    pointerId: 7,
    pointerType: 'pen',
    clientX: a.x,
    clientY: a.y,
    pressure,
    tiltX,
    tiltY: 0,
    button: 0,
    buttons: 1,
  });
  for (let i = 1; i <= 20; i++)
    await page.locator('#viewport').dispatchEvent('pointermove', {
      pointerId: 7,
      pointerType: 'pen',
      clientX: a.x + ((b.x - a.x) * i) / 20,
      clientY: a.y,
      pressure,
      tiltX,
      tiltY: 0,
      buttons: 1,
    });
  await page.locator('#viewport').dispatchEvent('pointerup', {
    pointerId: 7,
    pointerType: 'pen',
    clientX: b.x,
    clientY: b.y,
    pressure: 0,
    buttons: 0,
  });
  await expect(page.locator('#undo')).toBeEnabled();
}
async function pixel(page: Page, x: number, y: number) {
  return page
    .locator('#artwork')
    .evaluate((c: HTMLCanvasElement, p) => [...c.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data], {
      x,
      y,
    });
}
async function setRange(page: Page, id: string, value: number) {
  await page.locator('#' + id).evaluate((input: HTMLInputElement, v) => {
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
async function saveProject(page: Page) {
  const dl = page.waitForEvent('download');
  await page.locator('[data-action="save"]').click();
  const d = await dl;
  return JSON.parse(await fs.readFile((await d.path())!, 'utf8'));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('xartist.locale', 'en'));
  await page.goto('/');
  await expect(page.locator('#artwork')).toHaveAttribute('width', '1280');
});

test('compact panels and dialogs fit the minimum window in all six languages without scrolling', async ({
  page,
}) => {
  // 720px native window minus the Windows title bar and borders.
  await page.setViewportSize({ width: 1040, height: 681 });
  for (const lang of ['ru', 'uk', 'ko', 'ja', 'zh', 'en']) {
    await page.locator('[data-action="settings"]').click();
    await page.locator('#language').selectOption(lang);
    const overflow = await page.evaluate(() => {
      const selectors = [
        '.topbar',
        '.options',
        '.toolbar',
        '.left-panel',
        '.right-panel',
        '.layers-panel',
        '#layers',
      ];
      return selectors.filter((selector) => {
        const e = document.querySelector(selector)!;
        return e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1;
      });
    });
    expect(overflow, lang).toEqual([]);
    const curve = await page.locator('.pressure-curve').boundingBox();
    expect(curve!.y + curve!.height).toBeLessThan(660);
    await page.locator('[data-action="help"]').click();
    expect(await page.locator('#dialog').evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBeTruthy();
    await page.locator('#dialog-close').click();
  }
  await page.locator('[data-action="settings"]').click();
  await page.locator('#language').selectOption('ru');
  await page.screenshot({ path: '.tools/studio-compact-ru.png' });
});

test('all 24 layers remain reachable through paging without panel scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 681 });
  for (let i = 1; i < 24; i++) await page.locator('[data-action="add-layer"]').click();
  await expect(page.locator('[data-action="add-layer"]')).toBeDisabled();
  const seen = new Set<string>();
  for (let i = 0; i < 24; i++) {
    const ids = await page
      .locator('.layer-row')
      .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.layerId!));
    ids.forEach((id) => seen.add(id));
    expect(await page.locator('#layers').evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBeTruthy();
    if (!(await page.locator('[data-action="page-next"]').isEnabled())) break;
    await page.locator('[data-action="page-next"]').click();
  }
  expect(seen.size).toBe(24);
  await page.locator('.layer-select').last().click();
  await page.setViewportSize({ width: 1480, height: 980 });
  await expect(page.locator('.layer-row.active')).toBeVisible();
});

test('loads a complete studio without runtime errors or overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await expect(page.locator('.brush-card')).toHaveCount(8);
  await expect(page.locator('.layer-row')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
  await page.screenshot({ path: '.tools/studio-en.png' });
});

test('draws pixels, undoes and redoes the complete stroke', async ({ page }) => {
  await stroke(page);
  await expect.poll(() => pixel(page, 300, 200)).not.toEqual([255, 255, 255, 255]);
  await page.keyboard.press('Control+z');
  await expect.poll(() => pixel(page, 300, 200)).toEqual([255, 255, 255, 255]);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => pixel(page, 300, 200)).not.toEqual([255, 255, 255, 255]);
});

test('eraser removes pixels and is undoable', async ({ page }) => {
  await setRange(page, 'size', 30);
  await stroke(page);
  await page.keyboard.press('e');
  await setRange(page, 'size', 60);
  await stroke(page);
  await expect.poll(() => pixel(page, 300, 200)).toEqual([255, 255, 255, 255]);
  await page.keyboard.press('Control+z');
  await expect.poll(() => pixel(page, 300, 200)).not.toEqual([255, 255, 255, 255]);
});

test('pressure and tilt change the actual brush footprint', async ({ page }) => {
  await setRange(page, 'size', 60);
  await setRange(page, 'smoothing', 0);
  await setRange(page, 'stabilization', 0);
  await stroke(page, 200, 150, 0.15);
  await stroke(page, 200, 300, 1);
  await stroke(page, 200, 500, 1, 70);
  const widths = await page.locator('#artwork').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    return [150, 300, 500].map((y) => {
      let count = 0;
      for (let k = y - 60; k <= y + 60; k++) if (ctx.getImageData(300, k, 1, 1).data[0] < 200) count++;
      return count;
    });
  });
  expect(widths[1]).toBeGreaterThan(widths[0] * 2);
  expect(widths[2]).toBeLessThan(widths[1]);
  await expect(page.locator('#tilt-number')).toHaveText('70° / 0°');
});

test('stroke opacity stays consistent despite overlapping dabs', async ({ page }) => {
  await setRange(page, 'size', 40);
  await setRange(page, 'opacity', 30);
  await stroke(page);
  const p = await pixel(page, 300, 200);
  expect(p[0]).toBeGreaterThan(175);
  expect(p[0]).toBeLessThan(220);
});

test('all eight brush tips draw distinct stroke data', async ({ page }) => {
  const images = new Set<string>();
  for (const kind of ['ink', 'pencil', 'round', 'marker', 'airbrush', 'chalk', 'wash', 'tone']) {
    await page.locator(`[data-action="brush:${kind}"]`).click();
    await stroke(page);
    const p = await saveProject(page);
    images.add(p.layers[0].png);
    await page.locator('#undo').click();
  }
  expect(images.size).toBe(8);
});

test('layers isolate edits, respect visibility and lock, and undo structural changes', async ({ page }) => {
  await stroke(page);
  await page.locator('[data-action="add-layer"]').click();
  await expect(page.locator('.layer-row')).toHaveCount(2);
  await stroke(page, 200, 400);
  await page.locator('.layer-row.active .visibility').click();
  await expect.poll(() => pixel(page, 300, 400)).toEqual([255, 255, 255, 255]);
  await expect.poll(() => pixel(page, 300, 200)).not.toEqual([255, 255, 255, 255]);
  await page.locator('.layer-row.active .visibility').click();
  await page.locator('.layer-row.active').hover();
  await page.locator('.layer-row.active .layer-lock').click();
  const before = await saveProject(page);
  await stroke(page, 200, 600);
  const after = await saveProject(page);
  expect(after.layers[1].png).toBe(before.layers[1].png);
  await page.locator('[data-action="delete-layer"]').click();
  await expect(page.locator('.layer-row')).toHaveCount(1);
  await page.locator('#undo').click();
  await expect(page.locator('.layer-row')).toHaveCount(2);
});

test('selection clips fill and transforms only selected pixels', async ({ page }) => {
  await page.keyboard.press('m');
  const a = await point(page, 200, 200),
    b = await point(page, 400, 400);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.press('g');
  await expect.poll(() => pixel(page, 300, 300)).not.toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 500, 500)).toEqual([255, 255, 255, 255]);
  await page.keyboard.press('Control+t');
  await setRange(page, 'scale', 50);
  await page.locator('#inspector-apply').click();
  await expect.poll(() => pixel(page, 210, 210)).toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 300, 300)).not.toEqual([255, 255, 255, 255]);
  await page.keyboard.press('Control+z');
  await expect.poll(() => pixel(page, 210, 210)).not.toEqual([255, 255, 255, 255]);
});

test('color correction previews, cancels and commits reversibly', async ({ page }) => {
  await stroke(page);
  const original = await pixel(page, 300, 200);
  await page.keyboard.press('Control+u');
  await setRange(page, 'brightness', 80);
  await expect.poll(async () => (await pixel(page, 300, 200))[0]).toBeGreaterThan(original[0]);
  await page.locator('#inspector-cancel').click();
  await expect.poll(() => pixel(page, 300, 200)).toEqual(original);
  await page.keyboard.press('Control+u');
  await setRange(page, 'brightness', 80);
  await page.locator('#inspector-apply').click();
  await expect.poll(async () => (await pixel(page, 300, 200))[0]).toBeGreaterThan(original[0]);
  await page.keyboard.press('Control+z');
  await expect.poll(() => pixel(page, 300, 200)).toEqual(original);
});

test('project save and reopen preserves pixels and layer properties', async ({ page }) => {
  await stroke(page);
  await page.locator('[data-action="add-layer"]').click();
  await stroke(page, 200, 400);
  await page.locator('#blend').selectOption('multiply');
  await page.locator('#layer-opacity').fill('65');
  await page.locator('#layer-opacity').press('Tab');
  const project = await saveProject(page);
  expect(project.layers).toHaveLength(2);
  expect(project.layers[1].opacity).toBe(0.65);
  await page.locator('[data-action="new"]').click();
  await page.locator('#new-form .primary').click();
  await page.locator('#project-input').setInputFiles({
    name: 'test.xartist',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator('.layer-row')).toHaveCount(2);
  const reopened = await saveProject(page);
  expect(reopened).toEqual(project);
});

test('rejects corrupt or malicious projects without losing artwork', async ({ page }) => {
  await stroke(page);
  const project = await saveProject(page);
  for (const corrupt of [
    { ...project, version: 42 },
    { ...project, width: 9000 },
    { ...project, layers: [{ ...project.layers[0], id: '"><img src=x>' }] },
  ]) {
    await page.locator('#project-input').setInputFiles({
      name: 'bad.xartist',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(corrupt)),
    });
    await expect(page.locator('#toast')).toHaveClass('show');
    expect(await pixel(page, 300, 200)).not.toEqual([255, 255, 255, 255]);
  }
});

test('PNG export is a valid PNG and transparent export preserves alpha', async ({ page }) => {
  await stroke(page);
  await page.locator('#paper').selectOption('transparent');
  const dl = page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const bytes = await fs.readFile((await (await dl).path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1280);
  expect(bytes.readUInt32BE(20)).toBe(900);
  const alpha = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + base64;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 900;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, 1, 1).data[3];
  }, bytes.toString('base64'));
  expect(alpha).toBe(0);
});

test('switches all six locales without discarding artwork', async ({ page }) => {
  await stroke(page);
  for (const lang of ['ru', 'uk', 'ko', 'ja', 'zh', 'en']) {
    await page.locator('[data-action="settings"]').click();
    await page.locator('#language').selectOption(lang);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect.poll(() => pixel(page, 300, 200)).not.toEqual([255, 255, 255, 255]);
    await expect(page.locator('.brush-card')).toHaveCount(8);
  }
});

test('recovers the last session after reload', async ({ page }) => {
  await stroke(page);
  await expect(page.locator('#status')).toHaveText('Recovery copy saved', { timeout: 10000 });
  page.on('dialog', (d) => d.accept());
  await page.reload();
  await expect(page.locator('#restore')).toBeVisible();
  await page.locator('#restore').click();
  await expect.poll(() => pixel(page, 300, 200)).not.toEqual([255, 255, 255, 255]);
});

test('moving a selected region leaves the rest of the layer untouched', async ({ page }) => {
  await stroke(page, 200, 200);
  await stroke(page, 600, 400);
  await page.keyboard.press('m');
  const a = await point(page, 150, 150),
    b = await point(page, 450, 250);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  await page.mouse.up();
  await page.keyboard.press('v');
  const c = await point(page, 300, 200),
    d = await point(page, 300, 400);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(d.x, d.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => pixel(page, 300, 200)).toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 300, 400)).not.toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 700, 400)).not.toEqual([255, 255, 255, 255]);
});
