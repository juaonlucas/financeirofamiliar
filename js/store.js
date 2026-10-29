// Carrega e salva o estado do painel na API (/api/state).
const KEY_STORAGE = "painel-bv-cloud-key-v1"; // mesma chave do painel antigo: aparelhos já conectados continuam conectados

export const store = {
  state: null,
  mode: "loading", // admin | person | public | locked
  owner: null,     // pessoa do link pessoal
  status: "",
  listeners: new Set(),
  saveTimer: 0,
  saving: false,
  pending: false,
};

const token = () => new URLSearchParams(location.search).get("p") || "";
export const getKey = () => { try { return localStorage.getItem(KEY_STORAGE) || ""; } catch { return ""; } };
function setKey(value) { try { value ? localStorage.setItem(KEY_STORAGE, value) : localStorage.removeItem(KEY_STORAGE); } catch { /* sem armazenamento */ } }

function emit(kind) { store.listeners.forEach(fn => fn(kind)); }
function setStatus(text, kind = "") { store.status = text; store.statusKind = kind; emit("status"); }

async function request(method, body, extraHeaders = {}) {
  // Um link pessoal sempre abre como a pessoa vê, mesmo num aparelho com a chave de edição.
  const personal = method === "GET" && token(), key = personal ? "" : getKey();
  const url = personal ? `/api/state?p=${encodeURIComponent(token())}` : "/api/state";
  const response = await fetch(url, {
    method,
    headers: { ...(key ? { "x-panel-key": key } : {}), ...(body ? { "content-type": "application/json" } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function load() {
  setStatus("carregando…");
  try {
    const { ok, status, data } = await request("GET");
    if (status === 401) { store.mode = "locked"; store.state = null; setStatus(data.error || "Acesso restrito", "error"); emit("load"); return; }
    if (!ok) throw new Error(data.error || "Falha ao carregar");
    if (!data.exists) throw new Error("O painel ainda não tem dados salvos.");
    store.state = normalize(data.state);
    store.mode = data.scope === "person" ? "person" : data.scope === "admin" ? "admin" : "public";
    store.owner = data.owner || null;
    setStatus(store.mode === "admin" ? "sincronizado · você pode editar" : "modo visualização · para editar, toque em ⚙", "ok");
  } catch (error) {
    store.mode = store.state ? store.mode : "locked";
    setStatus(error.message, "error");
  }
  emit("load");
}

function normalize(state) {
  state.owners ||= [];
  state.profiles ||= {};
  state.invoices ||= [];
  state.transactions ||= [];
  state.deletedTransactions ||= [];
  state.rules ||= [];
  state.owners.forEach(o => { state.profiles[o] ||= {}; });
  return state;
}

/** Marca o estado como alterado e agenda o salvamento. */
export function commit() {
  emit("change");
  if (store.mode !== "admin") return;
  store.pending = true;
  clearTimeout(store.saveTimer);
  store.saveTimer = setTimeout(save, 700);
  setStatus("salvando…");
}

async function save() {
  if (store.saving) { store.saveTimer = setTimeout(save, 400); return; }
  store.saving = true; store.pending = false;
  const state = store.state;
  try {
    const { ok, status, data } = await request("PUT", state, state.updatedAt ? { "x-base-updated-at": state.updatedAt } : {});
    if (status === 409) {
      store.state = normalize(data.state);
      setStatus("dados atualizados de outro aparelho", "warn");
      emit("conflict");
    } else if (!ok) {
      throw new Error(data.error || "não foi possível salvar");
    } else {
      state.updatedAt = data.updatedAt;
      setStatus(`salvo às ${new Date(data.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, "ok");
    }
  } catch (error) {
    store.pending = true;
    setStatus(`não salvo: ${error.message}`, "error");
  } finally { store.saving = false; }
}

export async function connect(key) {
  setKey(key);
  const { ok, data } = await request("POST");
  if (!ok) { setKey(""); throw new Error(data.error || "Chave inválida"); }
  await load();
}

export function disconnect() { setKey(""); load(); }

/* PDFs originais das faturas */
export const pdfs = new Set();
export async function loadPdfList() {
  try {
    const key = getKey(), response = await fetch("/api/invoice-pdf", { headers: key ? { "x-panel-key": key } : {} });
    if (!response.ok) return;
    pdfs.clear(); (await response.json()).ids.forEach(id => pdfs.add(id));
    emit("pdfs");
  } catch { /* lista indisponível: os links simplesmente não aparecem */ }
}
export async function uploadPdf(id, file) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  const response = await fetch("/api/invoice-pdf", { method: "PUT", headers: { "x-panel-key": getKey(), "content-type": "application/json" }, body: JSON.stringify({ id, data: btoa(binary) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Falha ao guardar o PDF");
  pdfs.add(id); emit("pdfs");
}
export const pdfUrl = id => `/api/invoice-pdf?id=${encodeURIComponent(id)}`;

addEventListener("beforeunload", event => { if (store.pending || store.saving) { event.preventDefault(); event.returnValue = ""; } });
