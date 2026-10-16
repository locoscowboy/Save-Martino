// Headless balance check: scripted bots play one full run. Usage: npm run sim [-- char char ...]
// Bots walk to the boss, attack while in reach and fire their special whenever it is ready; they never dodge.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room } from '../game/room.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const roster = JSON.parse(readFileSync(path.join(ROOT, 'content/roster.json'), 'utf8'));
const script = JSON.parse(readFileSync(path.join(ROOT, 'content/script.json'), 'utf8'));
const chars = process.argv.slice(2).length ? process.argv.slice(2) : ['euge', 'quentin', 'jin'];

const room = new Room('SIM', { roster, script });
chars.forEach((c, i) => { room.addPlayer('p' + i, { name: c, char: c }); room.setReady('p' + i, true); });
room.start();

const DT = 1 / 30, fights = [];
let cur = null, hits = 0;
for (let tick = 0; tick < 30 * 1800 && room.phase !== 'results'; tick++) {
  if (room.phase === 'fight') {
    const b = room.boss;
    if (!cur || cur.boss !== b.id) { cur = { boss: b.id, hp: b.maxHp, from: room.clock, deaths0: deaths(), wipes0: room.wipes }; fights.push(cur); }
    for (const p of room.players.values()) {
      const dx = b.x - p.x, dy = b.y - p.y;
      room.setInput(p.id, { dx: Math.abs(dx) > 70 ? Math.sign(dx) : 0, dy: Math.abs(dy) > 10 ? Math.sign(dy) : 0, attack: Math.abs(dx) < 110 && tick % 10 < 4, special: p.cd <= 0 && Math.abs(dx) < 300 });
    }
    hits += room.step(DT).filter(e => e.type === 'hit').length;
    if (room.boss && room.boss.anim === 'dead' && !cur.to) { cur.to = room.clock; cur.deaths = deaths() - cur.deaths0; cur.wipes = room.wipes - cur.wipes0; }
  } else room.step(DT);
}
function deaths() { return [...room.players.values()].reduce((s, p) => s + p.deaths, 0); }

console.log(`team: ${chars.join(', ')}`);
for (const f of fights) console.log(`  ${f.boss.padEnd(8)} hp ${String(f.hp).padStart(4)}  ${f.to ? (f.to - f.from).toFixed(0).padStart(4) + ' s' : ' n/a'}  deaths ${f.deaths ?? '?'}  wipes ${f.wipes ?? '?'}`);
console.log(room.result ? `  run: ${room.result.time} s of fighting, ${room.result.deaths} deaths, ${room.result.wipes} wipes, MVP ${room.result.mvp}` : `  run not finished (phase ${room.phase})`);
console.log('  damage:', [...room.players.values()].map(p => `${p.char} ${p.dmg}`).join(', '), '· hits taken:', hits);
