// Telas do painel. Cada função desenha em #view; as ações usam data-action (tratadas em main.js).
import { allocations, brl, compareMonths, offsetPairs, installment, isFee, isLateFee, monthOffsetLabel, ownerTotals, plain, projection, sortInvoices, splitCents, suggestOwners, historyTransactions, num, CARD_PAYER } from "./finance.js";
import { pdfs, pdfUrl, store } from "./store.js";
import { $, app, avatar, canEdit, color, daysUntil, describe, esc, first, month, PILL } from "./ui.js";

const view = html => { $("#view").innerHTML = html; };
const money = v => `<span class="money">${brl(v)}</span>`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------ visão do mês */
export function renderMes() {
  const m = month(), { invoice, totals, owners, due, status } = m;
  if (!invoice) return view(`<div class="empty card"><h2>Nenhuma fatura ainda</h2><p>Importe o PDF da primeira fatura para começar.</p>${canEdit() ? '<button class="btn primary" data-action="go" data-arg="importar">Importar fatura</button>' : ""}</div>`);
  const total = num(invoice.total) || totals.sum, list = m.transactions, days = daysUntil(due);
  const identified = list.length - totals.unknownCount;
  const sent = owners.filter(o => status(o).status !== "pend").length, paid = owners.filter(o => status(o).status === "paid").length;
  const stage = totals.unknownCount ? 1 : sent < owners.length ? 2 : paid < owners.length ? 3 : 4;
  const steps = [["Fatura importada", 1], [`Identificar ${identified}/${list.length}`, list.length ? identified / list.length : 1],
    [`Cobrar ${sent}/${owners.length}`, owners.length ? sent / owners.length : 0], [`Receber ${paid}/${owners.length}`, owners.length ? paid / owners.length : 0], ["Mês fechado", stage === 4 ? 1 : 0]];
  const dueText = days > 1 ? `vence em ${days} dias` : days === 1 ? "vence amanhã" : days === 0 ? "vence hoje" : `venceu em ${due.toLocaleDateString("pt-BR")}`;
  const missing = owners.map(o => ({ o, s: status(o) })).filter(x => x.s.missing > 0.004 && (!x.s.coveredBy || x.s.coveredBy === "Próximo mês"));
  const agreements = list.filter(tx => tx.agreement);
  const varied = owners.filter(o => totals.people[o].pending > 0.004);
  const alerts = [];
  if (totals.unknownCount) alerts.push(["warn", "?", `${plural(totals.unknownCount, "compra sem dono", "compras sem dono")} · ${brl(totals.unknown)}`, "Enquanto não forem identificadas, ninguém é cobrado por elas.", canEdit() ? ["Identificar", "identificar"] : null]);
  if (totals.lateFees >= 1) alerts.push(["bad", "!", `Multa e juros por atraso · ${brl(totals.lateFees)}`, "A fatura anterior foi paga depois do vencimento. Combine quem arca com esse custo.", canEdit() ? ["Definir", "identificar"] : null]);
  if (m.active && days >= 0 && days <= 6 && paid < owners.length) alerts.push(["info", "⏰", `Vencimento ${due.toLocaleDateString("pt-BR")} · ${dueText}`, `Faltam ${plural(owners.length - paid, "pagamento", "pagamentos")}. Os repasses precisam chegar à ${CARD_PAYER} até a véspera para não gerar multa.`, null]);
  if (m.active && invoice.availableLimit !== undefined && invoice.availableLimit !== null && invoice.availableLimit < 500) alerts.push(["info", "%", `Limite disponível: ${brl(invoice.availableLimit)}`, invoice.nextInstallments ? `A próxima fatura já começa com ${brl(invoice.nextInstallments)} em parcelas.` : "O cartão está praticamente sem limite.", ["Ver", "futuro"]]);
  if (missing.length) alerts.push(["bad", "R$", `Falta cobrir ${brl(missing.reduce((s, x) => s + x.s.missing, 0))}`, `${missing.map(x => first(x.o)).join(", ")} pagou menos do que o combinado e ninguém cobriu a diferença.`, null]);
  if (varied.length || agreements.length) alerts.push(["info", "≈", "Combinados do mês", [varied.length ? `${varied.map(first).join(", ")} paga menos agora (${brl(owners.reduce((s, o) => s + totals.people[o].pending, 0))} pendente)` : "", agreements.length ? `${plural(agreements.length, "acordo", "acordos")} para cobrar de terceiros` : ""].filter(Boolean).join(" · "), null]);
  if (invoice.legacy) alerts.splice(0, alerts.length, ["info", "🗂", "Fatura antiga guardada para conferência", "Registrada antes do painel dividir por pessoa: serve para comparar compras, parcelas e totais.", null]);
  if (!alerts.length) alerts.push(["ok", "✓", stage === 4 ? "Mês fechado" : "Tudo em ordem", stage === 4 ? "Todos pagaram. Nada pendente." : "Fatura identificada e conciliada.", null]);

  view(`
  <div class="grid g2">
    <section class="card">
      <div class="eyebrow">Fatura de ${esc(invoice.month)} ${esc(invoice.year)} · ${dueText}</div>
      <div class="big">${money(total)}</div>
      <div class="sub">${plural(list.length, "lançamento", "lançamentos")} · ${brl(total - totals.unknown)} já têm dono${Math.abs(totals.sum - total) > 0.02 ? ` · <span class="warn-text">lançamentos somam ${brl(totals.sum)}</span>` : ""}</div>
      <div class="stack" role="img" aria-label="Divisão da fatura por pessoa">${owners.map(o => `<b style="width:${totals.people[o].total / total * 100}%;background:${color(o)}" title="${esc(o)} ${brl(totals.people[o].total)}"></b>`).join("")}<b class="unk" style="width:${Math.max(0, totals.unknown) / total * 100}%" title="Sem dono ${brl(totals.unknown)}"></b></div>
      <div class="legend">${owners.map(o => `<span><i style="background:${color(o)}"></i>${esc(first(o))} ${money(totals.people[o].total)}</span>`).join("")}${totals.unknown ? `<span><i class="unk"></i>Sem dono ${money(totals.unknown)}</span>` : ""}</div>
      <div class="steps" ${invoice.legacy ? "hidden" : ""}>${steps.map(([label, p], i) => `<div class="step ${i < stage || stage === 4 ? "done" : i === stage ? "now" : ""}" style="--p:${Math.round(p * 100)}%"><i></i><span>${label}</span></div>`).join("")}</div>
    </section>
    <section>${alerts.map(([kind, icon, title, text, action]) => `<div class="alert ${kind}"><span class="ico">${icon}</span><div><strong>${title}</strong><p>${text}</p></div>${action ? `<button class="act" data-action="go" data-arg="${action[1]}">${action[0]}</button>` : ""}</div>`).join("")}</section>
  </div>
  ${invoice.legacy ? "" : `<div class="section-h"><h2>Quem paga o quê</h2>${canEdit() ? '<button class="link" data-action="new-profile">+ Nova pessoa</button>' : ""}</div>
  <div class="people">${owners.map(o => personCard(o, totals.people[o], status(o))).join("") || '<p class="sub">Ninguém identificado ainda.</p>'}</div>`}
  ${comparison(m)}`);
}

