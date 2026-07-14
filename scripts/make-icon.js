// Genera le icone senza dipendenze esterne:
//   assets/tray.png  (32px)   -> icona nella tray
//   assets/icon.png  (256px)  -> icona app
//   assets/icon.ico  (256px)  -> icona per installer/exe (Windows)
// Disegno: cerchio verde "Spotify-like" con triangolo play bianco.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function inTriangle(px, py, A, B, C) {
  const sign = (p1, p2, p3) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = sign([px, py], A, B);
  const d2 = sign([px, py], B, C);
  const d3 = sign([px, py], C, A);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// Ritorna il buffer PNG (RGBA) di dimensione N
function makePng(N) {
  const cx = N / 2, cy = N / 2, r = N / 2 - 0.5;
  const A = [N * 0.40, N * 0.30], B = [N * 0.40, N * 0.70], C = [N * 0.70, N * 0.50];

  const raw = Buffer.alloc(N * (N * 4 + 1));
  let o = 0;
  for (let y = 0; y < N; y++) {
    raw[o++] = 0; // filtro "none"
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a;
      if (d <= r - 0.5) a = 255;
      else if (d >= r + 0.5) a = 0;
      else a = Math.round(255 * (r + 0.5 - d));

      let R = 29, G = 185, Bc = 84; // verde Spotify
      if (a > 0 && inTriangle(x + 0.5, y + 0.5, A, B, C)) {
        R = 255; G = 255; Bc = 255; // triangolo play bianco
      }
      raw[o++] = R;
      raw[o++] = G;
      raw[o++] = Bc;
      raw[o++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0);
  ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Impacchetta un PNG in un file .ico (entry singola, PNG-compressed)
function pngToIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(1, 4); // numero di immagini

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // 0 significa 256
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;  // color palette
  entry[3] = 0;  // reserved
  entry.writeUInt16LE(1, 4);   // color planes
  entry.writeUInt16LE(32, 6);  // bit per pixel
  entry.writeUInt32LE(png.length, 8);  // dimensione dati
  entry.writeUInt32LE(6 + 16, 12);     // offset dati

  return Buffer.concat([header, entry, png]);
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'tray.png'), makePng(32));

const big = makePng(256);
fs.writeFileSync(path.join(outDir, 'icon.png'), big);
fs.writeFileSync(path.join(outDir, 'icon.ico'), pngToIco(big, 256));

console.log('Create: assets/tray.png, assets/icon.png, assets/icon.ico');
