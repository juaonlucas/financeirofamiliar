const CLOUD_KEY_STORAGE = "painel-bv-cloud-key-v1";
let cloudSaveTimer = 0;
let applyingCloudState = false;

function cloudKey() { return localStorage.getItem(CLOUD_KEY_STORAGE) || ""; }
function cloudStatePayload() {
  return { version: 1, owners: [...OWNERS], transactions, deletedTransactions: deletedTransactions(), invoices, profiles, updatedAt: new Date().toISOString() };
}
function setCloudStatus(message, type = "") {
  const status = document.querySelector("#syncStatus");
  const detail = document.querySelector("#cloudMemoryState");
  status.textContent = message;
  detail.textContent = message;
  detail.className = `memory-state ${type}`.trim();
}
async function cloudRequest(method, body) {
  const response = await fetch("/api/state", {
    method,
    headers: { "x-panel-key": cloudKey(), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível acessar a memória.");
  return data;
}
async function saveCloudState() {
  if (!cloudKey() || applyingCloudState) return;
  try {
    setCloudStatus("salvando na nuvem…");
    const result = await cloudRequest("PUT", cloudStatePayload());
    setCloudStatus(`sincronizado às ${new Date(result.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, "ok");
  } catch (error) { setCloudStatus(`não sincronizado: ${error.message}`, "error"); }
}
function scheduleCloudSave() {
  if (!cloudKey() || applyingCloudState) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(saveCloudState, 900);
}
function applyCloudState(state) {
  applyingCloudState = true;
  transactions = structuredClone(state.transactions);
  if (Array.isArray(state.invoices)) invoices = structuredClone(state.invoices);
  if (Array.isArray(state.owners) && state.owners.length) OWNERS.splice(0, OWNERS.length, ...state.owners);
  if (state.profiles && typeof state.profiles === "object") profiles = structuredClone(state.profiles);
  localStorage.setItem(OWNER_STORAGE, JSON.stringify(OWNERS));
  localStorage.setItem(PROFILE_STORAGE, JSON.stringify(profiles));
  localStorage.setItem(DELETED_STORAGE, JSON.stringify(state.deletedTransactions || []));
  OWNERS.forEach(owner => { if (profiles[owner]?.color) COLORS[owner] = profiles[owner].color; });
  localPersist();
  persistInvoices();
  refreshOwnerSelects();
  render();
  applyingCloudState = false;
}
async function connectCloudMemory() {
  const entered = document.querySelector("#cloudMemoryKey").value.trim();
  if (!entered) return setCloudStatus("Digite a chave de acesso.", "error");
  localStorage.setItem(CLOUD_KEY_STORAGE, entered);
  try {
    setCloudStatus("conectando…");
    const result = await cloudRequest("GET");
    if (result.exists) {
      if (!confirm("Carregar neste aparelho os dados mais recentes salvos na nuvem? Os dados locais atuais serão substituídos.")) return setCloudStatus("conexão mantida; carregamento cancelado");
      applyCloudState(result.state);
      setCloudStatus("memória conectada e dados atualizados", "ok");
    } else {
      await saveCloudState();
      setCloudStatus("memória criada com os dados deste aparelho", "ok");
    }
    document.querySelector("#cloudMemoryDialog").close();
  } catch (error) { localStorage.removeItem(CLOUD_KEY_STORAGE); setCloudStatus(error.message, "error"); }
}
function disconnectCloudMemory() {
  localStorage.removeItem(CLOUD_KEY_STORAGE);
  document.querySelector("#cloudMemoryKey").value = "";
  setCloudStatus("dados locais; aparelho desconectado");
}

const localPersist = persist;
persist = function persistWithCloud() { localPersist(); scheduleCloudSave(); };
document.querySelector("#cloudMemoryBtn").onclick = () => {
  document.querySelector("#cloudMemoryKey").value = cloudKey();
  document.querySelector("#cloudMemoryDialog").showModal();
};
document.querySelector("#connectCloudMemory").onclick = connectCloudMemory;
document.querySelector("#disconnectCloudMemory").onclick = disconnectCloudMemory;
if (cloudKey()) {
  setCloudStatus("memória conectada; buscando atualização…");
  cloudRequest("GET").then(result => {
    if (result.exists) applyCloudState(result.state);
    setCloudStatus(result.exists ? "sincronizado com a nuvem" : "memória conectada; aguardando primeiro salvamento", "ok");
  }).catch(error => setCloudStatus(`dados locais: ${error.message}`, "error"));
}

