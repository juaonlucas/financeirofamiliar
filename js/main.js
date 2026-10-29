// Ponto de entrada: carrega os dados, desenha o topo e despacha as ações das telas.
import { allocations, assignOwners, isFee, isLateFee, plain, sortInvoices } from "./finance.js";
import { commit, connect, load, loadPdfList, store, uploadPdf } from "./store.js";
import { $, $$, app, canEdit, esc, month, toast } from "./ui.js";
import { filters, isSplitMode, recentlyAssigned, renderFuturo, renderHistorico, renderIdentificar, renderLancamentos, renderMes, renderPessoa, renderPessoas, toggleSplit } from "./views.js";
import { editPayment, editProfile, editTransaction, personalLink, sendMessage, settings, shareImage } from "./dialogs.js";
import { renderImportar } from "./import-view.js";

const TABS = [["mes", "Visão do mês"], ["identificar", "Identificar"], ["pessoas", "Pessoas"], ["lancamentos", "Lançamentos"], ["futuro", "Próximos meses"], ["historico", "Histórico"]];

function route() {
  if (store.mode === "loading") return;
  if (store.mode === "locked") return renderLocked();
  const state = store.state;
  if (!state.invoices.some(i => i.id === app.monthId)) app.monthId = state.activeInvoiceId;
  let [name, arg] = decodeURIComponent(location.hash.slice(1) || "mes").split("/");
  if (store.mode === "person") { name = "pessoa"; arg = store.owner; }
  if (name !== "identificar") recentlyAssigned.clear();
  renderTop(name);
  ({ mes: renderMes, identificar: renderIdentificar, pessoas: renderPessoas, pessoa: () => renderPessoa(arg), lancamentos: renderLancamentos, futuro: renderFuturo, historico: renderHistorico, importar: renderImportar }[name] || renderMes)();
}

function renderTop(name) {
  const state = store.state, person = store.mode === "person";
  const months = sortInvoices(state.invoices).filter(i => i.id === state.activeInvoiceId || i.transactions?.length);
  $("#subtitle").textContent = person ? `Demonstrativo de ${store.owner}` : "Cartão BV · gestão de João Lucas";
  $("#months").innerHTML = months.map(i => `<button class="${i.id === app.monthId ? "on" : ""}" data-month="${esc(i.id)}">${esc(i.month.slice(0, 3))} ${String(i.year).slice(2)}${i.id === state.activeInvoiceId ? " •" : ""}</button>`).join("");
  $("#topActions").innerHTML = person ? "" : `${canEdit() ? '<button class="ghost" data-action="go" data-arg="importar">Importar fatura</button>' : ""}<button class="ghost icon" data-action="settings" aria-label="Configurações" title="Configurações">⚙</button>`;
  const current = month(), unknown = current.invoice?.legacy ? 0 : current.totals.unknownCount;
  $("#tabs").innerHTML = person ? "" : TABS.filter(([k]) => k !== "identificar" || canEdit() || unknown).map(([k, label]) =>
    `<button class="${name === k || (name === "pessoa" && k === "pessoas") ? "on" : ""}" data-action="go" data-arg="${k}">${label}${k === "identificar" && unknown ? ` <span class="badge">${unknown}</span>` : ""}</button>`).join("");
  $("#tabsBar").hidden = person;
  $("#sync").textContent = store.status;
  $("#sync").className = `sync ${store.statusKind || ""}`;
}

function renderLocked() {
  $("#tabsBar").hidden = true; $("#months").innerHTML = ""; $("#topActions").innerHTML = "";
  $("#view").innerHTML = `<section class="card narrow">
    <h2 class="flush">Painel Família</h2>
    <p class="sub">${new URLSearchParams(location.search).get("p") ? "Este link pessoal não é mais válido. Peça um novo ao João Lucas." : "O painel agora é privado. Cada pessoa recebe um link próprio com as suas compras."}</p>
    <form id="lockForm" class="form top-gap"><label>Chave de edição (administração)<input id="lockKey" type="password" autocomplete="current-password" required></label><button class="btn primary">Entrar</button></form>
  </section>`;
  $("#lockForm").onsubmit = async e => { e.preventDefault(); try { await connect($("#lockKey").value.trim()); toast("Aparelho conectado"); } catch (err) { toast(err.message); } };
}

