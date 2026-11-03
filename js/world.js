'use strict';
// Мир: тайловая сетка, коллизии, лучи видимости, поиск пути, шум. Плюс MapBuilder для карт.
(function () {
  const U = G.U;

  // solid — непроходимо, opaque — не пропускает свет и взгляд.
  const TILES = {
    '#': { solid: 1, opaque: 1 }, // стена
    'w': { solid: 1, opaque: 0 }, // окно / стеклянная стена
    '.': { solid: 0, opaque: 0 }, // снег
    ',': { solid: 0, opaque: 0 }, // асфальт
    '=': { solid: 0, opaque: 0 }, // линолеум
    't': { solid: 0, opaque: 0 }, // кафель (больница)
    'D': { solid: 0, opaque: 0 }, // дверной проём
    'T': { solid: 1, opaque: 0 }, // дерево
    'c': { solid: 1, opaque: 0 }, // машина
    'b': { solid: 1, opaque: 0 }, // мебель
    '%': { solid: 1, opaque: 0 }, // забор / перила
    '~': { solid: 1, opaque: 0 }, // вода / лёд с полыньями
    '_': { solid: 0, opaque: 0 }, // настил моста
    's': { solid: 1, opaque: 0 }, // мешки с песком
    'x': { solid: 0, opaque: 0 }, // мусор / обломки
  };

  class MapBuilder {
    constructor(w, h, fill = '.') {
      this.w = w; this.h = h;
      this.g = [];
      for (let y = 0; y < h; y++) this.g.push(new Array(w).fill(fill));
    }
    set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = c; return this; }
    fill(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this; }
    rect(x, y, w, h, c) {
      for (let i = x; i < x + w; i++) { this.set(i, y, c); this.set(i, y + h - 1, c); }
      for (let j = y; j < y + h; j++) { this.set(x, j, c); this.set(x + w - 1, j, c); }
      return this;
    }
    room(x, y, w, h, floor = '=') { this.fill(x, y, w, h, floor); this.rect(x, y, w, h, '#'); return this; }
    hline(x, y, len, c) { return this.fill(x, y, len, 1, c); }
    vline(x, y, len, c) { return this.fill(x, y, 1, len, c); }
    rows() { return this.g.map((r) => r.join('')); }
  }

  class World {
    constructor(rows) {
      this.h = rows.length;
      this.w = rows[0].length;
      this.g = rows.map((r) => r.split(''));
      this.dyn = new Uint8Array(this.w * this.h); // динамические препятствия (запертые двери)
      this.noises = [];
      this.flowCache = new Map();
      this.flowAge = 0;
    }

    tile(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '#';
      return this.g[y][x];
    }
    setTile(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) { this.g[y][x] = c; this.flowCache.clear(); } }
    isSolid(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return true;
      return TILES[this.g[y][x]].solid || this.dyn[y * this.w + x] > 0;
    }
    isOpaque(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return true;
      return TILES[this.g[y][x]].opaque;
    }
    setBlock(x, y, on) { this.dyn[y * this.w + x] = on ? 1 : 0; this.flowCache.clear(); }

    // Движение круга с раздельной проверкой осей — скольжение вдоль стен.
    move(ent, dx, dy, r = 0.3) {
      const tryAxis = (nx, ny) => {
        const x0 = Math.floor(nx - r), x1 = Math.floor(nx + r);
        const y0 = Math.floor(ny - r), y1 = Math.floor(ny + r);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.isSolid(x, y)) return false;
        return true;
      };
      let moved = false;
      if (dx && tryAxis(ent.x + dx, ent.y)) { ent.x += dx; moved = true; }
      if (dy && tryAxis(ent.x, ent.y + dy)) { ent.y += dy; moved = true; }
      return moved;
    }

    // DDA-луч: расстояние до первой непрозрачной клетки.
    ray(x, y, ang, max) {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      let mx = Math.floor(x), my = Math.floor(y);
      const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
      const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
      let tx = dx > 0 ? (mx + 1 - x) * ddx : (x - mx) * ddx;
      let ty = dy > 0 ? (my + 1 - y) * ddy : (y - my) * ddy;
      let t = 0;
      while (t < max) {
        if (tx < ty) { t = tx; tx += ddx; mx += sx; } else { t = ty; ty += ddy; my += sy; }
        if (this.isOpaque(mx, my)) return Math.min(t, max);
      }
      return max;
    }

    los(ax, ay, bx, by) {
      const d = U.dist(ax, ay, bx, by);
      return this.ray(ax, ay, Math.atan2(by - ay, bx - ax), d) >= d - 0.05;
    }

    // Поле расстояний BFS до цели (кэшируется на короткое время).
    flow(tx, ty) {
      tx = Math.floor(tx); ty = Math.floor(ty);
      const key = ty * this.w + tx;
      let f = this.flowCache.get(key);
      if (f) return f;
      f = new Int16Array(this.w * this.h).fill(-1);
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return f;
      const q = [key];
      f[key] = 0;
      let head = 0;
      while (head < q.length) {
        const c = q[head++];
        const cx = c % this.w, cy = (c / this.w) | 0;
        if (f[c] > 60) continue;
        for (let k = 0; k < 4; k++) {
          const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const n = ny * this.w + nx;
          if (f[n] !== -1 || this.isSolid(nx, ny)) continue;
          f[n] = f[c] + 1;
          q.push(n);
        }
      }
      this.flowCache.set(key, f);
      return f;
    }

    // Куда шагать из (x,y), чтобы дойти до (tx,ty). Возвращает точку-ориентир или null.
    stepToward(x, y, tx, ty) {
      const f = this.flow(tx, ty);
      const cx = Math.floor(x), cy = Math.floor(y);
      const here = f[cy * this.w + cx];
      let best = null, bestV = here === -1 ? 9999 : here;
      for (let k = 0; k < 8; k++) {
        const ox = [1, -1, 0, 0, 1, 1, -1, -1][k], oy = [0, 0, 1, -1, 1, -1, 1, -1][k];
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        // Диагональ только если оба соседа свободны — не режем углы.
        if (ox && oy && (this.isSolid(cx + ox, cy) || this.isSolid(cx, cy + oy))) continue;
        const v = f[ny * this.w + nx];
        if (v !== -1 && v < bestV) { bestV = v; best = { x: nx + 0.5, y: ny + 0.5 }; }
      }
      return best;
    }

    update(dt) {
      this.flowAge += dt;
      if (this.flowAge > 0.4) { this.flowCache.clear(); this.flowAge = 0; }
      for (const n of this.noises) n.t += dt;
      this.noises = this.noises.filter((n) => n.t < 0.8);
    }

    noise(x, y, r, src) {
      this.noises.push({ x, y, r, t: 0 });
      G.Game && G.Game.onNoise(x, y, r, src);
    }
  }

  G.TILES = TILES;
  G.MapBuilder = MapBuilder;
  G.World = World;
})();
