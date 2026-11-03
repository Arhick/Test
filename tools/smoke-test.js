// Сквозной прогон Акта I в headless Chromium: все дни, ночи, финал. Ловит ошибки JS.
// Запуск: node tools/smoke-test.js [папка_для_скриншотов] [вариант: sergey|cop|both]
const { chromium } = require('playwright');
const path = require('path');

const outDir = process.argv[2] || path.join(__dirname, '..', 'screens');
const variant = process.argv[3] || 'sergey';
const fs = require('fs');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  const shot = (n) => page.screenshot({ path: path.join(outDir, `${variant}-${n}.png`) });
  const wait = (ms) => page.waitForTimeout(ms);
  const skipCard = async () => { if (await page.isVisible('#card')) { await page.click('#card'); await wait(800); } };
  // Пролистать сцену: выбирать варианты по очереди из списка picks
  const runScene = async (picks = []) => {
    for (let i = 0; i < 40; i++) {
      if (!(await page.isVisible('#dialog'))) return;
      const nChoices = await page.locator('#dlg-choices button').count();
      if (nChoices) {
        const k = picks.length ? picks.shift() : 1;
        await page.keyboard.press(String(Math.min(k, nChoices)));
      } else await page.keyboard.press('Space');
      await wait(60);
    }
  };
  const tp = (x, y) => page.evaluate(([x, y]) => { G.Game.player.x = x; G.Game.player.y = y; }, [x, y]);
  const god = () => page.evaluate(() => { G.Game.godMode = true; });

  await shot('00-menu');
  await page.click('#btn-new');
  await wait(400);
  await skipCard();
  await runScene();
  await god();
  await page.mouse.move(900, 300);
  await wait(1500);
  await shot('01-day1-start');

  // День 1: в спальню к Сергею
  await tp(28.5, 6.5); await wait(300);
  await shot('02-day1-sergey');
  await runScene([1]);
  await wait(500);
  await shot('03-day1-after-bite');
  // к Дьячкову
  await tp(38.5, 30); await wait(200);
  await page.keyboard.press('KeyE'); await wait(100);
  await runScene([2]);
  // к скорой с последователями
  await page.evaluate(() => { for (const n of G.Game.npcs) if (n.follow) { n.x = 9; n.y = 31; } });
  await tp(8.2, 30.6); await wait(300);
  await page.keyboard.press('KeyE'); await wait(100);
  const pick = { sergey: 1, cop: 2, both: 3 }[variant];
  await runScene([pick]);
  await wait(500);
  await skipCard();
  await wait(300);
  await shot('04-night1');
  await page.click('#night-btn');
  await wait(200);
  await runScene([2, 1, 1, 1]);
  await wait(300);
  await skipCard();
  await runScene();
  await god();
  await wait(1200);
  await shot('05-day2-start');

  // День 2: реанимация → Ступина → аптека → Маша → выход
  await tp(44.5, 15.5); await wait(100);
  await page.keyboard.press('KeyE'); await wait(100); await runScene([1]);
  await tp(44.5, 8.5); await wait(100);
  await page.keyboard.press('KeyE'); await wait(100); await runScene([1]);
  await tp(7.5, 4.5); await wait(300);
  await shot('06-day2-pharmacy');
  await tp(21.5, 15.5); await wait(100);
  await page.keyboard.press('KeyE'); await wait(100); await runScene([1]);
  await tp(21.5, 12.5); await wait(300);
  await shot('07-day2-masha');
  await runScene([3]); // выпустить
  await wait(300);
  await tp(44.5, 37.5); await wait(200);
  await page.keyboard.press('KeyE'); await wait(100); await runScene([2]);
  await wait(400);
  await skipCard();
  await shot('08-night2');
  await page.click('#night-btn');
  await wait(200);
  await runScene([2, 1, 1, 1]);
  await wait(300);
  await skipCard();
  await runScene();
  await god();
  await wait(1200);
  await shot('09-day3-start');

  // День 3: Грачёв → детонатор → проводить беженцев
  await tp(11.5, 15.5); await wait(300); await runScene([2]);
  await tp(36.5, 15.2); await wait(200);
  await page.keyboard.press('KeyE'); await wait(100);
  await runScene([2]);
  await wait(2000);
  await shot('10-day3-escort');
  // Расчищаем путь и ускоряем
  await page.evaluate(() => { for (const e of G.Game.infected) if (!e.passive) e.dead = true; G.Game.hordeOn = false; });
  await tp(12.5, 15.5);
  await wait(9000);
  const st = await page.evaluate(() => ({ saved: G.Game.escortSaved(), x: G.Game.npcs.filter((n) => n.refugee).map((n) => n.x.toFixed(1)) }));
  console.log('Беженцы:', JSON.stringify(st));
  await page.evaluate(() => { if (G.Game.timer) G.Game.timer = 0.1; });
  await wait(600);
  await runScene();
  await wait(3800);
  await shot('11-summary');
  const sum = await page.textContent('#summary-body').catch(() => '');
  console.log('Итоги (начало):', (sum || '').slice(0, 400).replace(/\s+/g, ' '));
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'Ошибок JS нет');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
