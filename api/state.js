import { get, put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";

const PATHNAME = "painel-familia/state.json";

function authorized(request) {
  const expected = process.env.PANEL_SYNC_SECRET || "";
  const received = String(request.headers["x-panel-key"] || "");
  if (!expected || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function send(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store");
  return response.status(status).json(body);
}

export default async function handler(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.PANEL_SYNC_SECRET) {
    return send(response, 503, { error: "Memória do painel ainda não configurada." });
  }
  if (!authorized(request)) return send(response, 401, { error: "Chave de acesso inválida." });

  if (request.method === "GET") {
    const result = await get(PATHNAME, { access: "private" });
    if (!result || result.statusCode !== 200) return send(response, 200, { exists: false });
    const state = await new Response(result.stream).json();
    return send(response, 200, { exists: true, state });
  }

  if (request.method === "PUT") {
    const raw = typeof request.body === "string" ? request.body : JSON.stringify(request.body || {});
    if (raw.length > 1_500_000) return send(response, 413, { error: "Dados acima do limite permitido." });
    let state;
    try { state = JSON.parse(raw); } catch { return send(response, 400, { error: "Dados inválidos." }); }
    if (!Array.isArray(state.transactions) || !Array.isArray(state.owners)) {
      return send(response, 400, { error: "Estrutura financeira inválida." });
    }
    state.updatedAt = new Date().toISOString();
    await put(PATHNAME, JSON.stringify(state), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 0,
    });
    return send(response, 200, { saved: true, updatedAt: state.updatedAt });
  }

  response.setHeader("Allow", "GET, PUT");
  return send(response, 405, { error: "Método não permitido." });
}

