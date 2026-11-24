// Impostazioni persistenti (salvate in %APPDATA%/widget-spotify/settings.json)
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  corner: 'bottom-right', // bottom-right | bottom-left | top-right | top-left
  fade: true, // dissolvenza in apertura/chiusura
  opacity: 1.0, // trasparenza finestra (0.5–1.0)
  style: 'ambient', // glass | aurora | classic | ambient | poster | vinyl
  glassGlow: 'soft', // alone del Vetro: soft | full
  auroraPalette: 'night', // colori dell'Aurora: night | sunset | forest
  theme: 'system', // dark | light | system (come Windows)
  size: 'normal', // normal | compact
  animations: true, // cambio brano, pulsanti, sfondo che si muove
};

// Valori ammessi per le chiavi a scelta: un valore sconosciuto torna a quello di partenza
const CHOICES = {
  corner: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
  style: ['glass', 'aurora', 'classic', 'ambient', 'poster', 'vinyl'],
  glassGlow: ['soft', 'full'],
  auroraPalette: ['night', 'sunset', 'forest'],
  theme: ['dark', 'light', 'system'],
  size: ['normal', 'compact'],
};

let current = null;

function file() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function clampOpacity(v) {
  const n = Number(v);
  if (!isFinite(n)) return 1.0;
  return Math.max(0.5, Math.min(1.0, n));
}

// Porta i valori salvati (anche da versioni vecchie) a valori validi. Restano solo le
// chiavi di DEFAULTS: quelle che non si usano più (es. albumBackground) si tolgono senza errori.
function normalize(s) {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) out[key] = key in s ? s[key] : DEFAULTS[key];
  for (const [key, allowed] of Object.entries(CHOICES)) {
    if (!allowed.includes(out[key])) out[key] = DEFAULTS[key];
  }
  out.fade = !!out.fade;
  out.animations = !!out.animations;
  out.opacity = clampOpacity(out.opacity);
  return out;
}

function load() {
  if (current) return current;
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch (e) {
    /* prima esecuzione o file assente */
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  current = normalize(saved);
  return current;
}

function save(patch) {
  current = normalize({ ...load(), ...(patch || {}) });
  try {
    fs.writeFileSync(file(), JSON.stringify(current, null, 2));
  } catch (e) {
    /* ignora errori di scrittura */
  }
  return current;
}

module.exports = { load, save, normalize, DEFAULTS };
