// Проверка карт: объекты на проходимых клетках и достижимы от точки старта.
// Запуск: node tools/check-maps.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['util.js', 'state.js', 'world.js', 'maps.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const G = ctx.G;
let errors = 0;

// Все варианты флагов, влияющих на объекты
const variants = [
  {}, { tookSergey: true }, { mashaReleased: true }, { grachevBriefed: true },
  { vadimChoice: 'two', sergeyAtChurch: true }, { vadimChoice: 'one' },
];

for (const day of [1, 2, 3]) {
  for (const flags of variants) {
    G.State.newGame();
    Object.assign(G.State.d.flags, flags);
    const map = G.Maps['day' + day]();
    const rows = map.rows;
    const w = rows[0].length;
    rows.forEach((r, i) => { if (r.length !== w) { console.error(`day${day}: строка ${i} длины ${r.length}`); errors++; } });
    const world = new G.World(rows);
    // BFS от спавна, двери считаем открытыми
    const seen = new Set();
    const q = [[Math.floor(map.spawn.x), Math.floor(map.spawn.y)]];
    seen.add(q[0].join());
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (seen.has(k) || world.isSolid(nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    const check = (o, x, y, label) => {
      x = Math.floor(x); y = Math.floor(y);
      if (world.isSolid(x, y)) { console.error(`day${day} ${JSON.stringify(flags)}: ${label} в стене (${x},${y}) '${world.tile(x, y)}'`); errors++; return; }
      if (!seen.has(x + ',' + y)) { console.error(`day${day} ${JSON.stringify(flags)}: ${label} недостижим (${x},${y})`); errors++; }
    };
    for (const o of map.objects) {
      if (o.when && !o.when()) continue;
      const label = `${o.type}:${o.id || o.kind || o.item || ''}`;
      if (o.type === 'infected' || o.type === 'item') check(o, o.x, o.y, label);
      if (o.type === 'npc' && o.pose !== 'lying' && !(o.x >= 59 && o.y >= 13 && o.y <= 15)) check(o, o.x, o.y, label);
      if (o.type === 'interact') check(o, o.x, o.y, label);
      if (o.type === 'infected' && o.path) o.path.forEach((p, i) => check(o, p[0], p[1], label + ' путь#' + i));
      if (o.type === 'door' && world.tile(o.x, o.y) !== 'D' && o.kind !== 'barrier') { console.error(`day${day}: дверь ${o.id} не на 'D'`); errors++; }
      if (o.type === 'trigger') {
        let ok = false;
        for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (seen.has(x + ',' + y)) ok = true;
        if (!ok) { console.error(`day${day}: триггер ${o.id} недостижим`); errors++; }
      }
    }
  }
}
console.log(errors ? `Ошибок: ${errors}` : 'Карты в порядке');
process.exit(errors ? 1 : 0);
