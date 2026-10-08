// Kitnet 47 — servidor multiplayer local, sem dependências.
// Serve o jogo e sincroniza salas via Server-Sent Events + POST.
//   node server.js            (porta 8047)
//   PORT=9000 node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = +process.env.PORT || 8047;
const ROOT = __dirname;
const GAME = path.join(ROOT, "kitnet.html");
const DATA_DIR = path.join(ROOT, "data");
const FONTS = path.join(ROOT, "fonts");
const DATA = path.join(DATA_DIR, "rooms.json");
const CODE_RE = /^[A-Z0-9]{3,6}$/;
const KINDS = new Set(["join", "start", "ready", "tap", "act", "chat"]);
const MAX_EVENTS = 6000;

// rooms[code] = { created, events: [] }
let rooms = {};
try { rooms = JSON.parse(fs.readFileSync(DATA, "utf8")); } catch (e) { rooms = {}; }
const ids = {};
for (const [c, r] of Object.entries(rooms)) ids[c] = new Set(r.events.map(e => e.id));

// live[code] = { clients: Set<{res, pk}>, pres: { pk: {nick,color,view,at,ts} } }
const live = {};
const liveRoom = c => (live[c] ||= { clients: new Set(), pres: {} });
const room = c => {
  if (!rooms[c]) { rooms[c] = { created: Date.now(), events: [] }; ids[c] = new Set(); }
  return rooms[c];
};

let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFile(DATA, JSON.stringify(rooms), err => err && console.error("save:", err.message));
  }, 800);
}

function sse(res, event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
function peersOf(c) {
  const L = liveRoom(c);
  const online = new Set([...L.clients].map(x => x.pk));
  return Object.entries(L.pres).map(([pk, p]) => ({ pk, ...p, online: online.has(pk) }));
}
const peerTimers = {};
function broadcastPeers(c) {
  if (peerTimers[c]) return;
  peerTimers[c] = setTimeout(() => {
    peerTimers[c] = null;
    const list = peersOf(c);
    for (const cl of liveRoom(c).clients) sse(cl.res, "peers", list);
  }, 80);
}

function validEvent(e) {
  return e && typeof e === "object" && typeof e.id === "string" && e.id.length < 48 &&
    typeof e.p === "string" && e.p.length < 64 && typeof e.ts === "number" && isFinite(e.ts) && KINDS.has(e.k);
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", ch => { size += ch.length; if (size > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(ch); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

// The artifact file has no <html>/<head>; wrap it into a full document when serving.
function gamePage() {
  const body = fs.readFileSync(GAME, "utf8");
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n' +
    body + "\n</body></html>";
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  // works both behind the /escape proxy (prefix stripped) and opened directly with /escape
  if (url.pathname === "/escape") { res.writeHead(308, { Location: "/escape/" + url.search }); return res.end(); }
  if (url.pathname.startsWith("/escape/")) url.pathname = url.pathname.slice(7);
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    try {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(gamePage());
    } catch (e) { res.writeHead(500); return res.end("kitnet.html não encontrado"); }
  }
  if (url.pathname === "/api/ping") return json(res, 200, { kitnet: 1, now: Date.now() });

  if (parts[0] === "fonts" && parts.length === 2 && /^[a-z0-9-]+\.woff2$/.test(parts[1])) {
    return fs.readFile(path.join(FONTS, parts[1]), (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": "font/woff2", "Cache-Control": "public, max-age=604800" });
      res.end(buf);
    });
  }

  if (parts[0] === "api" && parts[1] === "rooms" && !parts[2] && req.method === "GET") {
    return json(res, 200, Object.entries(rooms).map(([code, r]) => ({ code, created: r.created, events: r.events.length })));
  }

  if (parts[0] === "api" && parts[1] === "rooms" && parts[2]) {
    const code = parts[2].toUpperCase();
    if (!CODE_RE.test(code)) return json(res, 400, { error: "código inválido" });
    const action = parts[3] || "";

    if (req.method === "GET" && action === "stream") {
      const pk = String(url.searchParams.get("pk") || "").slice(0, 64);
      if (!pk) return json(res, 400, { error: "pk obrigatório" });
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write("retry: 1500\n\n");
      const L = liveRoom(code);
      const client = { res, pk };
      L.clients.add(client);
      sse(res, "init", { events: room(code).events, peers: peersOf(code) });
      broadcastPeers(code);
      const ka = setInterval(() => res.write(": ka\n\n"), 20000);
      req.on("close", () => { clearInterval(ka); L.clients.delete(client); broadcastPeers(code); });
      return;
    }

    if (req.method === "GET" && action === "") return json(res, 200, { code, ...(rooms[code] || { events: [] }) });

    if (req.method === "POST" && action === "ev") {
      let e; try { e = await readBody(req); } catch (err) { return json(res, 400, { error: "corpo inválido" }); }
      if (!validEvent(e)) return json(res, 400, { error: "evento inválido" });
      const r = room(code);
      if (!ids[code].has(e.id)) {
        if (r.events.length >= MAX_EVENTS) return json(res, 429, { error: "sala cheia" });
        ids[code].add(e.id); r.events.push(e); save();
        for (const cl of liveRoom(code).clients) sse(cl.res, "ev", e);
      }
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && action === "presence") {
      let p; try { p = await readBody(req, 1024); } catch (err) { return json(res, 400, { error: "corpo inválido" }); }
      const pk = typeof p.pk === "string" ? p.pk.slice(0, 64) : "";
      if (!pk) return json(res, 400, { error: "pk obrigatório" });
      const L = liveRoom(code);
      L.pres[pk] = {
        nick: String(p.nick || "").slice(0, 14),
        color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : "#ffffff",
        view: typeof p.view === "string" ? p.view.slice(0, 4) : null,
        at: typeof p.at === "string" ? p.at.slice(0, 16) : null,
        ts: Date.now()
      };
      broadcastPeers(code);
      return json(res, 200, { ok: true });
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("não encontrado");
});

server.listen(PORT, "0.0.0.0", () => console.log(`Kitnet 47 rodando em http://localhost:${PORT}`));
