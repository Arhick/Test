'use strict';
// Состояние мира: скрытые оси морали, флаги решений, ресурсы, люди, дневник, чекпоинт.
(function () {
  const SAVE_KEY = 'ostatochnye_save_v1';
  const U = G.U;

  function fresh() {
    return {
      day: 1,
      phase: 'day', // day | night | summary
      axes: { humanity: 0, trust: 0, cure: 0 }, // -100..100, игрок их не видит
      factions: { military: 0, doctors: 0, refugees: 0, church: 0 },
      flags: {},
      kills: 0,
      spared: 0,
      inv: { pistol: false, ammo: 0, inhib: 0, medkit: 1, bottle: 2, food: 4 },
      hero: { health: 100, infection: 0 },
      // Люди в убежище. here — находится в убежище; alive — жив.
      people: {
        kolya: { name: 'Коля', role: 'водитель скорой', alive: true, here: true, hunger: 0, infected: false, hidden: false },
        lisa: { name: 'Лиза', role: 'дочь Сергея, 16 лет', alive: true, here: false, hunger: 0, infected: false },
        sergey: { name: 'Сергей', role: 'отец Лизы, укушен', alive: true, here: false, hunger: 0, infected: true, locked: false },
        dyachkov: { name: 'Дьячков', role: 'лейтенант полиции, перелом', alive: true, here: false, hunger: 0, infected: false },
      },
      diary: [],
      decisions: [],
    };
  }

  const S = {
    d: fresh(),
    checkpoint: null,

    newGame() {
      this.d = fresh();
      this.checkpoint = null;
    },

    flag(name, value) {
      if (value === undefined) return this.d.flags[name];
      this.d.flags[name] = value;
    },

    shift(delta) {
      for (const k in delta) {
        if (k in this.d.axes) this.d.axes[k] = U.clamp(this.d.axes[k] + delta[k], -100, 100);
        else if (k in this.d.factions) this.d.factions[k] = U.clamp(this.d.factions[k] + delta[k], -100, 100);
      }
    },

    diary(text) {
      this.d.diary.push({ day: this.d.day, phase: this.d.phase, text });
      G.UI && G.UI.toast('Дневник обновлён', 'diary');
    },

    decide(id, title, choice, note) {
      this.d.decisions = this.d.decisions.filter((x) => x.id !== id);
      this.d.decisions.push({ id, day: this.d.day, title, choice, note });
    },

    // Заражённые «учатся» у игрока: чем больше убийств, тем они агрессивнее.
    aggression() {
      const k = this.d.kills, s = this.d.spared;
      return U.clamp(k / (k + s + 6), 0, 1);
    },

    beginDay(n) {
      this.d.day = n;
      this.d.phase = 'day';
      this.d.hero.health = Math.max(this.d.hero.health, 60);
      this.checkpoint = U.deepCopy(this.d);
      this.save();
    },

    restoreCheckpoint() {
      if (this.checkpoint) this.d = U.deepCopy(this.checkpoint);
    },

    save() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ d: this.d, checkpoint: this.checkpoint }));
      } catch (e) { /* хранилище недоступно — игра работает без сохранений */ }
    },

    hasSave() {
      try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    },

    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const obj = JSON.parse(raw);
        this.d = obj.d;
        this.checkpoint = obj.checkpoint;
        // Совместимость со старыми сохранениями
        for (const st of [this.d, this.checkpoint]) if (st && st.factions && st.factions.church == null) st.factions.church = 0;
        return true;
      } catch (e) { return false; }
    },
  };

  G.State = S;
})();
