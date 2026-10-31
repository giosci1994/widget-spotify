const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  screen,
  clipboard,
  Notification,
} = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const auth = require('./auth');
const spotify = require('./spotify');
const settings = require('./settings');

let tray = null;
let win = null;
let settingsWin = null;
let pollTimer = null;
let pollGen = 0; // invalida i cicli di polling precedenti
let fadeTimer = null;
let lastAuthUrl = null;
let updateReadyVersion = null;

// Devono coincidere con le dimensioni di .card in renderer/style.css
const WIN_WIDTH = 372;
const WIN_HEIGHT = 252;

// Il polling gira solo mentre la card è visibile
const POLL_MS = 1000;

// Ogni finestra ha il suo preload, che espone solo le API che le servono
function webPreferences(preload) {
  return {
    preload: path.join(__dirname, preload),
    contextIsolation: true,
    nodeIntegration: false,
  };
}

function alive(w) {
  return !!w && !w.isDestroyed();
}

function publicConfig() {
  const cfg = auth.loadConfig();
  return { hasClientId: !!cfg.clientId };
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    webPreferences: webPreferences('preload.js'),
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', pushSettings);
  win.on('blur', () => hideWindow());
}

// Posiziona la card nell'angolo scelto, dentro la workArea (esclude la barra).
function positionWindow() {
  const s = settings.load();
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;
  const m = 12;
  const corner = s.corner || 'bottom-right';
  const winX = corner.includes('left') ? x + m : x + width - WIN_WIDTH - m;
  const winY = corner.includes('top') ? y + m : y + height - WIN_HEIGHT - m;
  win.setPosition(Math.round(winX), Math.round(winY));
}

// Dissolvenza dell'opacità della finestra fino a "target".
function fadeTo(target, after) {
  if (fadeTimer) clearInterval(fadeTimer);
  const start = win.getOpacity();
  const steps = 12;
  let i = 0;
  fadeTimer = setInterval(() => {
    if (!alive(win)) {
      clearInterval(fadeTimer);
      fadeTimer = null;
      return;
    }
    i++;
    win.setOpacity(start + (target - start) * (i / steps));
    if (i >= steps) {
      clearInterval(fadeTimer);
      fadeTimer = null;
      win.setOpacity(target);
      if (typeof after === 'function') after();
    }
  }, 14);
}

function hideWindow() {
  if (!alive(win) || !win.isVisible()) return;
  stopPolling();
  const s = settings.load();
  if (s.fade) fadeTo(0, () => alive(win) && win.hide());
  else win.hide();
}

function toggleWindow() {
  if (!alive(win)) return;
  if (win.isVisible()) {
    hideWindow();
    return;
  }
  const s = settings.load();
  positionWindow();
  win.setOpacity(s.fade ? 0 : s.opacity);
  win.show();
  win.focus();
  startPolling();
  pushSettings();
  if (s.fade) fadeTo(s.opacity);
}

function pushSettings() {
  if (alive(win)) win.webContents.send('settings', settings.load());
}

function applySettings(s) {
  if (alive(win) && win.isVisible()) {
    positionWindow();
    if (!fadeTimer) win.setOpacity(s.opacity);
  }
  pushSettings();
}

