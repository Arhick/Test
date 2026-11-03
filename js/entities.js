'use strict';
// Сущности: игрок, «остаточные» (заражённые), NPC, предметы, брошенные бутылки.
(function () {
  const U = G.U;
  const A = () => G.Audio;
  const S = () => G.State;

  // ---------------- Игрок ----------------
  class Player {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.r = 0.3;
      this.aim = 0;
      this.flashlight = true;
      this.stamina = 100;
      this.mode = 'walk'; // walk | run | sneak
      this.stepT = 0;
      this.meleeCd = 0;
      this.shotCd = 0;
      this.swingT = 0;
      this.muzzle = 0;
      this.hurtT = 0;
      this.moving = false;
      this.infTick = 0;
    }

    update(dt, inp, world) {
      const hero = S().d.hero;
      let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      let my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
      const len = Math.hypot(mx, my);
      this.moving = len > 0;
      if (len) { mx /= len; my /= len; }

      this.mode = 'walk';
      if (inp.sneak) this.mode = 'sneak';
      else if (inp.run && this.stamina > 5 && this.moving) this.mode = 'run';

      let speed = { walk: 3.0, run: 5.2, sneak: 1.5 }[this.mode];
      if (hero.health < 30) speed *= 0.8;
      if (this.mode === 'run') this.stamina = Math.max(0, this.stamina - 22 * dt);
      else this.stamina = Math.min(100, this.stamina + 14 * dt);

      if (this.moving) {
        world.move(this, mx * speed * dt, my * speed * dt, this.r);
        this.stepT -= dt * speed;
        if (this.stepT <= 0) {
          this.stepT = 1.6;
          const r = { walk: 2.2, run: 6.5, sneak: 0.7 }[this.mode];
          world.noise(this.x, this.y, r, 'player');
          A().step(this.mode === 'sneak');
        }
      }

      this.aim = Math.atan2(inp.my - this.y, inp.mx - this.x);
      this.meleeCd = Math.max(0, this.meleeCd - dt);
      this.shotCd = Math.max(0, this.shotCd - dt);
      this.swingT = Math.max(0, this.swingT - dt);
      this.muzzle = Math.max(0, this.muzzle - dt);
      this.hurtT = Math.max(0, this.hurtT - dt);

      // Заражение медленно растёт само по себе.
      if (S().d.flags.bitten) {
        this.infTick += dt;
        if (this.infTick > 9) { this.infTick = 0; hero.infection = Math.min(100, hero.infection + 1); }
      }
    }

    melee(game) {
      if (this.meleeCd > 0) return;
      this.meleeCd = 0.55;
      this.swingT = 0.2;
      A().swing();
      game.world.noise(this.x, this.y, 5, 'player');
      let hit = false;
      for (const e of game.infected) {
        if (e.dead) continue;
        const d = U.dist(this.x, this.y, e.x, e.y);
        if (d > 1.25) continue;
        const a = Math.atan2(e.y - this.y, e.x - this.x);
        if (d > 0.75 && Math.abs(U.angDiff(this.aim, a)) > 1.1) continue; // вплотную — попадаем в любую сторону
        e.damage(1, this.aim, game);
        hit = true;
      }
      if (hit) A().hit();
    }

    shoot(game) {
      const inv = S().d.inv;
      if (!inv.pistol || this.shotCd > 0) return;
      if (inv.ammo <= 0) { A().click(); this.shotCd = 0.3; G.UI.toast('Патронов нет'); return; }
      inv.ammo--;
      this.shotCd = 0.45;
      this.muzzle = 0.06;
      A().shot();
      game.world.noise(this.x, this.y, 16, 'player');
      game.shake = 0.25;
      // Попадание: ближайший заражённый на линии выстрела.
      const range = game.world.ray(this.x, this.y, this.aim, 14);
      let best = null, bestD = range;
      for (const e of game.infected) {
        if (e.dead) continue;
        const dx = e.x - this.x, dy = e.y - this.y;
        const along = dx * Math.cos(this.aim) + dy * Math.sin(this.aim);
        if (along < 0 || along > bestD) continue;
        const perp = Math.abs(-dx * Math.sin(this.aim) + dy * Math.cos(this.aim));
        if (perp < 0.45) { best = e; bestD = along; }
      }
      game.tracer = { x: this.x, y: this.y, a: this.aim, d: bestD, t: 0.08 };
      if (best) best.damage(3, this.aim, game);
    }

    hurt(amount, game) {
      if (game.godMode) return;
      const hero = S().d.hero;
      hero.health = Math.max(0, hero.health - amount);
      hero.infection = Math.min(100, hero.infection + amount * 0.35);
      this.hurtT = 0.4;
      game.shake = 0.3;
      A().hurt();
    }
  }

  // ---------------- «Остаточный» ----------------
  // Поведение: ritual (повторяет действие из прошлой жизни) → investigate (слышал шум) →
  // chase (видит цель) → return (потерял цель, возвращается к ритуалу).
  class Infected {
    constructor(o) {
      this.id = o.id || null;
      this.x = o.x + 0.5; this.y = o.y + 0.5;
      this.home = { x: this.x, y: this.y };
      this.r = 0.32;
      this.kind = o.kind || 'stand'; // stand | pace | rock | knock | sweep | sit | wander | horde
      this.path = (o.path || []).map((p) => ({ x: p[0] + 0.5, y: p[1] + 0.5 }));
      this.pi = 0;
      this.lines = o.lines || [];
      this.lineT = U.rand(2, 6);
      this.line = null;
      this.lineShow = 0;
      this.look = o.look || 'adult'; // adult | nurse | cop | child | worker | old
      this.hp = o.hp || 3;
      this.state = o.state || 'ritual';
      this.target = null;
      this.lastSeen = null;
      this.alertT = 0;
      this.facing = o.facing != null ? o.facing : U.rand(0, Math.PI * 2);
      this.phase = Math.random() * 10;
      this.attackCd = 0;
      this.dead = false;
      this.deadT = 0;
      this.knock = 0;
      this.stun = 0;
      this.windup = 0;
      this.drop = o.drop || null;
      this.passive = !!o.passive; // не нападает (Маша)
      this.onDeath = o.onDeath || null;
      this.groanT = U.rand(3, 10);
      const ag = S().aggression();
      this.speedMul = 1 + ag * 0.45;
      this.hearMul = 1 + ag * 0.6;
      this.callsOthers = ag > 0.45;
    }

    damage(n, ang, game) {
      if (this.dead) return;
      this.hp -= n;
      this.stun = 0.5;
      this.windup = 0;
      this.knock = 0.25;
      this.kx = Math.cos(ang) * 4; this.ky = Math.sin(ang) * 4;
      game.blood(this.x, this.y);
      if (this.state === 'ritual' || this.state === 'return') this.alert(game.player, game);
      if (this.hp <= 0) {
        this.dead = true;
        S().d.kills++;
        game.blood(this.x, this.y, true);
        if (this.drop) game.spawnItem(this.x, this.y, this.drop);
        if (this.onDeath) this.onDeath(game, this);
      }
    }

    alert(target, game) {
      if (this.passive) return;
      if (this.state !== 'chase') {
        this.state = 'chase';
        if (target === game.player) game.spotted();
        if (this.callsOthers) {
          // Агрессивные заражённые зовут других — «учатся» у игрока.
          for (const o of game.infected) {
            if (o !== this && !o.dead && o.state !== 'chase' && U.dist(o.x, o.y, this.x, this.y) < 7) {
              o.state = 'investigate'; o.lastSeen = { x: target.x, y: target.y };
            }
          }
        }
      }
      this.target = target;
      this.lastSeen = { x: target.x, y: target.y };
      this.alertT = 4;
    }

    hear(x, y, r) {
      if (this.dead || this.passive) return;
      const d = U.dist(x, y, this.x, this.y);
      if (d <= r * this.hearMul && this.state !== 'chase') {
        this.state = 'investigate';
        this.lastSeen = { x, y };
        this.alertT = 6;
      }
    }

    canSee(t, game) {
      const d = U.dist(this.x, this.y, t.x, t.y);
      let range = 4.5;
      if (t === game.player) {
        if (game.player.flashlight) range = 9;
        if (game.player.mode === 'sneak') range *= 0.6;
        if (game.isLit(t.x, t.y)) range = Math.max(range, 9);
      } else range = 6;
      if (d > range) return false;
      if (d > 1.5) {
        const a = Math.atan2(t.y - this.y, t.x - this.x);
        const fov = this.state === 'chase' || this.state === 'investigate' ? Math.PI : Math.PI * 0.6;
        if (Math.abs(U.angDiff(this.facing, a)) > fov) return false;
      }
      return game.world.los(this.x, this.y, t.x, t.y);
    }

    moveTo(tx, ty, speed, dt, world) {
      let wx = tx, wy = ty;
      if (!world.los(this.x, this.y, tx, ty) || U.dist(this.x, this.y, tx, ty) > 1.5) {
        const st = world.stepToward(this.x, this.y, tx, ty);
        if (st && !world.los(this.x, this.y, tx, ty)) { wx = st.x; wy = st.y; }
      }
      const a = Math.atan2(wy - this.y, wx - this.x);
      this.facing = a;
      const d = U.dist(this.x, this.y, wx, wy);
      const s = Math.min(speed * dt, d);
      world.move(this, Math.cos(a) * s, Math.sin(a) * s, this.r);
      return d;
    }

    update(dt, game) {
      if (this.dead) { this.deadT += dt; return; }
      const world = game.world;
      this.phase += dt;
      this.attackCd = Math.max(0, this.attackCd - dt);
      if (this.knock > 0) {
        this.knock -= dt;
        world.move(this, this.kx * dt, this.ky * dt, this.r);
      }
      if (this.stun > 0) { this.stun -= dt; return; }

      // Реплики из прошлой жизни.
      this.lineShow = Math.max(0, this.lineShow - dt);
      this.lineT -= dt;
      if (this.lineT <= 0 && this.lines.length && this.state !== 'chase') {
        this.lineT = U.rand(5, 10);
        if (U.dist(this.x, this.y, game.player.x, game.player.y) < 8) { this.line = U.pick(this.lines); this.lineShow = 3; }
      }
      this.groanT -= dt;
      if (this.groanT <= 0) {
        this.groanT = U.rand(6, 14);
        const d = U.dist(this.x, this.y, game.player.x, game.player.y);
        if (d < 10) A().groan(0.12 * (1 - d / 10) + (this.state === 'chase' ? 0.08 : 0));
      }

      // Поиск целей: игрок и беженцы (День 3).
      if (!this.passive) {
        const targets = [game.player].concat(game.refugeeTargets());
        for (const t of targets) {
          if (t.dead) continue;
          if (this.canSee(t, game)) {
            if (this.state !== 'chase' || this.target !== t) {
              if (!this.target || this.target.dead || this.state !== 'chase' ||
                U.dist(this.x, this.y, t.x, t.y) < U.dist(this.x, this.y, this.target.x, this.target.y)) this.alert(t, game);
            } else { this.lastSeen = { x: t.x, y: t.y }; this.alertT = 4; }
          }
        }
      }

      const base = this.look === 'child' ? 1.2 : 1.0;
      switch (this.state) {
        case 'ritual': this.ritual(dt, game); break;
        case 'investigate': {
          const d = this.moveTo(this.lastSeen.x, this.lastSeen.y, 1.6 * base * this.speedMul, dt, world);
          this.alertT -= dt;
          if (d < 0.3 || this.alertT <= 0) this.state = 'return';
          break;
        }
        case 'chase': {
          const t = this.target;
          if (!t || t.dead) { this.state = 'return'; break; }
          const sees = this.canSee(t, game);
          if (sees) { this.lastSeen = { x: t.x, y: t.y }; this.alertT = 4; } else this.alertT -= dt;
          const d = this.moveTo(this.lastSeen.x, this.lastSeen.y, 2.55 * base * this.speedMul, dt, world);
          const dt2 = U.dist(this.x, this.y, t.x, t.y);
          // Замах перед укусом — у игрока есть доля секунды, чтобы ударить или отскочить.
          if (dt2 < 0.8 && this.attackCd <= 0) {
            this.windup += dt;
            if (this.windup >= 0.4) {
              this.windup = 0;
              this.attackCd = 1.3;
              if (U.dist(this.x, this.y, t.x, t.y) < 0.9) {
                if (t === game.player) game.playerBitten(this);
                else t.hurt && t.hurt(game);
              }
            }
          } else this.windup = 0;
          if (this.alertT <= 0 || (!sees && d < 0.3)) { this.state = 'investigate'; this.alertT = 3; }
          break;
        }
        case 'return': {
          const tx = this.path.length ? this.path[this.pi].x : this.home.x;
          const ty = this.path.length ? this.path[this.pi].y : this.home.y;
          const d = this.moveTo(tx, ty, 1.2 * this.speedMul, dt, world);
          if (d < 0.3) this.state = 'ritual';
          break;
        }
      }
    }

    ritual(dt, game) {
      const world = game.world;
      switch (this.kind) {
        case 'pace':
        case 'sweep':
        case 'wander': {
          if (!this.path.length) break;
          const p = this.path[this.pi];
          const d = this.moveTo(p.x, p.y, this.kind === 'wander' ? 0.9 : 0.75, dt, world);
          if (d < 0.2) {
            this.pi = (this.pi + 1) % this.path.length;
            if (this.kind === 'sweep') this.stun = 1.2; // «метёт» на месте
          }
          break;
        }
        case 'horde': {
          // Идёт к цели (мост) — орда.
          const p = this.path[this.pi] || this.home;
          const d = this.moveTo(p.x, p.y, 1.1 * this.speedMul, dt, world);
          if (d < 0.4 && this.pi < this.path.length - 1) this.pi++;
          break;
        }
        case 'rock': this.facing += Math.sin(this.phase * 1.4) * 0.01; break;
        case 'knock':
          if (Math.sin(this.phase * 2.2) > 0.97 && U.dist(this.x, this.y, game.player.x, game.player.y) < 9 && !this.knocked) {
            this.knocked = true; A().hit();
          }
          if (Math.sin(this.phase * 2.2) < 0) this.knocked = false;
          break;
        default: this.facing += Math.sin(this.phase * 0.5) * 0.004;
      }
    }
  }

  // ---------------- NPC ----------------
  class NPC {
    constructor(o) {
      this.id = o.id;
      this.name = o.name;
      this.x = o.x + 0.5; this.y = o.y + 0.5;
      this.r = 0.3;
      this.color = o.color || '#9a8';
      this.follow = false;
      this.talk = o.talk || null; // id сцены
      this.facing = o.facing || Math.PI / 2;
      this.pose = o.pose || 'stand'; // stand | lying | sit
      this.dead = false;
      this.hp = o.hp || 3;
      this.refugee = !!o.refugee;
      this.hurtCd = 0;
      this.phase = Math.random() * 10;
      this.prompt = o.prompt || 'Поговорить';
      this.hidden = false;
    }
    hurt(game) {
      if (this.hurtCd > 0) return;
      this.hurtCd = 0.8;
      this.hp--;
      game.blood(this.x, this.y);
      A().hurt();
      if (this.hp <= 0) { this.dead = true; game.blood(this.x, this.y, true); game.onNpcDeath(this); }
    }
    update(dt, game) {
      if (this.dead) return;
      this.phase += dt;
      this.hurtCd = Math.max(0, this.hurtCd - dt);
      if (this.follow) {
        const p = game.player;
        const d = U.dist(this.x, this.y, p.x, p.y);
        if (d > 1.6) {
          const st = game.world.los(this.x, this.y, p.x, p.y) ? { x: p.x, y: p.y } : game.world.stepToward(this.x, this.y, p.x, p.y);
          if (st) {
            const a = Math.atan2(st.y - this.y, st.x - this.x);
            this.facing = a;
            const sp = d > 4 ? 4.6 : 2.9;
            game.world.move(this, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt, this.r);
          }
        }
        if (d > 14) { this.x = p.x; this.y = p.y; } // не теряемся
      }
      if (this.escort) this.escort(dt, game, this);
    }
  }

  G.Player = Player;
  G.Infected = Infected;
  G.NPC = NPC;
})();
