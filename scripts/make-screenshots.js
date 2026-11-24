// Genera le immagini del widget con un brano finto, senza account Spotify:
// docs/screenshots/widget.png, settings.png, compact.png e styles/<stile>.png.
// Apre la card e le impostazioni vere (src/renderer, src/settings, con i loro preload)
// e manda i dati con gli stessi messaggi IPC del processo principale.
//
// Uso:  npm run make-screenshots
//       npm run make-screenshots -- --out <cartella> --extra   (anche le schermate di controllo)
//       npm run make-screenshots -- --gif-frames <cartella>    (i fotogrammi di docs/demo.gif;
//         la GIF si monta con ffmpeg: il comando, con la velocità giusta, è stampato alla fine)
// Le immagini escono al doppio dei pixel (--force-device-scale-factor=2 nello script npm).
// Su Linux senza schermo si aggiunge uno schermo finto:
//   npx electron --ozone-platform=headless --ozone-override-screen-size=4000,4000 \
//     --force-device-scale-factor=2 scripts/make-screenshots.js
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const args = process.argv.slice(2);
const argOut = args.indexOf('--out');
const OUT =
  argOut >= 0 ? path.resolve(args[argOut + 1]) : path.join(SRC, '..', 'docs', 'screenshots');
const EXTRA = args.includes('--extra');
const argGif = args.indexOf('--gif-frames');
const GIF_DIR = argGif >= 0 ? path.resolve(args[argGif + 1]) : null;

// Disegno via software: uguale su ogni macchina, anche senza scheda grafica
app.disableHardwareAcceleration();
// tra una schermata e l'altra non resta nessuna finestra aperta: non uscire
app.on('window-all-closed', () => {});

// Misure come in main.js
const CARD_WIDTH = 372;
const CARD_HEIGHT = 252;
const COMPACT_HEIGHT = 84;
const GLOW_PAD = 24;

/* ---------- Copertine finte (disegnate qui, nessuna immagine protetta) ---------- */
function svgUri(svg) {
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
function stripes(color) {
  let out = '';
  for (let y = 4; y < 58; y += 8) out += `<rect y="${y}" width="100" height="1" fill="${color}"/>`;
  return out;
}
const COVER_SUNSET =
  svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="640" height="640">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#ef7d3c"/><stop offset="0.52" stop-color="#c2416b"/><stop offset="1" stop-color="#6c2c63"/>
  </linearGradient></defs>
  <rect width="100" height="100" fill="url(#g)"/>${stripes('rgba(255,255,255,.10)')}
  <circle cx="32" cy="36" r="17" fill="#f6c453"/>
  <rect y="58" width="100" height="42" fill="#1f6f78"/>
  <rect x="10" y="66" width="34" height="1.6" rx=".8" fill="#f6c453" opacity=".55"/>
  <rect x="18" y="72" width="22" height="1.6" rx=".8" fill="#f6c453" opacity=".35"/>
</svg>`);
const COVER_NIGHT =
  svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="640" height="640">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#14204f"/><stop offset="0.6" stop-color="#2f6fd0"/><stop offset="1" stop-color="#5fd3c4"/>
  </linearGradient></defs>
  <rect width="100" height="100" fill="url(#g)"/>
  <circle cx="70" cy="28" r="11" fill="#e9f1ff"/>
  <circle cx="20" cy="15" r=".8" fill="#fff"/><circle cx="40" cy="22" r=".6" fill="#fff"/><circle cx="12" cy="34" r=".7" fill="#fff"/>
  <polygon points="0,78 22,52 40,70 58,44 80,66 100,50 100,100 0,100" fill="#0e1636"/>
  <polygon points="0,90 30,74 55,88 80,76 100,86 100,100 0,100" fill="#1c8c7a"/>
</svg>`);

