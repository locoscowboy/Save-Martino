// Where the game server lives. On the LAN (served by the server itself) leave it empty: the page uses its own origin.
// On Netlify, set it to the cloudflared tunnel URL of the laptop running the server, e.g. 'https://xxxx.trycloudflare.com'.
window.SERVER_URL = '';
window.ROOMS = ['cicchetti', 'bacaro', 'acqua-alta', 'gondola', 'bigoli'];
