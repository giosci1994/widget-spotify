const $ = (id) => document.getElementById(id);

const sections = {
  player: $('player'),
  idle: $('idle'),
  login: $('login'),
};

let state = null; // ultimo stato di riproduzione
let baseline = null; // { progressMs, durationMs, isPlaying, at }
let seeking = false;
let toastTimer = null;
let uiSettings = {};
let current = 'player'; // sezione mostrata
let ambient = null; // colori letti dalla copertina (stile Ambiente)
let ambientFor = null; // copertina a cui si riferiscono
let volDragging = false;
let volLockUntil = 0; // ignora gli update in arrivo subito dopo una modifica
let lastVolume = 40; // per il ripristino dopo il muto
let volThrottle = 0;

// Elementi aggiornati a ogni frame: meglio non cercarli ogni volta nel DOM
const fillEl = $('fill');
const knobEl = $('knob');
const curEl = $('cur');
const durEl = $('dur');

function show(name) {
  current = name;
  for (const k in sections) sections[k].classList.toggle('hidden', k !== name);
  applyLayout();
}

function fmt(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function toast(msg, ok) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('ok', !!ok);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3800);
}

async function ctl(action, payload) {
  const r = await window.spotify.control(action, payload);
  if (r && r.ok === false && !String(r.error).includes('AUTH_CANCELLED')) {
    toast(traduciErrore(r.error));
  }
  return r;
}

function traduciErrore(err) {
  if (!err) return 'Errore';
  if (err.includes('429')) return 'Troppe richieste a Spotify, riprova tra poco.';
  if (err.includes('NO_AUTH')) return 'Accedi di nuovo a Spotify.';
  if (err.includes('AUTH_TIMEOUT')) return 'Accesso scaduto: riprova.';
  if (err.includes('PORT_IN_USE')) return 'Porta del login occupata da un altro programma.';
  if (err.includes('403')) return 'Serve Spotify Premium per i comandi.';
  if (err.includes('404') || err.includes('NO_ACTIVE')) return 'Nessun dispositivo attivo.';
  if (err.includes('NO_CLIENT_ID')) return 'Client ID mancante in config.json.';
  return err.length > 80 ? err.slice(0, 80) + '…' : err;
}

/* ---------- Rendering ---------- */

function renderPlayback(s) {
  if (!s || !s.active) {
    state = null;
    baseline = null;
    document.body.classList.remove('playing');
    show('idle');
    return;
  }
  const trackChanged = !state || state.trackId !== s.trackId;
  state = s;
  baseline = {
    progressMs: s.progressMs,
    durationMs: s.durationMs,
    isPlaying: s.isPlaying,
    at: s.timestamp || Date.now(),
  };
  show('player');

  if (trackChanged) {
    $('title').textContent = s.title || '—';
    $('artist').textContent = s.artists || '';
    $('album').textContent = s.album || '';
    if (s.image) $('cover').src = s.image;
    else $('cover').removeAttribute('src');
    paintArtwork();
    swapIn();
  }

  paintPlayIcon(s.isPlaying);
  paintShuffle(s.shuffle);
  paintRepeat(s.repeat);
  document.body.classList.toggle('playing', !!s.isPlaying);

  // dispositivo: dove suona, sopra il titolo
  $('deviceBtn').classList.toggle('active', !!s.device);
  $('whereName').textContent = s.device ? s.device.name : '';
  $('where').classList.toggle('hidden', !s.device);

  // volume
  const vol = s.device ? s.device.volume : null;
  renderVolume(vol);
}

function paintPlayIcon(isPlaying) {
  $('playIcon').classList.toggle('hidden', isPlaying);
  $('pauseIcon').classList.toggle('hidden', !isPlaying);
}

function paintShuffle(on) {
  $('shuffle').classList.toggle('on', on);
}

function paintRepeat(mode) {
  $('repeat').classList.toggle('on', mode !== 'off');
  $('repeatOne').classList.toggle('hidden', mode !== 'track');
}

// Tempo trascorso a sinistra, tempo che manca a destra
function paintProgress(posMs, durationMs) {
  const pct = durationMs ? (posMs / durationMs) * 100 : 0;
  fillEl.style.width = pct + '%';
  knobEl.style.left = pct + '%';
  const cur = fmt(posMs);
  const left = '-' + fmt(durationMs - posMs);
  if (curEl.textContent !== cur) curEl.textContent = cur;
  if (durEl.textContent !== left) durEl.textContent = left;
}