const TRACK_A = {
  active: true,
  isPlaying: true,
  trackId: 'demo-1',
  title: 'Luci sul porto',
  artists: 'Gli Inventati',
  album: "Mare d'inverno · 2026",
  image: COVER_SUNSET,
  durationMs: 233000,
  progressMs: 102000,
  shuffle: true,
  repeat: 'off',
  device: { id: 'demo', name: 'PC fisso', type: 'Computer', volume: 64 },
};
const TRACK_B = {
  ...TRACK_A,
  trackId: 'demo-2',
  title: 'Cielo di vetro',
  artists: 'Orchestra Immaginaria',
  album: 'Prove generali · 2025',
  image: COVER_NIGHT,
  durationMs: 198000,
  progressMs: 31000,
  shuffle: false,
  repeat: 'context',
};

const BASE = {
  corner: 'bottom-right',
  fade: true,
  opacity: 1,
  style: 'ambient',
  glassGlow: 'soft',
  auroraPalette: 'night',
  theme: 'dark',
  size: 'normal',
  animations: true,
};

// Le schermate: file (relativo a OUT), impostazioni, schermata, didascalia per il foglio
const SCENES = [
  { file: 'widget.png', s: {} },
  { file: 'compact.png', s: { size: 'compact' } },
  { file: 'styles/glass.png', s: { style: 'glass' }, cap: 'Vetro · alone leggero' },
  {
    file: 'styles/glass-full.png',
    s: { style: 'glass', glassGlow: 'full' },
    cap: 'Vetro · alone pieno',
  },
  { file: 'styles/aurora.png', s: { style: 'aurora' }, cap: 'Aurora · Notte' },
  {
    file: 'styles/aurora-sunset.png',
    s: { style: 'aurora', auroraPalette: 'sunset' },
    cap: 'Aurora · Tramonto',
  },
  {
    file: 'styles/aurora-forest.png',
    s: { style: 'aurora', auroraPalette: 'forest' },
    cap: 'Aurora · Foresta',
  },
  { file: 'styles/classic.png', s: { style: 'classic' }, cap: 'Classico' },
  { file: 'styles/ambient.png', s: { style: 'ambient' }, cap: 'Ambiente · scuro' },
  {
    file: 'styles/ambient-light.png',
    s: { style: 'ambient', theme: 'light' },
    cap: 'Ambiente · chiaro',
  },
  { file: 'styles/poster.png', s: { style: 'poster' }, cap: 'Poster' },
  { file: 'styles/vinyl.png', s: { style: 'vinyl' }, cap: 'Vinile' },
];
const EXTRA_SCENES = [
  { file: 'ambient-other-cover.png', s: {}, track: TRACK_B, cap: 'Ambiente · altra copertina' },
  { file: 'ambient-hover.png', s: {}, hover: true, cap: 'Ambiente · mouse sulla barra' },
  { file: 'compact-light.png', s: { size: 'compact', theme: 'light' }, cap: 'Compatto · chiaro' },
  { file: 'compact-glass.png', s: { size: 'compact', style: 'glass' }, cap: 'Compatto · Vetro' },
  { file: 'compact-poster.png', s: { size: 'compact', style: 'poster' }, cap: 'Compatto · Poster' },
  { file: 'glass-light.png', s: { style: 'glass', theme: 'light' }, cap: 'Vetro · chiaro' },
  { file: 'aurora-light.png', s: { style: 'aurora', theme: 'light' }, cap: 'Aurora · chiaro' },
  { file: 'classic-light.png', s: { style: 'classic', theme: 'light' }, cap: 'Classico · chiaro' },
  { file: 'idle.png', s: {}, view: 'idle', cap: 'Nessuna riproduzione' },
  { file: 'login.png', s: {}, view: 'login', cap: 'Accesso (Client ID)' },
  {
    file: 'idle-compact.png',
    s: { size: 'compact' },
    view: 'idle',
    cap: 'Compatto senza musica: card intera',
  },
];

/* ---------- IPC finti: nessuna chiamata a Spotify ---------- */
let settingsState = { ...BASE, autostart: true };
ipcMain.handle('control', () => ({ ok: true, data: { devices: [] } }));
ipcMain.handle('set-client-id', () => ({ ok: true, hasClientId: true }));
ipcMain.handle('get-settings', () => settingsState);
ipcMain.handle('save-settings', (_e, patch) => (settingsState = { ...settingsState, ...patch }));
ipcMain.handle('close-settings', () => {});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function save(file, image) {
  const out = path.join(OUT, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, image.toPNG());
  console.log('creato', path.relative(process.cwd(), out), image.getSize());
  return out;
}

