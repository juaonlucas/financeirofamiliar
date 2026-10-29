import { get, put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";
import { personScope } from "../js/finance.js";

const PATHNAME = "painel-familia/state.json";

function safeEqual(expected, received) {
  if (!expected || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
const isAdmin = request => safeEqual(process.env.PANEL_SYNC_SECRET || "", String(request.headers["x-panel-key"] || ""));

function send(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store");
  return response.status(status).json(body);
}

async function readState() {
  const result = await get(PATHNAME, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).json();
}

export default async function handler(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return send(response, 503, { error: "Memória do painel ainda não configurada." });

  if (request.method === "GET") {
    const state = await readState();
    if (isAdmin(request) || process.env.PANEL_PUBLIC_READ === "1") {
      return send(response, 200, state ? { exists: true, scope: isAdmin(request) ? "admin" : "public", state } : { exists: false });
    }
    const token = String(request.query?.p || "");
    if (token.length >= 16 && state) {
      const owner = Object.keys(state.profiles || {}).find(o => safeEqual(String(state.profiles[o]?.token || ""), token));
      if (owner) return send(response, 200, { exists: true, scope: "person", owner, state: personScope(state, owner) });
    }
    return send(response, 401, { error: "Acesso restrito. Use o seu link pessoal ou a chave de edição." });
  }

  if (!process.env.PANEL_SYNC_SECRET) return send(response, 503, { error: "Edição sincronizada ainda não configurada." });
  if (!isAdmin(request)) return send(response, 401, { error: "Chave de acesso inválida." });

  if (request.method === "POST") return send(response, 200, { authorized: true });

  if (request.method === "PUT") {
    const raw = typeof request.body === "string" ? request.body : JSON.stringify(request.body || {});
    if (raw.length > 1_500_000) return send(response, 413, { error: "Dados acima do limite permitido." });
    let state;
    try { state = JSON.parse(raw); } catch { return send(response, 400, { error: "Dados inválidos." }); }
    if (!Array.isArray(state.transactions) || !Array.isArray(state.owners) || !Array.isArray(state.invoices)) {
      return send(response, 400, { error: "Estrutura financeira inválida." });
    }
    // Evita que um aparelho com dados antigos apague o que outro salvou depois.
    // Só recusa se o salvo for MAIS NOVO que a base: logo após gravar, o Blob pode devolver a versão anterior por alguns segundos.
    const base = String(request.headers["x-base-updated-at"] || "");
    if (base) {
      const current = await readState();
      if (current?.updatedAt && current.updatedAt > base) {
        return send(response, 409, { error: "Os dados foram alterados em outro aparelho.", state: current });
      }
    }
    state.updatedAt = new Date().toISOString();
    await put(PATHNAME, JSON.stringify(state), {
      access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 0,
    });
    return send(response, 200, { saved: true, updatedAt: state.updatedAt });
  }

  response.setHeader("Allow", "GET, POST, PUT");
  return send(response, 405, { error: "Método não permitido." });
}
