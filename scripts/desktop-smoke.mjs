import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('.tools/desktop-check');
await fs.mkdir(directory, { recursive: true });
const executablePath = process.argv[2];
const app = await electron.launch({
  timeout: 60000,
  ...(executablePath
    ? { executablePath, args: ['--user-data-dir=' + path.join(directory, 'profile')] }
    : { args: ['.', '--user-data-dir=' + path.join(directory, 'profile')] }),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
});
try {
  const page = await app.firstWindow({ timeout: 30000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('#artwork');
  assert.equal(await page.evaluate(() => typeof window.desktop?.save), 'function');
  assert.equal(await page.evaluate(() => window.isSecureContext), true);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.locator('[data-action="fill"]').click();
  const projectPath = path.join(directory, 'roundtrip.xartist');
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, projectPath);
  await page.locator('[data-action="save"]').click();
  await page.waitForFunction(() => !document.title.startsWith('•'));
  const saved = JSON.parse(await fs.readFile(projectPath, 'utf8'));
  assert.equal(saved.format, 'xartist');
  assert.equal(saved.layers.length, 1);
  const pngPath = path.join(directory, 'export.png');
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, pngPath);
  await page.locator('[data-action="export"]').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('PNG'));
  assert.equal((await fs.readFile(pngPath)).subarray(1, 4).toString(), 'PNG');
  await page.locator('[data-action="new"]').click();
  await page.locator('#new-form .primary').click();
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, projectPath);
  await page.locator('[data-action="open"]').click();
  await page.waitForFunction(
    () => document.querySelector('#artwork').getContext('2d').getImageData(300, 300, 1, 1).data[0] < 100,
  );
  // Canceling a native save must leave the document dirty.
  await page.locator('[data-action="add-layer"]').click();
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true });
  });
  await page.locator('[data-action="save"]').click();
  await page.waitForTimeout(100);
  assert.ok((await page.title()).startsWith('•'));
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 2 });
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  assert.equal(app.windows().length, 1);
  assert.equal(await page.locator('.layer-row.active').count(), 1);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(directory, 'desktop.png') });
  console.log(
    'Desktop smoke passed: secure renderer, native project save/open, PNG export, canceled save, unsaved-close protection.',
  );
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
  });
} catch (error) {
  console.error(`::error::Desktop check failed: ${String(error.message).replaceAll('\n', '%0A')}`);
  throw error;
} finally {
  // This is an isolated test profile. Never let an unsaved-work dialog trap CI cleanup.
  await app
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((win) => win.destroy()))
    .catch(() => {});
  await app.close();
}