function openSettings() {
  if (alive(settingsWin)) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 400,
    height: 548,
    resizable: false,
    frame: false,
    backgroundColor: '#17171c',
    show: false,
    fullscreenable: false,
    maximizable: false,
    title: 'Impostazioni · Widget Spotify',
    webPreferences: webPreferences('preload-settings.js'),
  });
  settingsWin.loadFile(path.join(__dirname, 'settings', 'index.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

function normalize(s) {
  if (!s || !s.item) return { active: false };
  const item = s.item;
  const img =
    item.album && item.album.images && item.album.images.length ? item.album.images[0].url : null;
  return {
    active: true,
    isPlaying: !!s.is_playing,
    trackId: item.id,
    title: item.name,
    artists: (item.artists || []).map((a) => a.name).join(', '),
    album: item.album ? item.album.name : '',
    image: img,
    durationMs: item.duration_ms || 0,
    progressMs: s.progress_ms || 0,
    shuffle: !!s.shuffle_state,
    repeat: s.repeat_state || 'off',
    device: s.device
      ? {
          id: s.device.id,
          name: s.device.name,
          type: s.device.type,
          volume: s.device.volume_percent,
        }
      : null,
    timestamp: Date.now(),
  };
}

function sendLoggedOut() {
  win.webContents.send('auth-state', { authed: false, config: publicConfig() });
}

// Aggiorna la card. Ritorna i ms da attendere prima del prossimo poll
// se Spotify ha risposto con un rate limit (429), altrimenti 0.
async function refreshNow() {
  if (!alive(win)) return 0;
  try {
    if (!auth.hasStoredAuth()) {
      sendLoggedOut();
      return 0;
    }
    const state = await spotify.getPlaybackState();
    if (alive(win)) win.webContents.send('playback', normalize(state));
  } catch (e) {
    if (e && e.status === 429) return e.retryAfterMs;
    if (!alive(win)) return 0;
    const msg = String(e && e.message);
    if (msg.includes('NO_AUTH')) sendLoggedOut();
    else win.webContents.send('error', msg);
  }
  return 0;
}

function startPolling() {
  stopPolling();
  const gen = pollGen;
  const tick = async () => {
    const backoff = await refreshNow();
    // fermato (o riavviato) mentre la richiesta era in corso
    if (gen !== pollGen || !alive(win) || !win.isVisible()) return;
    pollTimer = setTimeout(tick, Math.max(POLL_MS, backoff));
  };
  pollTimer = setTimeout(tick, 0);
}

function stopPolling() {
  pollGen++;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

// URL di autorizzazione pronto: lo copia negli appunti e lo segnala alla card,
// così l'utente può completare l'accesso in un altro browser.
function onAuthUrl(url) {
  lastAuthUrl = url;
  try {
    clipboard.writeText(url);
  } catch (e) {
    /* clipboard non disponibile */
  }
  if (alive(win)) win.webContents.send('auth-url', url);
}

async function login() {
  await auth.startAuthFlow(onAuthUrl);
  refreshNow();
}

function trayMenu() {
  const items = [
    { label: 'Mostra / Nascondi', click: toggleWindow },
    { label: 'Impostazioni…', click: openSettings },
    { type: 'separator' },
  ];

  // Voce che compare solo quando un aggiornamento è stato scaricato
  if (updateReadyVersion) {
    items.push({
      label: `⬆ Riavvia e aggiorna (v${updateReadyVersion})`,
      click: () => autoUpdater.quitAndInstall(),
    });
  } else {
    items.push({
      label: 'Controlla aggiornamenti',
      enabled: app.isPackaged,
      click: () => autoUpdater.checkForUpdates().catch((e) => console.error(e)),
    });
  }
  items.push({ type: 'separator' });

  items.push({
    label: 'Accedi / Ri-autentica',
    click: async () => {
      // Il vecchio token resta valido finché il nuovo login non va a buon fine
      try {
        await login();
      } catch (e) {
        console.error(e);
      }
    },
  });
  items.push({ type: 'separator' });
  // app.quit() (non app.exit) emette gli eventi di chiusura: serve, tra l'altro,
  // a electron-updater per installare un aggiornamento già scaricato.
  items.push({ label: 'Esci', click: () => app.quit() });

  return Menu.buildFromTemplate(items);
}

function refreshTrayMenu() {
  if (alive(tray)) tray.setContextMenu(trayMenu());
}

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')));
  tray.setToolTip('Widget Spotify');
  refreshTrayMenu();
  tray.on('click', toggleWindow);
}

// Aggiornamento automatico dalle release GitHub (solo app installata, non in dev).
function setupAutoUpdate() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    updateReadyVersion = info.version;
    refreshTrayMenu();
    tray.setToolTip(`Widget Spotify — aggiornamento v${info.version} pronto`);
    if (Notification.isSupported()) {
      const n = new Notification({
        title: 'Aggiornamento pronto',
        body: `Widget Spotify v${info.version} è pronto. Riavvia per installarlo.`,
      });
      n.on('click', () => autoUpdater.quitAndInstall());
      n.show();
    }
  });

  autoUpdater.on('error', (e) => console.error('auto-update:', e && e.message));

  autoUpdater.checkForUpdates().catch(() => {});
  // ricontrolla ogni 6 ore
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

ipcMain.handle('control', async (_e, action, payload = {}) => {
  try {
    switch (action) {
      case 'login':
        await login();
        break;
      case 'copyAuthLink':
        if (lastAuthUrl) {
          clipboard.writeText(lastAuthUrl);
          return { ok: true };
        }
        return { ok: false, error: 'nessun link disponibile' };
      case 'playPause':
        if (payload.isPlaying) await spotify.pause();
        else await spotify.play();
        break;
      case 'next':
        await spotify.next();
        break;
      case 'previous':
        await spotify.previous();
        break;
      case 'seek':
        await spotify.seek(payload.positionMs);
        break;
      case 'volume':
        await spotify.setVolume(payload.percent);
        break;
      case 'shuffle':
        await spotify.setShuffle(payload.state);
        break;
      case 'repeat':
        await spotify.setRepeat(payload.state);
        break;
      case 'devices':
        return { ok: true, data: await spotify.getDevices() };
      case 'transfer':
        await spotify.transfer(payload.deviceId, payload.play !== false);
        break;
      default:
        return { ok: false, error: 'azione sconosciuta' };
    }
    // aggiorna in fretta la card dopo un comando
    setTimeout(refreshNow, 300);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message) };
  }
});

// --- Client ID inserito in-app ---
ipcMain.handle('set-client-id', (_e, clientId) => {
  const cfg = auth.saveClientId(clientId);
  refreshNow();
  return { ok: true, hasClientId: !!cfg.clientId };
});

// --- Impostazioni ---
ipcMain.handle('get-settings', () => ({
  ...settings.load(),
  autostart: app.getLoginItemSettings().openAtLogin,
}));
ipcMain.handle('save-settings', (_e, patch = {}) => {
  const p = { ...patch };
  if (Object.prototype.hasOwnProperty.call(p, 'autostart')) {
    app.setLoginItemSettings({ openAtLogin: !!p.autostart });
    delete p.autostart;
  }
  const s = settings.save(p);
  applySettings(s);
  return { ...s, autostart: app.getLoginItemSettings().openAtLogin };
});
ipcMain.handle('close-settings', () => {
  if (alive(settingsWin)) settingsWin.close();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.exit(0);
} else {
  app.on('second-instance', () => toggleWindow());

  app.whenReady().then(async () => {
    createWindow();
    buildTray();
    setupAutoUpdate();
    if (auth.hasStoredAuth()) {
      try {
        await auth.refreshAccessToken();
      } catch (e) {
        /* mostrerà la schermata di login */
      }
    }
  });

  // App da tray: non uscire quando la finestra viene nascosta.
  app.on('window-all-closed', () => {});
}
