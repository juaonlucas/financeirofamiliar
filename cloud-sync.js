const CLOUD_KEY_STORAGE = "painel-bv-cloud-key-v1";
let cloudSaveTimer = 0;
let applyingCloudState = false;

function cloudKey() { return localStorage.getItem(CLOUD_KEY_STORAGE) || ""; }
function cloudStatePayload() {
  return { version: 2, owners: [...OWNERS], transactions, deletedTransactions: deletedTransactions(), invoices, profiles, updatedAt: new Date().toISOString() };
}
function setCloudStatus(message, type = "") {
  const status = document.querySelector("#syncStatus");
  const detail = document.querySelector("#cloudMemoryState");
  status.textContent = message;
  detail.textContent = message;
  detail.className = `memory-state ${type}`.trim();
}
function setReadOnly(readOnly) {
  document.body.classList.toggle("cloud-readonly", readOnly);
  document.querySelectorAll("[data-edit],[data-add-owner],[data-save-var]").forEach(button => { button.hidden = readOnly; });
}
async function cloudRequest(method, body) {
  const key = cloudKey();
  const response = await fetch("/api/state", {
    method,
    headers: { ...(key ? { "x-panel-key": key } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível acessar a memória.");
  return data;
}
async function saveCloudState() {
  if (!cloudKey() || applyingCloudState) return;
  try {
    setCloudStatus("salvando para todos…");
    const result = await cloudRequest("PUT", cloudStatePayload());
    setCloudStatus(`edição sincronizada às ${new Date(result.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, "ok");
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
  setReadOnly(!cloudKey());
}
async function loadPublicMemory() {
  try {
    setCloudStatus("carregando dados atualizados…");
    const result = await cloudRequest("GET");
    if (result.exists) applyCloudState(result.state);
    setReadOnly(!cloudKey());
    if (result.exists) setCloudStatus(cloudKey() ? "edição sincronizada" : "visualização sincronizada", "ok");
    else setCloudStatus(cloudKey() ? "memória pronta para o primeiro salvamento" : "visualização pública · aguardando primeiro salvamento", "ok");
    return result;
  } catch (error) {
    setReadOnly(!cloudKey());
    setCloudStatus(`dados locais: ${error.message}`, "error");
    return null;
  }
}
async function connectCloudMemory() {
  const entered = document.querySelector("#cloudMemoryKey").value.trim();
  if (!entered) return setCloudStatus("Digite a chave de edição.", "error");
  localStorage.setItem(CLOUD_KEY_STORAGE, entered);
  try {
    setCloudStatus("validando acesso de edição…");
    await cloudRequest("POST");
    const remote = await cloudRequest("GET");
    if (remote.exists) {
      const publishLocal = confirm("Já existem dados sincronizados.\n\nOK: publicar para todos os dados deste aparelho.\nCancelar: carregar neste aparelho os dados já publicados.");
      if (publishLocal) await saveCloudState();
      else applyCloudState(remote.state);
    } else {
      await saveCloudState();
    }
    setReadOnly(false);
    setCloudStatus("edição sincronizada neste aparelho", "ok");
    document.querySelector("#cloudMemoryDialog").close();
  } catch (error) {
    localStorage.removeItem(CLOUD_KEY_STORAGE);
    setReadOnly(true);
    setCloudStatus(error.message, "error");
  }
}
function disconnectCloudMemory() {
  localStorage.removeItem(CLOUD_KEY_STORAGE);
  document.querySelector("#cloudMemoryKey").value = "";
  setReadOnly(true);
  setCloudStatus("visualização sincronizada · edição desconectada", "ok");
  loadPublicMemory();
}

const localPersist = persist;
persist = function persistWithCloud() { localPersist(); scheduleCloudSave(); };
document.querySelector("#cloudMemoryBtn").onclick = () => {
  document.querySelector("#cloudMemoryKey").value = cloudKey();
  document.querySelector("#cloudMemoryDialog").showModal();
};
document.querySelector("#connectCloudMemory").onclick = connectCloudMemory;
document.querySelector("#disconnectCloudMemory").onclick = disconnectCloudMemory;
setReadOnly(!cloudKey());
loadPublicMemory();

