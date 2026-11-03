'use strict';
// Главный модуль: цикл, ввод, загрузка дня, взаимодействия, ночь, смерть, финал акта.
(function () {
  const U = G.U;
  const S = G.State;
  const A = G.Audio;
  const UI = G.UI;

  const keys = {};
  const mouse = { x: 0, y: 0, l: false, r: false };
  let lastT = 0;
  let lastLoadedDay = 0;
  let spotCd = 0;
  let whisperT = 8;

  const WHISPERS = ['...Илья...', 'ты один из нас', 'тук. тук. тук.', 'холодно...', 'баю-баю...', 'не оборачивайся'];

  const Game = {
    running: false,
    paused: false,
    time: 0,
    shake: 0,
    flash: 0,
    halluc: 0,
    darkness: 0.95,

    // ---------- Загрузка дня ----------
    load(day) {
      const map = G.Maps['day' + day]();
      this.map = map;
      this.world = new G.World(map.rows);
      this.player = new G.Player(map.spawn.x, map.spawn.y);
      this.infected = []; this.npcs = []; this.items = []; this.doors = [];
      this.triggers = []; this.interacts = []; this.decor = []; this.lights = [];
      this.decals = []; this.thrown = []; this.ghosts = [];
      this.timer = null; this.escortOn = false; this.hordeOn = false; this.hordeT = 3;
      this.ending = false; this.bridgeGone = false; this.tracer = null; this.bellT = null;
      this.objective = map.objective;
      this.darkness = { 1: 0.96, 2: 0.94, 3: 0.92 }[day] || 0.95;
      this.rebake = true;

      for (const o of map.objects) {
        // Для триггеров и взаимодействий условие проверяется во время игры, для остального — при загрузке.
        if (o.when && o.type !== 'trigger' && o.type !== 'interact' && !o.when()) continue;
        switch (o.type) {
          case 'infected': this.infected.push(new G.Infected(o)); break;
          case 'npc': this.npcs.push(new G.NPC(o)); break;
          case 'item': if (!S.flag('took_' + o.id)) this.items.push({ ...o, x: o.x + 0.5, y: o.y + 0.5 }); break;
          case 'door': {
            const dr = { ...o };
            this.doors.push(dr);
            for (let k = 0; k < (o.h || 1); k++) this.world.setBlock(o.x, o.y + k, dr.locked());
            break;
          }
          case 'trigger': if (!S.flag('trig_' + o.id)) this.triggers.push(o); break;
          case 'interact': this.interacts.push(o); break;
          case 'decor': this.decor.push(o); break;
          case 'light': this.lights.push(o); break;
        }
      }
      G.Render.invalidate();
      this.running = true;
      this.paused = false;
      const replay = lastLoadedDay === day;
      lastLoadedDay = day;
      UI.show('hud', true);
      UI.clearHint();
      UI.card(map.name, map.sub, () => {
        if (!replay && map.intro) this.scene(map.intro);
      }, replay ? 1500 : 3600);
    },

    // ---------- Сцены ----------
    scene(id, onDone) {
      const nodes = G.Story.scenes[id];
      if (!nodes) { console.warn('Нет сцены', id); return; }
      UI.playScene(nodes, onDone);
    },

    // ---------- Цикл ----------
    frame(t) {
      const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
      lastT = t;
      if (this.running) {
        if (!this.paused && !UI.busy()) this.update(dt);
        this.time += dt;
        this.shake = Math.max(0, this.shake - dt * 1.5);
        this.flash = Math.max(0, this.flash - dt * 0.7);
        G.Render.draw(this);
        UI.hud(this);
      }
      requestAnimationFrame((tt) => this.frame(tt));
    },

    input() {
      const cam = this.cam || { x: 0, y: 0 };
      const ts = G.Render.ts;
      return {
        up: keys.KeyW || keys.ArrowUp, down: keys.KeyS || keys.ArrowDown,
        left: keys.KeyA || keys.ArrowLeft, right: keys.KeyD || keys.ArrowRight,
        run: keys.ShiftLeft || keys.ShiftRight, sneak: keys.KeyC || keys.ControlLeft,
        mx: mouse.x / ts + cam.x, my: mouse.y / ts + cam.y,
      };
    },

    update(dt) {
      const p = this.player, hero = S.d.hero;
      this.world.update(dt);
      p.update(dt, this.input(), this.world);
      // Очередь действий: быстрый клик/нажатие не теряется между кадрами.
      if (mouse.l || this.qFire) { S.d.inv.pistol ? p.shoot(this) : p.melee(this); }
      if (mouse.r || keys.Space || this.qMelee) p.melee(this);
      this.qFire = this.qMelee = false;

      for (const e of this.infected) e.update(dt, this);
      for (const n of this.npcs) n.update(dt, this);
      this.separate();
      this.updateLeaving();
      this.updateThrown(dt);
      if (this.tracer) { this.tracer.t -= dt; if (this.tracer.t <= 0) this.tracer = null; }
      spotCd = Math.max(0, spotCd - dt);

      // Подбор предметов
      for (const it of this.items.slice()) {
        if (U.dist(it.x, it.y, p.x, p.y) < 0.7) this.pickup(it);
      }

      // Триггеры
      for (const tr of this.triggers.slice()) {
        if (tr.when && !tr.when()) continue;
        if (p.x >= tr.x && p.x < tr.x + tr.w && p.y >= tr.y && p.y < tr.y + tr.h) {
          S.flag('trig_' + tr.id, true);
          this.triggers.splice(this.triggers.indexOf(tr), 1);
          this.scene(tr.scene);
          return;
        }
      }

      // Подсказка взаимодействия
      this.focus = this.findFocus();
      UI.prompt(this.focus ? this.focus.prompt : null);

      // Опасность → сердцебиение
      let danger = 0;
      for (const e of this.infected) {
        if (e.dead || e.state !== 'chase') continue;
        danger = Math.max(danger, 1 - U.dist(e.x, e.y, p.x, p.y) / 10);
      }
      A.update(dt, danger);

      // Заражение → галлюцинации
      this.halluc = U.clamp((hero.infection - 45) / 55, 0, 1);
      this.updateGhosts(dt);

      // Колокол церкви: громкий шум, который уводит «остаточных» к церкви
      if (this.map.bell) {
        this.bellT = (this.bellT == null ? 8 : this.bellT) - dt;
        if (this.bellT <= 0) {
          this.bellT = this.map.bell.every;
          const dd = U.dist(this.map.bell.x, this.map.bell.y, p.x, p.y);
          A.bell(Math.max(0.15, 1 - dd / 40));
          this.world.noise(this.map.bell.x, this.map.bell.y, 11, 'bell');
        }
      }

      // День 3
      if (this.map.bridge) this.updateBridge(dt);

      // Смерть
      if (hero.health <= 0) return this.die('Ты не успел. Темнота сомкнулась.');
      if (hero.infection >= 100) return this.die('Заражение взяло своё. Ты стоишь посреди улицы и повторяешь чужие слова: «Двенадцатая бригада, выезжаем...»');
    },

    // Тела не проходят друг сквозь друга: расталкиваем заражённых, героя и NPC.
    separate() {
      const bodies = [this.player].concat(this.infected.filter((e) => !e.dead), this.npcs.filter((n) => !n.dead && !n.hidden && n.pose !== 'lying'));
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let dd = Math.hypot(dx, dy);
          const min = 0.62;
          if (dd >= min) continue;
          if (dd < 1e-4) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dd = Math.hypot(dx, dy); }
          const push = (min - dd) / 2;
          const nx = dx / dd * push, ny = dy / dd * push;
          // Героя двигаем меньше — управление не должно «уплывать».
          const ka = a === this.player ? 0.3 : 1, kb = b === this.player ? 0.3 : 1;
          this.world.move(a, -nx * ka, -ny * ka, a.r);
          this.world.move(b, nx * kb, ny * kb, b.r);
        }
      }
    },

    findFocus() {
      const p = this.player;
      let best = null, bd = 99;
      const consider = (dist, obj) => { if (dist < bd) { bd = dist; best = obj; } };
      for (const it of this.interacts) {
        if (it.when && !it.when()) continue;
        const dd = U.dist(it.x, it.y, p.x, p.y);
        if (dd < (it.r || 1.3)) consider(dd, { prompt: it.prompt, act: () => this.scene(typeof it.scene === 'function' ? it.scene() : it.scene) });
      }
      for (const n of this.npcs) {
        if (n.dead || n.hidden || !n.talk) continue;
        const dd = U.dist(n.x, n.y, p.x, p.y);
        if (dd < 1.5) consider(dd, { prompt: `${n.prompt}: ${n.name}`, act: () => this.scene(n.talk) });
      }
      for (const dr of this.doors) {
        if (!dr.locked()) continue;
        const dd = U.dist(dr.x + 0.5, dr.y + 0.5 + ((dr.h || 1) - 1) / 2, p.x, p.y);
        if (dd < 1.4 + ((dr.h || 1) - 1) / 2) {
          consider(dd, { prompt: dr.prompt, act: () => { if (dr.scene) this.scene(dr.scene); else { A.click(); UI.toast(dr.prompt); } } });
        }
      }
      return best;
    },

    interact() { if (this.focus) this.focus.act(); },

    // ---------- Предметы ----------
    pickup(it) {
      const inv = S.d.inv;
      this.items.splice(this.items.indexOf(it), 1);
      if (it.id) S.flag('took_' + it.id, true);
      A.pickup();
      const names = { ammo: 'Патроны', medkit: 'Аптечка', inhib: 'Ингибитор', bottle: 'Бутылка', food: 'Еда', pistol: 'Пистолет' };
      if (it.item === 'pistol') { inv.pistol = true; inv.ammo += it.n || 0; UI.toast(`Пистолет Дьячкова (+${it.n} патр.)`); }
      else { inv[it.item] = (inv[it.item] || 0) + (it.n || 1); UI.toast(`${names[it.item]} +${it.n || 1}`); }
      if (it.item === 'ammo' && !inv.pistol) UI.toast('Патроны пригодятся, если найдёшь оружие');
      if (it.onPick) it.onPick();
    },

    spawnItem(x, y, drop) { this.items.push({ x, y, item: drop.item, n: drop.n }); },

    useInhib() {
      const inv = S.d.inv, h = S.d.hero;
      if (inv.inhib <= 0) return UI.toast('Ингибиторов нет');
      if (!S.flag('bitten')) return UI.toast('Ты не заражён. Пока.');
      inv.inhib--; h.infection = Math.max(0, h.infection - 25);
      A.pickup(); UI.toast('Ингибитор: заражение −25%');
    },

    useMedkit() {
      const inv = S.d.inv, h = S.d.hero;
      if (inv.medkit <= 0) return UI.toast('Аптечек нет');
      if (h.health >= 100) return UI.toast('Ты цел');
      inv.medkit--; h.health = Math.min(100, h.health + 45);
      A.pickup(); UI.toast('Аптечка: +45 здоровья');
    },

    throwBottle() {
      const inv = S.d.inv, p = this.player;
      if (inv.bottle <= 0) return UI.toast('Бутылок нет');
      inv.bottle--;
      const inp = this.input();
      const dist = Math.min(8, U.dist(p.x, p.y, inp.mx, inp.my));
      this.thrown.push({ x: p.x, y: p.y, a: p.aim, left: dist, v: 11 });
      A.swing();
    },

    updateThrown(dt) {
      for (const b of this.thrown.slice()) {
        const step = Math.min(b.left, b.v * dt);
        const nx = b.x + Math.cos(b.a) * step, ny = b.y + Math.sin(b.a) * step;
        b.left -= step;
        const hitWall = this.world.isSolid(Math.floor(nx), Math.floor(ny));
        if (!hitWall) { b.x = nx; b.y = ny; }
        if (b.left <= 0 || hitWall) {
          this.thrown.splice(this.thrown.indexOf(b), 1);
          A.glass();
          this.world.noise(b.x, b.y, 8, 'bottle');
        }
      }
    },

    // ---------- События ----------
    onNoise(x, y, r) { for (const e of this.infected) e.hear(x, y, r); },

    spotted() {
      if (spotCd > 0) return;
      spotCd = 5;
      A.sting();
    },

    playerBitten() {
      this.player.hurt(12, this);
      if (!S.flag('bitten')) { S.flag('bitten', true); UI.toast('Укус! Заражение началось', 'bad'); }
    },

    isLit(x, y) {
      for (const L of this.lights) if (U.dist(L.x, L.y, x, y) < L.r * 0.6) return true;
      return false;
    },

    blood(x, y, big) {
      const parts = [];
      const n = big ? 9 : 4;
      for (let i = 0; i < n; i++) parts.push([U.rand(-0.4, 0.4) * (big ? 1.3 : 1), U.rand(-0.4, 0.4) * (big ? 1.3 : 1), U.rand(0.05, big ? 0.22 : 0.12)]);
      this.decals.push({ x, y, big, parts });
      if (this.decals.length > 220) this.decals.shift();
    },

    unlock(id) {
      const dr = this.doors.find((x) => x.id === id);
      if (!dr) return;
      dr.locked = () => false;
      for (let k = 0; k < (dr.h || 1); k++) this.world.setBlock(dr.x, dr.y + k, false);
    },

    byId(id) { return this.infected.find((e) => e.id === id) || this.npcs.find((n) => n.id === id); },

    removeEntity(id) {
      this.infected = this.infected.filter((e) => e.id !== id);
      this.npcs = this.npcs.filter((n) => n.id !== id);
    },

    setFollow(id, on) { const n = this.byId(id); if (n) { n.follow = on; n.pose = 'stand'; } },

    followersNear() {
      return ['sergey', 'lisa'].every((id) => { const n = this.byId(id); return n && U.dist(n.x, n.y, this.player.x, this.player.y) < 6; });
    },

    setObjective(text) { this.objective = text; UI.toast('Новая цель: ' + text, 'obj'); },

    releaseMasha() {
      const m = this.byId('masha');
      if (!m) return;
      m.kind = 'horde'; m.state = 'ritual';
      m.path = [[21, 16], [27.5, 17], [27.5, 24], [27.5, 33], [27.5, 39]].map(([x, y]) => ({ x: x + 0.5, y: y }));
      m.pi = 0; m.leaving = true;
    },

    updateLeaving() {
      this.infected = this.infected.filter((e) => !(e.leaving && e.pi >= e.path.length - 1 && U.dist(e.x, e.y, e.path[e.path.length - 1].x, e.path[e.path.length - 1].y) < 0.6));
    },

    onNpcDeath(n) {
      if (n.refugee) UI.toast(`${n.name} погиб`, 'bad');
    },

    // ---------- Галлюцинации ----------
    updateGhosts(dt) {
      for (const g of this.ghosts) g.t -= dt * 1.5;
      this.ghosts = this.ghosts.filter((g) => g.t > 0);
      if (this.halluc <= 0) return;
      const p = this.player;
      if (Math.random() < this.halluc * dt * 0.5) {
        const a = p.aim + U.rand(-0.4, 0.4), dd = U.rand(5, 9);
        const r = this.world.ray(p.x, p.y, a, dd);
        if (r > 3) this.ghosts.push({ x: p.x + Math.cos(a) * (r - 0.5), y: p.y + Math.sin(a) * (r - 0.5), a: a + Math.PI, t: 1 });
      }
      whisperT -= dt;
      if (whisperT <= 0) {
        whisperT = U.rand(10, 20) / (0.5 + this.halluc);
        UI.toast(U.pick(WHISPERS), 'whisper');
        A.groan(0.08);
      }
    },

    // ---------- День 3: мост ----------
    refugeeTargets() { return this.escortOn ? this.npcs.filter((n) => n.refugee && !n.dead) : []; },

    startEscort(time) {
      this.escortOn = true;
      this.hordeOn = true;
      this.timer = time > 0 ? time : null;
      const ref = this.npcs.filter((n) => n.refugee);
      ref.forEach((n, i) => {
        n.safeSpot = { x: 6 + i * 1.5, y: 13.5 + (i % 2) * 2 };
        n.escort = (dt, game, self) => {
          if (self.dead) return;
          if (self.x < 15) {
            // Безопасно: отходят от моста
            const s = self.safeSpot;
            if (U.dist(self.x, self.y, s.x, s.y) > 0.4) {
              const st = game.world.stepToward(self.x, self.y, s.x, s.y) || s;
              const a = Math.atan2(st.y - self.y, st.x - self.x);
              game.world.move(self, Math.cos(a) * 2 * dt, Math.sin(a) * 2 * dt, self.r);
            }
            return;
          }
          // Идут, только если рядом нет «остаточных»
          const threat = game.infected.some((e) => !e.dead && !e.passive && U.dist(e.x, e.y, self.x, self.y) < 3.2);
          self.waiting = threat;
          if (threat) return;
          const st = game.world.stepToward(self.x, self.y, 10, 15);
          if (!st) return;
          const a = Math.atan2(st.y - self.y, st.x - self.x);
          self.facing = a;
          game.world.move(self, Math.cos(a) * 2.1 * dt, Math.sin(a) * 2.1 * dt, self.r);
        };
      });
      if (time > 0) A.alarm();
    },

    escortSaved() { return this.npcs.filter((n) => n.refugee && !n.dead && n.x < 16).length; },

    updateBridge(dt) {
      const p = this.player, ch = S.flag('bridgeChoice');
      // Орда
      if (this.hordeOn && !this.bridgeGone) {
        this.hordeT -= dt;
        const alive = this.infected.filter((e) => !e.dead && e.kind === 'horde').length;
        if (this.hordeT <= 0 && alive < 12) {
          this.hordeT = 5.5 / (1 + S.aggression());
          const e = new G.Infected({
            x: 70, y: 13 + Math.floor(Math.random() * 4), kind: 'horde', look: U.pick(['worker', 'worker', 'adult', 'old']),
            path: [[57, 15], [44, 14], [30, 14], [16, 15], [6, 15]], lines: ['Смена... смена...', 'Домой...', 'Автобус ушёл'],
          });
          this.infected.push(e);
        }
      }
      if (this.ending) return;
      if (this.timer != null) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = null;
          this.ending = true;
          if (p.x >= 15.5) {
            this.explodeBridge();
            return this.die('Майор сдержал слово. Мост рухнул вместе с тобой.');
          }
          return this.scene('d3_end_escort');
        }
        // Все беженцы на берегу или погибли, и ты тоже на берегу — взрыв раньше.
        const pending = this.npcs.filter((n) => n.refugee && !n.dead && n.x >= 16).length;
        if (pending === 0 && p.x < 14.5) { this.ending = true; this.timer = null; return this.scene('d3_end_escort'); }
      }
      if (ch === 'return' && p.x < 14.5) { this.ending = true; return this.scene('d3_end_return'); }
      if (ch === 'kept' && p.x < 14.5) {
        const pending = this.npcs.filter((n) => n.refugee && !n.dead && n.x >= 16).length;
        if (pending === 0) { this.ending = true; return this.scene('d3_end_kept'); }
        if (!this.keptHint) { this.keptHint = true; UI.toast('Беженцы ещё на мосту'); }
      }
    },

    explodeBridge() {
      if (this.bridgeGone) return;
      this.bridgeGone = true;
      this.hordeOn = false;
      A.explosion();
      this.flash = 1; this.shake = 1.4;
      for (let y = 11; y <= 18; y++) for (let x = 18; x <= 55; x++) this.world.setTile(x, y, '~');
      for (const e of this.infected) if (e.x >= 18 && e.x <= 56) { e.dead = true; e.hidden = true; }
      this.infected = this.infected.filter((e) => !(e.hidden));
      for (const n of this.npcs) if (n.x >= 18 && n.x <= 56 && !n.dead) { n.dead = true; n.hidden = true; }
      this.rebake = true;
    },

    // ---------- Конец дня / ночь ----------
    endDay() {
      UI.closeScene();
      UI.prompt(null);
      // Пощажённые — живые «остаточные», которых ты оставил (учитываются в агрессии).
      S.d.spared += this.infected.filter((e) => !e.dead && !e.passive).length;
      const day = S.d.day;
      S.d.phase = 'night';
      S.save();
      this.running = false;
      UI.show('hud', false);
      this.startNight(day);
    },

    startNight(n) {
      UI.show('hud', false);
      const alloc = () => UI.night(n, (a) => this.applyNight(n, a));
      UI.card(`Ночь ${n}`, 'Подстанция скорой помощи №2', () => {
        // Отец Вадим приходит до распределения: его просьба соперничает с нуждами своих.
        if (n === 2) this.scene('n_vadim', alloc); else alloc();
      }, 2400);
    },

    applyNight(n, alloc) {
      const D = S.d, hero = D.hero;
      for (const id in D.people) {
        const p = D.people[id];
        if (!p.alive || !p.here || p.locked) continue;
        if (alloc.fed[id]) p.hunger = 0;
        else { p.hunger++; S.shift({ trust: -5 }); }
      }
      if (alloc.fed.hero) hero.health = Math.min(100, hero.health + 15);
      else hero.health = Math.max(20, hero.health - 15);
      if (alloc.med) hero.health = Math.min(100, hero.health + 45);
      if (D.flags.bitten) hero.infection = alloc.hero ? Math.max(0, hero.infection - 25) : Math.min(95, hero.infection + 12);
      if (alloc.sergey && n === 1) D.flags.sergeyInhib1 = true;
      const hungry = Object.keys(D.people).filter((id) => { const p = D.people[id]; return p.alive && p.here && !p.locked && !alloc.fed[id]; });
      if (hungry.length) S.diary(`Ночь ${n}. Не хватило еды: ${hungry.map((id) => D.people[id].name).join(', ')}. Они ничего не сказали. Это хуже, чем если бы сказали.`);
      if (!alloc.hero && D.flags.bitten && D.inv.inhib >= 0 && (alloc.sergey || alloc.kolya)) {
        S.shift({ humanity: 5 });
        S.diary('Я отдал свою дозу. Руки к утру дрожат сильнее.');
      }

      const events = G.Story.nightEvents(n, alloc);
      const runNext = () => {
        const id = events.shift();
        if (id) return this.scene(id, runNext);
        UI.closeScene();
        S.beginDay(n + 1);
        this.load(n + 1);
      };
      runNext();
    },

    endAct() {
      UI.closeScene();
      UI.prompt(null);
      S.d.spared += this.infected.filter((e) => !e.dead && !e.passive && e.kind !== 'horde').length;
      S.d.phase = 'summary';
      S.save();
      this.running = false;
      UI.show('hud', false);
      UI.card('Конец Акта I', 'Решения сохранены', () => UI.summary(), 3000);
    },

    die(msg) {
      if (this.dead) return;
      this.dead = true;
      UI.closeScene();
      UI.prompt(null);
      this.running = false;
      A.hurt();
      UI.death(msg, () => {
        this.dead = false;
        S.restoreCheckpoint();
        this.load(S.d.day);
      });
    },

    // ---------- Меню ----------
    newGame() {
      A.init();
      S.newGame();
      lastLoadedDay = 0;
      UI.show('menu', false);
      UI.show('summary', false);
      S.beginDay(1);
      this.load(1);
    },

    continueGame() {
      A.init();
      if (!S.load()) return this.newGame();
      UI.show('menu', false);
      lastLoadedDay = S.d.day;
      if (S.d.phase === 'summary') return UI.summary();
      if (S.d.phase === 'night') return this.startNight(S.d.day);
      S.restoreCheckpoint();
      lastLoadedDay = 0;
      this.load(S.d.day);
    },

    toMenu() {
      this.running = false;
      this.paused = false;
      UI.closeScene();
      ['pause', 'diary', 'summary', 'hud', 'night', 'death', 'card'].forEach((id) => UI.show(id, false));
      document.getElementById('btn-continue').hidden = !S.hasSave();
      UI.show('menu', true);
    },

    togglePause() {
      if (!this.running || UI.busy()) return;
      this.paused = !this.paused;
      UI.pause(this.paused);
      if (!this.paused) UI.diary(false);
    },
  };

  // ---------- Ввод ----------
  window.addEventListener('keydown', (e) => {
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (UI.sceneKey(e)) return;
    if (e.code === 'Escape') {
      if (!document.getElementById('diary').hidden) { UI.diary(false); if (!Game.paused) return; }
      return Game.togglePause();
    }
    if (e.code === 'Tab') {
      if (!Game.running || UI.busy()) return;
      const open = document.getElementById('diary').hidden;
      Game.paused = open;
      UI.diary(open);
      return;
    }
    if (!Game.running || Game.paused || UI.busy()) return;
    keys[e.code] = true;
    if (e.repeat) return;
    switch (e.code) {
      case 'KeyE': Game.interact(); break;
      case 'Space': Game.qMelee = true; break;
      case 'KeyF': Game.player.flashlight = !Game.player.flashlight; A.click(); break;
      case 'KeyQ': Game.useInhib(); break;
      case 'KeyH': Game.useMedkit(); break;
      case 'KeyG': Game.throwBottle(); break;
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; });

  function bindCanvas(cv) {
    cv.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
    cv.addEventListener('mousedown', (e) => {
      A.init();
      if (e.button === 0) { mouse.l = true; Game.qFire = true; }
      if (e.button === 2) { mouse.r = true; Game.qMelee = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  window.addEventListener('load', () => {
    const cv = document.getElementById('game');
    G.Render.init(cv);
    bindCanvas(cv);
    window.addEventListener('resize', () => G.Render.resize());
    document.getElementById('btn-new').onclick = () => Game.newGame();
    document.getElementById('btn-continue').onclick = () => Game.continueGame();
    document.getElementById('btn-continue').hidden = !S.hasSave();
    document.getElementById('btn-resume').onclick = () => Game.togglePause();
    document.getElementById('btn-diary').onclick = () => UI.diary(true);
    document.getElementById('btn-diary-close').onclick = () => UI.diary(false);
    document.getElementById('btn-restart-day').onclick = () => { Game.togglePause(); S.restoreCheckpoint(); Game.load(S.d.day); };
    document.getElementById('btn-menu').onclick = () => Game.toMenu();
    document.getElementById('btn-sum-new').onclick = () => Game.newGame();
    document.getElementById('btn-sum-menu').onclick = () => Game.toMenu();
    document.getElementById('dlg-next').onclick = () => UI.advance && UI.sceneKey({ code: 'Enter' });
    requestAnimationFrame((t) => { lastT = t; Game.frame(t); });
  });

  G.Game = Game;
})();