function monthTransactions(state, invoice) {
  return invoice.id === state.activeInvoiceId ? state.transactions : invoice.transactions || [];
}

/** Bloco "Comparado com o mês anterior". */
function comparison(m) {
  const state = store.state, ordered = sortInvoices(state.invoices), index = ordered.findIndex(i => i.id === m.invoice.id);
  const prev = ordered[index - 1];
  if (!prev) return "";
  const prevTotal = num(prev.total), curTotal = num(m.invoice.total) || m.totals.sum, diff = curTotal - prevTotal;
  const pct = prevTotal ? diff / prevTotal * 100 : 0;
  const prevTx = monthTransactions(state, prev);
  const head = `<div class="section-h"><h2>Comparado com ${esc(prev.month)}${String(prev.year) !== String(m.invoice.year) ? ` ${esc(prev.year)}` : ""}</h2>${pdfs.has(m.invoice.id) ? `<a class="link" href="${pdfUrl(m.invoice.id)}" target="_blank" rel="noopener">PDF desta fatura</a>` : ""}</div>`;
  const totalStat = `<div class="stat"><span>Total da fatura</span><strong>${money(curTotal)}</strong><em class="${diff > 0 ? "up" : "down"}">${diff >= 0 ? "▲" : "▼"} ${brl(Math.abs(diff))} (${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</em><small>${esc(prev.month)}: ${brl(prevTotal)}</small></div>`;
  if (!prevTx.length) return `${head}<section class="card stats">${totalStat}<p class="sub">A fatura de ${esc(prev.month)} só tem o total registrado.</p></section>`;
  const cmp = compareMonths(prevTx, m.transactions);
  const prevOwners = ownerTotals(prevTx, state.owners).people;
  const deltas = m.owners.filter(o => prevOwners[o]?.count).map(o => ({ o, d: m.totals.people[o].total - prevOwners[o].total })).filter(x => Math.abs(x.d) > 0.5);
  const list = (items, label) => items.length ? `<details><summary>${label} (${items.length})</summary><div class="mini-list">${items.map(tx => `<div><span>${esc(tx.date)} · ${esc(describe(tx) || tx.merchant)} <small>${esc(tx.installment || "à vista")}</small></span>${money(tx.amount)}</div>`).join("")}</div></details>` : "";
  return `${head}<section class="card">
    <div class="stats">${totalStat}
      <div class="stat"><span>Compras novas ou avulsas</span><strong>${money(cmp.freshSum)}</strong><small>${plural(cmp.fresh.length, "lançamento", "lançamentos")}</small></div>
      <div class="stat"><span>Parcelas que continuam</span><strong>${money(cmp.continuingSum)}</strong><small>${plural(cmp.continuing.length, "parcela", "parcelas")}</small></div>
      <div class="stat"><span>Saíram da fatura</span><strong>${money(cmp.endedSum)}</strong><small>${plural(cmp.ended.length, "lançamento", "lançamentos")} de ${esc(prev.month)}</small></div>
    </div>
    ${deltas.length ? `<div class="deltas">${deltas.map(x => `<span class="who-chip" style="--c:${color(x.o)}">${esc(first(x.o))} ${x.d > 0 ? "▲" : "▼"} ${brl(Math.abs(x.d))}</span>`).join("")}</div>` : ""}
    ${list(cmp.fresh, "Ver compras novas")}${list(cmp.ended, `Ver o que saiu desde ${esc(prev.month)}`)}
  </section>`;
}

