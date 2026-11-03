'use strict';
// Рендер: запечённая карта, сущности, темнота с фонарём (лучи с учётом стен), свет, галлюцинации.
(function () {
  const U = G.U;
  let cv, ctx, dark, dctx, baked = null, bakedFor = null;
  let ts = 40; // пикселей на клетку
  let W = 0, H = 0;
  const flakes = [];

  const LOOKS = {
    adult: { coat: '#4a4038', skin: '#8a9480' },
    nurse: { coat: '#b8c8c4', skin: '#8a9480' },
    cop: { coat: '#2a3450', skin: '#8a9480', hat: '#1a2030' },
    worker: { coat: '#a8642a', skin: '#8a9480' },
    old: { coat: '#5a5a58', skin: '#9a9a88' },
    child: { coat: '#a05a78', skin: '#9aa090' },
    priest: { coat: '#141418', skin: '#8a9480', hat: '#0c0c10' },
  };

  function init(canvas) {
    cv = canvas;
    ctx = cv.getContext('2d');
    dark = document.createElement('canvas');
    dctx = dark.getContext('2d');
    resize();
    for (let i = 0; i < 160; i++) flakes.push({ x: Math.random(), y: Math.random(), s: U.rand(0.5, 2), v: U.rand(0.02, 0.06) });
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dark.width = W; dark.height = H;
    // Показываем ~17 клеток по вертикали, но не меньше 26 px на клетку.
    const nts = Math.max(26, Math.round(Math.min(H / 17, W / 24)));
    if (nts !== ts) { ts = nts; baked = null; }
    R.dpr = dpr;
  }

  // ---------- Запекание карты ----------
  function tileColor(c, x, y) {
    const n = U.hash(x, y);
    switch (c) {
      case '.': return `rgb(${200 + n * 20 | 0},${208 + n * 20 | 0},${222 + n * 18 | 0})`;
      case ',': return `rgb(${48 + n * 10 | 0},${50 + n * 10 | 0},${56 + n * 10 | 0})`;
      case '=': return `rgb(${96 + n * 10 | 0},${74 + n * 8 | 0},${56 + n * 6 | 0})`;
      case 't': return ((x + y) % 2 ? '#8d9a98' : '#98a5a2');
      case 'D': return '#6a5a48';
      case '_': return `rgb(${78 + n * 12 | 0},${80 + n * 12 | 0},${84 + n * 10 | 0})`;
      case '~': return `rgb(${30 + n * 10 | 0},${44 + n * 12 | 0},${62 + n * 14 | 0})`;
      case 'x': return '#6a6660';
      default: return '#ccc';
    }
  }

  function bake(game) {
    const w = game.world;
    const c = document.createElement('canvas');
    c.width = w.w * ts; c.height = w.h * ts;
    const b = c.getContext('2d');
    // Пол
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const ch = w.tile(x, y);
      let base = ch;
      if ('#wTcb%s'.includes(ch)) {
        // Под объектом — пол того же типа, что вокруг.
        base = game.map.outdoor && !isInterior(w, x, y) ? '.' : '=';
        if (ch === 'c') base = (w.tile(x, y - 1) === '_' || w.tile(x, y + 1) === '_') ? '_' : ',';
        if (ch === '%' && (w.tile(x, y + 1) === '~' || w.tile(x, y - 1) === '~')) base = '~';
        if (ch === 's') base = ',';
      }
      if (ch === '#' || ch === 'w') continue;
      b.fillStyle = tileColor(base, x, y);
      b.fillRect(x * ts, y * ts, ts + 1, ts + 1);
      // Мелкие детали
      const n = U.hash(x, y, 3);
      if (base === '.' && n > 0.7) { b.fillStyle = 'rgba(255,255,255,0.5)'; b.fillRect(x * ts + n * ts * 0.7, y * ts + (1 - n) * ts * 0.7, 3, 2); }
      if (base === ',' && n > 0.85) { b.fillStyle = 'rgba(230,235,245,0.6)'; b.fillRect(x * ts, y * ts + n * ts, ts * 0.8, 2); }
      if (base === '=') { b.fillStyle = 'rgba(0,0,0,0.12)'; b.fillRect(x * ts, y * ts + ts - 1, ts, 1); }
      if (base === '_') { b.fillStyle = 'rgba(0,0,0,0.25)'; b.fillRect(x * ts + ts - 2, y * ts, 2, ts); }
      if (base === '~' && n > 0.6) { b.strokeStyle = 'rgba(160,190,220,0.35)'; b.beginPath(); b.moveTo(x * ts + n * ts, y * ts); b.lineTo(x * ts + ts * (1 - n), y * ts + ts); b.stroke(); }
    }
    // Стены и объекты
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const ch = w.tile(x, y);
      const px = x * ts, py = y * ts, n = U.hash(x, y, 7);
      if (ch === '#') {
        b.fillStyle = '#2c2a2e'; b.fillRect(px, py, ts + 1, ts + 1);
        b.fillStyle = '#3c3a40'; b.fillRect(px, py, ts + 1, ts * 0.25);
        if (game.map.outdoor && !isInterior(w, x, y - 1) && w.tile(x, y - 1) !== '#') { b.fillStyle = 'rgba(235,240,250,0.8)'; b.fillRect(px, py, ts + 1, ts * 0.18); }
      } else if (ch === 'w') {
        b.fillStyle = '#2c2a2e'; b.fillRect(px, py, ts + 1, ts + 1);
        b.fillStyle = '#4a6a80'; b.fillRect(px + ts * 0.15, py + ts * 0.3, ts * 0.7, ts * 0.4);
        b.fillStyle = 'rgba(200,230,255,0.3)'; b.fillRect(px + ts * 0.2, py + ts * 0.33, ts * 0.2, ts * 0.1);
      } else if (ch === 'T') {
        b.fillStyle = 'rgba(0,0,0,0.25)'; b.beginPath(); b.arc(px + ts * 0.6, py + ts * 0.6, ts * 0.55, 0, 7); b.fill();
        b.fillStyle = '#1e3326'; b.beginPath(); b.arc(px + ts / 2, py + ts / 2, ts * 0.55, 0, 7); b.fill();
        b.fillStyle = '#2a4532'; b.beginPath(); b.arc(px + ts * 0.42, py + ts * 0.42, ts * 0.35, 0, 7); b.fill();
        b.fillStyle = 'rgba(240,245,255,0.75)'; b.beginPath(); b.arc(px + ts * 0.38, py + ts * 0.36, ts * 0.18, 0, 7); b.fill();
      } else if (ch === 'b') {
        b.fillStyle = '#4a3828'; b.fillRect(px + 2, py + 2, ts - 4, ts - 4);
        b.fillStyle = '#5a4634'; b.fillRect(px + 4, py + 4, ts - 8, ts * 0.3);
      } else if (ch === '%') {
        b.fillStyle = '#3a3a3e';
        const vert = w.tile(x - 1, y) !== '%' && w.tile(x + 1, y) !== '%';
        if (vert) b.fillRect(px + ts * 0.4, py, ts * 0.2, ts + 1); else b.fillRect(px, py + ts * 0.4, ts + 1, ts * 0.2);
        b.fillRect(px + ts * 0.4, py + ts * 0.3, ts * 0.2, ts * 0.4);
      } else if (ch === 's') {
        b.fillStyle = '#7a6e52';
        for (let k = 0; k < 3; k++) { b.beginPath(); b.ellipse(px + ts / 2, py + ts * (0.2 + k * 0.3), ts * 0.45, ts * 0.16, 0, 0, 7); b.fill(); }
      } else if (ch === 'c') {
        // Машины рисуются декором; если декора нет — простой корпус.
        b.fillStyle = '#3a3e44'; b.fillRect(px, py, ts + 1, ts + 1);
      }
      if (n > 0.995 && ch === '.') { b.fillStyle = 'rgba(120,20,20,0.4)'; b.beginPath(); b.arc(px + ts / 2, py + ts / 2, ts * 0.2, 0, 7); b.fill(); }
    }
    // Статичный декор
    for (const o of game.decor) drawDecor(b, o, game, true);
    baked = c;
    bakedFor = game.world;
  }

  function isInterior(w, x, y) {
    const c = w.tile(x, y);
    return c === '=' || c === 't';
  }

  function drawDecor(b, o, game, bakePass) {
    const px = o.x * ts, py = o.y * ts;
    const dyn = o.kind === 'policecar';
    if (bakePass === dyn && o.kind !== 'policecar') return;
    switch (o.kind) {
      case 'ambulance': vehicle(b, px, py, o.w * ts, o.h * ts, '#e8e8e4', '#c03030', true); break;
      case 'policecar': if (bakePass) vehicle(b, px, py, o.w * ts, o.h * ts, '#d8dce4', '#2848a0', false); break;
      case 'car': vehicle(b, px, py, o.w * ts, o.h * ts, o.color || '#444', null, false); break;
      case 'bus': vehicle(b, px, py, o.w * ts, o.h * ts, '#c8a030', '#806010', false); break;
      case 'stroller':
        b.fillStyle = '#2a3a5a'; b.fillRect(px + ts * 0.2, py + ts * 0.25, ts * 0.6, ts * 0.45);
        b.strokeStyle = '#111'; b.lineWidth = 2; b.beginPath(); b.arc(px + ts * 0.3, py + ts * 0.75, ts * 0.1, 0, 7); b.arc(px + ts * 0.7, py + ts * 0.75, ts * 0.1, 0, 7); b.stroke(); break;
      case 'swing':
        b.strokeStyle = '#555'; b.lineWidth = 3; b.beginPath(); b.moveTo(px - ts, py + ts * 0.2); b.lineTo(px + ts * 2, py + ts * 0.2); b.stroke();
        b.fillStyle = '#7a4a2a'; b.fillRect(px + ts * 0.2, py + ts * 0.5, ts * 0.6, ts * 0.15); break;
      case 'stairs':
        for (let i = 0; i < o.h * 3; i++) { b.fillStyle = i % 2 ? '#5a5650' : '#6a665e'; b.fillRect(px, py + i * ts / 3, o.w * ts, ts / 3); }
        b.fillStyle = '#3a3630'; b.fillRect(px + o.w * ts / 2 - 2, py, 4, o.h * ts); break;
      case 'blood': splat(b, px + ts / 2, py + ts / 2, ts * 0.5, o.x * 13 + o.y); break;
      case 'body':
        splat(b, px + ts / 2, py + ts / 2, ts * 0.6, o.x + o.y * 7);
        b.fillStyle = '#3a3a2a'; b.beginPath(); b.ellipse(px + ts / 2, py + ts / 2, ts * 0.45, ts * 0.2, 0.4, 0, 7); b.fill();
        b.fillStyle = '#7a7060'; b.beginPath(); b.arc(px + ts * 0.9, py + ts * 0.7, ts * 0.14, 0, 7); b.fill(); break;
      case 'patient':
        b.fillStyle = '#c8d0d0'; b.fillRect(px + 3, py + 3, ts - 6, ts - 6);
        b.fillStyle = '#d8b8a0'; b.beginPath(); b.arc(px + ts / 2, py + ts * 0.3, ts * 0.14, 0, 7); b.fill(); break;
      case 'graffiti':
        b.save(); b.font = `bold ${ts * 0.42}px "Courier New", monospace`; b.fillStyle = 'rgba(170,20,20,0.85)';
        b.fillText(o.text, px, py + ts * 0.6); b.restore(); break;
      case 'sign':
        b.save(); b.font = `${ts * 0.32}px sans-serif`; b.fillStyle = 'rgba(230,230,220,0.9)';
        b.fillText(o.text, px, py + ts * 0.7); b.restore(); break;
      case 'sandbags': break;
      case 'cross':
        b.fillStyle = '#c8a040';
        b.fillRect(px - ts * 0.06, py + ts * 0.1, ts * 0.12, ts * 0.8);
        b.fillRect(px - ts * 0.28, py + ts * 0.3, ts * 0.56, ts * 0.1);
        b.fillRect(px - ts * 0.18, py + ts * 0.62, ts * 0.36, ts * 0.08); break;
      case 'candles':
        for (let i = 0; i < 5; i++) {
          const cx = px + ts * (0.3 + i * 0.75), cy = py + ts * 0.5;
          b.fillStyle = '#e8dcc0'; b.fillRect(cx - 2, cy - ts * 0.1, 4, ts * 0.3);
          b.fillStyle = '#ffd070'; b.beginPath(); b.arc(cx, cy - ts * 0.16, 3, 0, 7); b.fill();
        } break;
      case 'charges':
        b.fillStyle = '#5a5a30'; b.fillRect(px + ts * 0.2, py + ts * 0.3, ts * 0.6, ts * 0.4);
        b.fillStyle = '#c02020'; b.fillRect(px + ts * 0.45, py + ts * 0.35, ts * 0.1, ts * 0.1); break;
    }
  }

  function vehicle(b, x, y, w, h, body, stripe, cross) {
    b.fillStyle = 'rgba(0,0,0,0.3)'; b.fillRect(x + 4, y + 4, w, h);
    b.fillStyle = body; b.fillRect(x + 2, y + 2, w - 4, h - 4);
    b.fillStyle = 'rgba(240,245,255,0.8)'; b.fillRect(x + 2, y + 2, w - 4, h * 0.15); // снег на крыше
    b.fillStyle = '#1a2028';
    b.fillRect(x + w * 0.72, y + h * 0.18, w * 0.16, h * 0.64); // лобовое стекло
    if (stripe) { b.fillStyle = stripe; b.fillRect(x + 2, y + h * 0.45, w * 0.7, h * 0.12); }
    if (cross) {
      b.fillStyle = '#c03030';
      b.fillRect(x + w * 0.3, y + h * 0.25, w * 0.06, h * 0.5);
      b.fillRect(x + w * 0.21, y + h * 0.44, w * 0.24, h * 0.12);
    }
  }

  function splat(b, x, y, r, seed) {
    b.fillStyle = 'rgba(90,10,12,0.75)';
    for (let i = 0; i < 6; i++) {
      const a = U.hash(seed, i) * 6.28, d = U.hash(i, seed) * r;
      b.beginPath(); b.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.2 + U.hash(seed + i, 1) * 0.3), 0, 7); b.fill();
    }
  }

  // ---------- Персонажи ----------
  function person(x, y, facing, coat, skin, opts = {}) {
    const s = (opts.scale || 1) * ts;
    ctx.save();
    ctx.translate(x, y);
    if (opts.lying) {
      ctx.rotate(opts.lyingAngle || 0);
      ctx.fillStyle = coat; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(s * 0.42, 0, s * 0.14, 0, 7); ctx.fill();
      ctx.restore(); return;
    }
    // Тень
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(s * 0.05, s * 0.08, s * 0.32, s * 0.26, 0, 0, 7); ctx.fill();
    ctx.rotate(facing + (opts.sway || 0));
    // Руки вперёд (заражённые в погоне)
    if (opts.armsOut) {
      ctx.fillStyle = coat;
      ctx.fillRect(s * 0.05, -s * 0.28, s * 0.38, s * 0.1);
      ctx.fillRect(s * 0.05, s * 0.18, s * 0.38, s * 0.1);
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(s * 0.45, -s * 0.23, s * 0.06, 0, 7); ctx.arc(s * 0.45, s * 0.23, s * 0.06, 0, 7); ctx.fill();
    }
    ctx.fillStyle = coat; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.2, s * 0.32, 0, 0, 7); ctx.fill();
    if (opts.stripe) { ctx.fillStyle = opts.stripe; ctx.fillRect(-s * 0.04, -s * 0.31, s * 0.08, s * 0.62); }
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(s * 0.03, 0, s * 0.15, 0, 7); ctx.fill();
    if (opts.hat) { ctx.fillStyle = opts.hat; ctx.beginPath(); ctx.arc(0, 0, s * 0.14, 0, 7); ctx.fill(); }
    if (opts.hair) { ctx.fillStyle = opts.hair; ctx.beginPath(); ctx.arc(-s * 0.03, 0, s * 0.13, Math.PI * 0.5, Math.PI * 1.5); ctx.fill(); }
    ctx.restore();
  }

  function drawPlayer(p, game) {
    const x = (p.x - game.cam.x) * ts, y = (p.y - game.cam.y) * ts;
    person(x, y, p.aim, p.hurtT > 0 ? '#802020' : '#1e2a44', '#d0a888', { stripe: '#b8e050' });
    // Монтировка / пистолет
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.aim);
    if (p.swingT > 0) {
      const k = 1 - p.swingT / 0.2;
      ctx.rotate(-1 + k * 2);
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(ts * 0.2, 0); ctx.lineTo(ts * 0.9, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = ts * 0.5;
      ctx.beginPath(); ctx.arc(0, 0, ts * 0.7, -0.4, 0.4); ctx.stroke();
    } else {
      ctx.fillStyle = '#222'; ctx.fillRect(ts * 0.18, ts * 0.06, ts * 0.28, ts * 0.08);
    }
    if (p.muzzle > 0) {
      ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(ts * 0.55, ts * 0.1, ts * 0.18, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawInfected(e, game, ghost) {
    const x = (e.x - game.cam.x) * ts, y = (e.y - game.cam.y) * ts;
    const L = LOOKS[e.look] || LOOKS.adult;
    if (e.dead) {
      person(x, y, 0, '#2a2a24', '#5a6050', { lying: true, lyingAngle: e.facing + 1.2, scale: e.look === 'child' ? 0.75 : 1 });
      return;
    }
    let sway = Math.sin(e.phase * 1.7) * 0.18;
    if (e.kind === 'rock' && e.state === 'ritual') sway = Math.sin(e.phase * 1.4) * 0.35;
    if (e.windup > 0) sway += Math.sin(e.windup * 40) * 0.15;
    const opts = {
      sway, armsOut: e.state === 'chase', scale: e.look === 'child' ? 0.72 : 1,
      hat: L.hat, hair: e.look === 'child' ? '#3a2418' : null,
    };
    if (ghost) ctx.globalAlpha = 0.5;
    person(x, y, e.facing, L.coat, e.hp < 2 && e.look !== 'child' ? '#7a4040' : L.skin, opts);
    ctx.globalAlpha = 1;
    if (e.state === 'ritual' && e.kind === 'sweep') {
      ctx.strokeStyle = '#6a5030'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(e.facing + Math.sin(e.phase * 4)) * ts * 0.7, y + Math.sin(e.facing + Math.sin(e.phase * 4)) * ts * 0.7); ctx.stroke();
    }
  }

  function drawNPC(n, game) {
    if (n.hidden) return;
    const x = (n.x - game.cam.x) * ts, y = (n.y - game.cam.y) * ts;
    if (n.dead) { person(x, y, 0, n.color, '#d0a888', { lying: true, lyingAngle: 1 }); return; }
    const halluc = game.halluc > 0.75 && Math.sin(game.time * 0.7 + n.x) > 0.93;
    const skin = halluc ? '#8a9480' : '#d0a888';
    if (n.pose === 'lying') person(x, y, 0, n.color, skin, { lying: true });
    else person(x, y, n.facing, n.color, skin, { scale: n.pose === 'sit' ? 0.9 : 1, sway: Math.sin(n.phase) * 0.05, armsOut: halluc });
  }

  function drawItem(it, game) {
    const x = (it.x - game.cam.x) * ts, y = (it.y - game.cam.y) * ts;
    const bob = Math.sin(game.time * 3 + it.x) * 2;
    ctx.save(); ctx.translate(x, y + bob);
    const s = ts * 0.32;
    switch (it.item) {
      case 'ammo': ctx.fillStyle = '#8a6a20'; ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.2); ctx.fillStyle = '#e0c060'; for (let i = 0; i < 4; i++) ctx.fillRect(-s * 0.8 + i * s * 0.45, -s * 0.4, s * 0.25, s * 0.8); break;
      case 'medkit': ctx.fillStyle = '#eee'; ctx.fillRect(-s, -s * 0.8, s * 2, s * 1.6); ctx.fillStyle = '#c02020'; ctx.fillRect(-s * 0.2, -s * 0.6, s * 0.4, s * 1.2); ctx.fillRect(-s * 0.6, -s * 0.2, s * 1.2, s * 0.4); break;
      case 'inhib': ctx.fillStyle = '#60b0e0'; ctx.fillRect(-s, -s * 0.25, s * 1.6, s * 0.5); ctx.fillStyle = '#ccc'; ctx.fillRect(s * 0.6, -s * 0.06, s * 0.6, s * 0.12); ctx.fillStyle = '#204060'; ctx.fillRect(-s * 1.2, -s * 0.35, s * 0.25, s * 0.7); break;
      case 'bottle': ctx.fillStyle = '#2a6a3a'; ctx.fillRect(-s * 0.35, -s * 0.6, s * 0.7, s * 1.3); ctx.fillRect(-s * 0.15, -s, s * 0.3, s * 0.45); break;
      case 'food': ctx.fillStyle = '#9a9aa0'; ctx.fillRect(-s * 0.6, -s * 0.7, s * 1.2, s * 1.4); ctx.fillStyle = '#c04020'; ctx.fillRect(-s * 0.6, -s * 0.3, s * 1.2, s * 0.6); break;
      case 'pistol': ctx.fillStyle = '#222'; ctx.fillRect(-s, -s * 0.3, s * 1.8, s * 0.5); ctx.fillRect(-s, -s * 0.1, s * 0.5, s); break;
    }
    ctx.restore();
  }

  function drawDoor(o, game) {
    const x = (o.x - game.cam.x) * ts, y = (o.y - game.cam.y) * ts;
    if (o.kind === 'barrier') {
      for (let i = 0; i < (o.h || 1); i++) {
        ctx.fillStyle = i % 2 ? '#c02020' : '#e8e8e8';
        ctx.fillRect(x + ts * 0.35, y + i * ts, ts * 0.3, ts);
      }
      return;
    }
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(x + 2, y + 2, ts - 4, ts - 4);
    ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.arc(x + ts * 0.75, y + ts / 2, ts * 0.06, 0, 7); ctx.fill();
  }

  // ---------- Свет ----------
  function visPoly(world, ox, oy, a0, a1, range, rays) {
    const pts = [];
    for (let i = 0; i <= rays; i++) {
      const a = a0 + (a1 - a0) * (i / rays);
      const d = world.ray(ox, oy, a, range);
      pts.push([ox + Math.cos(a) * d, oy + Math.sin(a) * d]);
    }
    return pts;
  }

  function fillPoly(c, pts, cx, cy, game, grad, center) {
    c.fillStyle = grad;
    c.beginPath();
    if (center) c.moveTo((cx - game.cam.x) * ts, (cy - game.cam.y) * ts);
    for (const p of pts) c.lineTo((p[0] - game.cam.x) * ts, (p[1] - game.cam.y) * ts);
    c.closePath();
    c.fill();
  }

  function lightGrad(c, x, y, r, inner) {
    const sx = (x - R.cam.x) * ts, sy = (y - R.cam.y) * ts;
    const gr = c.createRadialGradient(sx, sy, 0, sx, sy, r * ts);
    gr.addColorStop(0, `rgba(0,0,0,${inner})`);
    gr.addColorStop(0.6, `rgba(0,0,0,${inner * 0.7})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    return gr;
  }

  function drawDarkness(game) {
    const p = game.player, w = game.world;
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, W, H);
    dctx.fillStyle = `rgba(3,5,12,${game.darkness})`;
    dctx.fillRect(0, 0, W, H);
    dctx.globalCompositeOperation = 'destination-out';

    // Рассеянный свет вокруг героя
    const amb = visPoly(w, p.x, p.y, 0, Math.PI * 2, 2.6, 48);
    fillPoly(dctx, amb, p.x, p.y, game, lightGrad(dctx, p.x, p.y, 2.6, 0.75), false);

    // Фонарь — конус с учётом стен, мерцает при сильном заражении
    let flick = 1;
    if (game.halluc > 0.5 && Math.random() < game.halluc * 0.08) flick = 0.3;
    if (p.flashlight) {
      const range = 10.5, fov = 0.5;
      const cone = visPoly(w, p.x, p.y, p.aim - fov, p.aim + fov, range, 70);
      fillPoly(dctx, cone, p.x, p.y, game, lightGrad(dctx, p.x, p.y, range, 0.97 * flick), true);
    }
    // Статичные источники
    for (const L of game.lights) {
      let k = 0.9;
      if (L.flicker) k *= 0.75 + 0.25 * Math.sin(game.time * 13 + L.x) * Math.sin(game.time * 7.3 + L.y);
      if (L.color === 'police') k = 0.6 + 0.3 * Math.abs(Math.sin(game.time * 4));
      const sx = (L.x - game.cam.x) * ts, sy = (L.y - game.cam.y) * ts;
      if (sx < -L.r * ts || sy < -L.r * ts || sx > W + L.r * ts || sy > H + L.r * ts) continue;
      dctx.fillStyle = lightGrad(dctx, L.x, L.y, L.r, k);
      dctx.beginPath(); dctx.arc(sx, sy, L.r * ts, 0, 7); dctx.fill();
    }
    if (p.muzzle > 0) {
      dctx.fillStyle = lightGrad(dctx, p.x, p.y, 7, 1);
      dctx.beginPath(); dctx.arc((p.x - game.cam.x) * ts, (p.y - game.cam.y) * ts, 7 * ts, 0, 7); dctx.fill();
    }
    if (game.flash > 0) { dctx.fillStyle = `rgba(0,0,0,${game.flash})`; dctx.fillRect(0, 0, W, H); }
    dctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(dark, 0, 0, W, H);

    // Цветное свечение
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of game.lights) {
      let col = L.color;
      if (col === 'police') col = Math.sin(game.time * 4) > 0 ? '#ff2020' : '#2040ff';
      const sx = (L.x - game.cam.x) * ts, sy = (L.y - game.cam.y) * ts;
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, L.r * ts);
      gr.addColorStop(0, hexA(col, 0.22)); gr.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, L.r * ts, 0, 7); ctx.fill();
    }
    if (p.flashlight) {
      const sx = (p.x - game.cam.x) * ts, sy = (p.y - game.cam.y) * ts;
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, 9 * ts);
      gr.addColorStop(0, 'rgba(255,240,200,0.06)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, 9 * ts, p.aim - 0.5, p.aim + 0.5); ctx.fill();
    }
    ctx.restore();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }

  // ---------- Главный кадр ----------
  function draw(game) {
    if (!baked || bakedFor !== game.world || game.rebake) { bake(game); game.rebake = false; }
    const p = game.player;
    const vw = W / ts, vh = H / ts;
    let cx = p.x - vw / 2, cy = p.y - vh / 2;
    cx = U.clamp(cx, 0, Math.max(0, game.world.w - vw));
    cy = U.clamp(cy, 0, Math.max(0, game.world.h - vh));
    if (game.world.w < vw) cx = (game.world.w - vw) / 2;
    if (game.world.h < vh) cy = (game.world.h - vh) / 2;
    if (game.shake > 0) { cx += U.rand(-1, 1) * game.shake * 0.3; cy += U.rand(-1, 1) * game.shake * 0.3; }
    game.cam = { x: cx, y: cy };
    R.cam = game.cam;

    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(baked, cx * ts, cy * ts, W, H, 0, 0, W, H);

    // Декали (кровь во время игры)
    for (const dcl of game.decals) {
      ctx.save(); ctx.translate((dcl.x - cx) * ts, (dcl.y - cy) * ts);
      splatCtx(dcl, ts);
      ctx.restore();
    }
    for (const o of game.decor) if (o.kind === 'policecar') {
      const sx = (o.x - cx) * ts, sy = (o.y - cy) * ts;
      ctx.fillStyle = Math.sin(game.time * 4) > 0 ? '#ff3030' : '#3050ff';
      ctx.fillRect(sx + o.w * ts * 0.45, sy + o.h * ts * 0.3, ts * 0.4, ts * 0.4);
    }
    for (const dr of game.doors) if (dr.locked()) drawDoor(dr, game);
    for (const it of game.items) drawItem(it, game);
    for (const e of game.infected) if (e.dead) drawInfected(e, game);
    for (const n of game.npcs) drawNPC(n, game);
    for (const e of game.infected) if (!e.dead) drawInfected(e, game);
    for (const b of game.thrown) {
      ctx.fillStyle = '#2a6a3a'; ctx.beginPath(); ctx.arc((b.x - cx) * ts, (b.y - cy) * ts, ts * 0.1, 0, 7); ctx.fill();
    }
    drawPlayer(p, game);
    if (game.tracer) {
      const t = game.tracer;
      ctx.strokeStyle = 'rgba(255,230,160,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo((t.x - cx) * ts, (t.y - cy) * ts);
      ctx.lineTo((t.x + Math.cos(t.a) * t.d - cx) * ts, (t.y + Math.sin(t.a) * t.d - cy) * ts); ctx.stroke();
    }

    // Снег — виден только в свете
    if (game.map.outdoor) {
      ctx.fillStyle = 'rgba(240,245,255,0.8)';
      for (const f of flakes) {
        f.y += f.v * 0.016 * 6; f.x += 0.0008 + Math.sin(game.time + f.s) * 0.0004;
        if (f.y > 1) { f.y = 0; f.x = Math.random(); }
        if (f.x > 1) f.x = 0;
        ctx.fillRect(f.x * W, f.y * H, f.s, f.s);
      }
    }

    drawDarkness(game);

    // Поверх темноты: глаза в погоне, звуковые круги, реплики, призраки
    for (const e of game.infected) {
      if (e.dead || e.passive) continue;
      const d = U.dist(e.x, e.y, p.x, p.y);
      if ((e.state === 'chase' || e.state === 'investigate') && d < 12) {
        const sx = (e.x - cx) * ts, sy = (e.y - cy) * ts;
        const a = e.facing, s = ts * (e.look === 'child' ? 0.72 : 1);
        ctx.fillStyle = e.state === 'chase' ? 'rgba(255,60,40,0.9)' : 'rgba(255,200,120,0.6)';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(sx + Math.cos(a) * s * 0.1 + Math.cos(a + Math.PI / 2) * side * s * 0.06,
            sy + Math.sin(a) * s * 0.1 + Math.sin(a + Math.PI / 2) * side * s * 0.06, Math.max(1.5, s * 0.03), 0, 7);
          ctx.fill();
        }
      }
    }
    for (const n of game.world.noises) {
      const k = n.t / 0.8;
      ctx.strokeStyle = `rgba(200,210,230,${0.18 * (1 - k)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc((n.x - cx) * ts, (n.y - cy) * ts, n.r * ts * k, 0, 7); ctx.stroke();
    }
    ctx.font = `italic ${Math.round(ts * 0.36)}px Georgia, serif`;
    ctx.textAlign = 'center';
    for (const e of game.infected) {
      if (e.dead || e.lineShow <= 0 || !e.line) continue;
      const d = U.dist(e.x, e.y, p.x, p.y);
      const a = Math.min(1, e.lineShow) * (1 - d / 9);
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(190,200,190,${a * 0.85})`;
      ctx.fillText(e.line, (e.x - cx) * ts, (e.y - cy) * ts - ts * 0.6);
    }
    // Имена NPC рядом
    ctx.font = `${Math.round(ts * 0.3)}px sans-serif`;
    for (const n of game.npcs) {
      if (n.dead || n.hidden) continue;
      const d = U.dist(n.x, n.y, p.x, p.y);
      if (d < 4) {
        ctx.fillStyle = `rgba(220,220,200,${0.8 * (1 - d / 4)})`;
        ctx.fillText(n.name, (n.x - cx) * ts, (n.y - cy) * ts - ts * 0.55);
      }
    }
    ctx.textAlign = 'left';
    // Галлюцинации: силуэты на краю света
    for (const gh of game.ghosts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, gh.t)) * 0.6;
      person((gh.x - cx) * ts, (gh.y - cy) * ts, gh.a, '#0a0a0a', '#1a1a1a', { armsOut: true });
      ctx.globalAlpha = 1;
    }
    // Виньетка: ранение и заражение
    const hero = G.State.d.hero;
    const hurt = Math.max(0, 1 - hero.health / 60) * 0.5 + (p.hurtT > 0 ? 0.35 : 0);
    const inf = game.halluc;
    if (hurt > 0 || inf > 0.3) {
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 2.2);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, `rgba(${100 + hurt * 100 | 0},${inf > 0.3 ? 40 : 0},${inf > 0.3 ? 30 : 0},${Math.min(0.75, hurt + (inf - 0.3) * 0.6 * pulse)})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
  }

  function splatCtx(dcl, ts) {
    ctx.fillStyle = dcl.big ? 'rgba(80,8,10,0.85)' : 'rgba(110,12,14,0.7)';
    for (const s of dcl.parts) { ctx.beginPath(); ctx.arc(s[0] * ts, s[1] * ts, s[2] * ts, 0, 7); ctx.fill(); }
  }

  const R = { init, resize, draw, cam: { x: 0, y: 0 }, get ts() { return ts; }, invalidate() { baked = null; } };
  G.Render = R;
})();