// Posizione stimata: ultima posizione nota + tempo trascorso (se in riproduzione)
function currentPos() {
  if (!baseline) return 0;
  let pos = baseline.progressMs;
  if (baseline.isPlaying) pos += Date.now() - baseline.at;
  return Math.min(pos, baseline.durationMs);
}

// Rapporto 0–1 della posizione del mouse lungo un elemento orizzontale
function ratioFromEvent(e, el) {
  const rect = el.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
}

// Interpolazione locale della barra tra un poll e l'altro
function animate() {
  if (state && baseline && !seeking) paintProgress(currentPos(), baseline.durationMs);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

/* ---------- Comandi ---------- */

$('playPause').onclick = () => {
  if (!state) return;
  const wasPlaying = state.isPlaying;
  state.isPlaying = !wasPlaying;
  baseline.isPlaying = !wasPlaying;
  baseline.progressMs = currentPos();
  baseline.at = Date.now();
  paintPlayIcon(state.isPlaying);
  ctl('playPause', { isPlaying: wasPlaying });
};

$('next').onclick = () => ctl('next');
$('prev').onclick = () => ctl('previous');

$('shuffle').onclick = () => {
  if (!state) return;
  state.shuffle = !state.shuffle;
  paintShuffle(state.shuffle);
  ctl('shuffle', { state: state.shuffle });
};

$('repeat').onclick = () => {
  if (!state) return;
  const order = ['off', 'context', 'track'];
  const nextRep = order[(order.indexOf(state.repeat) + 1) % 3];
  state.repeat = nextRep;
  paintRepeat(nextRep);
  ctl('repeat', { state: nextRep });
};

// Seek cliccando sulla barra
const bar = $('bar');
function seekFromEvent(e) {
  if (!state) return;
  const posMs = ratioFromEvent(e, bar) * state.durationMs;
  paintProgress(posMs, state.durationMs);
  return posMs;
}
bar.addEventListener('mousedown', (e) => {
  seeking = true;
  seekFromEvent(e);
});
window.addEventListener('mousemove', (e) => {
  if (seeking) seekFromEvent(e);
});
window.addEventListener('mouseup', (e) => {
  if (!seeking) return;
  seeking = false;
  const posMs = seekFromEvent(e);
  if (posMs != null && baseline) {
    baseline.progressMs = posMs;
    baseline.at = Date.now();
    ctl('seek', { positionMs: posMs });
  }
});

/* ---------- Volume ---------- */

const volume = $('volume');
const volBar = $('volBar');

function setVolIcon(v) {
  $('volHigh').classList.toggle('hidden', !(v > 50));
  $('volLow').classList.toggle('hidden', !(v > 0 && v <= 50));
  $('volMute').classList.toggle('hidden', v > 0);
}

function paintVolume(v) {
  $('volFill').style.width = v + '%';
  $('volKnob').style.left = v + '%';
  $('volVal').textContent = v + '%';
  setVolIcon(v);
}

// Chiamata dai poll: aggiorna solo se non stai trascinando e non è nel "lock"
function renderVolume(v) {
  const available = typeof v === 'number';
  volume.classList.toggle('disabled', !available);
  if (!available) {
    $('volVal').textContent = '—';
    return;
  }
  if (volDragging || Date.now() < volLockUntil) return;
  if (v > 0) lastVolume = v;
  paintVolume(v);
}

function volFromEvent(e) {
  return Math.round(ratioFromEvent(e, volBar) * 100);
}

function sendVolume(v) {
  volLockUntil = Date.now() + 1500;
  ctl('volume', { percent: v });
}

volBar.addEventListener('mousedown', (e) => {
  if (volume.classList.contains('disabled')) return;
  volDragging = true;
  const v = volFromEvent(e);
  paintVolume(v);
});
window.addEventListener('mousemove', (e) => {
  if (!volDragging) return;
  const v = volFromEvent(e);
  paintVolume(v);
  const now = Date.now();
  if (now - volThrottle > 220) {
    volThrottle = now;
    ctl('volume', { percent: v });
  }
});
window.addEventListener('mouseup', (e) => {
  if (!volDragging) return;
  volDragging = false;
  const v = volFromEvent(e);
  paintVolume(v);
  if (v > 0) lastVolume = v;
  sendVolume(v);
});

// Muto / riattiva
$('volBtn').onclick = () => {
  if (volume.classList.contains('disabled')) return;
  const cur = parseInt($('volVal').textContent, 10) || 0;
  const target = cur > 0 ? 0 : lastVolume > 0 ? lastVolume : 40;
  if (cur > 0) lastVolume = cur;
  paintVolume(target);
  sendVolume(target);
};

/* ---------- Dispositivi ---------- */

const pop = $('devicePop');
async function openDevices() {
  const r = await ctl('devices');
  const list = $('deviceList');
  const devices = (r && r.data && r.data.devices) || [];
  list.replaceChildren();
  if (!devices.length) {
    list.append(el('div', 'device-item', 'Nessun dispositivo trovato'));
  }
  for (const d of devices) {
    const item = el('div', 'device-item' + (d.is_active ? ' current' : ''));
    item.append(el('span', 'dname', d.name), el('span', 'dtype', d.type));
    item.onclick = async () => {
      pop.classList.add('hidden');
      await ctl('transfer', { deviceId: d.id, play: true });
    };
    list.append(item);
  }
  pop.classList.remove('hidden');
}
// Crea un elemento con testo semplice (niente innerHTML con dati esterni)
function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
$('deviceBtn').onclick = (e) => {
  e.stopPropagation();
  if (pop.classList.contains('hidden')) openDevices();
  else pop.classList.add('hidden');
};
$('idleDevice').onclick = openDevices;
document.addEventListener('click', (e) => {
  if (!pop.contains(e.target) && e.target !== $('deviceBtn')) pop.classList.add('hidden');
});

/* ---------- Login ---------- */

function revealCopyLink() {
  $('copyLinkBtn').classList.remove('hidden');
  $('copyHint').classList.remove('hidden');
}

$('loginBtn').onclick = () => {
  ctl('login');
  revealCopyLink();
};

$('copyLinkBtn').onclick = async () => {
  const r = await window.spotify.control('copyAuthLink');
  if (r && r.ok) toast('Link copiato! Incollalo nel browser dove sei loggato a Spotify.', true);
  else toast('Premi prima "Accedi con Spotify".');
};

async function saveClientId() {
  const v = $('clientIdInput').value.trim();
  if (!v) {
    toast('Incolla prima il Client ID.');
    return;
  }
  const r = await window.spotify.setClientId(v);
  if (r && r.ok && r.hasClientId) toast('Client ID salvato!', true);
  else toast('Client ID non valido.');
}
$('saveClientIdBtn').onclick = saveClientId;
$('clientIdInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveClientId();
});