function personCard(o, p, s) {
  const detail = p.pending > 0.004 ? `de ${brl(p.total)} · ${brl(p.pending)} fica para depois`
    : o === CARD_PAYER && p.covers > 0.004 ? `inclui ${brl(p.covers)} que cobre de outros`
    : s.status === "paid" && s.missing > 0.004 ? `pagou ${brl(s.received)} · faltam ${brl(s.missing)}` : "valor integral do mês";
  return `<article class="card person" data-action="go" data-arg="pessoa/${encodeURIComponent(o)}" tabindex="0">
    <div class="prow">${avatar(o)}<div class="grow"><div class="pname">${esc(o)}</div><div class="sub">${plural(p.count, "compra", "compras")} · ${o === CARD_PAYER ? "paga o cartão" : `paga para ${CARD_PAYER}`}</div></div>${PILL[s.status]}</div>
    <div><div class="pay">${money(p.pay)}</div><div class="sub">${detail}</div></div>
    ${canEdit() ? `<div class="pbtns"><button class="btn wa" data-action="msg" data-arg="${esc(o)}">WhatsApp</button><button class="btn ${s.status === "paid" ? "" : "primary"}" data-action="pay" data-arg="${esc(o)}">${s.status === "paid" ? "Pagamento ✓" : "Registrar pagamento"}</button></div>` : ""}
  </article>`;
}

