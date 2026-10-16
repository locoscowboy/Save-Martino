# Save Martino

Co-op boss-rush for Via Falchi Game Night. Phones are controllers, each team watches its own laptop, the TV watches every room. Little Fighter 2 movement: eight directions on a ground plane.

Plan and decisions: https://claude.ai/artifact/DSr6fncsYNN2vMTHdfPqZr

## Layout

```
web/        static site, deployed to Netlify (phone controller, watch page, TV grid)
server/     Node + Socket.IO game server: the only place the game is simulated
content/    roster.json (characters), script.json (story cards and boss lines)
assets/     sprites and arenas (placeholders until the art lands)
```

## Run locally

```
cd server && npm install && npm start        # http://localhost:3000
```

The server also serves `web/`, so on the LAN you can skip Netlify: open `http://<laptop-ip>:3000/watch.html?room=bacaro` on a laptop and `http://<laptop-ip>:3000/phone.html?room=bacaro` on phones.

## Deploy (Netlify is the event's hosting)

Netlify hosts static files and serverless functions only; it cannot hold a websocket open, so the game server runs on a laptop and the Netlify site talks to it.

1. Start the server on the TV laptop: `cd server && npm start`.
2. Expose it over HTTPS (Netlify pages are HTTPS, so the socket must be `wss://`):
   `cloudflared tunnel --url http://localhost:3000` prints a `https://xxxx.trycloudflare.com` URL.
3. Put that URL in `web/js/config.js` (`SERVER_URL`), commit, push. Netlify deploys `web/` (see `netlify.toml`).
4. Phones open `https://<site>.netlify.app/phone.html?room=bacaro`, laptops `watch.html?room=bacaro`, TV `watch.html?room=all`.

If the tunnel misbehaves, the LAN URLs above still work from the server itself.

## Rooms

One room per team, created on first join. Room names are the team slugs: `cicchetti`, `bacaro`, `acqua-alta`, `gondola`, `bigoli`. Any phone in the room can press Start; the watch page shows the QR for its room.

## Protocol

See `server/PROTOCOL.md`. Rule that never changes: phones send inputs, the server simulates, every screen draws the server's state.
