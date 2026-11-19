const { app, BaseWindow, WebContentsView, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const STUDIO_URL = process.env.CHIDO_URL || 'http://localhost:3000';
const PARTITION = 'persist:chido-browser';

let mainWindow = null;
let uiView = null;
const browserViews = new Map();
let activeBrowserTabId = null;
let activeProjectContext = {
  projectId: null,
  companyCode: 'INBOX',
  productCode: 'UNASSIGNED',
  storageRoot: path.join(process.cwd(), 'chido-assets'),
  productFolder: '_Inbox',
};

function createStudioWindow() {
  mainWindow = new BaseWindow({
    width: 1520,
    height: 940,
    minWidth: 1200,
    minHeight: 760,
    title: 'CHIDO Studio',
  });

  uiView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.contentView.addChildView(uiView);
  const bounds = mainWindow.getContentBounds();
  uiView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
  uiView.webContents.loadURL(STUDIO_URL);

  mainWindow.on('resize', () => {
    const b = mainWindow.getContentBounds();
    uiView.setBounds({ x: 0, y: 0, width: b.width, height: b.height });
  });

  // Intercept every download across the persistent Chromium session
  const browserSession = session.fromPartition(PARTITION);
  browserSession.on('will-download', (event, item, webContents) => {
    // Lock project identity at the exact instant download starts
    const lockedContext = { ...activeProjectContext };
    const fileName = item.getFilename();
    const isGlb = fileName.toLowerCase().endsWith('.glb');
    const subfolder = isGlb ? 'Tripo' : 'AI Images';

    const targetDir = lockedContext.projectId
      ? path.join(lockedContext.storageRoot, lockedContext.productFolder, subfolder)
      : path.join(lockedContext.storageRoot, '_Inbox');
    const stagingDir = path.join(lockedContext.storageRoot, '_Staging');

    fs.mkdirSync(stagingDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    const stagedPath = path.join(stagingDir, `${Date.now()}-${fileName}.part`);
    const finalPath = path.join(targetDir, fileName);
    item.setSavePath(stagedPath);

    item.on('updated', (_, state) => {
      if (state === 'progressing') {
        uiView.webContents.send('chido:download-progress', {
          fileName,
          lockedProjectId: lockedContext.projectId,
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes(),
        });
      }
    });

    item.once('done', (_, state) => {
      if (state === 'completed') {
        fs.renameSync(stagedPath, finalPath);
        uiView.webContents.send('chido:download-complete', {
          fileName,
          lockedProjectId: lockedContext.projectId,
          finalPath,
          subfolder,
        });
      }
    });
  });
}

ipcMain.handle('chido:set-active-project', (_, ctx) => {
  activeProjectContext = { ...activeProjectContext, ...ctx };
  return { ok: true, activeProjectContext };
});

ipcMain.handle('chido:open-browser-tab', (_, { tabId, url, bounds, scripts }) => {
  let view = browserViews.get(tabId);
  if (!view) {
    view = new WebContentsView({
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    browserViews.set(tabId, view);
    mainWindow.contentView.addChildView(view);

    view.webContents.on('did-finish-load', async () => {
      const currentUrl = view.webContents.getURL();
      for (const script of scripts || []) {
        if (script.enabled && currentUrl.includes(script.domainPattern)) {
          try {
            await view.webContents.executeJavaScript(script.code, true);
          } catch (err) {
            uiView.webContents.send('chido:script-error', {
              scriptId: script.id,
              message: String(err),
            });
          }
        }
      }
    });
  }

  activeBrowserTabId = tabId;
  for (const [id, v] of browserViews.entries()) {
    v.setVisible(id === tabId);
  }
  if (bounds) view.setBounds(bounds);
  if (url && view.webContents.getURL() !== url) {
    view.webContents.loadURL(url);
  }
  return { ok: true };
});

ipcMain.handle('chido:toggle-devtools', (_, tabId) => {
  const view = browserViews.get(tabId || activeBrowserTabId);
  if (view) {
    view.webContents.toggleDevTools();
  }
});

ipcMain.handle('chido:capture-region', async (_, { tabId, rect }) => {
  const view = browserViews.get(tabId || activeBrowserTabId);
  if (!view) return null;
  const image = await view.webContents.capturePage(rect);
  return image.toPNG().toString('base64');
});

ipcMain.handle('chido:launch-blender', (_, { blenderExe, scriptPath, glbPath }) => {
  const child = spawn(blenderExe, ['--python', scriptPath, '--', glbPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return { ok: true, pid: child.pid };
});

app.whenReady().then(createStudioWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