/* ------------------------------------------------------------ identificar */
const splitMode = new Set();
export const recentlyAssigned = new Set();
const GROUPS = [
  ["offset", "Cobranças que se anulam", tx => offsetIds.has(tx.id), "Cobrança e estorno/desconto do mesmo valor (ex.: anuidade 9,90 e −9,90). Somam R$ 0,00 e ficam com o mesmo dono."],
  ["late", "Multa e juros por atraso", tx => isLateFee(tx) && !offsetIds.has(tx.id), "Custo de pagar a fatura anterior com atraso. Decida quem arca."],
  ["fees", "Tarifas do cartão", tx => isFee(tx) && !isLateFee(tx) && !offsetIds.has(tx.id), `Anuidade, seguros e descontos. Normalmente da ${CARD_PAYER}.`],
  ["cont", "Parcelas que continuam", tx => !isFee(tx) && !offsetIds.has(tx.id) && installment(tx.installment)?.current > 1, "A primeira parcela ficou sem dono. Definindo agora, as próximas entram sozinhas."],
  ["new", "Compras novas", tx => !isFee(tx) && !offsetIds.has(tx.id) && !(installment(tx.installment)?.current > 1), "Primeira parcela ou compra à vista."],
];

let offsetIds = new Set();
export function renderIdentificar() {
  const m = month(), { totals, transactions: list } = m, state = store.state;
  offsetIds = new Set(offsetPairs(list).flatMap(p => [p.charge.id, p.credit.id]));
  const history = historyTransactions(state, app.monthId);
  const pending = list.filter(tx => !allocations(tx).length || recentlyAssigned.has(tx.id));
  const done = list.length - totals.unknownCount;
  view(`
  <div class="sticky"><div class="card slim">
    <div class="row-between"><strong>${done} de ${list.length} identificadas</strong><span class="sub">${totals.unknownCount ? `falta ${brl(totals.unknown)}` : "tudo certo"}</span></div>
    <div class="prog"><b style="width:${list.length ? done / list.length * 100 : 100}%"></b></div>
  </div></div>
  ${pending.length ? "" : `<div class="alert ok"><span class="ico">✓</span><div><strong>Tudo identificado</strong><p>Agora é cobrar: abra a Visão do mês e envie as mensagens.</p></div><button class="act" data-action="go" data-arg="mes">Ir para cobranças</button></div>`}
  ${GROUPS.map(([id, title, test, hint]) => {
    const group = pending.filter(test);
    if (!group.length) return "";
    const open = group.filter(tx => !allocations(tx).length), sum = group.reduce((s, tx) => s + num(tx.amount), 0);
    return `<div class="group-h"><div><h3>${title} · ${money(sum)}</h3><div class="sub">${hint}</div></div>
      ${open.length && id === "offset" && canEdit() ? '<div class="bulk"><button class="btn" data-action="offsets">Juntar os pares</button></div>' : ""}
      ${open.length && (id === "fees" || id === "late") && canEdit() ? `<div class="bulk"><button class="btn" data-action="bulk" data-arg="${id}|${CARD_PAYER}">Tudo para ${CARD_PAYER}</button>${id === "late" ? `<button class="btn" data-action="bulk" data-arg="${id}|*">Dividir entre todos</button>` : ""}</div>` : ""}</div>
      ${group.map(tx => txCard(tx, suggestOwners(tx, history, state.owners, state.rules))).join("")}`;
  }).join("")}`);
}

function txCard(tx, suggestions) {
  const owners = allocations(tx).map(a => a.owner), part = installment(tx.installment), multi = splitMode.has(tx.id) || owners.length > 1;
  const note = suggestions.find(s => s.note)?.note || describe(tx);
  const ruleable = owners.length && !part && !isFee(tx) && !store.state.rules.some(r => r.merchant === plain(tx.merchant));
  return `<div class="tx ${owners.length ? "done" : ""}">
    <div><div class="m">${esc(tx.merchant)}</div><div class="meta">${esc(tx.date)} · ${part ? `parcela ${esc(tx.installment)}` : "à vista"}${tx.location ? ` · ${esc(tx.location)}` : ""}${note ? ` · <em>“${esc(note)}”</em>` : ""}</div></div>
    <div class="val">${money(tx.amount)}</div>
    ${suggestions.length && !owners.length && canEdit() ? `<div class="hint">💡 ${suggestions.map(s => `${esc(s.label)} <button data-action="assign" data-arg="${tx.id}|${esc(s.owners.join(","))}">${esc(s.owners.map(first).join(" + "))}</button>`).join(" · ")}</div>` : ""}
    ${canEdit() ? `<div class="chips">${store.state.owners.map(o => `<button class="chip ${owners.includes(o) ? "on" : ""}" style="--c:${color(o)}" data-action="pick" data-arg="${tx.id}|${esc(o)}" aria-pressed="${owners.includes(o)}">${avatar(o)}${esc(first(o))}</button>`).join("")}
      <label class="split"><input type="checkbox" data-action="split" data-arg="${tx.id}" ${multi ? "checked" : ""}> dividir</label>
      <button class="link small" data-action="edit-tx" data-arg="${tx.id}">detalhes</button></div>` : ""}
    ${owners.length > 1 ? `<div class="hint muted">Dividido: ${allocations(tx).map(a => `${esc(first(a.owner))} ${brl(a.amount)}`).join(" · ")}</div>` : ""}
    ${ruleable && canEdit() ? `<div class="hint muted">Compra que se repete? <button data-action="rule" data-arg="${tx.id}">Sempre de ${esc(owners.map(first).join(" + "))}</button></div>` : ""}
  </div>`;
}

