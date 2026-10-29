// Servidor local para testar o painel sem tocar nos dados reais: node scripts/dev.mjs [estado.json]
// Chave de edição local: "dev" (ou PANEL_SYNC_SECRET). Dados ficam em .dev-state.json.
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { personScope } from "../js/finance.js";

const SEED = process.argv[2] ? normalize(process.argv[2]) : "";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));

const PORT = Number(process.env.PORT || 8790), KEY = process.env.PANEL_SYNC_SECRET || "dev", FILE = ".dev-state.json";
if (!existsSync(FILE) && SEED) copyFileSync(SEED, FILE);
const read = () => { if (!existsSync(FILE)) return null; const d = JSON.parse(readFileSync(FILE, "utf8")); return d.state || d; };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/state") {
    const admin = req.headers["x-panel-key"] === KEY, state = read();
    if (req.method === "GET") {
      if (admin || process.env.PANEL_PUBLIC_READ === "1") return json(res, 200, state ? { exists: true, scope: admin ? "admin" : "public", state } : { exists: false });
      const owner = state && Object.keys(state.profiles || {}).find(o => state.profiles[o]?.token && state.profiles[o].token === url.searchParams.get("p"));
      return owner ? json(res, 200, { exists: true, scope: "person", owner, state: personScope(state, owner) }) : json(res, 401, { error: "Acesso restrito. Use o seu link pessoal ou a chave de edição." });
    }
    if (!admin) return json(res, 401, { error: "Chave de acesso inválida." });
    if (req.method === "POST") return json(res, 200, { authorized: true });
    let body = ""; for await (const chunk of req) body += chunk;
    const next = JSON.parse(body), base = req.headers["x-base-updated-at"];
    if (base && state?.updatedAt && state.updatedAt !== base) return json(res, 409, { error: "Os dados foram alterados em outro aparelho.", state });
    next.updatedAt = new Date().toISOString();
    writeFileSync(FILE, JSON.stringify(next));
    return json(res, 200, { saved: true, updatedAt: next.updatedAt });
  }
  if (url.pathname === "/api/invoice-pdf") {
    const admin = req.headers["x-panel-key"] === KEY, dir = ".dev-pdfs";
    if (!existsSync(dir)) mkdirSync(dir);
    if (req.method === "GET") {
      if (!admin && process.env.PANEL_PUBLIC_READ !== "1") return json(res, 401, { error: "Acesso restrito." });
      const id = url.searchParams.get("id");
      if (!id) return json(res, 200, { ids: readdirSync(dir).map(f => f.replace(/\.pdf$/, "")) });
      if (!existsSync(`${dir}/${id}.pdf`)) return json(res, 404, { error: "PDF não encontrado." });
      res.writeHead(200, { "content-type": "application/pdf" }); return res.end(readFileSync(`${dir}/${id}.pdf`));
    }
    if (!admin) return json(res, 401, { error: "Chave de acesso inválida." });
    let body = ""; for await (const chunk of req) body += chunk;
    const { id, data } = JSON.parse(body);
    writeFileSync(`${dir}/${id}.pdf`, Buffer.from(data, "base64"));
    return json(res, 200, { saved: true, id });
  }
  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  let file = path.startsWith("/assets/pdfjs/") ? join("node_modules/pdfjs-dist/build", path.slice(14)) : normalize(join(".", path));
  if (file.startsWith("..") || !existsSync(file)) { res.writeHead(404); return res.end("não encontrado"); }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
}).listen(PORT, "127.0.0.1", () => console.log(`Painel local em http://localhost:${PORT} · chave "${KEY}"`));
