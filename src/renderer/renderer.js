const $ = (id) => document.getElementById(id);

const sections = {
  player: $('player'),
  idle: $('idle'),
  login: $('login'),
};

let state = null;          // ultimo stato di riproduzione
let baseline = null;       // { progressMs, durationMs, isPlaying, at }
let seeking = false;
let toastTimer = null;
let uiSettings = { albumBackground: false };
let volDragging = false;
let volLockUntil = 0;   // ignora gli update in arrivo subito dopo una modifica
let lastVolume = 40;    // per il ripristino dopo il muto
let volThrottle = 0;

// Elementi aggiornati a ogni frame: meglio non cercarli ogni volta nel DOM
const fillEl = $('fill');
const knobEl = $('knob');
const curEl = $('cur');

function show(name) {
  for (const k in sections) sections[k].classList.toggle('hidden', k !== name);
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
    updateBackground();
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
    updateBackground();
  }

  paintPlayIcon(s.isPlaying);
  paintShuffle(s.shuffle);
  paintRepeat(s.repeat);

  // dispositivo
  $('deviceBtn').classList.toggle('active', !!s.device);
  $('dur').textContent = fmt(s.durationMs);

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

function paintProgress(posMs, durationMs) {
  const pct = durationMs ? (posMs / durationMs) * 100 : 0;
  fillEl.style.width = pct + '%';
  knobEl.style.left = pct + '%';
  curEl.textContent = fmt(posMs);
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
  list.innerHTML = '';
  const devices = (r && r.data && r.data.devices) || [];
  if (!devices.length) {
    list.innerHTML = '<div class="device-item">Nessun dispositivo trovato</div>';
  }
  for (const d of devices) {
    const el = document.createElement('div');
    el.className = 'device-item' + (d.is_active ? ' current' : '');
    el.innerHTML = `<span class="dname">${escapeHtml(d.name)}</span><span class="dtype">${d.type}</span>`;
    el.onclick = async () => {
      pop.classList.add('hidden');
      await ctl('transfer', { deviceId: d.id, play: true });
    };
    list.appendChild(el);
  }
  pop.classList.remove('hidden');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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

/* ---------- Impostazioni (sfondo copertina) ---------- */

function updateBackground() {
  const bg = $('bg');
  const scrim = $('scrim');
  const on = !!(uiSettings.albumBackground && state && state.image);
  if (on) {
    bg.style.backgroundImage = `url("${state.image}")`;
    bg.classList.remove('hidden');
    scrim.classList.remove('hidden');
  } else {
    bg.classList.add('hidden');
    scrim.classList.add('hidden');
  }
  $('card').classList.toggle('has-bg', on);
}

/* ---------- Eventi dal main ---------- */

window.spotify.onSettings((s) => {
  uiSettings = s || uiSettings;
  updateBackground();
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