export const isSplitMode = id => splitMode.has(id);
export function toggleSplit(id, on) { on ? splitMode.add(id) : splitMode.delete(id); }

/* ------------------------------------------------------------ pessoas */
export function renderPessoas() {
  const m = month();
  const owners = store.state.owners;
  view(`<div class="section-h"><h2>Pessoas e demonstrativos</h2>${canEdit() ? '<button class="link" data-action="new-profile">+ Nova pessoa</button>' : ""}</div>
  <div class="people">${owners.map(o => {
    const p = m.totals.people[o], s = m.status(o);
    return `<button class="card person left" data-action="go" data-arg="pessoa/${encodeURIComponent(o)}"><div class="prow">${avatar(o)}<div class="grow"><div class="pname">${esc(o)}</div><div class="pay sm">${p.count ? money(p.pay) : '<span class="sub">sem compras neste mês</span>'}</div></div>${p.count ? PILL[s.status] : ""}</div></button>`;
  }).join("")}</div>
  ${canEdit() ? `<div class="alert info top-gap"><span class="ico">🔗</span><div><strong>Link pessoal</strong><p>Em cada pessoa, use “Link pessoal” para gerar um endereço privado que mostra só as compras dela. Quem recebe não vê o cartão inteiro.</p></div></div>` : ""}`);
}