async function openCard(s, view) {
  const compact = s.size === 'compact' && view === 'player';
  const pad = s.style === 'glass' ? GLOW_PAD : 0;
  const win = new BrowserWindow({
    width: CARD_WIDTH + 2 * pad,
    height: (compact ? COMPACT_HEIGHT : CARD_HEIGHT) + 2 * pad,
    show: true, // nascosta, le animazioni non vanno avanti e la foto le coglie a metà
    frame: false,
    transparent: true,
    resizable: false,
    useContentSize: true,
    webPreferences: { preload: path.join(SRC, 'preload.js'), contextIsolation: true },
  });
  await win.loadFile(path.join(SRC, 'renderer', 'index.html'));
  return win;
}

function send(win, s, view, track) {
  win.webContents.send('settings', { ...s, resolvedTheme: s.theme === 'light' ? 'light' : 'dark' });
  if (view === 'login') {
    win.webContents.send('auth-state', { authed: false, config: { hasClientId: false } });
  } else if (view === 'idle') {
    win.webContents.send('playback', { active: false });
  } else {
    win.webContents.send('playback', { ...track, timestamp: Date.now() });
  }
}

async function hoverSeek(win) {
  const r = await win.webContents.executeJavaScript(
    'JSON.stringify(document.getElementById("bar").getBoundingClientRect())',
  );
  const b = JSON.parse(r);
  const x = Math.round(b.left + b.width * 0.44);
  const y = Math.round(b.top + b.height / 2);
  win.webContents.sendInputEvent({ type: 'mouseEnter', x, y });
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
}

async function shootCard(scene) {
  const s = { ...BASE, ...scene.s };
  const view = scene.view || 'player';
  const win = await openCard(s, view);
  send(win, s, view, scene.track || TRACK_A);
  await wait(900); // dissolvenza del cambio brano e colori della copertina
  if (scene.hover) {
    await hoverSeek(win);
    await wait(400);
  }
  const out = save(scene.file, await win.webContents.capturePage());
  win.destroy();
  return out;
}

async function shootSettings(file, overrides) {
  settingsState = { ...BASE, autostart: true, ...overrides };
  const win = new BrowserWindow({
    width: 400,
    height: 640,
    show: true,
    frame: false,
    backgroundColor: '#17171c',
    useContentSize: true,
    webPreferences: { preload: path.join(SRC, 'preload-settings.js'), contextIsolation: true },
  });
  await win.loadFile(path.join(SRC, 'settings', 'index.html'));
  await wait(500);
  // la finestra deve bastare: niente da scorrere
  const overflow = await win.webContents.executeJavaScript(
    '(() => { const m = document.querySelector("main"); return m.scrollHeight - m.clientHeight; })()',
  );
  if (overflow > 0)
    console.warn(`ATTENZIONE: impostazioni più alte della finestra di ${overflow}px`);
  const out = save(file, await win.webContents.capturePage());
  win.destroy();
  return out;
}

