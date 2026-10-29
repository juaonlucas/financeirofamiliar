import { get, list, put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";

// PDFs originais das faturas, guardados para conferência: painel-familia/faturas/<invoiceId>.pdf
const PREFIX = "painel-familia/faturas/";
const MAX_BYTES = 4 * 1024 * 1024;

function isAdmin(request) {
  const expected = process.env.PANEL_SYNC_SECRET || "", received = String(request.headers["x-panel-key"] || "");
  return !!expected && expected.length === received.length && timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
const validId = id => /^[a-z0-9ç-]{3,80}$/i.test(id);
const json = (response, status, body) => { response.setHeader("Cache-Control", "private, no-store"); return response.status(status).json(body); };

export default async function handler(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return json(response, 503, { error: "Armazenamento não configurado." });
  const canRead = isAdmin(request) || process.env.PANEL_PUBLIC_READ === "1";

  if (request.method === "GET") {
    if (!canRead) return json(response, 401, { error: "Acesso restrito." });
    const id = String(request.query?.id || "");
    if (!id) {
      const { blobs } = await list({ prefix: PREFIX });
      return json(response, 200, { ids: blobs.map(b => b.pathname.slice(PREFIX.length).replace(/\.pdf$/, "")) });
    }
    if (!validId(id)) return json(response, 400, { error: "Fatura inválida." });
    const result = await get(`${PREFIX}${id}.pdf`, { access: "private" });
    if (!result || result.statusCode !== 200) return json(response, 404, { error: "PDF não encontrado." });
    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="fatura-${id}.pdf"`);
    response.setHeader("Cache-Control", "private, max-age=300");
    return response.status(200).send(bytes);
  }

  if (request.method === "PUT") {
    if (!isAdmin(request)) return json(response, 401, { error: "Chave de acesso inválida." });
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
    const id = String(body.id || ""), bytes = Buffer.from(String(body.data || ""), "base64");
    if (!validId(id)) return json(response, 400, { error: "Fatura inválida." });
    if (!bytes.length || bytes.length > MAX_BYTES || bytes.subarray(0, 4).toString() !== "%PDF") return json(response, 400, { error: "Envie um PDF de até 4 MB." });
    await put(`${PREFIX}${id}.pdf`, bytes, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/pdf" });
    return json(response, 200, { saved: true, id });
  }

  response.setHeader("Allow", "GET, PUT");
  return json(response, 405, { error: "Método não permitido." });
}