export function renderPessoa(owner) {
  const state = store.state;
  if (!state.owners.includes(owner)) return renderPessoas();
  const m = month(), p = m.totals.people[owner], s = m.status(owner), c = color(owner), inv = m.invoice;
  const proj = projection(m.transactions, owner), max = Math.max(p.total, ...proj, 1);
  const deadline = new Date(m.due.getTime() - 864e5);
  const ending = p.items.filter(({ tx }) => { const part = installment(tx.installment); return !part || part.current === part.total; });
  const personal = store.mode === "person";
  view(`${personal ? "" : '<button class="back" data-action="go" data-arg="pessoas">‹ Todas as pessoas</button>'}
  <div class="grid g2">
    <section class="card" style="--c:${c}">
      <div class="hero-p">${avatar(owner, "xl")}<div><div class="eyebrow">Demonstrativo · ${esc(inv?.month || "")} ${esc(inv?.year || "")}</div><div class="h-name">${esc(owner)}</div>${p.count ? PILL[s.status] : ""}</div></div>
      <div class="eyebrow top-gap">Valor a pagar</div>
      <div class="big">${money(p.pay)}</div>
      <div class="sub">${owner === CARD_PAYER ? `Paga a fatura do cartão até <strong>${m.due.toLocaleDateString("pt-BR")}</strong>` : `Pagar para <strong>${CARD_PAYER}</strong> até <strong>${deadline.toLocaleDateString("pt-BR")}</strong>`}${p.pending > 0.004 ? ` · combinado: ${brl(p.pending)} fica para depois` : ""}${owner === CARD_PAYER && p.covers > 0.004 ? ` · inclui ${brl(p.covers)} cobertos de outros` : ""}${owner === CARD_PAYER && p.collect > 0.004 ? ` · ${brl(p.collect)} a receber de terceiros` : ""}</div>
      ${s.status === "paid" ? `<div class="paid-note">✓ Pagamento registrado${s.received !== null ? `: ${brl(s.received)}` : ""}${s.missing > 0.004 ? ` · faltam ${brl(s.missing)}${s.coveredBy ? ` (cobre: ${esc(s.coveredBy)})` : ""}` : ""}${s.credit > 0.004 ? ` · ${brl(s.credit)} a mais` : ""}</div>` : ""}
      ${canEdit() ? `<div class="pbtns top-gap"><button class="btn wa" data-action="msg" data-arg="${esc(owner)}">WhatsApp</button><button class="btn ${s.status === "paid" ? "" : "primary"}" data-action="pay" data-arg="${esc(owner)}">${s.status === "paid" ? "Editar pagamento" : "Registrar pagamento"}</button></div>
        <div class="tools"><button class="link" data-action="share-img" data-arg="${esc(owner)}">Imagem para enviar</button><button class="link" data-action="link" data-arg="${esc(owner)}">Link pessoal</button><button class="link" data-action="profile" data-arg="${esc(owner)}">Editar perfil</button><button class="link" data-action="print">Imprimir</button></div>` : '<div class="tools"><button class="link" data-action="print">Imprimir</button></div>'}
    </section>
    <section class="card">
      <div class="eyebrow">Próximos meses · parcelas já assumidas</div>
      <div class="bars">${[p.total, ...proj].map((v, k) => `<div class="col"><em>${v ? brl(v).replace("R$ ", "") : "—"}</em><div class="stk" style="height:${v / max * 100}%;background:${c};opacity:${k ? .55 : 1}"></div><small>${k ? monthOffsetLabel(inv, k).slice(0, 3) : (inv?.month || "").slice(0, 3)}</small></div>`).join("")}</div>
      <div class="sub top-gap">${ending.length ? `${plural(ending.length, "compra termina", "compras terminam")} neste mês · ${brl(ending.reduce((s2, x) => s2 + x.a.amount, 0))} a menos no próximo` : "Nenhuma compra termina neste mês."}</div>
    </section>
  </div>
  <h2>Compras de ${esc(first(owner))} nesta fatura</h2>
  <section class="card items" style="--c:${c}">${p.items.map(({ tx, a }) => {
    const part = installment(tx.installment), shared = Math.abs(a.amount - num(tx.amount)) > 0.005, varied = a.amount - a.dueNow > 0.004;
    return `<div class="it ${canEdit() ? "clickable" : ""}" ${canEdit() ? `data-action="edit-tx" data-arg="${tx.id}"` : ""}>
      <div><strong>${esc(describe(tx) || tx.merchant)}</strong>${part && part.current === part.total ? '<span class="tag end">última parcela</span>' : !part ? '<span class="tag end">à vista</span>' : ""}${shared ? `<span class="tag">sua parte de ${brl(tx.amount)}</span>` : ""}${varied ? `<span class="tag warn">paga ${brl(a.dueNow)} agora</span>` : ""}
      <div class="sub">${esc(tx.date)}${describe(tx) ? ` · ${esc(tx.merchant)}` : ""}${a.variationNote ? ` · ${esc(a.variationNote)}` : ""}</div></div>
      <div class="money strong">${brl(a.amount)}</div>
      ${part ? `<div class="ibar"><span class="t"><b style="width:${part.current / part.total * 100}%"></b></span>${part.current} de ${part.total}${part.total > part.current ? ` · faltam ${part.total - part.current}` : ""}</div>` : ""}
    </div>`;
  }).join("") || '<p class="sub">Nenhuma compra neste mês.</p>'}</section>`);
}

