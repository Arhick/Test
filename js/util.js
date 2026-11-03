'use strict';
// Общие утилиты. Всё в глобальном пространстве G, чтобы игра открывалась двойным кликом (без сервера).
window.G = window.G || {};

G.U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
  angle: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
  angDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  rand: (a, b) => a + Math.random() * (b - a),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  // Детерминированный хэш тайла — для неизменных «текстур».
  hash(x, y, s = 0) {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  },
  deepCopy: (o) => JSON.parse(JSON.stringify(o)),
};
