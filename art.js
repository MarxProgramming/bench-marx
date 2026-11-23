const shapes = {
  settings: '<path d="M3 7h8m5 0h5M3 17h3m5 0h10"/><circle cx="13" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>',
  grid:
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  insight: '<path d="M4 19V9m6 10V5m6 14v-7m5 7V3"/>',
  history: '<path d="M3 10a9 9 0 1 1 2 8M3 5v5h5m4-4v6l4 2"/>',
  help:
      '<circle cx="12" cy="12" r="9"/><path d="M9.8 9.4c.1-3.3 6.1-3.6 5.6-.1-.2 1.8-3.2 2-3.2 4.1m0 3h.01"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v5m10-5v5M3 10h18"/>',
  prev: '<path d="m14 6-6 6 6 6"/>',
  next: '<path d="m10 6 6 6-6 6"/>',
  wave: '<path d="M2 13h3l3-8 4 15 4-14 3 7h3"/>',
  weekly: '<path d="M3 18v-4m5 4V8m5 10V4m5 14V9"/>',
  trophy:
      '<path d="M7 3h10v7a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v5m-4 1h8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  heavy: '<path d="m4 14 5 5L20 8M4 8l5 5 9-9"/>',
  edit: '<path d="m4 20 4-.8 12-12-3.3-3.4L4.8 16 4 20ZM15 6l3.1 3.2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  disk: '<path d="M4 4h14l2 3v13H4V4Zm4 0v6h8V4M8 20v-6h8v6"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  target:
      '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>'
};
function icon(k) {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (shapes[k] || shapes.wave) + '</svg>'
}
function waveArt() {
  let ribbons = '';
  for (let i = exercises.length - 1; i >= 0; i--) {
    const off = i * 4.8, x = 19 + off, y = 150 - i * 2.8;
    const line = 'M ' + x + ' ' + y + ' c 34 0 42 -79 77 -78 s 50 76 88 59 s 43 -88 79 -96 s 43 21 66 17';
    const back = ' l 0 11 c -23 3 -30 -21 -66 -13 s -41 82 -79 98 s -53 -57 -88 -63 s -44 71 -77 74 Z';
    ribbons += '<g data-ridge="' + i + '"><path d="' + line + back +
        '" fill="url(#ribbon)" stroke="#292036" stroke-width=".8"/><path class="crest" d="' + line +
        '" fill="none" stroke="url(#edge)" stroke-width="1.65"/></g>'
  }
  return '<svg class="wave" viewBox="0 -24 430 217" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><linearGradient id="ribbon" x1=".08" y1="1" x2=".85" y2="0" gradientUnits="objectBoundingBox"><stop stop-color="#514265"/><stop offset=".28" stop-color="#9b65db"/><stop offset=".51" stop-color="#533970"/><stop offset=".77" stop-color="#ae7df4"/><stop offset="1" stop-color="#593f85"/></linearGradient><linearGradient id="edge"><stop stop-color="#72508d"/><stop offset=".22" stop-color="#d6aafa"/><stop offset=".48" stop-color="#8a5db7"/><stop offset=".75" stop-color="#d7adff"/><stop offset="1" stop-color="#956cbb"/></linearGradient></defs>' +
      ribbons + '</svg>'
}
