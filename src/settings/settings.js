const $ = (id) => document.getElementById(id);
const all = (sel) => document.querySelectorAll(sel);

let s = {};

function apply(patch) {
  s = { ...s, ...patch };
  window.settingsApi.save(patch);
  render();
}

function render() {
  // stile e opzioni dello stile scelto
  all('.tile').forEach((t) => t.classList.toggle('on', t.dataset.style === s.style));
  all('.sub').forEach((box) => box.classList.toggle('hidden', box.dataset.for !== s.style));
  all('[data-glow]').forEach((b) => b.classList.toggle('on', b.dataset.glow === s.glassGlow));
  all('[data-palette]').forEach((b) =>
    b.classList.toggle('on', b.dataset.palette === s.auroraPalette),
  );
  // scelte a segmenti
  all('#theme button').forEach((b) => b.classList.toggle('on', b.dataset.value === s.theme));
  all('#size button').forEach((b) => b.classList.toggle('on', b.dataset.value === s.size));
  // angolo
  all('.corner').forEach((btn) => btn.classList.toggle('on', btn.dataset.corner === s.corner));
  // interruttori
  $('animations').checked = s.animations !== false;
  $('fade').checked = !!s.fade;
  $('autostart').checked = !!s.autostart;
  // cursore (0.5–1.0 -> 50–100)
  const pct = Math.round((s.opacity || 1) * 100);
  $('opacity').value = pct;
  $('opacityVal').textContent = pct + '%';
}

async function init() {
  s = await window.settingsApi.get();
  render();
}

all('.tile').forEach((t) => (t.onclick = () => apply({ style: t.dataset.style })));
all('[data-glow]').forEach((b) => (b.onclick = () => apply({ glassGlow: b.dataset.glow })));
all('[data-palette]').forEach(
  (b) => (b.onclick = () => apply({ auroraPalette: b.dataset.palette })),
);
all('#theme button').forEach((b) => (b.onclick = () => apply({ theme: b.dataset.value })));
all('#size button').forEach((b) => (b.onclick = () => apply({ size: b.dataset.value })));
all('.corner').forEach((btn) => (btn.onclick = () => apply({ corner: btn.dataset.corner })));

$('animations').onchange = (e) => apply({ animations: e.target.checked });
$('fade').onchange = (e) => apply({ fade: e.target.checked });
$('autostart').onchange = (e) => apply({ autostart: e.target.checked });

$('opacity').oninput = (e) => {
  const pct = Number(e.target.value);
  $('opacityVal').textContent = pct + '%';
  s.opacity = pct / 100;
  window.settingsApi.save({ opacity: pct / 100 });
};

$('close').onclick = () => window.settingsApi.close();

init();
