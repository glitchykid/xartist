const { app, BrowserWindow, ipcMain, dialog, protocol, net, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'xartist',
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
let win,
  dirty = false,
  allowClose = false,
  askingClose = false;
let labels = {
  title: 'Unsaved changes',
  message: 'Save your project before closing.',
  save: 'Save project',
  discard: 'Discard changes',
  cancel: 'Cancel',
};
const validSender = (event) =>
  event.sender === win?.webContents &&
  event.senderFrame === win.webContents.mainFrame &&
  event.senderFrame.url.startsWith('xartist://app/');
function handler(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!validSender(event)) throw new Error('Untrusted sender');
    return fn(...args);
  });
}

app.whenReady().then(() => {
  const root = path.resolve(__dirname, '../dist');
  protocol.handle('xartist', (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Forbidden', { status: 403 });
    const target = path.resolve(
      root,
      '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
    );
    if (!target.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#202425',
    title: 'X Artist',
    icon: path.join(root, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.on('close', async (event) => {
    if (!dirty || allowClose) return;
    event.preventDefault();
    if (askingClose) return;
    askingClose = true;
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      title: labels.title,
      message: labels.message,
      buttons: [labels.save, labels.discard, labels.cancel],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    askingClose = false;
    if (response === 1) {
      allowClose = true;
      win.close();
    }
    if (response === 0) win.webContents.send('save-before-close');
  });
  handler('state', (value) => {
    if (!value || typeof value.dirty !== 'boolean') return;
    dirty = value.dirty;
    if (
      value.labels &&
      Object.keys(labels).every((k) => typeof value.labels[k] === 'string' && value.labels[k].length < 1000)
    )
      labels = value.labels;
  });
  handler('close-saved', () => {
    if (!dirty) {
      allowClose = true;
      win.close();
    }
  });
  handler('open-project', async () => {
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: 'X Artist', extensions: ['xartist'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if ((await fs.stat(file)).size > 192 * 1024 * 1024) throw new Error('Project too large');
    return fs.readFile(file, 'utf8');
  });
  handler('save-file', async ({ name, data, kind }) => {
    if (
      !['project', 'png'].includes(kind) ||
      typeof data !== 'string' ||
      data.length > 192 * 1024 * 1024 ||
      typeof name !== 'string'
    )
      throw new Error('Invalid file');
    const ext = kind === 'project' ? 'xartist' : 'png';
    if (kind === 'png' && !data.startsWith('data:image/png;base64,')) throw new Error('Invalid PNG');
    const filename = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || 'Untitled';
    const result = await dialog.showSaveDialog(win, {
      defaultPath: filename + '.' + ext,
      filters: [{ name: kind === 'project' ? 'X Artist' : 'PNG', extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return false;
    const tmp = result.filePath + '.' + require('node:crypto').randomUUID() + '.tmp';
    try {
      await fs.writeFile(tmp, kind === 'project' ? data : Buffer.from(data.slice(22), 'base64'), {
        flag: 'wx',
      });
      await fs.rename(tmp, result.filePath);
    } catch (error) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw error;
    }
    return true;
  });
  win.loadURL('xartist://app/');
});
app.on('window-all-closed', () => app.quit());