/* ------------------------------------------------------------ ações */
const actions = {
  go: arg => { location.hash = arg; },
  "open-month": id => { app.monthId = id; location.hash = "mes"; route(); },
  settings, "new-profile": () => editProfile(null), profile: editProfile, link: personalLink,
  msg: sendMessage, pay: editPayment, "share-img": shareImage, "edit-tx": editTransaction, "new-tx": () => editTransaction("new"),
  print: () => print(),
  pick: arg => {
    const [id, owner] = arg.split("|"), tx = month().transactions.find(t => t.id === Number(id)), current = allocations(tx).map(a => a.owner);
    const next = isSplitMode(tx.id) || current.length > 1 ? (current.includes(owner) ? current.filter(o => o !== owner) : [...current, owner]) : (current.length === 1 && current[0] === owner ? [] : [owner]);
    assignOwners(tx, next); recentlyAssigned.add(tx.id); commit();
    toast(next.length ? `${tx.merchant} → ${next.join(" + ")}` : "Atribuição desfeita");
  },
  assign: arg => {
    const [id, list] = arg.split("|"), tx = month().transactions.find(t => t.id === Number(id)), owners = list.split(",");
    assignOwners(tx, owners); if (owners.length > 1) toggleSplit(tx.id, true); recentlyAssigned.add(tx.id); commit();
    toast(`${tx.merchant} → ${owners.join(" + ")}`);
  },
  bulk: arg => {
    const [group, who] = arg.split("|"), m = month();
    const test = group === "late" ? isLateFee : tx => isFee(tx) && !isLateFee(tx);
    const owners = who === "*" ? m.owners : [who];
    m.transactions.filter(tx => test(tx) && !allocations(tx).length).forEach(tx => { assignOwners(tx, owners); recentlyAssigned.add(tx.id); });
    commit(); toast(who === "*" ? "Dividido entre quem tem compras no mês" : `Tudo para ${who}`);
  },
  rule: id => {
    const tx = month().transactions.find(t => t.id === Number(id));
    store.state.rules.push({ merchant: plain(tx.merchant), owners: allocations(tx).map(a => a.owner), createdAt: new Date().toISOString() });
    commit(); toast("Regra salva: nas próximas faturas essa compra já vem com dono");
  },
};

document.addEventListener("click", event => {
  const el = event.target.closest("[data-action]");
  if (!el || el.matches("input")) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  event.preventDefault(); event.stopPropagation();
  fn(el.dataset.arg);
});
document.addEventListener("change", event => {
  const el = event.target;
  if (el.dataset.attach && el.files[0]) {
    uploadPdf(el.dataset.attach, el.files[0]).then(() => toast("PDF guardado")).catch(e => toast(e.message));
    return;
  }
  if (el.dataset.action === "split") { toggleSplit(Number(el.dataset.arg), el.checked); return; }
  if (el.dataset.filter) { filters[el.dataset.filter] = el.value; renderLancamentos(); }
  if (el.closest("#months")) return;
});
document.addEventListener("input", event => {
  const el = event.target;
  if (el.dataset.filter === "q") { filters.q = el.value; const pos = el.selectionStart; renderLancamentos(); const again = $('[data-filter="q"]'); again.focus(); again.setSelectionRange(pos, pos); }
});
document.addEventListener("keydown", event => {
  if (event.key === "Enter" && event.target.matches("article[data-action]")) event.target.click();
});
$("#months").addEventListener("click", event => {
  const b = event.target.closest("[data-month]");
  if (!b) return;
  app.monthId = b.dataset.month; route();
});
$("#dialog").addEventListener("click", event => { if (event.target.id === "dialog") event.target.close(); });

store.listeners.add(kind => {
  if (kind === "status") { const el = $("#sync"); el.textContent = store.status; el.className = `sync ${store.statusKind || ""}`; return; }
  if (kind === "conflict") toast("Outro aparelho salvou antes. Carregamos a versão mais nova; refaça a última alteração.");
  if (kind === "load") { app.monthId = store.state?.activeInvoiceId || null; if (store.state) loadPdfList(); }
  const scrollY = scrollY_();
  route();
  if (kind === "change") window.scrollTo(0, scrollY);
});
const scrollY_ = () => window.scrollY;
addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
load();
