// Impostazioni persistenti (salvate in %APPDATA%/widget-spotify/settings.json)
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  corner: 'bottom-right', // bottom-right | bottom-left | top-right | top-left
  fade: true, // dissolvenza in apertura/chiusura
  opacity: 1.0, // trasparenza finestra (0.5–1.0)
  albumBackground: false, // usa la copertina come sfondo del widget
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

function load() {
  if (current) return current;
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch (e) {
    /* prima esecuzione o file assente */
  }
  current = { ...DEFAULTS, ...saved };
  current.opacity = clampOpacity(current.opacity);
  return current;
}

function save(patch) {
  current = { ...load(), ...(patch || {}) };
  current.opacity = clampOpacity(current.opacity);
  try {
    fs.writeFileSync(file(), JSON.stringify(current, null, 2));
  } catch (e) {
    /* ignora errori di scrittura */
  }
  return current;
}

module.exports = { DEFAULTS, load, save };