/* ---------- Aspetto: stile, tema, formato, animazioni ---------- */

// Classi sul <body> lette da style.css (vedi l'intestazione del file)
function applyLayout() {
  const st = uiSettings;
  const body = document.body;
  const keep = ['playing'].filter((c) => body.classList.contains(c));
  body.className = [
    ...keep,
    's-' + (st.style || 'ambient'),
    't-' + (st.resolvedTheme || 'dark'),
    'pal-' + (st.auroraPalette || 'night'),
    'glow-' + (st.glassGlow || 'soft'),
    st.animations === false ? '' : 'anim',
    // la compatta vale solo per il player: accesso e "nessuna riproduzione" restano interi
    st.size === 'compact' && current === 'player' ? 'compact' : '',
  ]
    .filter(Boolean)
    .join(' ');
  paintAmbient();
}

// Cambio brano: copertina e testi entrano con una dissolvenza breve
function swapIn() {
  for (const node of [$('meta'), document.querySelector('.art-wrap')]) {
    node.classList.remove('swap');
    void node.offsetWidth; // riavvia l'animazione
    node.classList.add('swap');
  }
}

// Copertina come sfondo (Poster) e colori della copertina (Ambiente)
function paintArtwork() {
  const art = $('layerArt');
  if (state && state.image) art.style.backgroundImage = `url("${state.image}")`;
  else art.style.removeProperty('background-image');
  const src = state && (state.imageSmall || state.image);
  if (!src) {
    ambient = null;
    ambientFor = null;
    paintAmbient();
    return;
  }
  if (src === ambientFor) return;
  ambientFor = src;
  readColors(src).then((colors) => {
    if (ambientFor !== src) return; // nel frattempo è cambiato brano
    ambient = colors;
    paintAmbient();
  });
}