// Foglio con tutte le schermate su un finto desktop (solo con --extra)
async function shootSheet(items) {
  const cells = items
    .map(
      (it) =>
        `<figure><img src="data:image/png;base64,${fs.readFileSync(it.path).toString('base64')}"/>` +
        `<figcaption>${it.cap}</figcaption></figure>`,
    )
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { width:1360px; padding:28px; font-family:"Segoe UI",system-ui,sans-serif; color:#e8eaf0;
      background: radial-gradient(circle at 10% 10%, rgba(64,140,255,.45), transparent 30%),
        radial-gradient(circle at 90% 60%, rgba(190,80,255,.35), transparent 35%),
        linear-gradient(135deg, #18202e, #0d1016); }
    h1 { font-size:20px; margin-bottom:18px; }
    .grid { display:flex; flex-wrap:wrap; gap:22px 26px; align-items:flex-end; }
    figure { display:flex; flex-direction:column; align-items:center; gap:8px; }
    img { width:auto; zoom:.5; }
    figcaption { font-size:12.5px; color:#c9ceda; }
  </style></head><body><h1>Widget Spotify 0.3.0 · codice vero, brano finto</h1>
  <div class="grid">${cells}</div></body></html>`;
  const tmp = path.join(app.getPath('temp'), 'wspot-sheet.html');
  fs.writeFileSync(tmp, html);
  const win = new BrowserWindow({ width: 1360, height: 400, show: true, useContentSize: true });
  await win.loadFile(tmp);
  await wait(300);
  const h = await win.webContents.executeJavaScript('document.body.scrollHeight');
  win.setContentSize(1360, Math.ceil(h));
  await wait(400);
  save('sheet.png', await win.webContents.capturePage());
  win.destroy();
  fs.unlinkSync(tmp);
}

// Fotogrammi della GIF: la card cambia brano, va in pausa e passa da uno stile all'altro
async function shootGifFrames() {
  fs.mkdirSync(GIF_DIR, { recursive: true });
  const win = new BrowserWindow({
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    show: true,
    frame: false,
    backgroundColor: '#0b0e10', // il colore del finto desktop della landing
    useContentSize: true,
    webPreferences: { preload: path.join(SRC, 'preload.js'), contextIsolation: true },
  });
  await win.loadFile(path.join(SRC, 'renderer', 'index.html'));
  let n = 0;
  let recorded = 0; // ms registrati, per la velocità vera della GIF
  const record = async (ms) => {
    const end = Date.now() + ms;
    recorded += ms;
    while (Date.now() < end) {
      const t = Date.now();
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(GIF_DIR, String(++n).padStart(4, '0') + '.png'), img.toPNG());
      await wait(Math.max(0, 80 - (Date.now() - t)));
    }
  };
  const settingsOf = (patch) => ({ ...BASE, ...patch, resolvedTheme: 'dark' });
  const play = (track) => win.webContents.send('playback', { ...track, timestamp: Date.now() });
  win.webContents.send('settings', settingsOf({}));
  play(TRACK_A);
  await wait(900);
  await record(1600);
  await hoverSeek(win);
  await record(1000);
  win.webContents.sendInputEvent({ type: 'mouseLeave', x: 0, y: 0 });
  play({ ...TRACK_B, progressMs: 0 }); // "successivo"
  await record(2000);
  play({ ...TRACK_B, progressMs: 2200, isPlaying: false }); // pausa
  await record(1000);
  play({ ...TRACK_B, progressMs: 2200 });
  for (const style of ['aurora', 'classic', 'vinyl', 'ambient']) {
    win.webContents.send('settings', settingsOf({ style }));
    await record(1500);
  }
  win.destroy();
  const fps = Math.round((n / recorded) * 10000) / 10;
  console.log(`${n} fotogrammi in ${GIF_DIR}, ${fps} al secondo. Per la GIF (metà misura):`);
  console.log(
    `ffmpeg -y -framerate ${fps} -i ${GIF_DIR}/%04d.png -vf "scale=iw/2:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=sierra2_4a" docs/demo.gif`,
  );
}

app.whenReady().then(async () => {
  try {
    if (GIF_DIR) {
      await shootGifFrames();
      app.quit();
      return;
    }
    const sheet = [];
    for (const scene of SCENES) {
      const p = await shootCard(scene);
      if (scene.cap) sheet.push({ path: p, cap: scene.cap });
    }
    const settingsPath = await shootSettings('settings.png');
    if (EXTRA) {
      for (const scene of EXTRA_SCENES)
        sheet.push({ path: await shootCard(scene), cap: scene.cap });
      sheet.push({ path: path.join(OUT, 'compact.png'), cap: 'Compatto · scuro' });
      sheet.push({ path: settingsPath, cap: 'Impostazioni (400×640)' });
      sheet.push({
        path: await shootSettings('settings-aurora.png', { style: 'aurora', theme: 'system' }),
        cap: 'Impostazioni · Aurora scelta',
      });
      sheet.push({
        path: await shootSettings('settings-glass.png', { style: 'glass', size: 'compact' }),
        cap: 'Impostazioni · Vetro scelto',
      });
      await shootSheet(sheet);
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
  app.quit();
});
