// Regras financeiras do Painel Família. Funções puras: usadas pela interface, pelos testes e pela API.

export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const DEFAULT_COLORS = { "Rosa": "#e91e63", "Wedja": "#c28b00", "Aianny": "#2476c5", "Ju/Wellington": "#238b45", "Joao Lucas": "#e56b18", "Kauany": "#7a3db8", "Evane": "#008c88" };
export const CARD_PAYER = "Rosa";
export const FEE = /ENCARGOS|MULTA|MORA\b|IOF|ANUIDADE|SEGURO CARTAO|SEGUROEMPRESTIMO|DESCONTO PROGRESSIVO|JUROS/i;
export const LATE_FEE = /MULTA|MORA\b|ENCARGOS DO ROTATIVO|REPASSE DE IOF/i;
const MONTHLY_FIELDS = ["received", "coveredBy", "verified", "verifiedAt", "sentAt"];

export const num = value => Number(String(value ?? "").replace(",", ".")) || 0;
export const round2 = value => Math.round(value * 100) / 100;

export function splitCents(total, count) {
  const cents = Math.round(num(total) * 100), base = Math.floor(cents / count), rest = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < rest ? 1 : 0)) / 100);
}

export function plain(value = "") {
  return String(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/^(MP\s*\*|MP\s+|PAG\*|MERCADOPAGO\*|MERCADOLIVRE\*)/, "").replace(/[^A-Z0-9]+/g, " ").trim();
}

export function installment(value) {
  const match = String(value || "").match(/^(\d+)\s*\/\s*(\d+)$/);
  return match ? { current: Number(match[1]), total: Number(match[2]) } : null;
}

export const isFee = tx => FEE.test(tx.merchant || "");
export const isLateFee = tx => LATE_FEE.test(tx.merchant || "");
export const defaultPayTo = owner => owner && owner !== CARD_PAYER ? CARD_PAYER : "";

/** Quem responde por um lançamento: [{owner, amount, dueNow, payTo, variationNote}] */
export function allocations(tx) {
  const normalize = a => ({ ...a, amount: num(a.amount), dueNow: a.dueNow === undefined || a.dueNow === "" ? num(a.amount) : num(a.dueNow), payTo: a.payTo ?? defaultPayTo(a.owner), variationNote: a.variationNote || "" });
  if (tx.shares?.length) return tx.shares.map(normalize);
  if (tx.owner) return [normalize({ owner: tx.owner, amount: tx.amount, dueNow: tx.dueNow, payTo: tx.payTo, variationNote: tx.variationNote })];
  return [];
}

/** Grava responsáveis num lançamento, dividindo igualmente (mantém combinados de quem continua). */
export function assignOwners(tx, owners) {
  const previous = Object.fromEntries(allocations(tx).map(a => [a.owner, a]));
  if (!owners.length) { tx.owner = ""; tx.shares = []; tx.payTo = ""; tx.dueNow = tx.amount; return tx; }
  if (owners.length === 1) {
    const [owner] = owners, keep = previous[owner] && Math.abs(previous[owner].amount - tx.amount) < 0.005;
    Object.assign(tx, { owner, shares: [], dueNow: keep ? previous[owner].dueNow : tx.amount, payTo: keep ? previous[owner].payTo : defaultPayTo(owner) });
    return tx;
  }
  const values = splitCents(tx.amount, owners.length);
  tx.owner = owners.join(" e ");
  tx.dueNow = tx.amount;
  tx.payTo = "";
  tx.shares = owners.map((owner, i) => {
    const old = previous[owner], same = old && Math.abs(old.amount - values[i]) < 0.005;
    return { owner, amount: values[i], dueNow: same ? old.dueNow : values[i], payTo: same ? old.payTo : defaultPayTo(owner), variationNote: same ? old.variationNote : "" };
  });
  return tx;
}

/**
 * Cobrança e estorno/desconto do mesmo valor (ex.: ANUIDADE 9,90 e DESCONTO PROGRESSIVO ANUIDADE −9,90).
 * Os dois se anulam; devem ficar com o mesmo dono para ninguém pagar a cobrança sem receber o desconto.
 */