// Legge i colori principali di un'immagine rimpicciolita a 24x24.
// Se la copertina non si può leggere (CORS) restano i colori di partenza dello stile.
function readColors(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const N = 24;
        const canvas = document.createElement('canvas');
        canvas.width = N;
        canvas.height = N;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, N, N);
        const px = ctx.getImageData(0, 0, N, N).data;
        const avg = (x0, y0, x1, y1) => {
          let r = 0;
          let g = 0;
          let b = 0;
          let n = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const i = (y * N + x) * 4;
              r += px[i];
              g += px[i + 1];
              b += px[i + 2];
              n++;
            }
          }
          return [r / n, g / n, b / n];
        };
        // il colore più vivo diventa l'accento
        let vivid = null;
        let best = -1;
        for (let i = 0; i < px.length; i += 4) {
          const [h, sat, l] = toHsl([px[i], px[i + 1], px[i + 2]]);
          const score = sat * (1 - Math.abs(l - 0.55) * 1.6);
          if (score > best) {
            best = score;
            vivid = [h, sat, l];
          }
        }
        const half = N / 2;
        resolve({
          all: toHsl(avg(0, 0, N, N)),
          c1: toHsl(avg(0, 0, half, half)), // in alto a sinistra
          c2: toHsl(avg(half, half, N, N)), // in basso a destra
          c3: toHsl(avg(half, 0, N, half)), // in alto a destra
          vivid,
        });
      } catch (e) {
        resolve(null);
      }
    };
    img.src = src;
  });
}

function toHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, sat, l];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hsl = ([h, sat, l], a = 1) =>
  `hsla(${Math.round(h)}, ${Math.round(sat * 100)}%, ${Math.round(l * 100)}%, ${a})`;

// Variabili --amb-* della card: sfondo scuro o chiaro dalla copertina, accento leggibile
function paintAmbient() {
  const card = $('card');
  const names = ['base', 'c1', 'c2', 'c3', 'accent', 'on-accent', 'pop'];
  if (!ambient) {
    for (const n of names) card.style.removeProperty('--amb-' + n);
    return;
  }
  const light = uiSettings.resolvedTheme === 'light';
  const [h, sat] = ambient.all;
  const [vh, vs] = ambient.vivid;
  const tone = ([ch, cs, cl], lo, hi, smax) => [ch, Math.min(cs, smax), clamp(cl, lo, hi)];
  // copertina quasi grigia: accento neutro invece di un colore inventato
  const grey = vs < 0.12;
  let vars;
  if (light) {
    vars = {
      base: hsl([h, Math.min(sat, 0.45), 0.95]),
      c1: hsl(tone(ambient.c1, 0.55, 0.75, 0.8), 0.35),
      c2: hsl(tone(ambient.c2, 0.55, 0.75, 0.8), 0.3),
      c3: hsl(tone(ambient.c3, 0.55, 0.75, 0.8), 0.3),
      accent: grey ? '#1d1a1f' : hsl([vh, clamp(vs, 0.45, 0.85), 0.4]),
      'on-accent': '#fff',
      pop: '#fff',
    };
  } else {
    vars = {
      base: hsl([h, Math.min(sat, 0.5), 0.13]),
      c1: hsl(tone(ambient.c1, 0.25, 0.45, 0.85), 0.85),
      c2: hsl(tone(ambient.c2, 0.2, 0.4, 0.85), 0.9),
      c3: hsl(tone(ambient.c3, 0.25, 0.45, 0.85), 0.7),
      accent: grey ? '#f2f2f4' : hsl([vh, clamp(vs, 0.45, 0.9), 0.66]),
      'on-accent': hsl([h, Math.min(sat, 0.5), 0.12]),
      pop: hsl([h, Math.min(sat, 0.4), 0.18], 0.98),
    };
  }
  for (const n of names) card.style.setProperty('--amb-' + n, vars[n]);
}

/* ---------- Eventi dal main ---------- */

window.spotify.onSettings((s) => {
  uiSettings = s || uiSettings;
  applyLayout();
});
window.spotify.onPlayback((data) => renderPlayback(data));
window.spotify.onAuthState((info) => {
  if (!info.authed) {
    show('login');
    const hasCid = !!(info.config && info.config.hasClientId);
    $('needClientId').classList.toggle('hidden', hasCid);
    $('canLogin').classList.toggle('hidden', !hasCid);
  }
});
window.spotify.onAuthUrl(() => revealCopyLink());
window.spotify.onError((msg) => toast(traduciErrore(msg)));
