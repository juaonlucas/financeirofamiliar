import { get, put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";

const PATHNAME = "painel-familia/state.json";
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
});

function authorized(request) {
  const expected = process.env.PANEL_SYNC_SECRET || "";
  const received = request.headers.get("x-panel-key") || "";
  if (!expected || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export default async function handler(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.PANEL_SYNC_SECRET) {
    return json({ error: "Memória do painel ainda não configurada." }, 503);
  }
  if (!authorized(request)) return json({ error: "Chave de acesso inválida." }, 401);

  if (request.method === "GET") {
    const result = await get(PATHNAME, { access: "private" });
    if (!result || result.statusCode !== 200) return json({ exists: false });
    const state = await new Response(result.stream).json();
    return json({ exists: true, state });
  }

  if (request.method === "PUT") {
    const raw = await request.text();
    if (raw.length > 1_500_000) return json({ error: "Dados acima do limite permitido." }, 413);
    let state;
    try { state = JSON.parse(raw); } catch { return json({ error: "Dados inválidos." }, 400); }
    if (!Array.isArray(state.transactions) || !Array.isArray(state.owners)) {
      return json({ error: "Estrutura financeira inválida." }, 400);
    }
    state.updatedAt = new Date().toISOString();
    await put(PATHNAME, JSON.stringify(state), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 0,
    });
    return json({ saved: true, updatedAt: state.updatedAt });
  }

  return json({ error: "Método não permitido." }, 405);
}

