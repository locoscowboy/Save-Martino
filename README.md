# Save Martino

Co-op boss-rush for Via Falchi Game Night. Phones are controllers, each team watches its own laptop, the TV watches every room. Little Fighter 2 movement: eight directions on a ground plane. Teams of three.

Plan and decisions: https://claude.ai/artifact/DSr6fncsYNN2vMTHdfPqZr

## Layout

```
web/        static site, deployed to Netlify (phone controller, watch page, TV grid)
server/     Node + Socket.IO game server: the only place the game is simulated; server/tools/ holds the dev scripts
content/    roster.json (characters), script.json (story cards and boss lines), sfx.json (sound manifest)
assets/     Jin's sheets (characters/, bosses/), arenas/, sfx/, and sprites/: the atlases cut from the sheets
```

## Run locally

```
cd server && npm install && npm start        # http://localhost:3000
```

The server also serves `web/`, so on the LAN you can skip Netlify: open `http://<laptop-ip>:3000/watch.html` on a laptop and `http://<laptop-ip>:3000/phone.html` on phones. Phones work on a laptop too: arrows/WASD move, space attacks, shift fires the special.

## How a game goes

1. A phone opens `phone.html`, picks a name and a character, and presses **Host a game**. It gets a 4-letter code.
2. Teammates press **Join a game** and type the code, or scan the QR code on the team laptop. Three players per game.
3. The team laptop opens `watch.html` and picks the game from the list (or types the code). It shows the arena, the code and the QR.
4. Everyone presses **I'm ready**; the host presses **Start**. Enter on the watch page also starts the run, for the organiser.
5. Story card → boss, three times. If the whole team is down at once, the boss comes back at its last checkpoint (full, or half once it reached phase 2).
6. Results: time, deaths, wipes, MVP. The lobby comes back for another run.

**Play solo** skips the lobby and starts at once, against a softer boss.

The TV opens `watch.html?room=all`: one cell per live game, keys 1-9 to go full-screen on one, 0 back to the grid.

## Art pipeline

Jin draws one sheet per character and boss (`assets/characters/*_sheet.png`, `assets/bosses/*_sheet.png`): two rows of figures on white with a caption under each. `cd server && npm run sprites` cuts every sheet into a Phaser atlas (`assets/sprites/<id>.png` + `.json`, pivot on the feet) plus portraits (`<id>_front.png`, `martino_hero.png`, `martino_tino.png`). Commit the output. When a sheet changes layout (a fifth figure in a row, a renamed pose) edit `SHEETS` in `server/tools/cut-sheets.mjs`; when a white area sealed inside an outline stays opaque, add a `holes` seed there. `npm run sprites -- jin` does one sheet.

The renderer (`web/js/renderer.js`) maps server animations to frames: players `idle / walk1 walk2 / attack / special / hurt` (down = hurt lying), bosses the same plus `throw`, `defeated`, and `hero` for Martino's intro and windup. Projectiles are still coloured dots.

`npm run shots` (server running, Google Chrome installed) plays a game with scripted phones and screenshots the lobby, a story card, the fight, the phone and the TV grid into `server/shots/`.

## Balance

Boss hp and attack patterns live in `server/game/bosses.js`. `cd server && npm run sim` plays a run with three scripted bots that never dodge and prints the time per boss, deaths and wipes; `npm run sim -- jin oriana` picks the team. Aim for 25-60 s per boss with bots: humans deal less damage and take about twice as long.

## Deploy (Netlify is the event's hosting)

Netlify hosts static files only; it cannot hold a websocket open, so the game server runs on a laptop and the Netlify pages talk to it.

1. Start the server on the TV laptop: `cd server && npm start`.
2. Expose it over HTTPS (Netlify pages are HTTPS, so the socket must be `wss://`):
   `cloudflared tunnel --url http://localhost:3000` prints a `https://xxxx.trycloudflare.com` URL.
3. Open `https://<site>.netlify.app/?server=https://xxxx.trycloudflare.com` on the laptops and the TV. The pages carry the `server` parameter along, and the QR code on each watch page gives it to the phones. Nothing to commit when the tunnel URL changes.
4. `SERVER_URL` in `web/js/config.js` is the fallback when the parameter is missing; leave it empty on the LAN.

Content, arenas and sprites are always fetched from the game server (it sends `Access-Control-Allow-Origin: *`), so Netlify only ever holds `web/`.

If the tunnel misbehaves, the LAN URLs above still work from the server itself.

## Protocol

See `server/PROTOCOL.md`. Rule that never changes: phones send inputs, the server simulates, every screen draws the server's state.