export function offsetPairs(transactions) {
  const words = tx => new Set(plain(tx.merchant).split(" ").filter(w => w.length >= 5 && !/^\d+$/.test(w)));
  const used = new Set(), pairs = [];
  for (const credit of transactions.filter(t => num(t.amount) < 0)) {
    const mine = words(credit);
    const charge = transactions.find(t => num(t.amount) > 0 && !used.has(t) && Math.abs(num(t.amount) + num(credit.amount)) < 0.005
      && (plain(t.merchant) === plain(credit.merchant) || [...words(t)].some(w => mine.has(w))));
    if (charge) { used.add(charge); pairs.push({ charge, credit }); }
  }
  return pairs;
}

const describeNote = tx => tx.note && !/Importado do PDF|identificar respons|revisar descri/i.test(tx.note) ? tx.note : "";

/** Dá o mesmo dono ao par que se anula (o da cobrança; senão o do estorno; senão quem paga o cartão). */
export function settleOffsets(transactions) {
  let changed = 0;
  for (const { charge, credit } of offsetPairs(transactions)) {
    const a = allocations(charge).map(x => x.owner), b = allocations(credit).map(x => x.owner);
    if (a.length && a.join() === b.join()) continue;
    const owners = a.length ? a : b.length ? b : [CARD_PAYER];
    assignOwners(charge, owners); assignOwners(credit, owners);
    if (!describeNote(credit)) credit.note = `estorno/desconto de ${charge.merchant}: se anulam`;
    if (!describeNote(charge)) charge.note = `anulado por ${credit.merchant}`;
    changed++;
  }
  return changed;
}

/** Totais por pessoa no mês. pay = valor que a pessoa efetivamente paga neste mês. */
export function ownerTotals(transactions, owners) {
  const totals = Object.fromEntries(owners.map(o => [o, { total: 0, due: 0, pending: 0, covers: 0, collect: 0, count: 0, items: [] }]));
  let unknown = 0, unknownCount = 0, fees = 0, lateFees = 0, sum = 0;
  for (const tx of transactions) {
    const amount = num(tx.amount), list = allocations(tx);
    sum += amount;
    if (isFee(tx)) fees += amount;
    if (isLateFee(tx)) lateFees += amount;
    if (!list.length) { unknown += amount; unknownCount++; continue; }
    for (const a of list) {
      const person = totals[a.owner];
      if (!person) continue;
      const pending = a.amount - a.dueNow;
      person.total += a.amount; person.due += a.dueNow; person.pending += pending; person.count++;
      person.items.push({ tx, a });
      if (a.payTo && totals[a.payTo] && a.payTo !== a.owner) totals[a.payTo].covers += pending;
    }
    if (tx.agreement && totals[tx.owner]) totals[tx.owner].collect += num(tx.agreement.amount);
  }
  for (const [owner, t] of Object.entries(totals)) t.pay = round2(owner === CARD_PAYER ? t.due + t.covers - t.collect : t.due);
  return { people: totals, unknown: round2(unknown), unknownCount, fees: round2(fees), lateFees: round2(lateFees), sum: round2(sum), count: transactions.length };
}

/** Situação de pagamento de cada pessoa no mês (pend → sent → paid). */
export function paymentStatus(settlement = {}, expected = 0) {
  const received = settlement.received === undefined || settlement.received === null || settlement.received === "" ? null : num(settlement.received);
  const status = settlement.verified ? "paid" : settlement.sentAt ? "sent" : "pend";
  const missing = status === "paid" && received !== null ? Math.max(0, round2(expected - received)) : 0;
  const credit = status === "paid" && received !== null ? Math.max(0, round2(received - expected)) : 0;
  return { status, received, missing, credit, coveredBy: settlement.coveredBy || "" };
}

/** Quanto cada pessoa já tem assumido nos próximos meses (só parcelas conhecidas). */
export function projection(transactions, owner, months = 6) {
  return Array.from({ length: months }, (_, k) => round2(transactions.reduce((sum, tx) => {
    const part = installment(tx.installment);
    if (!part || part.current + k + 1 > part.total) return sum;
    const list = allocations(tx);
    if (owner === null) return sum + (list.length ? 0 : num(tx.amount));
    return sum + list.filter(a => a.owner === owner).reduce((s, a) => s + a.amount, 0);
  }, 0)));
}

