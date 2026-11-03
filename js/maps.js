'use strict';
// Карты Акта I. Строятся кодом через MapBuilder; объекты могут иметь условие when(flags, state).
// Типы объектов: infected, npc, item, trigger, interact, door, decor, light.
(function () {
  const MB = G.MapBuilder;
  const S = () => G.State;
  const f = (name) => () => !!S().d.flags[name];
  const nf = (name) => () => !S().d.flags[name];

  const MAPS = {};

  // =====================================================================
  // ДЕНЬ 1 — «Вызов». Двор на Комбинатской, 23:40.
  // =====================================================================
  MAPS.day1 = function () {
    const b = new MB(48, 34, '.');
    b.fill(0, 28, 48, 6, ',');                // дорога
    // Пятиэтажка
    b.room(6, 2, 28, 12, '=');                // x 6..33, y 2..13
    [9, 11, 28, 31].forEach((x) => b.set(x, 13, 'w'));
    [10, 20, 30].forEach((x) => b.set(x, 2, 'w'));
    b.set(19, 13, 'D'); b.set(20, 13, 'D');   // вход в подъезд
    b.vline(14, 3, 10, '#'); b.vline(25, 3, 10, '#');
    b.set(14, 9, 'D');                         // дверь соседа (заперта)
    b.set(25, 10, 'D');                        // дверь квартиры 14
    b.hline(26, 8, 7, '#'); b.set(29, 8, 'D'); // спальня
    b.fill(31, 3, 2, 2, 'b');                  // кровать
    b.set(26, 3, 'b'); b.hline(30, 12, 3, 'b');
    b.hline(7, 3, 3, 'b'); b.set(12, 12, 'b');
    // Гаражи
    b.room(37, 4, 10, 9, '=');                 // x 37..46, y 4..12
    b.set(41, 12, 'D');
    b.set(38, 5, 'b'); b.set(45, 5, 'b');
    // Деревья, скамейки, забор
    [[3, 16], [4, 22], [44, 16], [36, 22], [2, 25], [46, 24], [30, 17]].forEach(([x, y]) => b.set(x, y, 'T'));
    b.hline(12, 24, 2, 'b');
    b.hline(0, 27, 14, '%'); b.hline(24, 27, 12, '%');
    // Машины
    b.fill(3, 29, 4, 2, 'c');                  // скорая
    b.fill(40, 29, 4, 2, 'c');                 // полицейская
    b.fill(18, 31, 3, 2, 'c');                 // брошенная легковушка

    const objects = [
      { type: 'decor', kind: 'ambulance', x: 3, y: 29, w: 4, h: 2 },
      { type: 'decor', kind: 'policecar', x: 40, y: 29, w: 4, h: 2 },
      { type: 'decor', kind: 'car', x: 18, y: 31, w: 3, h: 2, color: '#5a4a3a' },
      { type: 'decor', kind: 'stroller', x: 11, y: 19 },
      { type: 'decor', kind: 'swing', x: 24, y: 18 },
      { type: 'decor', kind: 'stairs', x: 17, y: 3, w: 6, h: 3 },
      { type: 'decor', kind: 'blood', x: 20, y: 11 },
      { type: 'decor', kind: 'blood', x: 27, y: 6 },
      { type: 'decor', kind: 'graffiti', x: 22, y: 12, text: 'КВ 14 →' },
      { type: 'decor', kind: 'sign', x: 16, y: 13, text: 'Подъезд 3' },
      { type: 'light', x: 42, y: 29, r: 5, color: 'police' },
      { type: 'light', x: 20, y: 14.5, r: 3.5, color: '#ffd9a0', flicker: true },
      { type: 'light', x: 5, y: 29.5, r: 3, color: '#cfe8ff' },

      // Люди
      { type: 'npc', id: 'sergey', name: 'Сергей', x: 31, y: 3, color: '#7a8a6a', pose: 'lying', when: nf('sergeyMet') },
      { type: 'npc', id: 'lisa', name: 'Лиза', x: 28, y: 4, color: '#a07890' },
      { type: 'npc', id: 'dyachkov', name: 'Дьячков', x: 38, y: 31, color: '#4a5a8a', pose: 'sit', talk: 'd1_cop' },

      // «Остаточные»
      { type: 'infected', id: 'neighbor', x: 12, y: 9, kind: 'knock', look: 'old', facing: 0,
        lines: ['Откройте... это Пётр Ильич', 'У вас музыка громко...', 'Я в полицию позвоню'] },
      { type: 'infected', x: 10, y: 19, kind: 'rock', look: 'adult', facing: 0,
        lines: ['Тш-ш-ш... спи...', 'Сейчас пойдём домой', 'А-а-а, а-а-а...'] },
      { type: 'infected', x: 18, y: 24, kind: 'sweep', look: 'worker', path: [[18, 24], [32, 24], [32, 21], [18, 21]],
        lines: ['Ходят тут...', 'Опять насвинячили', 'Песком посыпать надо'] },
      { type: 'infected', x: 23, y: 19, kind: 'stand', look: 'adult', facing: -Math.PI / 2,
        lines: ['Выше, Дашенька, выше!', 'Держись крепче'] },
      { type: 'infected', x: 35, y: 31, kind: 'stand', look: 'adult', facing: 0, lines: ['Где мой автобус...'] },
      { type: 'infected', x: 45, y: 30, kind: 'wander', look: 'worker', path: [[45, 30], [45, 33], [36, 33], [36, 30]],
        lines: ['Смена через час', 'Пропуск... где пропуск'] },
      { type: 'infected', x: 42, y: 8, kind: 'stand', look: 'worker', facing: Math.PI / 2,
        lines: ['Карбюратор... опять', 'Ключ на двенадцать подай'] },

      // Двери
      { type: 'door', id: 'door_neighbor', x: 14, y: 9, locked: nf('neighborOut'), prompt: 'Дверь заперта. Изнутри стучат.' },

      // Предметы
      { type: 'item', id: 'd1_bottle1', x: 16, y: 22, item: 'bottle', n: 1 },
      { type: 'item', id: 'd1_bottle2', x: 39, y: 7, item: 'bottle', n: 2 },
      { type: 'item', id: 'd1_food1', x: 44, y: 10, item: 'food', n: 2 },
      { type: 'item', id: 'd1_med1', x: 8, y: 11, item: 'medkit', n: 1 },
      { type: 'item', id: 'd1_food2', x: 27, y: 11, item: 'food', n: 1 },

      // Триггеры и взаимодействия
      { type: 'trigger', id: 't_stairs', x: 18, y: 11, w: 4, h: 2, scene: 'd1_stairs' },
      { type: 'trigger', id: 't_bedroom', x: 27, y: 3, w: 4, h: 5, scene: 'd1_sergey' },
      { type: 'interact', id: 'i_ambulance', x: 7.5, y: 30, r: 1.6, prompt: 'Скорая — Коля',
        scene: () => (S().d.flags.sergeyMet ? 'd1_stretcher' : 'd1_kolya_wait') },
    ];

    return {
      name: 'День 1. Вызов',
      sub: 'Полярный Яр, ул. Комбинатская, 23:40',
      rows: b.rows(), spawn: { x: 8.5, y: 31.5 }, objects,
      outdoor: true, intro: 'd1_intro',
      objective: 'Подняться в квартиру 14 (подъезд 3)',
    };
  };

  // =====================================================================
  // ДЕНЬ 2 — «Больница». Городская больница №1.
  // =====================================================================
  MAPS.day2 = function () {
    const b = new MB(56, 40, '.');
    b.fill(0, 31, 56, 9, ',');                 // парковка
    b.room(4, 2, 48, 28, 't');                 // x 4..51, y 2..29
    for (let x = 8; x < 50; x += 5) if (x < 25 || x > 30) b.set(x, 29, 'w');
    b.set(27, 29, 'D'); b.set(28, 29, 'D');    // главный вход
    // Коридор
    b.hline(5, 19, 46, '#'); b.set(27, 19, 'D'); b.set(28, 19, 'D'); b.set(10, 19, 'D'); b.set(46, 19, 'D');
    b.hline(5, 14, 46, '#');
    // Палаты над коридором
    b.vline(15, 3, 11, '#'); b.vline(26, 3, 11, '#'); b.vline(37, 3, 11, '#');
    b.set(10, 14, 'D'); // аптека
    b.set(21, 14, 'D'); // детское
    b.set(32, 14, 'D'); // ординаторская
    b.set(44, 14, 'D'); // реанимация
    // Мебель
    b.hline(5, 3, 10, 'b');                    // стеллажи аптеки
    b.hline(5, 8, 4, 'b'); b.hline(11, 8, 4, 'b');
    [[17, 4], [17, 8], [23, 4], [23, 8], [17, 11], [23, 11]].forEach(([x, y]) => b.set(x, y, 'b')); // детские кровати
    b.fill(29, 7, 4, 2, 'b');                  // стол ординаторской
    [[39, 4], [42, 4], [48, 4], [39, 10], [48, 10]].forEach(([x, y]) => b.set(x, y, 'b')); // койки реанимации
    // Холл
    b.hline(21, 23, 5, 'b'); b.hline(30, 23, 5, 'b'); // стойка регистратуры
    b.vline(13, 20, 9, '#'); b.set(13, 24, 'D'); // приёмный покой
    b.vline(42, 20, 9, '#'); b.set(42, 25, 'D'); // гардероб
    b.hline(44, 21, 6, 'b');
    [[7, 21], [7, 25]].forEach(([x, y]) => b.set(x, y, 'b'));
    b.set(36, 26, 'b'); b.set(18, 26, 'b');
    // Парковка
    b.fill(8, 34, 5, 2, 'c'); b.fill(16, 35, 3, 2, 'c'); b.fill(38, 34, 3, 2, 'c'); b.fill(45, 36, 5, 2, 'c');
    [[2, 33], [53, 33], [2, 38]].forEach(([x, y]) => b.set(x, y, 'T'));

    const tookSergey = () => !!S().d.flags.tookSergey;
    const lowAggr = () => S().aggression() < 0.35;

    const objects = [
      { type: 'decor', kind: 'ambulance', x: 45, y: 36, w: 5, h: 2 },
      { type: 'decor', kind: 'car', x: 8, y: 34, w: 5, h: 2, color: '#3e4a52' },
      { type: 'decor', kind: 'car', x: 16, y: 35, w: 3, h: 2, color: '#6a3a32' },
      { type: 'decor', kind: 'car', x: 38, y: 34, w: 3, h: 2, color: '#40444a' },
      { type: 'decor', kind: 'sign', x: 25, y: 30, text: 'ГОРОДСКАЯ БОЛЬНИЦА №1' },
      { type: 'decor', kind: 'sign', x: 8, y: 13, text: 'Аптека' },
      { type: 'decor', kind: 'sign', x: 18, y: 13, text: 'Детское' },
      { type: 'decor', kind: 'sign', x: 29, y: 13, text: 'Ординаторская' },
      { type: 'decor', kind: 'sign', x: 40, y: 13, text: 'Реанимация' },
      { type: 'decor', kind: 'graffiti', x: 30, y: 17, text: 'НЕ ВХОДИТЬ — ОНИ ПОМНЯТ' },
      { type: 'decor', kind: 'graffiti', x: 20, y: 6, text: 'мама скоро придёт' },
      { type: 'decor', kind: 'blood', x: 28, y: 21 }, { type: 'decor', kind: 'blood', x: 9, y: 23 },
      { type: 'decor', kind: 'blood', x: 33, y: 16 }, { type: 'decor', kind: 'body', x: 47, y: 16 },
      { type: 'decor', kind: 'patient', x: 39, y: 4 }, { type: 'decor', kind: 'patient', x: 42, y: 4 },
      { type: 'decor', kind: 'patient', x: 48, y: 4 },
      { type: 'light', x: 44, y: 7, r: 5, color: '#ff8080', flicker: true },
      { type: 'light', x: 27.5, y: 31, r: 4, color: '#cfe8ff', flicker: true },
      { type: 'light', x: 47, y: 35, r: 3, color: '#cfe8ff' },
      { type: 'light', x: 20, y: 7, r: 2.5, color: '#ffe0a0', flicker: true },

      // Люди
      { type: 'npc', id: 'stupina', name: 'Д-р Ступина', x: 45, y: 7, color: '#d8d8d0', talk: 'd2_stupina' },

      // Маша — пассивная «остаточная»
      { type: 'infected', id: 'masha', x: 20, y: 7, kind: 'sit', look: 'child', passive: true, hp: 1,
        lines: ['Баю-баюшки-баю...', 'Мама, ты где?', 'Не ложися на краю...'],
        onDeath: () => { if (!S().d.flags.mashaChoice) G.Story.mashaKilledInFight(); } },

      // «Остаточные» больницы
      { type: 'infected', x: 27, y: 21, kind: 'stand', look: 'worker', facing: Math.PI / 2,
        lines: ['Пропуск покажите', 'Посещения до семи', 'Бахилы наденьте'] },
      { type: 'infected', x: 35, y: 25, kind: 'sit', look: 'old', lines: ['Сестра... сестра...', 'Мне укол не сделали'] },
      { type: 'infected', x: 8, y: 16, kind: 'pace', look: 'nurse', path: [[8, 16], [48, 16]],
        lines: ['Сейчас, сейчас, капельницу...', 'Больной, вернитесь в палату', 'Давление померяем'] },
      { type: 'infected', x: 20, y: 27, kind: 'wander', look: 'adult', path: [[20, 27], [38, 27], [38, 21], [20, 21]],
        lines: ['Мне только спросить', 'Кто последний?'] },
      { type: 'infected', x: 9, y: 22, kind: 'sit', look: 'adult', lines: ['Долго ещё ждать?'] },
      { type: 'infected', x: 10, y: 27, kind: 'stand', look: 'adult', lines: ['Я по записи'] },
      { type: 'infected', x: 47, y: 23, kind: 'knock', look: 'old', facing: 0, lines: ['Номерок не теряйте'] },
      { type: 'infected', x: 8, y: 6, kind: 'pace', look: 'nurse', path: [[7, 6], [13, 6]],
        lines: ['Без рецепта не отпускаем', 'Этого нет, ждите поставку'] },
      { type: 'infected', x: 34, y: 10, kind: 'stand', look: 'nurse', facing: Math.PI,
        lines: ['Обход в восемь', 'Кто взял мою кружку?'] },
      { type: 'infected', x: 30, y: 36, kind: 'stand', look: 'adult', lines: ['Такси... я вызывал такси'] },

      // Дьячков — если его бросили в День 1
      { type: 'infected', id: 'cop', x: 24, y: 33, kind: 'pace', look: 'cop', path: [[24, 33], [32, 33]], hp: 4,
        when: tookSergey, drop: { item: 'pistol', n: 6 },
        lines: ['Проезжаем! Не задерживаемся!', 'Документы...', 'Не бросай меня, док...', 'Нога... нога...'],
        onDeath: () => G.Story.copKilled() },

      // Доп. «остаточные» — если игрок щадит их, их становится больше
      { type: 'infected', x: 12, y: 37, kind: 'stand', look: 'adult', when: lowAggr, extra: true, lines: ['Холодно...'] },
      { type: 'infected', x: 40, y: 17, kind: 'stand', look: 'nurse', when: lowAggr, extra: true, lines: ['Тише, тише'] },
      { type: 'infected', x: 22, y: 25, kind: 'sit', look: 'old', when: lowAggr, extra: true, lines: ['Внучек придёт'] },

      // Двери
      { type: 'door', id: 'door_pharmacy', x: 10, y: 14, locked: nf('pharmacyKey'), prompt: 'Аптека заперта. Ключ — у врача?' },
      { type: 'door', id: 'door_kids', x: 21, y: 14, locked: nf('kidsOpen'), prompt: 'Отодвинуть стул', scene: 'd2_masha_door' },
      { type: 'door', id: 'door_icu', x: 44, y: 14, locked: nf('icuOpen'), prompt: 'Постучать в реанимацию', scene: 'd2_icu_door' },

      // Предметы
      { type: 'item', id: 'd2_inhib', x: 7, y: 4, item: 'inhib', n: 3, onPick: () => S().flag('gotInhib', true) },
      { type: 'item', id: 'd2_med1', x: 12, y: 4, item: 'medkit', n: 1 },
      { type: 'item', id: 'd2_ammo', x: 30, y: 5, item: 'ammo', n: 4 },
      { type: 'item', id: 'd2_food', x: 35, y: 11, item: 'food', n: 2 },
      { type: 'item', id: 'd2_bottle', x: 19, y: 25, item: 'bottle', n: 2 },
      { type: 'item', id: 'd2_med2', x: 6, y: 27, item: 'medkit', n: 1 },
      { type: 'item', id: 'd2_food2', x: 48, y: 27, item: 'food', n: 1 },

      // Сцены
      { type: 'trigger', id: 't_masha', x: 16, y: 9, w: 10, h: 4, scene: 'd2_masha', when: f('kidsOpen') },
      { type: 'trigger', id: 't_corridor', x: 26, y: 15, w: 4, h: 4, scene: 'd2_corridor' },
      { type: 'interact', id: 'i_exit2', x: 44, y: 37, r: 1.8, prompt: 'Скорая — уезжать', scene: 'd2_exit' },
    ];

    return {
      name: 'День 2. Больница',
      sub: 'Городская больница №1, 10:15. Солнце не взойдёт до февраля.',
      rows: b.rows(), spawn: { x: 42.5, y: 37.5 }, objects,
      outdoor: true, intro: 'd2_intro',
      objective: 'Найти ингибиторы (аптека на втором этаже — корпус слева)',
    };
  };

  // =====================================================================
  // ДЕНЬ 3 — «Мост». Мост через реку Яр.
  // =====================================================================
  MAPS.day3 = function () {
    const W = 72, H = 30;
    const b = new MB(W, H, '.');
    b.fill(18, 0, 38, H, '~');                 // река
    b.fill(15, 12, 44, 6, '_');                // настил моста y 12..17
    b.hline(18, 11, 38, '%'); b.hline(18, 18, 38, '%');
    b.fill(0, 12, 18, 6, ','); b.fill(58, 12, 14, 6, ','); // дороги
    // Дома левого берега
    b.room(1, 1, 8, 8, '='); b.set(5, 8, 'D'); b.set(1, 4, 'w');
    b.room(10, 2, 6, 7, '='); b.set(12, 8, 'D');
    b.room(1, 20, 9, 8, '='); b.set(5, 20, 'D');
    b.room(11, 21, 6, 6, '='); b.set(13, 21, 'D');
    b.set(3, 3, 'b'); b.set(14, 4, 'b'); b.set(7, 25, 'b');
    // Блокпост
    b.vline(15, 9, 3, 's'); b.vline(15, 18, 3, 's');
    // Машины на мосту
    b.fill(24, 12, 3, 2, 'c'); b.fill(38, 15, 3, 2, 'c'); b.fill(47, 12, 3, 2, 'c'); b.fill(31, 16, 2, 2, 'c');
    // Правый берег
    b.fill(60, 13, 6, 3, 'c');                 // автобус
    [[60, 4], [66, 8], [63, 22], [69, 25], [58, 26]].forEach(([x, y]) => b.set(x, y, 'T'));
    [[4, 17], [9, 11]].forEach(([x, y]) => b.set(x, y, 'T'));

    const released = () => !!S().d.flags.mashaReleased;

    const objects = [
      { type: 'decor', kind: 'car', x: 24, y: 12, w: 3, h: 2, color: '#4a3a3a' },
      { type: 'decor', kind: 'car', x: 38, y: 15, w: 3, h: 2, color: '#3a4a3a' },
      { type: 'decor', kind: 'car', x: 47, y: 12, w: 3, h: 2, color: '#44444c' },
      { type: 'decor', kind: 'car', x: 31, y: 16, w: 2, h: 2, color: '#5a5040' },
      { type: 'decor', kind: 'bus', x: 60, y: 13, w: 6, h: 3 },
      { type: 'decor', kind: 'sandbags', x: 15, y: 9 },
      { type: 'decor', kind: 'charges', x: 20, y: 11 }, { type: 'decor', kind: 'charges', x: 20, y: 18 },
      { type: 'decor', kind: 'body', x: 36, y: 14, id: 'sapper_body' },
      { type: 'decor', kind: 'graffiti', x: 2, y: 15, text: 'ЭВАКУАЦИЯ — ЧЕРЕЗ МОСТ НЕТ' },
      { type: 'decor', kind: 'sign', x: 56, y: 11, text: 'Яр-Комбинат 4 км' },
      { type: 'light', x: 13, y: 15, r: 5, color: '#ffb060', flicker: true },  // бочка с огнём
      { type: 'light', x: 62, y: 16.5, r: 4, color: '#ffe0a0' },              // фары автобуса
      { type: 'light', x: 36, y: 10, r: 3, color: '#a0c0ff' },

      { type: 'npc', id: 'grachev', name: 'Майор Грачёв', x: 12, y: 13, color: '#556b3a', talk: 'd3_grachev' },
      { type: 'npc', id: 'soldier1', name: 'Рядовой', x: 14, y: 10, color: '#4d5e36', talk: 'd3_soldier' },
      { type: 'npc', id: 'soldier2', name: 'Рядовой', x: 14, y: 19, color: '#4d5e36', talk: 'd3_soldier' },

      // Беженцы
      { type: 'npc', id: 'ref1', name: 'Беженка с ребёнком', x: 59, y: 16, color: '#8a7060', refugee: true, talk: 'd3_refugee' },
      { type: 'npc', id: 'ref2', name: 'Старик', x: 61, y: 17, color: '#7a7a6a', refugee: true, talk: 'd3_refugee' },
      { type: 'npc', id: 'ref3', name: 'Водитель автобуса', x: 63, y: 16, color: '#6a6a80', refugee: true, talk: 'd3_refugee' },
      { type: 'npc', id: 'ref4', name: 'Парень', x: 64, y: 17, color: '#806a5a', refugee: true, talk: 'd3_refugee' },

      // Маша — если её выпустили
      { type: 'infected', id: 'masha', x: 62, y: 19, kind: 'sit', look: 'child', passive: true, hp: 1, when: released,
        lines: ['Баю-баюшки-баю...', 'Не бойтесь...', 'Придёт серенький волчок...'] },

      // «Остаточные» левого берега
      { type: 'infected', x: 2, y: 10, kind: 'wander', look: 'worker', path: [[2, 10], [8, 10]],
        lines: ['Нам обещали автобусы', 'Пропустите!'] },
      { type: 'infected', x: 4, y: 24, kind: 'stand', look: 'old', lines: ['Где мой кот...'] },
      { type: 'infected', x: 13, y: 24, kind: 'knock', look: 'adult', facing: 0, lines: ['Открывай, это я'] },
      // На мосту
      { type: 'infected', x: 28, y: 14, kind: 'stand', look: 'adult', facing: 0, lines: ['Клюёт... клюёт...'] },
      { type: 'infected', x: 34, y: 13, kind: 'pace', look: 'worker', path: [[33, 13], [33, 16]], lines: ['Пробка... опять пробка'] },
      { type: 'infected', x: 42, y: 16, kind: 'sit', look: 'adult', lines: ['Не заводится...'] },
      { type: 'infected', x: 45, y: 14, kind: 'stand', look: 'adult', facing: Math.PI, lines: ['Мы почти доехали'] },
      { type: 'infected', x: 52, y: 15, kind: 'wander', look: 'worker', path: [[52, 13], [52, 16], [55, 16], [55, 13]],
        lines: ['Смену не сдал...'] },
      { type: 'infected', x: 21, y: 16, kind: 'stand', look: 'adult', when: () => S().aggression() < 0.35, extra: true,
        lines: ['Холодная вода...'] },

      // Блок прохода на мост до разговора с Грачёвым
      { type: 'door', id: 'barrier', x: 16, y: 12, h: 6, kind: 'barrier', locked: nf('grachevBriefed'),
        prompt: 'Шлагбаум. Сначала — к майору.' },

      // Предметы
      { type: 'item', id: 'd3_ammo', x: 3, y: 5, item: 'ammo', n: 3 },
      { type: 'item', id: 'd3_med', x: 13, y: 5, item: 'medkit', n: 1 },
      { type: 'item', id: 'd3_bottle', x: 3, y: 22, item: 'bottle', n: 2 },
      { type: 'item', id: 'd3_food', x: 14, y: 25, item: 'food', n: 2 },
      { type: 'item', id: 'd3_inhib', x: 7, y: 26, item: 'inhib', n: 1 },

      { type: 'trigger', id: 't_grachev', x: 10, y: 12, w: 4, h: 6, scene: 'd3_grachev' },
      { type: 'interact', id: 'i_detonator', x: 36.5, y: 14.5, r: 1.4, prompt: 'Подрывная машинка', scene: 'd3_detonator',
        when: () => f('grachevBriefed')() && !S().d.flags.bridgeChoice },
    ];

    return {
      name: 'День 3. Мост',
      sub: 'Мост через Яр, 14:30. Сумерки, как и всё время.',
      rows: b.rows(), spawn: { x: 2.5, y: 15.5 }, objects,
      outdoor: true, intro: 'd3_intro',
      objective: 'Добраться до блокпоста у моста',
      bridge: { x0: 16, x1: 57 },
    };
  };

  G.Maps = MAPS;
})();
