// Electron 主进程：启动内嵌本地服务并打开导播控制台窗口
// 所有关键步骤都会写入日志：%APPDATA%\WardenBroadcast\logs\main.log
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = !app.isPackaged;
let mainWindow = null;
let serverHandle = null;
let activeUrl = null;
let fatalShown = false;

// 这台机器是 RTX 5070 Ti Laptop 的混合显卡；Electron 33 在部分 NVIDIA 驱动上
// GPU 进程初始化失败会直接结束主进程（表现为"双击没反应"）。界面是纯 DOM，用软件渲染即可。
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

/* ---------------------------------------------------------------- 日志 */
function logDir() {
  const base = (() => {
    try { return app.getPath('userData'); } catch { return path.join(process.env.APPDATA || '.', 'WardenBroadcast'); }
  })();
  return path.join(base, 'logs');
}
function logToFile(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    fs.appendFileSync(path.join(logDir(), 'main.log'), line);
  } catch {}
  try { process.stdout.write(line); } catch {}
}
function fail(title, detail) {
  logToFile('FAIL', title, detail);
  if (fatalShown) return;
  fatalShown = true;
  try { dialog.showErrorBox(title, detail); } catch (err) { logToFile('dialog failed', String(err)); }
  app.quit();
}

logToFile('boot', `electron=${process.versions.electron} node=${process.versions.node} packaged=${app.isPackaged} exe=${process.execPath}`);
logToFile('argv', process.argv.join(' '));

process.on('uncaughtException', (err) => fail('卫戍协议 · 启动异常', String(err && err.stack ? err.stack : err)));
process.on('unhandledRejection', (err) => fail('卫戍协议 · 启动异常', String(err && err.stack ? err.stack : err)));

/* ------------------------------------------------------------ 单实例 */
const gotLock = app.requestSingleInstanceLock();
logToFile('single-instance-lock', gotLock);
if (!gotLock) {
  // 锁拿不到通常意味着「已有实例在跑」，也可能是杀软/重定向目录导致锁文件创建失败。
  // 不能直接退出——那样用户看到的就是「双击没反应」。稍后由 whenReady 探测：
  // 有活着的实例就连过去开窗口，没有就照常自己起服务。
  logToFile('lock not acquired, will probe for a live instance');
} else {
  app.on('second-instance', () => {
    logToFile('second-instance event');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/* -------------------------------------------------------------- 服务 */
async function startLocalServer() {
  const { startServer } = require(path.join(__dirname, '..', 'dist-server', 'server.cjs'));
  const dataDir = path.join(app.getPath('userData'), 'match-data');
  fs.mkdirSync(dataDir, { recursive: true });
  logToFile('dataDir', dataDir);

  let lastErr = null;
  for (const port of [7317, 7318, 7319, 7320]) {
    try {
      const handle = await startServer({ port, dataDir });
      logToFile('server started', handle.url);
      return handle;
    } catch (err) {
      lastErr = err;
      logToFile('server start failed', `port=${port}`, String(err && err.code), String(err && err.message));
      if (err && err.code !== 'EADDRINUSE') throw err;
    }
  }
  throw lastErr || new Error('端口 7317–7320 均被占用');
}

// 端口上已经有本程序（或开发服务）在跑时，直接连上去开窗口
async function detectRunningInstance() {
  for (const port of [7317, 7318, 7319, 7320]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(700) });
      if (!res.ok) continue;
      const body = await res.json();
      if (body && body.ok) {
        logToFile('found running instance', port);
        return { port, url: `http://127.0.0.1:${port}/` };
      }
    } catch {}
  }
  return null;
}

/* -------------------------------------------------------------- 窗口 */
function createWindow(url) {
  logToFile('createWindow', url);
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1020,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#0B0D10',
    title: '卫戍协议 · 导播控制台',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    logToFile('ready-to-show');
    if (mainWindow) mainWindow.show();
  });
  // 兜底：即使首帧事件没来，也要把窗口显示出来
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      logToFile('force show window (ready-to-show missed)');
      mainWindow.show();
    }
  }, 4000);

  mainWindow.webContents.on('did-finish-load', () => logToFile('did-finish-load'));
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, validUrl) => {
    logToFile('did-fail-load', code, desc, validUrl);
  });
  mainWindow.webContents.on('render-process-gone', (_e, d) => logToFile('render-process-gone', JSON.stringify(d)));

  mainWindow.loadURL(url).catch((err) => logToFile('loadURL rejected', String(err && err.message)));

  // 外部链接交给系统浏览器，站内链接留在窗口内
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http://127.0.0.1')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1600,
          height: 940,
          backgroundColor: '#000000',
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    logToFile('window closed');
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  logToFile('app ready');
  try {
    const existing = await detectRunningInstance();
    if (existing) {
      activeUrl = existing.url;
      createWindow(activeUrl);
      return;
    }
    serverHandle = await startLocalServer();
    activeUrl = serverHandle.url;
    createWindow(activeUrl);
  } catch (err) {
    fail(
      '卫戍协议 · 启动失败',
      `内置服务没能启动。\n\n${String(err && err.message ? err.message : err)}\n\n` +
        `若提示端口被占用，请先关闭占用 7317–7320 的程序（例如残留的 node 进程）后重试。\n` +
        `日志：${path.join(logDir(), 'main.log')}`
    );
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && activeUrl) createWindow(activeUrl);
  });
});

app.on('window-all-closed', () => {
  logToFile('window-all-closed -> quit');
  app.quit();
});

app.on('will-quit', () => logToFile('will-quit'));

app.on('before-quit', () => {
  try {
    const { stopServer } = require(path.join(__dirname, '..', 'dist-server', 'server.cjs'));
    stopServer();
  } catch {}
});