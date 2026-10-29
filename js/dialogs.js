// Diálogos de edição: lançamento, pagamento, mensagem, perfil, link pessoal, configurações e imagem.
import { allocations, assignOwners, brl, CARD_PAYER, defaultPayTo, installment, num, round2, splitCents, whatsappMessage } from "./finance.js";
import { commit, connect, disconnect, getKey, store } from "./store.js";
import { $, $$, app, avatar, color, describe, esc, first, month, openDialog, settlementTarget, toast } from "./ui.js";

/* ------------------------------------------------------------ lançamento */
export function editTransaction(id) {
  const m = month(), isNew = id === "new";
  const tx = isNew ? { id: 0, date: "", merchant: "", installment: "", location: "", amount: 0, owner: "", note: "", shares: [] } : m.transactions.find(t => t.id === Number(id));
  if (!tx) return;
  let rows = allocations(tx).map(a => ({ ...a }));
  const owners = store.state.owners;
  const dialog = openDialog(`
    <div class="dlg-h"><div><div class="eyebrow">${isNew ? "Novo lançamento" : "Lançamento da fatura"}</div><h3>${esc(isNew ? "Lançamento manual" : tx.merchant)}</h3></div><button class="x" data-close aria-label="Fechar">×</button></div>
    <div class="form">
      <div class="f2"><label>Data<input id="fDate" value="${esc(tx.date)}" placeholder="DD/MM"></label><label>Parcela<input id="fInst" value="${esc(tx.installment)}" placeholder="01/05"></label></div>
      <label>Nome na fatura<input id="fMerchant" value="${esc(tx.merchant)}"></label>
      <div class="f2"><label>Local<input id="fLocation" value="${esc(tx.location)}"></label><label>Valor<input id="fAmount" type="number" step="0.01" value="${num(tx.amount)}"></label></div>
      <label>O que é <small>(aparece para a pessoa no lugar do nome da loja)</small><input id="fNote" value="${esc(describe(tx))}" placeholder="Ex.: óculos da Evane, peças do carro"></label>
      <fieldset><legend>De quem é</legend>
        <div class="chips">${owners.map(o => `<button type="button" class="chip" style="--c:${color(o)}" data-owner="${esc(o)}">${avatar(o)}${esc(first(o))}</button>`).join("")}</div>
        <div id="fRows"></div>
      </fieldset>
      <details ${tx.agreement ? "open" : ""}><summary>Acordo com alguém de fora da família</summary>
        <div class="f2"><label>Cobrar de<input id="fAgPerson" value="${esc(tx.agreement?.person || "")}" placeholder="Ex.: Leandro"></label><label>Quanto<input id="fAgAmount" type="number" step="0.01" value="${tx.agreement?.amount ?? ""}"></label></div>
        <label>Motivo<input id="fAgNote" value="${esc(tx.agreement?.note || "")}"></label>
      </details>
    </div>
    <div class="dlg-actions">${isNew ? "" : '<button class="btn danger" id="fDelete">Excluir</button>'}<span class="grow"></span><button class="btn" data-close>Cancelar</button><button class="btn primary" id="fSave">Salvar</button></div>`);

  const amount = () => num($("#fAmount").value);
  const drawRows = () => {
    $$("#dialog [data-owner]").forEach(b => { const on = rows.some(r => r.owner === b.dataset.owner); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    const sum = round2(rows.reduce((s, r) => s + num(r.amount), 0));
    $("#fRows").innerHTML = rows.length ? `<div class="share-rows">${rows.map((r, i) => `
      <div class="share-row"><strong style="color:${color(r.owner)}">${esc(r.owner)}</strong>
        <label>Responde por<input type="number" step="0.01" data-i="${i}" data-k="amount" value="${num(r.amount)}"></label>
        <label>Paga agora<input type="number" step="0.01" data-i="${i}" data-k="dueNow" value="${num(r.dueNow)}"></label>
        <label>Paga para<select data-i="${i}" data-k="payTo"><option value="">— (paga o cartão)</option>${owners.filter(o => o !== r.owner).map(o => `<option ${r.payTo === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>
        <label class="wide">Observação do combinado<input data-i="${i}" data-k="variationNote" value="${esc(r.variationNote || "")}" placeholder="Ex.: paga R$ 50 agora, resto em dezembro"></label>
      </div>`).join("")}</div>
      ${Math.abs(sum - amount()) > 0.009 ? `<p class="warn-text">A soma das partes (${brl(sum)}) difere do valor (${brl(amount())}).</p>` : ""}` : '<p class="sub">Sem dono. Escolha uma ou mais pessoas acima.</p>';
    $$("#fRows [data-k]").forEach(input => input.oninput = input.onchange = () => {
      const r = rows[input.dataset.i], k = input.dataset.k;
      r[k] = k === "amount" || k === "dueNow" ? num(input.value) : input.value;
      if (k === "amount") r.dueNow = r[k];
      if (k === "amount") drawRows();
    });
  };
  $$("#dialog [data-owner]").forEach(b => b.onclick = () => {
    const o = b.dataset.owner, list = rows.some(r => r.owner === o) ? rows.filter(r => r.owner !== o).map(r => r.owner) : [...rows.map(r => r.owner), o];
    const values = list.length ? splitCents(amount(), list.length) : [];
    rows = list.map((owner, i) => ({ owner, amount: values[i], dueNow: values[i], payTo: defaultPayTo(owner), variationNote: "" }));
    drawRows();
  });
  $("#fAmount").onchange = () => { const values = rows.length ? splitCents(amount(), rows.length) : []; rows.forEach((r, i) => { r.amount = values[i]; r.dueNow = values[i]; }); drawRows(); };
  drawRows();

  $("#fSave").onclick = () => {
    const sum = round2(rows.reduce((s, r) => s + num(r.amount), 0));
    if (rows.length && Math.abs(sum - amount()) > 0.009) return toast("A soma das partes precisa ser igual ao valor.");
    const target = isNew ? tx : m.transactions.find(t => t.id === tx.id);
    Object.assign(target, { date: $("#fDate").value.trim(), installment: $("#fInst").value.trim(), merchant: $("#fMerchant").value.trim() || "LANÇAMENTO MANUAL", location: $("#fLocation").value.trim(), amount: amount() });
    const note = $("#fNote").value.trim();
    if (note || describe(target)) target.note = note;
    if (rows.length === 1) Object.assign(target, { owner: rows[0].owner, dueNow: num(rows[0].dueNow), payTo: rows[0].payTo, variationNote: rows[0].variationNote || "", shares: [] });
    else if (rows.length > 1) Object.assign(target, { owner: rows.map(r => r.owner).join(" e "), dueNow: target.amount, payTo: "", variationNote: "", shares: rows.map(r => ({ owner: r.owner, amount: num(r.amount), dueNow: num(r.dueNow), payTo: r.payTo, variationNote: r.variationNote || "" })) });
    else assignOwners(target, []);
    const person = $("#fAgPerson").value.trim(), agAmount = num($("#fAgAmount").value);
    target.agreement = person && agAmount ? { person, amount: agAmount, note: $("#fAgNote").value.trim() } : null;
    if (isNew) {
      const all = [...store.state.transactions, ...store.state.invoices.flatMap(i => i.transactions || [])];
      target.id = Math.max(0, ...all.map(t => Number(t.id) || 0)) + 1;
      target.invoiceId = app.monthId;
      m.transactions.push(target);
    }
    commit(); dialog.close(); toast("Lançamento salvo");
  };
  $("#fDelete")?.addEventListener("click", () => {
    if (!confirm(`Excluir "${tx.merchant}" (${brl(tx.amount)})? Ele vai para a lixeira do painel.`)) return;
    m.transactions.splice(m.transactions.indexOf(tx), 1);
    store.state.deletedTransactions.push({ ...structuredClone(tx), deletedAt: new Date().toISOString() });
    commit(); dialog.close(); toast("Lançamento excluído");
  });
}

/* ------------------------------------------------------------ pagamento */
export function editPayment(owner) {
  const m = month(), p = m.totals.people[owner], s = m.status(owner), target = settlementTarget(owner);
  let status = s.status;
  const dialog = openDialog(`
    <div class="dlg-h"><div class="prow">${avatar(owner, "sm")}<div><div class="eyebrow">Pagamento de ${esc(m.invoice.month)}</div><h3>${esc(owner)} · ${brl(p.pay)}</h3></div></div><button class="x" data-close aria-label="Fechar">×</button></div>
    <div class="seg" role="radiogroup">${[["pend", "A cobrar"], ["sent", "Cobrança enviada"], ["paid", "Pago"]].map(([k, l]) => `<button type="button" data-st="${k}" role="radio">${l}</button>`).join("")}</div>
    <div id="payPaid" class="form">
      <label>Quanto ${owner === CARD_PAYER ? "foi pago" : `chegou para ${CARD_PAYER}`}<input id="pReceived" type="number" step="0.01" value="${s.received ?? p.pay}"></label>
      <div id="pDiff"></div>
    </div>
    <div class="dlg-actions"><span class="grow"></span><button class="btn" data-close>Cancelar</button><button class="btn primary" id="pSave">Salvar</button></div>`);
  const draw = () => {
    $$("#dialog [data-st]").forEach(b => { b.classList.toggle("on", b.dataset.st === status); b.setAttribute("aria-checked", b.dataset.st === status); });
    $("#payPaid").hidden = status !== "paid";
    const diff = round2(p.pay - num($("#pReceived").value));
    $("#pDiff").innerHTML = diff > 0.004 ? `<label>Faltam ${brl(diff)}. Quem cobre?<select id="pCover"><option value="">Ninguém ainda</option>${store.state.owners.filter(o => o !== owner).map(o => `<option ${s.coveredBy === o ? "selected" : ""}>${esc(o)}</option>`).join("")}<option ${s.coveredBy === "Próximo mês" ? "selected" : ""}>Próximo mês</option></select></label>`
      : diff < -0.004 ? `<p class="sub">Pagou ${brl(-diff)} a mais (fica como crédito).</p>` : "";
  };
  $$("#dialog [data-st]").forEach(b => b.onclick = () => { status = b.dataset.st; draw(); });
  $("#pReceived").oninput = draw;
  draw();
  $("#pSave").onclick = () => {
    const now = new Date().toISOString();
    if (status === "pend") { delete target.sentAt; delete target.verified; delete target.verifiedAt; delete target.received; delete target.coveredBy; }
    if (status === "sent") { target.sentAt ||= now; delete target.verified; delete target.verifiedAt; delete target.received; delete target.coveredBy; }
    if (status === "paid") { target.sentAt ||= now; target.verified = true; target.verifiedAt ||= now; target.received = num($("#pReceived").value); target.coveredBy = $("#pCover")?.value || ""; }
    commit(); dialog.close(); toast(status === "paid" ? `${first(owner)}: pagamento registrado` : "Situação atualizada");
  };
}

/* ------------------------------------------------------------ WhatsApp */
export function sendMessage(owner) {
  const m = month(), text = whatsappMessage({ owner, invoice: m.invoice, person: m.totals.people[owner], status: m.status(owner), dueDate: m.due });
  const phone = String(store.state.profiles[owner]?.phone || "").replace(/\D/g, "");
  const url = `https://wa.me/${phone ? (phone.length <= 11 ? "55" + phone : phone) : ""}?text=${encodeURIComponent(text)}`;
  const dialog = openDialog(`
    <div class="dlg-h"><div class="prow">${avatar(owner, "sm")}<h3>Mensagem para ${esc(owner)}</h3></div><button class="x" data-close aria-label="Fechar">×</button></div>
    <pre class="msg">${esc(text)}</pre>
    ${phone ? "" : `<p class="sub">Dica: cadastre o WhatsApp de ${esc(first(owner))} em “Editar perfil” para a conversa abrir direto.</p>`}
    <div class="dlg-actions"><button class="btn" id="mCopy">Copiar</button><span class="grow"></span><a class="btn wa" id="mOpen" target="_blank" rel="noopener" href="${url}">Abrir no WhatsApp</a></div>`);
  const markSent = () => {
    if (store.mode !== "admin" || m.status(owner).status !== "pend") return;
    settlementTarget(owner).sentAt = new Date().toISOString();
    commit();
  };
  $("#mCopy").onclick = async () => { try { await navigator.clipboard.writeText(text); toast("Mensagem copiada"); markSent(); } catch { toast("Não foi possível copiar"); } };
  $("#mOpen").onclick = () => { markSent(); setTimeout(() => dialog.close(), 300); };
}

/* ------------------------------------------------------------ perfis */
export function editProfile(owner) {
  const state = store.state, isNew = !owner, p = isNew ? {} : state.profiles[owner] || {};
  const used = !isNew && [...state.transactions, ...state.invoices.flatMap(i => i.transactions || [])].some(tx => allocations(tx).some(a => a.owner === owner));
  const dialog = openDialog(`
    <div class="dlg-h"><h3>${isNew ? "Nova pessoa" : `Perfil de ${esc(owner)}`}</h3><button class="x" data-close aria-label="Fechar">×</button></div>
    <div class="form">
      <label>Nome<input id="prName" value="${esc(owner || "")}" placeholder="Ex.: Maria"></label>
      <div class="f2"><label>WhatsApp<input id="prPhone" value="${esc(p.phone || "")}" placeholder="82 99999-0000" inputmode="tel"></label><label>Cor<input id="prColor" type="color" value="${color(owner || "") || "#64748b"}"></label></div>
      <label>Observações<textarea id="prNotes" rows="2">${esc(p.notes || "")}</textarea></label>
    </div>
    <div class="dlg-actions">${!isNew && !used && owner !== CARD_PAYER ? '<button class="btn danger" id="prDelete">Remover</button>' : ""}<span class="grow"></span><button class="btn" data-close>Cancelar</button><button class="btn primary" id="prSave">Salvar</button></div>`);
  $("#prSave").onclick = () => {
    const name = $("#prName").value.trim();
    if (!name) return toast("Informe o nome.");
    if (name !== owner && state.owners.includes(name)) return toast("Já existe alguém com esse nome.");
    if (isNew) { state.owners.push(name); state.profiles[name] = {}; }
    else if (name !== owner) renameOwner(owner, name);
    Object.assign(state.profiles[name], { phone: $("#prPhone").value.trim(), color: $("#prColor").value, notes: $("#prNotes").value.trim() });
    commit(); dialog.close(); toast("Perfil salvo");
    if (!isNew && name !== owner) location.hash = `pessoa/${encodeURIComponent(name)}`;
  };
  $("#prDelete")?.addEventListener("click", () => {
    if (!confirm(`Remover ${owner} do painel?`)) return;
    state.owners.splice(state.owners.indexOf(owner), 1); delete state.profiles[owner];
    commit(); dialog.close(); location.hash = "pessoas";
  });
}

function renameOwner(from, to) {
  const state = store.state;
  const fix = tx => {
    if (tx.owner === from) tx.owner = to;
    else if (tx.shares?.length) tx.owner = tx.shares.map(s => s.owner === from ? to : s.owner).join(" e ");
    if (tx.payTo === from) tx.payTo = to;
    (tx.shares || []).forEach(s => { if (s.owner === from) s.owner = to; if (s.payTo === from) s.payTo = to; });
  };
  state.transactions.forEach(fix);
  state.invoices.forEach(i => { (i.transactions || []).forEach(fix); if (i.settlementState?.[from]) { i.settlementState[to] = i.settlementState[from]; delete i.settlementState[from]; } });
  state.rules.forEach(r => { r.owners = r.owners.map(o => o === from ? to : o); });
  state.owners[state.owners.indexOf(from)] = to;
  state.profiles[to] = state.profiles[from]; delete state.profiles[from];
}

/* ------------------------------------------------------------ link pessoal */
export function personalLink(owner) {
  const profile = store.state.profiles[owner];
  const make = () => { const bytes = crypto.getRandomValues(new Uint8Array(18)); profile.token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); commit(); };
  if (!profile.token) make();
  const draw = () => {
    const url = `${location.origin}/?p=${profile.token}`;
    openDialog(`
      <div class="dlg-h"><div class="prow">${avatar(owner, "sm")}<h3>Link pessoal de ${esc(first(owner))}</h3></div><button class="x" data-close aria-label="Fechar">×</button></div>
      <p class="sub">Quem abrir este link vê só as compras e pagamentos de ${esc(owner)}, sem poder editar. Não mostra o restante do cartão.</p>
      <div class="linkbox"><input readonly value="${esc(url)}" id="lkUrl"><button class="btn primary" id="lkCopy">Copiar</button></div>
      <div class="dlg-actions"><button class="btn danger" id="lkNew">Trocar link</button><span class="grow"></span><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Oi, ${first(owner)}! Este é o seu link para acompanhar sua parte do cartão: ${url}`)}">Enviar no WhatsApp</a></div>`);
    $("#lkCopy").onclick = async () => { try { await navigator.clipboard.writeText(url); toast("Link copiado"); } catch { $("#lkUrl").select(); } };
    $("#lkNew").onclick = () => { if (confirm("O link atual deixa de funcionar. Continuar?")) { make(); draw(); } };
  };
  draw();
}

/* ------------------------------------------------------------ configurações */
export function settings() {
  const state = store.state, admin = store.mode === "admin";
  const dialog = openDialog(`
    <div class="dlg-h"><h3>Configurações</h3><button class="x" data-close aria-label="Fechar">×</button></div>
    <div class="form">
      <div class="state-line ${store.statusKind || ""}">${admin ? "Este aparelho pode editar" : "Somente leitura"} · ${esc(store.status)}</div>
      ${admin ? `<label>Dia de vencimento da fatura<input id="sDue" type="number" min="1" max="28" value="${state?.settings?.dueDay || 1}"></label>
        <div class="f2"><button class="btn" id="sExport">Baixar cópia dos dados (JSON)</button><label class="btn file">Restaurar de um JSON<input type="file" id="sImport" accept="application/json"></label></div>
        <button class="btn danger" id="sOut">Desconectar este aparelho</button>`
      : `<label>Chave de edição<input id="sKey" type="password" autocomplete="current-password" value="${esc(getKey())}"></label><button class="btn primary" id="sIn">Conectar</button>`}
    </div>`);
  $("#sIn")?.addEventListener("click", async () => { try { await connect($("#sKey").value.trim()); dialog.close(); toast("Aparelho conectado"); } catch (e) { toast(e.message); } });
  $("#sOut")?.addEventListener("click", () => { if (confirm("Este aparelho deixará de editar o painel.")) { disconnect(); dialog.close(); } });
  $("#sDue")?.addEventListener("change", e => { state.settings = { ...(state.settings || {}), dueDay: Math.min(28, Math.max(1, num(e.target.value))) }; commit(); });
  $("#sExport")?.addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    a.download = `painel-familia-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#sImport")?.addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    file.text().then(text => {
      const data = JSON.parse(text);
      if (!Array.isArray(data.transactions) || !Array.isArray(data.invoices)) throw new Error();
      if (!confirm("Substituir TODOS os dados do painel por este arquivo?")) return;
      Object.keys(state).forEach(k => { if (k !== "updatedAt") delete state[k]; });
      Object.assign(state, data, { updatedAt: state.updatedAt });
      commit(); dialog.close(); toast("Dados restaurados");
    }).catch(() => toast("Arquivo inválido"));
  });
}

/* ------------------------------------------------------------ imagem 1080×1350 */
export async function shareImage(owner) {
  const m = month(), p = m.totals.people[owner], c = color(owner), canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
  canvas.width = 1080; canvas.height = 1350;
  ctx.fillStyle = "#f3f5fa"; ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#13285c"; ctx.fillRect(0, 0, 1080, 300);
  ctx.fillStyle = c; ctx.fillRect(0, 300, 1080, 10);
  ctx.fillStyle = "#b9c5e6"; ctx.font = "600 30px Segoe UI, sans-serif"; ctx.fillText(`PAINEL FAMÍLIA · ${m.invoice.month.toUpperCase()} ${m.invoice.year}`, 70, 90);
  ctx.fillStyle = "#fff"; ctx.font = "700 64px Segoe UI, sans-serif"; ctx.fillText(owner, 70, 175);
  ctx.font = "400 32px Segoe UI, sans-serif"; ctx.fillStyle = "#dfe6fb";
  const deadline = new Date(m.due.getTime() - 864e5).toLocaleDateString("pt-BR");
  ctx.fillText(owner === CARD_PAYER ? `Fatura vence em ${m.due.toLocaleDateString("pt-BR")}` : `Pagar para ${CARD_PAYER} até ${deadline}`, 70, 240);
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(60, 350, 960, 190, 28); ctx.fill();
  ctx.fillStyle = "#667085"; ctx.font = "600 28px Segoe UI, sans-serif"; ctx.fillText("VALOR A PAGAR", 100, 410);
  ctx.fillStyle = "#141c2f"; ctx.font = "800 88px Segoe UI, sans-serif"; ctx.fillText(brl(p.pay), 100, 505);
  let y = 610;
  ctx.fillStyle = "#667085"; ctx.font = "600 28px Segoe UI, sans-serif"; ctx.fillText("COMPRAS", 70, y); y += 30;
  const items = p.items.slice(0, 12);
  for (const { tx, a } of items) {
    y += 52;
    const part = installment(tx.installment), label = (describe(tx) || tx.merchant).slice(0, 34);
    ctx.fillStyle = "#141c2f"; ctx.font = "500 32px Segoe UI, sans-serif"; ctx.fillText(label, 70, y);
    ctx.fillStyle = "#98a2b3"; ctx.font = "400 26px Segoe UI, sans-serif"; ctx.fillText(part ? `${tx.installment}${part.current === part.total ? " · última" : ""}` : "à vista", 640, y);
    ctx.fillStyle = "#141c2f"; ctx.font = "700 32px Segoe UI, sans-serif"; ctx.textAlign = "right"; ctx.fillText(brl(a.amount), 1010, y); ctx.textAlign = "left";
  }
  if (p.items.length > items.length) { y += 50; ctx.fillStyle = "#667085"; ctx.font = "italic 28px Segoe UI, sans-serif"; ctx.fillText(`+ ${p.items.length - items.length} compras`, 70, y); }
  ctx.fillStyle = "#98a2b3"; ctx.font = "400 24px Segoe UI, sans-serif"; ctx.fillText("Cartão BV · demonstrativo gerado pelo Painel Família", 70, 1300);
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  const url = URL.createObjectURL(blob), name = `demonstrativo-${owner.replace(/\W+/g, "-")}-${m.invoice.month}.png`;
  const dialog = openDialog(`<div class="dlg-h"><h3>Imagem para ${esc(first(owner))}</h3><button class="x" data-close aria-label="Fechar">×</button></div>
    <img class="share-preview" src="${url}" alt="Demonstrativo de ${esc(owner)}">
    <div class="dlg-actions"><a class="btn" href="${url}" download="${esc(name)}">Baixar PNG</a><span class="grow"></span><button class="btn primary" id="imgShare">Compartilhar</button></div>`);
  $("#imgShare").onclick = async () => {
    const file = new File([blob], name, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); } catch { /* cancelado */ } }
    else toast("Use “Baixar PNG” e envie pelo WhatsApp");
  };
  dialog.addEventListener("close", () => URL.revokeObjectURL(url), { once: true });
}
