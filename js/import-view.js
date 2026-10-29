// Importação da fatura em PDF: leitura, revisão e criação do novo mês.
import { allocations, archiveActive, brl, MONTHS, num, plain, resetMonthlyState, round2, splitCents, suggestOwners, defaultPayTo } from "./finance.js";
import { readInvoicePdf } from "./pdf-import.js";
import { commit, store } from "./store.js";
import { $, $$, app, canEdit, esc, toast } from "./ui.js";

let review = null; // { file, summary, rows }

export function renderImportar() {
  if (!canEdit()) { $("#view").innerHTML = '<div class="card empty"><h2>Somente quem administra o painel importa faturas.</h2></div>'; return; }
  $("#view").innerHTML = `
  <section class="card">
    <h2 class="flush">Importar a fatura do mês</h2>
    <p class="sub">O PDF é lido aqui mesmo, no navegador. Você revisa tudo antes de confirmar. Parcelas que continuam herdam o dono do mês anterior; compras novas entram sem dono.</p>
    <label class="drop" id="drop"><input type="file" id="pdfInput" accept="application/pdf"><strong>Escolher ou arrastar o PDF da fatura</strong><span>Use a versão desbloqueada (sem senha)</span></label>
    <div id="pdfStatus" class="sub"></div>
  </section>
  <div id="review"></div>`;
  const input = $("#pdfInput"), drop = $("#drop");
  input.onchange = () => input.files[0] && analyze(input.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) analyze(f); };
  if (review) drawReview();
}

async function analyze(file) {
  const status = $("#pdfStatus");
  try {
    const { found, summary } = await readInvoicePdf(file, text => { status.textContent = text; });
    const state = store.state;
    const history = [...state.transactions, ...state.invoices.flatMap(i => i.id === state.activeInvoiceId ? [] : i.transactions || [])];
    const sameActive = state.invoices.find(i => i.id === state.activeInvoiceId && plain(i.month) === plain(summary.month) && Number(i.year) === summary.year);
    const existing = sameActive ? state.transactions : [];
    const rows = found.map((tx, index) => {
      const duplicate = existing.some(e => e.date === tx.date && plain(e.merchant) === plain(tx.merchant) && String(e.installment || "") === String(tx.installment || "") && Math.abs(num(e.amount) - tx.amount) < 0.009);
      const suggestions = suggestOwners(tx, history, state.owners, state.rules);
      const auto = suggestions.find(s => s.kind === "parcela" || s.kind === "regra");
      return { ...tx, index, duplicate, selected: !duplicate, owners: auto ? auto.owners : [], source: auto?.kind || "", note: auto?.note || "" };
    });
    review = { file, summary: { ...summary, month: MONTHS.find(m => plain(m) === plain(summary.month)) || summary.month }, rows };
    status.textContent = `${found.length} lançamentos encontrados.`;
    drawReview();
  } catch (error) {
    console.error(error);
    status.textContent = "Não foi possível ler este PDF. Confira se é a fatura BV desbloqueada.";
  }
}

