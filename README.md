# Save Martino

Co-op boss-rush for Via Falchi Game Night. Phones are controllers, each team watches its own laptop, the TV watches every room. Little Fighter 2 movement: eight directions on a ground plane. Teams of three.

Plan and decisions: https://claude.ai/artifact/DSr6fncsYNN2vMTHdfPqZr

## Layout

```
web/        static site, deployed to Netlify (phone controller, watch page, TV grid)
server/     Node + Socket.IO game server: the only place the game is simulated; server/tools/ holds the dev scripts
content/    roster.json (characters), script.json (story cards and boss lines), sfx.json (sound manifest), music.json (music manifest)
assets/     Jin's sheets (characters/, bosses/), arenas/, sfx/, music/, and sprites/: the atlases cut from the sheets
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

The renderer (`web/js/renderer.js`) maps server animations to frames: players `idle / walk1 walk2 / attack / special / hurt` (down = hurt lying), bosses the same plus `throw`, `defeated`, and `hero` for Martino's intro and windup. The generated boss sheets look left at rest and right in most actions, so each boss frame carries its own `facing` (the `frameFacing` table in the tool) and the renderer flips per pose.

Projectiles come from the same sheets: `PROPS` in the tool cuts the plate, the feather, the baguette chunk, the sauce and the grill into `assets/sprites/props.png`; the pigeon is drawn in code. Anything without a prop falls back to a coloured dot.

`npm run shots` (server running, Google Chrome installed) plays a game with scripted phones and screenshots the lobby, a story card, the fight, the phone and the TV grid into `server/shots/`.

## Sound

`content/sfx.json` lists the clips in `assets/sfx/` (`assets/sfx_fal/` is an alternative generation of the same ids, swap the folder name in `renderer.js` to try it). The team laptop's watch page plays them from the differences between two snapshots (`createSfx` in `renderer.js`): a character's attack or special frame, a landed hit with a random `_b` variant and a ±5 % pitch, the boss' throw/special/hurt/defeat, the story card, the boss intro, the victory fanfare. Volumes follow the manifest's tips: hits 1.0, specials 0.8, UI 0.6. The TV grid is silent. Browsers need one click or key on the page before any sound: the help line in the corner says so until it is unlocked. The phone plays the menu blip on taps.

`content/music.json` lists the background tracks in `assets/music/`: the menu loop in the lobby, one loop per fight, the results track once (`createMusic` in `renderer.js`, volume 0.35). Each track is fetched the first time it is needed, the fight track during the story card before it, so the page never downloads all 10 MB at once. A wipe's retry card keeps the fight music going.

`content/music.json` lists the five background tracks in `assets/music/`: `menu_select` (menu and character select), `fight_nonna`, `fight_peacock`, `fight_martino` (one per story fight) and `results` (the results screen). All are instrumental and meant to loop. They are not wired into the pages yet.

## Balance

Boss hp and attack patterns live in `server/game/bosses.js`. `cd server && npm run sim` plays a run with three scripted bots that never dodge and prints the time per boss, deaths and wipes; `npm run sim -- jin oriana` picks the team. Aim for 25-60 s per boss with bots: humans deal less damage and take about twice as long.

## Deploy

Netlify hosts static files only; it cannot hold a websocket open, so the game server has to run somewhere else and the pages talk to it. Content, arenas, sprites and sounds are always fetched from the game server (it sends `Access-Control-Allow-Origin: *`), so Netlify only ever holds `web/`.

### Online: the server on Render (free, fixed URL)

`render.yaml` describes the service. On render.com: New → Blueprint → this repository → Apply. Render builds `server/` and gives a URL such as `https://save-martino.onrender.com`. That server serves the pages too, so `https://save-martino.onrender.com/phone.html` is the whole game, Netlify or not.

To make the Netlify site use it, put the URL in `SERVER_URL` in `web/js/config.js` and push.

Free instances sleep after 15 minutes without requests and take about a minute to wake up: open the watch page a few minutes before the guests arrive. An open watch page pings the server every 5 minutes to keep it awake.

The blueprint pins the region to Frankfurt; a service created in Oregon (Render's default) adds about 200 ms to every input from Europe, and a region cannot be changed afterwards: delete the service and apply the blueprint again. If the broadcast still stutters on the free plan (shared CPU), the Starter plan is the next step, not Pro.

### At the venue: the server on a laptop

Lower latency and no dependence on the venue's internet: `cd server && npm start` on the TV laptop, then the LAN URLs from "Run locally". To reach that laptop through the Netlify site instead (HTTPS pages need a `wss://` socket):
`cloudflared tunnel --url http://localhost:3000` prints a `https://xxxx.trycloudflare.com` URL; open `https://<site>.netlify.app/?server=https://xxxx.trycloudflare.com`. The pages carry the `server` parameter along and the QR code gives it to the phones, so nothing is committed when the tunnel URL changes. The parameter wins over `SERVER_URL`.

If the tunnel misbehaves, the LAN URLs above still work from the server itself.

## Protocol

See `server/PROTOCOL.md`. Rule that never changes: phones send inputs, the server simulates, every screen draws the server's state.
