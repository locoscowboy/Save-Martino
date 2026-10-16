// Where the game server lives.
// On the LAN the server serves these pages itself: leave SERVER_URL empty and the page uses its own origin.
// On Netlify the pages carry the server in the URL instead (?server=https://xxxx.trycloudflare.com): the QR code on
// the watch page fills it in for the phones, and the TV/laptop pages pass it along. SERVER_URL is only the fallback.
window.SERVER_URL = '';
window.SERVER = (function () {
  const q = new URLSearchParams(location.search).get('server');
  try {
    if (q) { sessionStorage.setItem('sm-server', q); return q.replace(/\/$/, ''); }
    const saved = sessionStorage.getItem('sm-server'); if (saved) return saved;
  } catch (e) {}
  return window.SERVER_URL || location.origin;
})();
// Query string that carries the server to another page of this site when it is not the page's own origin.
window.SERVER_QS = window.SERVER === location.origin ? '' : '&server=' + encodeURIComponent(window.SERVER);
