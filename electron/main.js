// BlokCraft – okno gry (Electron). Pliki gry są w archiwum app.asar, a kod jest zaciemniony.
const { app, BrowserWindow, protocol, net, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// własny adres app://blokcraft – działa jak strona https (moduły, workery, zapis IndexedDB)
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// wydajność: zawsze mocniejsza karta graficzna, bez czarnej listy GPU, bez zwalniania w tle
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const ROOT = path.join(__dirname, '..', 'app');
const fs = require('fs');
// tryb diagnostyczny (tylko na serwerze GitHuba): zapisuje log i zrzut ekranu
const DIAG = process.env.BC_DIAG ? (process.env.BC_DIAG_OUT || process.cwd()) : null;
const dlog = (...a) => { if (DIAG) fs.appendFileSync(path.join(DIAG, 'diag.txt'), a.map(String).join(' ') + '\n'); };
process.on('uncaughtException', (e) => { dlog('UNCAUGHT', e && e.stack); });
dlog('start', process.versions.electron, __dirname, 'ROOT', ROOT, 'exists', fs.existsSync(path.join(ROOT, 'index.html')));
let win = null, quitting = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 500,
    title: 'BlokCraft', backgroundColor: '#000000', show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, devTools: !app.isPackaged, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // F11 – pełny ekran; w gotowej wersji brak narzędzi deweloperskich
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (app.isPackaged && (input.key === 'F12' || (input.control && input.shift && ['I', 'J', 'C'].includes(input.key.toUpperCase())) || (input.control && input.key.toUpperCase() === 'U'))) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
  // zamykanie: najpierw zapisz świat
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    const done = () => { quitting = true; if (win && !win.isDestroyed()) win.destroy(); };
    const t = setTimeout(done, 4000);
    win.webContents.executeJavaScript('window.__bc_save ? window.__bc_save() : 1', true).catch(() => {}).finally(() => { clearTimeout(t); done(); });
  });
  win.webContents.on('will-prevent-unload', (e) => e.preventDefault());
  if (DIAG) {
    win.webContents.on('console-message', (e, level, msg, line, src) => dlog('console', level, msg, src + ':' + line));
    win.webContents.on('did-fail-load', (e, code, desc, url) => dlog('FAIL-LOAD', code, desc, url));
    win.webContents.on('render-process-gone', (e, d) => dlog('GONE', JSON.stringify(d)));
    win.webContents.on('did-finish-load', () => {
      dlog('loaded');
      setTimeout(() => win.webContents.executeJavaScript("window.__test_start ? (__test_start('diag', 4), 'started') : 'no __test_start'").then((r) => dlog('start world', r)).catch((e) => dlog('start err', e.message)), 3000);
      setTimeout(async () => {
        try { dlog('state', await win.webContents.executeJavaScript("JSON.stringify({ready: window.__game && __game.game.ready, chunks: window.__game && __game.world && __game.world.chunks.size})")); } catch (e) { dlog('state err', e.message); }
        try { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(DIAG, 'diag.png'), img.toPNG()); dlog('screenshot ok'); } catch (e) { dlog('shot err', e.message); }
        app.exit(0);
      }, 30000);
    });
  }
  win.loadURL('app://blokcraft/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (!p || p === '/') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { dlog('403', file); return new Response('Brak dostępu', { status: 403 }); }
    dlog('req', req.url, '->', file, fs.existsSync(file));
    return net.fetch(pathToFileURL(file).toString()).then((r) => { dlog('res', req.url, r.status, r.headers.get('content-type')); return r; }).catch((e) => { dlog('ERR', req.url, e && e.message); throw e; });
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