export function invoiceDueDate(invoice, dueDay = 1) {
  return new Date(Number(invoice.year), MONTHS.indexOf(invoice.month), dueDay);
}

export function monthOffsetLabel(invoice, offset) {
  const d = new Date(Number(invoice.year), MONTHS.indexOf(invoice.month) + offset, 1);
  return MONTHS[d.getMonth()];
}

/** Sugestões de responsável para um lançamento sem dono. Nunca aplicadas sozinhas, exceto parcela continuada. */
export function suggestOwners(tx, history, owners, rules = []) {
  const out = [], name = plain(tx.merchant), part = installment(tx.installment);
  if (part && part.current > 1) {
    const tolerance = Math.max(0.1, Math.abs(num(tx.amount)) * 0.005);
    const previous = history.filter(h => {
      const p = installment(h.installment);
      return p && p.total === part.total && p.current < part.current && plain(h.merchant) === name
        && Math.abs(Math.abs(num(h.amount)) - Math.abs(num(tx.amount))) <= tolerance && allocations(h).length;
    }).sort((a, b) => installment(a.installment).current - installment(b.installment).current);
    if (previous.length) out.push({ kind: "parcela", label: `parcela ${previous.at(-1).installment} foi de`, owners: allocations(previous.at(-1)).map(a => a.owner), note: previous.at(-1).note || "" });
  }
  if (!part || part.current === 1) {
    const rule = rules.find(r => r.merchant === name);
    if (rule) out.push({ kind: "regra", label: "regra salva:", owners: rule.owners });
  }
  if (isLateFee(tx)) return out;
  if (isFee(tx)) {
    const prev = history.filter(h => plain(h.merchant) === name && allocations(h).length).at(-1);
    out.push({ kind: "tarifa", label: prev ? "tarifa do cartão; mês passado:" : "tarifa do cartão:", owners: prev ? [...new Set(allocations(prev).map(a => a.owner))] : [CARD_PAYER] });
    return out;
  }
  const named = owners.find(o => o.split(/[\s/]+/).some(part => part.length > 2 && name.replace(/\s/g, "").includes(plain(part))));
  if (named) out.push({ kind: "nome", label: "nome na descrição:", owners: [named] });
  if (!out.length) {
    const seen = [...new Set(history.filter(h => plain(h.merchant) === name && allocations(h).length).flatMap(h => allocations(h).map(a => a.owner)))];
    if (seen.length) out.push({ kind: "loja", label: "já comprou nesta loja:", owners: seen.slice(0, 3) });
  }
  return out.slice(0, 2);
}

/** Visão de um mês: lançamentos e estado de pagamento (o mês em evidência vive na raiz do estado). */
export function monthView(state, invoiceId) {
  const invoice = state.invoices.find(i => i.id === invoiceId);
  const active = invoiceId === state.activeInvoiceId;
  const transactions = active ? state.transactions : (invoice?.transactions || []);
  const settlement = owner => active ? (state.profiles?.[owner] || {}) : (invoice?.settlementState?.[owner] || {});
  return { invoice, active, transactions, settlement };
}

export function historyTransactions(state, exceptId) {
  return state.invoices.filter(i => i.id !== exceptId && i.id !== state.activeInvoiceId).flatMap(i => i.transactions || [])
    .concat(exceptId === state.activeInvoiceId ? [] : state.transactions);
}

/** Arquiva o mês em evidência dentro do seu invoice (lançamentos + pagamentos). */
export function archiveActive(state) {
  const invoice = state.invoices.find(i => i.id === state.activeInvoiceId);
  if (!invoice) return;
  invoice.transactions = structuredClone(state.transactions);
  invoice.settlementState = Object.fromEntries(state.owners.map(o => [o, Object.fromEntries(MONTHLY_FIELDS.map(k => [k, state.profiles?.[o]?.[k]]))]));
}

export function resetMonthlyState(state) {
  for (const owner of state.owners) for (const k of MONTHLY_FIELDS) if (state.profiles?.[owner]) delete state.profiles[owner][k];
}

