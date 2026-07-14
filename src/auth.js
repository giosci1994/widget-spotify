// Gestione OAuth (Authorization Code + PKCE) e dei token Spotify.
// Il refresh token viene salvato cifrato con DPAPI di Windows via safeStorage.
const { app, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ');

// Cache dell'access token in memoria
let cache = { accessToken: null, expiresAt: 0 };

// Flusso di login attualmente in corso (per poterlo annullare a un nuovo tentativo)
let activeAuth = null; // { server, reject }

function cancelActiveAuth() {
  if (!activeAuth) return;
  try {
    activeAuth.server.close();
  } catch (e) {
    /* già chiuso */
  }
  try {
    activeAuth.reject(new Error('AUTH_CANCELLED'));
  } catch (e) {
    /* già risolto */
  }
  activeAuth = null;
}

function projectRoot() {
  return path.join(__dirname, '..');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return {};
  }
}

// config.json modificabile dall'utente (usato dall'app installata / campo in-app)
function userConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

// Legge il Client ID da più sorgenti, in ordine di precedenza:
// 1) config.json accanto ai sorgenti (comodo in sviluppo)
// 2) config.json in userData (scritto dal campo in-app o a mano)
// 3) variabile d'ambiente SPOTIFY_CLIENT_ID
function loadConfig() {
  const merged = { clientId: '', port: 8888 };
  Object.assign(merged, readJson(path.join(projectRoot(), 'config.json')));
  Object.assign(merged, readJson(userConfigPath()));
  if (process.env.SPOTIFY_CLIENT_ID) merged.clientId = process.env.SPOTIFY_CLIENT_ID;
  const port = merged.port || 8888;
  return {
    clientId: String(merged.clientId || '').trim(),
    port,
    redirectUri: `http://127.0.0.1:${port}/callback`,
  };
}

// Salva il Client ID nel config.json dell'utente (userData).
function saveClientId(clientId) {
  const file = userConfigPath();
  const cfg = readJson(file);
  cfg.clientId = String(clientId || '').trim();
  if (!cfg.port) cfg.port = loadConfig().port;
  try {
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  } catch (e) {
    /* ignora errori di scrittura */
  }
  return loadConfig();
}

function tokenFilePath() {
  return path.join(app.getPath('userData'), 'spotify-token.bin');
}

function saveRefreshToken(refreshToken) {
  const file = tokenFilePath();
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(file, safeStorage.encryptString(refreshToken));
  } else {
    // Fallback (raro): salva in chiaro con prefisso riconoscibile
    fs.writeFileSync(file, Buffer.from('PLAIN:' + refreshToken, 'utf8'));
  }
}

function getStoredRefreshToken() {
  const file = tokenFilePath();
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 6).toString('utf8') === 'PLAIN:') {
    return buf.subarray(6).toString('utf8');
  }
  try {
    return safeStorage.decryptString(buf);
  } catch (e) {
    return null;
  }
}

function hasStoredAuth() {
  return !!getStoredRefreshToken();
}

function clearAuth() {
  cache = { accessToken: null, expiresAt: 0 };
  try {
    fs.unlinkSync(tokenFilePath());
  } catch (e) {
    /* già assente */
  }
}

function base64url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function tokenRequest(params) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Richiesta token fallita (${res.status}): ${t}`);
  }
  return res.json();
}

function applyTokenResponse(data) {
  cache.accessToken = data.access_token;
  // margine di 60s per non usare un token quasi scaduto
  cache.expiresAt = Date.now() + (data.expires_in - 60) * 1000;
  if (data.refresh_token) saveRefreshToken(data.refresh_token);
}

// Avvia il login: apre il browser di sistema e cattura il redirect in locale.
// onUrl(url) viene chiamato appena l'URL di autorizzazione è pronto, così la UI
// può offrire "copia link" per completare l'accesso in un altro browser del PC.
async function startAuthFlow(onUrl) {
  const cfg = loadConfig();
  if (!cfg.clientId) throw new Error('NO_CLIENT_ID');

  cancelActiveAuth(); // chiude un eventuale tentativo precedente rimasto in ascolto

  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(
    crypto.createHash('sha256').update(verifier).digest()
  );
  const state = base64url(crypto.randomBytes(16));

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', cfg.redirectUri);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, cfg.redirectUri);
      if (u.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }
      const err = u.searchParams.get('error');
      const gotState = u.searchParams.get('state');
      const gotCode = u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (err || gotState !== state || !gotCode) {
        res.end(page('Autorizzazione non riuscita.', 'Puoi chiudere questa scheda e riprovare dal widget.'));
        server.close();
        reject(new Error('AUTH_FAILED: ' + (err || 'state non valido')));
        return;
      }
      res.end(page('Fatto! Widget Spotify autorizzato.', 'Puoi chiudere questa scheda.'));
      server.close();
      resolve(gotCode);
    });
    activeAuth = { server, reject };
    server.on('error', reject);
    server.listen(cfg.port, '127.0.0.1', () => {
      const url = authUrl.toString();
      if (typeof onUrl === 'function') onUrl(url);
      shell.openExternal(url);
    });
  });
  activeAuth = null;

  const data = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    code_verifier: verifier,
  });
  applyTokenResponse(data);
  return cache.accessToken;
}

async function refreshAccessToken() {
  const cfg = loadConfig();
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) throw new Error('NO_AUTH');
  const data = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: cfg.clientId,
  });
  applyTokenResponse(data);
  return cache.accessToken;
}

async function getAccessToken() {
  if (cache.accessToken && Date.now() < cache.expiresAt) return cache.accessToken;
  return refreshAccessToken();
}

function page(title, sub) {
  return `<!doctype html><meta charset="utf-8"><title>Widget Spotify</title>
  <body style="font-family:Segoe UI,system-ui,sans-serif;background:#121212;color:#fff;
  display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
  <div><div style="width:56px;height:56px;border-radius:50%;background:#1db954;margin:0 auto 18px"></div>
  <h2 style="margin:0 0 8px">${title}</h2><p style="color:#b3b3b3;margin:0">${sub}</p></div></body>`;
}

module.exports = {
  loadConfig,
  saveClientId,
  startAuthFlow,
  refreshAccessToken,
  getAccessToken,
  hasStoredAuth,
  clearAuth,
};
