// Screenshots of the real pages in headless Chrome while scripted phones play: the lobby, a story card, the fight, the phone.
// Usage: npm start in another terminal, then npm run shots [-- http://localhost:3000 outdir]
import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const URL = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || path.join(process.cwd(), 'shots');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const once = (s, ev) => new Promise(r => s.once(ev, r));

// three phones: host, two teammates
const phones = [['Quentin', 'quentin'], ['Jin', 'jin'], ['Euge', 'euge']].map(([name, char]) => ({ name, char, s: io(URL, { transports: ['websocket'] }) }));
await Promise.all(phones.map(p => once(p.s, 'connect')));
phones[0].s.emit('host', { name: phones[0].name, char: phones[0].char });
const { room: code } = await once(phones[0].s, 'joined');
for (const p of phones.slice(1)) { p.s.emit('join', { room: code, name: p.name, char: p.char }); await once(p.s, 'joined'); }
console.log('game', code);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const shot = async (url, file, { width = 1280, height = 720, mobile = false, wait = 2500 } = {}) => {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  page error:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('  console:', m.text()); });
  page.on('response', r => { if (r.status() >= 400) console.log(`  ${r.status()} ${r.url()}`); });
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await page.goto(url, { waitUntil: 'load' });
  await sleep(wait);
  await page.screenshot({ path: path.join(OUT, file) });
  console.log('  shot', file);
  return page;
};

await shot(`${URL}/phone.html?room=${code}`, 'phone-join.png', { width: 390, height: 844, mobile: true });
const watch = await shot(`${URL}/watch.html?room=${code}`, 'watch-lobby.png', { wait: 4000 });

for (const p of phones) p.s.emit('ready', { ready: true });
await sleep(400);
phones[0].s.emit('start');
await sleep(1500);
await watch.screenshot({ path: path.join(OUT, 'watch-story.png') }); console.log('  shot watch-story.png');

// walk toward the boss and mash: the fight begins after the 7 s story card
const tick = setInterval(() => { for (const p of phones) p.s.emit('input', { dx: 1, dy: Math.random() < 0.3 ? 0.5 : 0, attack: Math.random() < 0.5, special: Math.random() < 0.2 }); }, 50);
await sleep(9000);
await watch.screenshot({ path: path.join(OUT, 'watch-fight-1.png') }); console.log('  shot watch-fight-1.png');
await sleep(6000);
await watch.screenshot({ path: path.join(OUT, 'watch-fight-2.png') }); console.log('  shot watch-fight-2.png');
clearInterval(tick);
await shot(`${URL}/phone.html`, 'phone-pad.png', { width: 844, height: 390, mobile: true, wait: 1500 }).catch(() => {});
await shot(`${URL}/watch.html?room=all`, 'tv-grid.png', { wait: 5000 });

await browser.close();
for (const p of phones) p.s.disconnect();
console.log('done:', OUT);
process.exit(0);