function drawReview() {
  const { summary, rows } = review, owners = store.state.owners;
  const selected = rows.filter(r => r.selected), sum = round2(selected.reduce((s, r) => s + r.amount, 0));
  const target = summary.nationalTotal || summary.invoiceTotal, diff = round2(target - sum);
  const auto = selected.filter(r => r.owners.length).length;
  $("#review").innerHTML = `
  <section class="card top-gap">
    <div class="f3"><label>Mês<select id="rMonth">${MONTHS.map(m => `<option ${m === summary.month ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      <label>Ano<input id="rYear" type="number" value="${summary.year || new Date().getFullYear()}"></label>
      <label>Total da fatura<input id="rTotal" type="number" step="0.01" value="${summary.invoiceTotal || ""}"></label></div>
    <div class="recon"><span>Lançamentos selecionados<strong>${brl(sum)}</strong></span><span>Total da fatura<strong>${target ? brl(target) : "não encontrado"}</strong></span><span class="${Math.abs(diff) < 0.02 ? "ok" : "bad"}">Diferença<strong>${target ? brl(diff) : "—"}</strong></span><span>Já com dono<strong>${auto} de ${selected.length}</strong></span></div>
    ${summary.nextInstallments ? `<p class="sub">A próxima fatura já começa com ${brl(summary.nextInstallments)} em parcelas.${summary.availableLimit !== null ? ` Limite disponível: ${brl(summary.availableLimit)}.` : ""}</p>` : ""}
  </section>
  <div class="txlist top-gap">${rows.map(r => `
    <div class="txrow ${r.duplicate ? "muted" : ""}">
      <input type="checkbox" data-sel="${r.index}" ${r.selected ? "checked" : ""} ${r.duplicate ? "disabled" : ""} aria-label="Importar">
      <div class="d">${esc(r.date)}</div>
      <div class="grow"><strong>${esc(r.merchant)}</strong> <span class="sub">${esc(r.installment || "à vista")}${r.location ? " · " + esc(r.location) : ""}</span>
        <div class="sub">${r.duplicate ? "já está no painel" : r.source === "parcela" ? "parcela anterior" : r.source === "regra" ? "regra salva" : r.amount < 0 ? "crédito/estorno" : "novo · sem dono"}</div></div>
      <select data-own="${r.index}" ${r.duplicate ? "disabled" : ""}><option value="">Sem dono</option>${owners.map(o => `<option ${r.owners.length === 1 && r.owners[0] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}${r.owners.length > 1 ? `<option selected value="${esc(r.owners.join("|"))}">${esc(r.owners.join(" + "))}</option>` : ""}</select>
      <div class="money strong">${brl(r.amount)}</div>
    </div>`).join("")}</div>
  <div class="dlg-actions top-gap"><button class="btn" id="rCancel">Cancelar</button><span class="grow"></span><button class="btn primary" id="rConfirm">Importar ${selected.filter(r => !r.duplicate).length} lançamentos</button></div>`;
  $$("[data-sel]").forEach(c => c.onchange = () => { rows[c.dataset.sel].selected = c.checked; drawReview(); });
  $$("[data-own]").forEach(s => s.onchange = () => { const r = rows[s.dataset.own]; r.owners = s.value ? s.value.split("|") : []; r.source = s.value ? "manual" : ""; });
  $("#rCancel").onclick = () => { review = null; renderImportar(); };
  $("#rConfirm").onclick = confirmImport;
}

function confirmImport() {
  const state = store.state, month = $("#rMonth").value, year = Number($("#rYear").value), total = num($("#rTotal").value);
  const chosen = review.rows.filter(r => r.selected && !r.duplicate);
  if (!chosen.length) return toast("Nada selecionado para importar.");
  const existing = state.invoices.find(i => i.month === month && Number(i.year) === year);
  if (existing && existing.id !== state.activeInvoiceId) return toast(`${month}/${year} já está no histórico do painel.`);
  let invoice = existing;
  if (!invoice) {
    archiveActive(state);
    invoice = { id: `${month.toLowerCase()}-${year}-${Date.now()}`, month, year, total, file: review.file.name, detail: "PDF analisado e lançamentos importados", hasBlob: false, status: "Classificada" };
    state.invoices.push(invoice);
    state.transactions = [];
    state.activeInvoiceId = invoice.id;
    resetMonthlyState(state);
  } else if (total) invoice.total = total;
  const { availableLimit, nextInstallments, dueDate } = review.summary;
  Object.assign(invoice, { availableLimit, nextInstallments, dueDate });
  let nextId = Math.max(0, ...[...state.transactions, ...state.invoices.flatMap(i => i.transactions || [])].map(t => Number(t.id) || 0)) + 1;
  for (const r of chosen) {
    const tx = { id: nextId++, invoiceId: invoice.id, date: r.date, merchant: r.merchant, location: r.location, installment: r.installment, amount: r.amount, owner: "", note: r.note || "", dueNow: r.amount, payTo: "", variationNote: "", agreement: null, shares: [] };
    if (r.owners.length === 1) Object.assign(tx, { owner: r.owners[0], payTo: defaultPayTo(r.owners[0]) });
    else if (r.owners.length > 1) {
      const values = splitCents(r.amount, r.owners.length);
      Object.assign(tx, { owner: r.owners.join(" e "), shares: r.owners.map((o, i) => ({ owner: o, amount: values[i], dueNow: values[i], payTo: defaultPayTo(o), variationNote: "" })) });
    }
    state.transactions.push(tx);
  }
  invoice.transactions = structuredClone(state.transactions);
  commit();
  toast(`${chosen.length} lançamentos importados · ${chosen.filter(r => allocations(r).length || r.owners.length).length} já com dono`);
  review = null;
  app.monthId = invoice.id;
  location.hash = "identificar";
}