/** Recorte do estado para o link pessoal: só as compras e pagamentos daquela pessoa. */
export function personScope(state, owner) {
  const onlyMine = list => (list || []).filter(tx => allocations(tx).some(a => a.owner === owner)).map(tx => {
    const mine = allocations(tx).filter(a => a.owner === owner);
    const safe = { id: tx.id, invoiceId: tx.invoiceId, date: tx.date, merchant: tx.merchant, location: tx.location, installment: tx.installment, amount: tx.amount, note: tx.note };
    return tx.shares?.length ? { ...safe, owner: "", shares: mine } : { ...safe, owner, dueNow: mine[0].dueNow, payTo: mine[0].payTo, variationNote: mine[0].variationNote };
  });
  const p = state.profiles?.[owner] || {};
  return {
    version: state.version, owners: [owner], activeInvoiceId: state.activeInvoiceId, updatedAt: state.updatedAt,
    profiles: { [owner]: { gender: p.gender, color: p.color, received: p.received, verified: p.verified, verifiedAt: p.verifiedAt, sentAt: p.sentAt, coveredBy: p.coveredBy } },
    transactions: onlyMine(state.transactions),
    invoices: (state.invoices || []).filter(i => Array.isArray(i.transactions) || i.id === state.activeInvoiceId).map(i => ({
      id: i.id, month: i.month, year: i.year,
      transactions: i.id === state.activeInvoiceId ? undefined : onlyMine(i.transactions),
      settlementState: i.settlementState?.[owner] ? { [owner]: i.settlementState[owner] } : {},
    })),
  };
}

/** Compara dois meses: o que entrou, o que continua e o que saiu da fatura. */
export function compareMonths(previous, current) {
  const pool = previous.map(tx => ({ tx, part: installment(tx.installment), used: false }));
  const continuing = [], fresh = [];
  for (const tx of current) {
    const part = installment(tx.installment);
    const match = part && part.current > 1 && pool.find(p => !p.used && p.part && p.part.total === part.total && p.part.current === part.current - 1
      && plain(p.tx.merchant) === plain(tx.merchant) && Math.abs(num(p.tx.amount) - num(tx.amount)) <= Math.max(0.5, num(tx.amount) * 0.01));
    if (match) { match.used = true; continuing.push({ tx, previous: match.tx }); } else fresh.push(tx);
  }
  const ended = pool.filter(p => !p.used).map(p => p.tx);
  const sum = list => round2(list.reduce((s, tx) => s + num(tx.amount), 0));
  return { continuing, fresh, ended, freshSum: sum(fresh), endedSum: sum(ended), continuingSum: sum(continuing.map(c => c.tx)) };
}

/** Meses em ordem cronológica. */
export function sortInvoices(invoices) {
  return [...invoices].sort((a, b) => (Number(a.year) - Number(b.year)) || (MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month)));
}

export function whatsappMessage({ owner, invoice, person, status, dueDate }) {
  const money = brl, first = owner.split("/")[0];
  const deadline = new Date(dueDate.getTime() - 864e5).toLocaleDateString("pt-BR");
  const lines = [`Oi, ${first}! Sua parte da fatura do cartão de ${invoice.month}:`, "", `💰 *${money(person.pay)}*`,
    owner === CARD_PAYER ? `📅 A fatura vence em ${dueDate.toLocaleDateString("pt-BR")}` : `👉 Pagar para ${CARD_PAYER} até ${deadline}`];
  if (person.pending > 0.004) lines.push(`⏳ Combinado: ${money(person.pending)} fica para depois`);
  if (owner === CARD_PAYER && person.covers > 0.004) lines.push(`🤝 Inclui ${money(person.covers)} cobertos de outras pessoas`);
  if (status?.status === "paid") lines.push("✅ Pagamento já registrado. Obrigado!");
  lines.push("", "🧾 Suas compras:");
  for (const { tx, a } of person.items) {
    const part = installment(tx.installment), shared = Math.abs(a.amount - num(tx.amount)) > 0.005;
    lines.push(`• ${tx.note && !/Importado|identificar|revisar/i.test(tx.note) ? tx.note : tx.merchant}${part ? ` (${tx.installment})` : ""}: ${money(a.amount)}${shared ? ` — sua parte de ${money(tx.amount)}` : ""}${part && part.current === part.total ? " ✅ última" : ""}`);
  }
  return lines.join("\n");
}

export function brl(value) {
  const v = num(value);
  return (v < -0.004 ? "-" : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
