// Genera docs/social-preview.png (1280x640) per la "social preview" di GitHub.
// Renderizza una card HTML in una finestra Electron nascosta e la cattura.
// Uso: electron scripts/make-social.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const W = 1280, H = 640;

function dataUri(file) {
  const b = fs.readFileSync(file);
  return 'data:image/png;base64,' + b.toString('base64');
}

app.whenReady().then(async () => {
  const shot = dataUri(path.join(__dirname, '..', 'docs', 'screenshots', 'widget.png'));

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:${W}px; height:${H}px; overflow:hidden;
      font-family:"Segoe UI",system-ui,sans-serif; }
    .bg { position:absolute; inset:0;
      background:
        radial-gradient(900px 520px at 14% 8%, rgba(29,185,84,.28), transparent 60%),
        radial-gradient(700px 700px at 100% 100%, rgba(29,185,84,.12), transparent 55%),
        linear-gradient(150deg, #12141a 0%, #0a0b0f 100%);
    }
    .wrap { position:relative; height:100%; display:flex; align-items:center;
      gap:56px; padding:0 72px; }
    .left { flex:1 1 auto; color:#fff; }
    .pill { display:inline-block; font-size:20px; font-weight:600; color:#1db954;
      border:1px solid rgba(29,185,84,.45); background:rgba(29,185,84,.08);
      padding:7px 16px; border-radius:999px; letter-spacing:.02em; }
    h1 { font-size:82px; font-weight:800; letter-spacing:-2px; margin:22px 0 10px; line-height:1; }
    .tag { font-size:30px; color:#aab0b8; line-height:1.35; max-width:600px; }
    ul { list-style:none; margin:34px 0 30px; }
    li { font-size:25px; color:#e6e8ea; margin:14px 0; display:flex; align-items:center; gap:14px; }
    .chk { color:#1db954; font-weight:900; font-size:26px; }
    .repo { font-size:24px; color:#1db954; font-weight:600; }
    .right { flex:0 0 auto; }
    .shot { width:500px; border-radius:16px;
      box-shadow:0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.06);
      transform:rotate(-2.5deg); }
  </style></head><body>
    <div class="bg"></div>
    <div class="wrap">
      <div class="left">
        <span class="pill">🎵 Windows · Electron · Spotify Web API</span>
        <h1>Widget Spotify</h1>
        <div class="tag">Your Spotify remote, one click away in the Windows system tray.</div>
        <ul>
          <li><span class="chk">✓</span> Now playing, controls &amp; seek</li>
          <li><span class="chk">✓</span> Switch device — Echo / PC / phone</li>
          <li><span class="chk">✓</span> Album-art background &amp; auto-update</li>
        </ul>
        <div class="repo">github.com/giosci1994/widget-spotify</div>
      </div>
      <div class="right"><img class="shot" src="${shot}" /></div>
    </div>
  </body></html>`;

  const tmp = path.join(os.tmpdir(), 'wspot-social.html');
  fs.writeFileSync(tmp, html);

  const win = new BrowserWindow({
    width: W, height: H, show: false, useContentSize: true,
    webPreferences: { offscreen: false },
  });
  await win.loadFile(tmp);
  win.webContents.setZoomFactor(1);
  await new Promise((r) => setTimeout(r, 500));

  let img = await win.webContents.capturePage();
  const size = img.getSize();
  if (size.width !== W || size.height !== H) img = img.resize({ width: W, height: H });

  const out = path.join(__dirname, '..', 'docs', 'social-preview.png');
  fs.writeFileSync(out, img.toPNG());
  console.log('Creato docs/social-preview.png', img.getSize());
  app.quit();
});
