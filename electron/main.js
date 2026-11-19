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
  win.loadURL('app://blokcraft/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (!p || p === '/') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) return new Response('Brak dostępu', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
