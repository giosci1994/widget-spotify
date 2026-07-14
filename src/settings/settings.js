const $ = (id) => document.getElementById(id);

let s = {};

function apply(patch) {
  s = { ...s, ...patch };
  window.spotify.saveSettings(patch);
}

function render() {
  // angolo
  document.querySelectorAll('.corner').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.corner === s.corner);
  });
  // switch
  $('fade').checked = !!s.fade;
  $('albumBackground').checked = !!s.albumBackground;
  $('autostart').checked = !!s.autostart;
  // range (0.5–1.0 -> 50–100)
  const pct = Math.round((s.opacity || 1) * 100);
  $('opacity').value = pct;
  $('opacityVal').textContent = pct + '%';
}

async function init() {
  s = await window.spotify.getSettings();
  render();
}

document.querySelectorAll('.corner').forEach((btn) => {
  btn.onclick = () => {
    apply({ corner: btn.dataset.corner });
    render();
  };
});

$('fade').onchange = (e) => apply({ fade: e.target.checked });
$('albumBackground').onchange = (e) => apply({ albumBackground: e.target.checked });
$('autostart').onchange = (e) => apply({ autostart: e.target.checked });

$('opacity').oninput = (e) => {
  const pct = Number(e.target.value);
  $('opacityVal').textContent = pct + '%';
  apply({ opacity: pct / 100 });
};

$('close').onclick = () => window.spotify.closeSettings();

init();