/* ------------------------------------------------------------ lançamentos */
export const filters = { q: "", owner: "", status: "" };
export function renderLancamentos() {
  const m = month(), state = store.state;
  const q = plain(filters.q);
  const list = m.transactions.filter(tx => {
    const a = allocations(tx);
    if (filters.owner && !a.some(x => x.owner === filters.owner)) return false;
    if (filters.status === "unknown" && a.length) return false;
    if (filters.status === "identified" && !a.length) return false;
    if (filters.status === "agreement" && !tx.agreement && !a.some(x => x.amount - x.dueNow > 0.004)) return false;
    if (filters.status === "fees" && !isFee(tx)) return false;
    return !q || plain([tx.merchant, tx.note, tx.location, ...a.map(x => x.owner)].join(" ")).includes(q);
  });
  const sum = list.reduce((s, tx) => s + num(tx.amount), 0);
  view(`<div class="filters card slim">
    <input type="search" placeholder="Buscar loja, descrição ou pessoa" value="${esc(filters.q)}" data-filter="q">
    <select data-filter="owner"><option value="">Todas as pessoas</option>${state.owners.map(o => `<option ${filters.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
    <select data-filter="status">${[["", "Todos"], ["unknown", "Sem dono"], ["identified", "Identificados"], ["agreement", "Com combinado ou acordo"], ["fees", "Tarifas e encargos"]].map(([v, l]) => `<option value="${v}" ${filters.status === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    ${canEdit() ? '<button class="btn primary" data-action="new-tx">+ Lançamento</button>' : ""}
  </div>
  <div class="sub list-sum">${plural(list.length, "lançamento", "lançamentos")} · ${brl(sum)}</div>
  <div class="txlist">${list.map(tx => {
    const a = allocations(tx), part = installment(tx.installment);
    return `<div class="txrow ${canEdit() ? "clickable" : ""}" ${canEdit() ? `data-action="edit-tx" data-arg="${tx.id}"` : ""}>
      <div class="d">${esc(tx.date)}</div>
      <div class="grow"><strong>${esc(tx.merchant)}</strong> <span class="sub">${part ? esc(tx.installment) : "à vista"}</span><div class="sub">${esc(describe(tx))}${tx.agreement ? ` · cobrar ${esc(tx.agreement.person)} ${brl(tx.agreement.amount)}` : ""}</div></div>
      <div class="who">${a.length ? a.map(x => `<span class="who-chip" style="--c:${color(x.owner)}">${esc(first(x.owner))}</span>`).join("") : '<span class="who-chip unk">sem dono</span>'}</div>
      <div class="money strong">${brl(tx.amount)}</div>
    </div>`;
  }).join("") || '<p class="sub pad">Nada encontrado.</p>'}</div>`);
}

/* ------------------------------------------------------------ próximos meses */
export function renderFuturo() {
  const m = month(), { invoice, totals } = m, state = store.state;
  const owners = state.owners.filter(o => totals.people[o].count);
  const rows = owners.map(o => ({ o, cur: totals.people[o].total, proj: projection(m.transactions, o) }));
  const unknownProj = projection(m.transactions, null);
  const cols = [{ label: invoice.month.slice(0, 3), vals: rows.map(r => r.cur), unk: totals.unknown },
    ...unknownProj.map((u, k) => ({ label: monthOffsetLabel(invoice, k + 1).slice(0, 3), vals: rows.map(r => r.proj[k]), unk: u }))];
  const sums = cols.map(c => c.vals.reduce((a, b) => a + b, 0) + c.unk), max = Math.max(...sums, 1);
  view(`<section class="card"><div class="eyebrow">Compromisso do cartão nos próximos meses</div>
    <div class="sub">Somente parcelas que já existem. Compras novas entram por cima disso.</div>
    <div class="bars tall">${cols.map((c, k) => `<div class="col"><em>${(sums[k] / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil</em><div class="stk" style="height:${sums[k] / max * 100}%">${rows.map((r, i) => `<b style="height:${sums[k] ? c.vals[i] / sums[k] * 100 : 0}%;background:${color(r.o)}"></b>`).join("")}<b class="unk" style="height:${sums[k] ? c.unk / sums[k] * 100 : 0}%"></b></div><small>${c.label}${k ? "" : "*"}</small></div>`).join("")}</div>
    <div class="legend">${rows.map(r => `<span><i style="background:${color(r.o)}"></i>${esc(first(r.o))}</span>`).join("")}<span><i class="unk"></i>Sem dono</span><span>* mês atual</span></div>
  </section>
  <h2>Por pessoa</h2>
  <section class="card tscroll"><table><thead><tr><th>Pessoa</th>${cols.map(c => `<th>${c.label}</th>`).join("")}</tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.o)}</td><td>${money(r.cur)}</td>${r.proj.map(v => `<td class="${v ? "" : "muted"}">${v ? money(v) : "—"}</td>`).join("")}</tr>`).join("")}
    <tr><td>Sem dono</td><td>${money(totals.unknown)}</td>${unknownProj.map(v => `<td class="${v ? "" : "muted"}">${v ? money(v) : "—"}</td>`).join("")}</tr>
    <tr class="total"><td>Total</td>${sums.map(v => `<td>${money(v)}</td>`).join("")}</tr>
  </tbody></table></section>`);
}

/* ------------------------------------------------------------ histórico */
export function renderHistorico() {
  const state = store.state, invoices = sortInvoices(state.invoices);
  const max = Math.max(...invoices.map(i => num(i.total)), 1);
  const detailed = invoices.filter(i => i.id === state.activeInvoiceId || i.transactions?.length);
  const perMonth = detailed.map(i => {
    const list = i.id === state.activeInvoiceId ? state.transactions : i.transactions;
    const t = Object.fromEntries(state.owners.map(o => [o, 0]));
    let unk = 0;
    list.forEach(tx => { const a = allocations(tx); if (!a.length) unk += num(tx.amount); a.forEach(x => { if (x.owner in t) t[x.owner] += x.amount; }); });
    return { i, t, unk };
  });
  view(`<section class="card"><div class="eyebrow">Total das faturas</div>
    <div class="bars tall">${invoices.map(i => `<div class="col clickable" ${i.id === state.activeInvoiceId || i.transactions?.length ? `data-action="open-month" data-arg="${esc(i.id)}"` : ""}><em>${(num(i.total) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil</em><div class="stk" style="height:${num(i.total) / max * 100}%;background:${i.id === app.monthId ? "var(--blue)" : "#9db0e8"}"></div><small>${esc(i.month.slice(0, 3))}</small></div>`).join("")}</div>
    <div class="sub">Clique num mês com lançamentos para abri-lo.</div></section>
  <h2>Quanto cada pessoa respondeu por mês</h2>
  <section class="card tscroll"><table><thead><tr><th>Pessoa</th>${perMonth.map(x => `<th>${esc(x.i.month.slice(0, 3))}</th>`).join("")}</tr></thead><tbody>
    ${state.owners.map(o => `<tr><td>${esc(o)}</td>${perMonth.map(x => `<td class="${x.t[o] ? "" : "muted"}">${x.t[o] ? money(x.t[o]) : "—"}</td>`).join("")}</tr>`).join("")}
    <tr><td>Sem dono</td>${perMonth.map(x => `<td>${money(x.unk)}</td>`).join("")}</tr>
    <tr class="total"><td>Fatura</td>${perMonth.map(x => `<td>${money(x.i.total)}</td>`).join("")}</tr>
  </tbody></table></section>
  <h2>Faturas registradas</h2>
  <div class="inv-list">${invoices.map((i, k) => ({ i, prev: invoices[k - 1] })).reverse().map(({ i, prev }) => {
    const diff = prev ? num(i.total) - num(prev.total) : 0, open = i.id === state.activeInvoiceId || i.transactions?.length;
    return `<div class="card slim inv">
      <div><strong>${esc(i.month)} ${esc(i.year)}</strong>${i.id === state.activeInvoiceId ? ' <span class="pill paid">em evidência</span>' : ""}<div class="sub">${prev ? `${diff >= 0 ? "▲" : "▼"} ${brl(Math.abs(diff))} vs ${esc(prev.month.slice(0, 3).toLowerCase())}` : "primeira registrada"}${i.legacy ? " · sem divisão por pessoa" : ""}</div></div>
      <div class="money strong">${brl(i.total)}</div>
      <div class="inv-actions">${open ? `<button class="link" data-action="open-month" data-arg="${esc(i.id)}">abrir</button>` : ""}
        ${pdfs.has(i.id) ? `<a class="link" href="${pdfUrl(i.id)}" target="_blank" rel="noopener">PDF</a>` : canEdit() ? `<label class="link file-link">anexar PDF<input type="file" accept="application/pdf" data-attach="${esc(i.id)}"></label>` : '<span class="sub">sem PDF</span>'}</div>
    </div>`;
  }).join("")}</div>`);
}

export { splitCents };
