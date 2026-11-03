'use strict';
// Интерфейс поверх канваса: HUD, диалоги, ночь, пауза, дневник, итоги акта.
(function () {
  const $ = (id) => document.getElementById(id);
  const S = () => G.State;
  const d = () => G.State.d;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let sceneState = null;
  let hintTimer = 0;
  const last = {};

  function setText(id, v) { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } }
  function setWidth(id, v) { const k = Math.round(v); if (last[id] !== k) { last[id] = k; $(id).style.width = k + '%'; } }

  const UI = {
    busy() { return !!sceneState || !$('night').hidden || !$('summary').hidden || !$('card').hidden || !$('death').hidden; },

    show(id, on = true) { $(id).hidden = !on; },

    // ---------- HUD ----------
    hud(game) {
      const h = d().hero, inv = d().inv;
      setText('hud-day', game.map.name);
      setText('hud-obj', game.objective || '');
      setWidth('bar-hp', h.health);
      setWidth('bar-inf', h.infection);
      setWidth('bar-sta', game.player.stamina);
      setText('inv-weapon', inv.pistol ? `Пистолет: ${inv.ammo}` : 'Монтировка');
      setText('inv-inhib', `Ингибитор (Q): ${inv.inhib}`);
      setText('inv-med', `Аптечка (H): ${inv.medkit}`);
      setText('inv-bottle', `Бутылка (G): ${inv.bottle}`);
      setText('inv-food', `Еда: ${inv.food}`);
      setText('hud-mode', { walk: '', run: 'БЕГ — шумно', sneak: 'Крадёшься' }[game.player.mode]);
      $('hud-inf-label').classList.toggle('pulse', h.infection > 50);
      if (game.timer != null) { $('timer').hidden = false; setText('timer', fmtTime(game.timer)); } else $('timer').hidden = true;
      if (hintTimer > 0) { hintTimer -= 1 / 60; if (hintTimer <= 0) $('hint').classList.remove('on'); }
      // Ложный HUD при сильном заражении
      if (h.infection > 70 && Math.random() < 0.01) { $('hud').classList.add('glitch'); setTimeout(() => $('hud').classList.remove('glitch'), 200); }
    },

    prompt(text) {
      const el = $('prompt');
      if (!text) { el.classList.remove('on'); return; }
      setText('prompt', 'E — ' + text);
      el.classList.add('on');
    },

    toast(msg, type) {
      const el = document.createElement('div');
      el.className = 'toast ' + (type || '');
      el.textContent = msg;
      $('toasts').appendChild(el);
      setTimeout(() => el.classList.add('out'), 2200);
      setTimeout(() => el.remove(), 2800);
    },

    clearHint() { hintTimer = 0; $('hint').classList.remove('on'); },

    hint(msg) {
      $('hint').textContent = msg;
      $('hint').classList.add('on');
      hintTimer = 9;
    },

    // ---------- Диалоги ----------
    playScene(nodes, onDone) {
      sceneState = { nodes, i: 0, onDone };
      $('dialog').hidden = false;
      this.stepScene();
    },

    stepScene() {
      const st = sceneState;
      if (!st) return;
      while (st.i < st.nodes.length) {
        const n = st.nodes[st.i];
        if (n.if && !n.if()) { st.i++; continue; }
        if (n.end && !n.text && !n.choices) { st.i = st.nodes.length; break; }
        break;
      }
      if (st.i >= st.nodes.length) return this.endScene();
      const n = st.nodes[st.i];
      if (n.do) n.do();
      if (!sceneState) return; // сцена могла закрыться (например, endDay)
      const text = typeof n.text === 'function' ? n.text() : (n.text || '');
      const choices = (n.choices || []).filter((c) => !c.if || c.if());
      if (!text && !choices.length) return this.advance(n);
      $('dlg-who').textContent = n.who || '';
      $('dlg-who').hidden = !n.who;
      $('dlg-text').className = n.who ? '' : 'narr';
      $('dlg-text').textContent = text;
      $('dlg-text').hidden = !text;
      const box = $('dlg-choices');
      box.innerHTML = '';
      if (choices.length) {
        choices.forEach((c, k) => {
          const b = document.createElement('button');
          b.innerHTML = `<span class="k">${k + 1}</span>${esc(c.t)}`;
          b.onclick = () => this.choose(c, n);
          box.appendChild(b);
        });
        $('dlg-next').hidden = true;
      } else $('dlg-next').hidden = false;
      st.choices = choices;
      st.node = n;
    },

    advance(n) {
      const st = sceneState;
      if (!st) return;
      if (n.end) { st.i = st.nodes.length; return this.stepScene(); }
      if (n.next) st.i = st.nodes.findIndex((x) => x.id === n.next); else st.i++;
      if (st.i < 0) st.i = st.nodes.length;
      this.stepScene();
    },

    choose(c, n) {
      G.Audio.click();
      if (c.do) c.do();
      if (!sceneState) return;
      if (c.next) {
        sceneState.i = sceneState.nodes.findIndex((x) => x.id === c.next);
        if (sceneState.i < 0) sceneState.i = sceneState.nodes.length;
        this.stepScene();
      } else this.advance({ next: n.next });
    },

    sceneKey(e) {
      if (!sceneState) return false;
      const st = sceneState;
      if (st.choices && st.choices.length) {
        const k = parseInt(e.key, 10);
        if (k >= 1 && k <= st.choices.length) this.choose(st.choices[k - 1], st.node);
      } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
        this.advance(st.node);
      }
      return true;
    },

    endScene() {
      const cb = sceneState && sceneState.onDone;
      sceneState = null;
      $('dialog').hidden = true;
      if (cb) cb();
    },

    closeScene() { sceneState = null; $('dialog').hidden = true; },

    // ---------- Титульные карточки ----------
    card(title, sub, cb, ms = 3200) {
      $('card-title').textContent = title;
      $('card-sub').textContent = sub || '';
      $('card').hidden = false;
      $('card').classList.remove('out');
      let done = false;
      const fin = () => {
        if (done) return; done = true;
        $('card').classList.add('out');
        setTimeout(() => { $('card').hidden = true; cb && cb(); }, 600);
      };
      $('card').onclick = fin;
      setTimeout(fin, ms);
    },

    death(msg, cb) {
      $('death-text').textContent = msg;
      $('death').hidden = false;
      $('death-btn').onclick = () => { $('death').hidden = true; cb(); };
    },

    // ---------- Ночь ----------
    night(n, cb) {
      const inv = d().inv, P = d().people, hero = d().hero;
      const rows = [];
      rows.push({ id: 'hero', name: 'Илья (ты)', status: heroStatus(), food: true, inhib: !!d().flags.bitten, med: hero.health < 90 && inv.medkit > 0 });
      for (const id of ['lisa', 'sergey', 'kolya', 'dyachkov']) {
        const p = P[id];
        if (!p.alive || !p.here) continue;
        const r = { id, name: p.name, status: personStatus(id, p), food: !p.locked, inhib: false };
        if (id === 'sergey' && !p.locked) r.inhib = true;
        if (id === 'kolya' && p.infected && !p.hidden && !p.locked) r.inhib = true;
        rows.push(r);
      }
      const shelter = n === 1 ? 'Подстанция скорой помощи №2' : 'Подстанция. Вторая ночь';
      $('night-title').textContent = `Ночь ${n}. ${shelter}`;
      $('night-sub').textContent = n === 1 ?
        'Минус тридцать за окном. Печка-буржуйка. Каждому — по пайку, если хватит. Ингибитор тормозит заражение на сутки.' :
        'Ветер воет в воротах гаража. Ресурсов меньше, чем людей. Ингибитор — только тормозит.';
      const tb = $('night-rows');
      tb.innerHTML = '';
      rows.forEach((r) => {
        const tr = document.createElement('div');
        tr.className = 'nrow';
        tr.innerHTML = `<div class="nname">${esc(r.name)}<small>${esc(r.status)}</small></div>
          <label class="nchk ${r.food ? '' : 'na'}"><input type="checkbox" data-k="food" data-id="${r.id}" ${r.food ? '' : 'disabled'}> Паёк</label>
          <label class="nchk ${r.inhib ? '' : 'na'}"><input type="checkbox" data-k="inhib" data-id="${r.id}" ${r.inhib ? '' : 'disabled'}> Ингибитор</label>
          ${r.id === 'hero' ? `<label class="nchk ${r.med ? '' : 'na'}"><input type="checkbox" data-k="med" data-id="hero" ${r.med ? '' : 'disabled'}> Аптечка</label>` : '<span class="nchk na"></span>'}`;
        tb.appendChild(tr);
      });
      const update = () => {
        const used = { food: 0, inhib: 0, med: 0 };
        tb.querySelectorAll('input:checked').forEach((i) => used[i.dataset.k]++);
        const left = { food: inv.food - used.food, inhib: inv.inhib - used.inhib, med: inv.medkit - used.med };
        $('night-res').innerHTML = `Еда: <b>${left.food}</b> &nbsp; Ингибитор: <b>${left.inhib}</b> &nbsp; Аптечки: <b>${left.med}</b>`;
        tb.querySelectorAll('input').forEach((i) => {
          if (!i.checked && i.closest('.nchk').classList.contains('na') === false) i.disabled = left[i.dataset.k] <= 0;
        });
      };
      // По умолчанию — кормим всех, кого можем.
      let food = inv.food;
      tb.querySelectorAll('input[data-k=food]').forEach((i) => { if (!i.disabled && food > 0) { i.checked = true; food--; } });
      tb.onchange = update;
      update();
      $('night').hidden = false;
      $('night-btn').onclick = () => {
        // alloc[id] = true — этому человеку дан ингибитор (hero — сам Илья).
        const alloc = { fed: {} };
        tb.querySelectorAll('input:checked').forEach((i) => {
          if (i.dataset.k === 'food') { alloc.fed[i.dataset.id] = true; inv.food--; }
          if (i.dataset.k === 'inhib') { alloc[i.dataset.id] = true; inv.inhib--; }
          if (i.dataset.k === 'med') { alloc.med = true; inv.medkit--; }
        });
        $('night').hidden = true;
        cb(alloc, rows);
      };
    },

    // ---------- Пауза / дневник ----------
    pause(on) { $('pause').hidden = !on; },

    diary(on) {
      if (on) {
        const list = d().diary.slice().reverse();
        $('diary-list').innerHTML = list.length ? list.map((e) =>
          `<div class="dentry"><span>${e.phase === 'night' ? 'Ночь' : 'День'} ${e.day}</span>${esc(e.text)}</div>`).join('') :
          '<div class="dentry">Пока пусто.</div>';
      }
      $('diary').hidden = !on;
    },

    // ---------- Итоги акта ----------
    summary() {
      const D = d(), A = D.axes, P = D.people;
      const ag = S().aggression();
      const h = [];
      h.push('<h1>Конец Акта I</h1><p class="sub">Три дня. Полярный Яр всё ещё во тьме.</p>');
      h.push('<h2>Твои решения</h2><ul class="dec">');
      for (const x of D.decisions) h.push(`<li><b>${esc(x.title)}:</b> ${esc(x.choice)}<br><small>${esc(x.note)}</small></li>`);
      h.push('</ul>');

      h.push('<h2>Кем ты становишься</h2><ul class="dec">');
      h.push(`<li>${A.humanity > 20 ? 'Ты всё ещё рискуешь собой ради чужих.' : A.humanity < -20 ? 'Ты научился считать людей. Это помогает выжить. Пока.' : 'Ты пока сам не знаешь, на чьей ты стороне.'}</li>`);
      h.push(`<li>${A.cure > 20 ? 'Ты веришь, что «остаточные» всё ещё люди. Что их можно вернуть.' : A.cure < -15 ? 'Для тебя они — угроза. Только угроза.' : 'Ты не знаешь, кто они. Ты стараешься не думать об этом.'}</li>`);
      if (P.lisa.here) h.push(`<li>${A.trust > 15 ? 'Лиза держится рядом с тобой. Она тебе доверяет.' : A.trust < -5 ? 'Лиза тебя боится. Она спит с ножом под подушкой.' : 'Лиза почти не разговаривает. Ждёт, кем ты окажешься.'}</li>`);
      h.push('</ul>');

      h.push('<h2>Они учатся</h2><ul class="dec">');
      h.push(`<li>Убито: <b>${D.kills}</b>. ${ag > 0.45 ? '«Остаточные» стали злее: слышат дальше, бегают быстрее и зовут друг друга. Они научились этому у тебя.' :
        ag < 0.25 ? '«Остаточные» почти не нападают первыми. Но на улицах их становится всё больше.' :
          '«Остаточные» насторожены. Они ещё не решили, кто ты для них.'}</li>`);
      h.push('</ul>');

      h.push('<h2>Кто с тобой</h2><ul class="dec">');
      for (const id of ['lisa', 'sergey', 'kolya', 'dyachkov']) {
        const p = P[id];
        let st;
        if (id === 'sergey' && !p.here) st = 'остался в подъезде на Комбинатской';
        else if (id === 'dyachkov' && !p.here) st = D.flags.copKilled ? 'убит тобой у больницы' : 'бродит у больницы';
        else if (!p.alive) st = 'мёртв';
        else if (p.locked) st = 'заперт — обратился';
        else if (id === 'kolya' && D.flags.kolyaWandering) st = 'ушёл в ночь, обратившись';
        else if (p.infected && id !== 'kolya') st = 'держится на ингибиторе';
        else if (p.infected) st = 'заражён, держится на ингибиторе';
        else st = 'с тобой';
        h.push(`<li><b>${esc(p.name)}</b> — ${st}</li>`);
      }
      const ref = D.flags.refugeesSaved || 0;
      if (ref) h.push(`<li><b>Беженцы</b> — ${ref} из 4 живы</li>`);
      h.push('</ul>');

      h.push('<h2>Что ждёт в Акте II</h2><ul class="dec teaser">');
      if (D.flags.hordeInTown) h.push('<li>Мост цел. Орда с Комбината входит в город. Военные считают тебя врагом.</li>');
      else if (D.flags.refugeesDied) h.push('<li>Мост взорван. Город отрезан от орды — и от всего мира. Военные считают тебя своим.</li>');
      else h.push('<li>Мост взорван. Спасённые беженцы ищут, кому в городе можно верить.</li>');
      if (D.flags.mashaStudied) h.push('<li>Ступина изучает Машу. Слух о лекарстве разойдётся по городу — и не все ему обрадуются.</li>');
      if (D.flags.mashaReleased) h.push('<li>Где-то в городе ходит девочка, которая поёт. Беженцы зовут её «Колыбельной».</li>');
      if (D.flags.sergeyLocked) h.push('<li>Сергей всё ещё стучит в дверь гаража. Лиза верит, что он там.</li>');
      if (D.flags.promisedLisa) h.push('<li>Ты обещал Лизе вернуться за её отцом.</li>');
      if (D.flags.kolyaWandering) h.push('<li>По ночам кто-то заводит брошенные машины скорой.</li>');
      h.push('<li>Вертолётная эвакуация — через 11 дней. Мест не хватит на всех.</li>');
      h.push(`<li>Заражение Ильи: ${Math.round(D.hero.infection)}%. Ингибиторов: ${D.inv.inhib}.</li>`);
      h.push('</ul>');

      h.push('<h2>Дневник</h2>');
      h.push(D.diary.map((e) => `<div class="dentry"><span>${e.phase === 'night' ? 'Ночь' : 'День'} ${e.day}</span>${esc(e.text)}</div>`).join(''));
      $('summary-body').innerHTML = h.join('');
      $('summary').hidden = false;
      $('summary').scrollTop = 0;
    },
  };

  function heroStatus() {
    const h = d().hero;
    const parts = [`здоровье ${Math.round(h.health)}%`];
    if (d().flags.bitten) parts.push(`заражение ${Math.round(h.infection)}%`);
    return parts.join(', ');
  }
  function personStatus(id, p) {
    if (p.locked) return 'заперт';
    const parts = [p.role];
    if (p.hunger > 0) parts.push(p.hunger > 1 ? 'голодает' : 'голоден');
    if (id === 'sergey') parts.push('жар, бред — обращается');
    if (id === 'kolya' && p.infected && !p.hidden) parts.push('укушен');
    if (id === 'kolya' && p.hidden) parts.push('прячет руку');
    return parts.join(', ');
  }
  function fmtTime(t) {
    t = Math.max(0, Math.ceil(t));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  G.UI = UI;
})();
