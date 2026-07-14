// Wrapper minimale sulla Spotify Web API (endpoint /me/player).
const auth = require('./auth');

const API = 'https://api.spotify.com/v1';

async function call(method, endpoint, { query, body } = {}, retry = true) {
  const token = await auth.getAccessToken();
  let url = API + endpoint;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += '?' + qs;
  }
  const opts = { method, headers: { Authorization: 'Bearer ' + token } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);

  // Token invalidato prima della scadenza: forza refresh e riprova una volta
  if (res.status === 401 && retry) {
    await auth.refreshAccessToken();
    return call(method, endpoint, { query, body }, false);
  }
  // Nessun contenuto (es. nessun dispositivo attivo)
  if (res.status === 204) return null;
  // Rate limit: segnala al chiamante
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '1', 10);
    return { __rateLimited: true, retryAfter };
  }
  if (!res.ok) {
    const text = await res.text();
    const e = new Error(`Spotify ${res.status}: ${text}`);
    e.status = res.status;
    throw e;
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return null;
}

module.exports = {
  getPlaybackState: () => call('GET', '/me/player'),
  getDevices: () => call('GET', '/me/player/devices'),
  play: (deviceId) =>
    call('PUT', '/me/player/play', {
      query: deviceId ? { device_id: deviceId } : undefined,
    }),
  pause: () => call('PUT', '/me/player/pause'),
  next: () => call('POST', '/me/player/next'),
  previous: () => call('POST', '/me/player/previous'),
  seek: (positionMs) =>
    call('PUT', '/me/player/seek', { query: { position_ms: Math.round(positionMs) } }),
  setVolume: (percent) =>
    call('PUT', '/me/player/volume', {
      query: { volume_percent: Math.max(0, Math.min(100, Math.round(percent))) },
    }),
  setShuffle: (state) =>
    call('PUT', '/me/player/shuffle', { query: { state: !!state } }),
  setRepeat: (state) =>
    call('PUT', '/me/player/repeat', { query: { state } }), // 'off' | 'context' | 'track'
  transfer: (deviceId, play) =>
    call('PUT', '/me/player', { body: { device_ids: [deviceId], play: !!play } }),
};
