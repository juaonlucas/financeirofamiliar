import { allocations, archiveActive, assignOwners, offsetPairs, ownerTotals, paymentStatus, personScope, projection, settleOffsets, splitCents, suggestOwners } from "../js/finance.js";

const close = (actual, expected, label) => {
  if (Math.abs(actual - expected) > 0.009) throw new Error(`${label}: esperado ${expected}, recebido ${actual}`);
};
const ok = (condition, label) => { if (!condition) throw new Error(label); };

const owners = ["Rosa", "Wedja", "Aianny", "Ju/Wellington", "Kauany"];
const tx = (id, merchant, installment, amount, extra = {}) => ({ id, date: "01/10", merchant, installment, location: "MACEIO", amount, owner: "", note: "", dueNow: amount, payTo: "", shares: [], ...extra });
const month = [
  tx(1, "AMAZON BR", "08/10", 218.99, { owner: "Kauany", payTo: "Rosa", note: "televisão" }),
  tx(2, "MP*FRANCILEIDE", "04/06", 226.66, { owner: "Aianny e Ju/Wellington", shares: [{ owner: "Aianny", amount: 113.33, dueNow: 113.33, payTo: "Rosa" }, { owner: "Ju/Wellington", amount: 113.33, dueNow: 113.33, payTo: "Rosa" }] }),
  tx(3, "NETFLIX.COM", "", 69.8, { owner: "Rosa" }),
  tx(4, "MP*TECHMUNDO", "02/07", 142.82),
  tx(5, "MULTA POR ATRASO", "", 137.34),
  tx(6, "JIM.COM VIVIANE", "07/12", 533.33, { owner: "Rosa", agreement: { person: "Leandro", amount: 266.66 } }),
];

// Rateio em centavos
const thirds = splitCents(100, 3);
close(thirds.reduce((s, v) => s + v, 0), 100, "Rateio em três pessoas");
close(thirds[0], 33.34, "Centavo residual na primeira parte");
close(splitCents(226.66, 2)[1], 113.33, "Metade da compra");

// Totais e reconciliação
let t = ownerTotals(month, owners);
close(t.sum, 1328.94, "Soma dos lançamentos");
close(t.unknown, 280.16, "Sem dono");
close(Object.values(t.people).reduce((s, p) => s + p.total, 0) + t.unknown, t.sum, "Reconciliação geral");
close(t.lateFees, 137.34, "Encargos por atraso");
close(t.people.Rosa.pay, 69.8 + 533.33 - 266.66, "Rosa desconta acordo a cobrar de terceiro");

// Combinado: Kauany paga 50 agora, Rosa cobre a diferença
month[0].dueNow = 50;
t = ownerTotals(month, owners);
close(t.people.Kauany.pay, 50, "Kauany paga o combinado");
close(t.people.Kauany.pending, 168.99, "Pendência da Kauany");
close(t.people.Rosa.covers, 168.99, "Cobertura automática da Rosa");
close(t.people.Rosa.pay, 69.8 + 533.33 - 266.66 + 168.99, "Rosa paga o que cobre");

// Atribuição e divisão
assignOwners(month[3], ["Wedja", "Aianny"]);
ok(month[3].shares.length === 2 && month[3].owner === "Wedja e Aianny", "Divisão entre duas pessoas");
close(allocations(month[3]).reduce((s, a) => s + a.amount, 0), 142.82, "Divisão soma o total");
assignOwners(month[3], ["Wedja"]);
ok(month[3].owner === "Wedja" && !month[3].shares.length && month[3].payTo === "Rosa", "Volta para uma pessoa");
assignOwners(month[3], []);
ok(!allocations(month[3]).length, "Desfaz atribuição");

// Sugestão só herda parcela continuada com mesmo total e valor
const history = [tx(10, "MP*TECHMUNDO", "01/07", 142.87, { owner: "Wedja" }), tx(11, "MP*OUTRA", "01/03", 50, { owner: "Rosa" })];
const s = suggestOwners(month[3], history, owners, []);
ok(s[0]?.kind === "parcela" && s[0].owners[0] === "Wedja", "Herda dono da parcela anterior");
ok(!suggestOwners(tx(12, "LOJA NOVA", "01/02", 10), history, owners, []).length, "Compra nova sem sugestão");
ok(suggestOwners(tx(13, "NETFLIX.COM", "", 69.8), [], owners, [{ merchant: "NETFLIX COM", owners: ["Rosa"] }])[0]?.kind === "regra", "Regra salva sugere dono");

// Projeção
const proj = projection(month, "Kauany", 3);
close(proj[0], 218.99, "Kauany ainda tem parcela 09/10");
close(proj[2], 0, "Compra da Kauany termina na parcela 10");

// Pagamentos
ok(paymentStatus({}, 100).status === "pend", "Sem registro = a cobrar");
ok(paymentStatus({ sentAt: "x" }, 100).status === "sent", "Cobrança enviada");
close(paymentStatus({ verified: true, received: 80 }, 100).missing, 20, "Pagou menos");

// Link pessoal: só as compras daquela pessoa, sem as partes dos outros
const state = { version: 4, owners, activeInvoiceId: "nov", transactions: month, profiles: { Aianny: { token: "segredo", received: 10 } }, invoices: [{ id: "out", month: "Outubro", year: 2026, total: 1, transactions: [history[0]], settlementState: { Wedja: { verified: true } } }, { id: "nov", month: "Novembro", year: 2026, total: 2 }] };
const scoped = personScope(state, "Aianny");
ok(scoped.owners.length === 1 && scoped.transactions.length === 1, "Link pessoal mostra só a pessoa");
ok(scoped.transactions[0].shares.length === 1 && scoped.transactions[0].shares[0].owner === "Aianny", "Esconde as partes de outras pessoas");
ok(!scoped.profiles.Aianny.token && !JSON.stringify(scoped).includes("segredo"), "Não vaza o token");
ok(scoped.invoices.find(i => i.id === "out").transactions.length === 0 && !scoped.invoices[0].settlementState.Wedja, "Histórico filtrado");

// Cobrança e estorno do mesmo valor ficam com o mesmo dono (somam zero)
const fees = [
  tx(30, "ANUIDADE DIFERENCIADA", "08/12", 9.9, { owner: "Rosa" }),
  tx(31, "DESCONTO PROGRESSIVO ANUIDADE", "", -9.9),
  tx(32, "SEGURO CARTAO PROTEGIDO C", "", 5.9),
  tx(33, "SEGURO CARTAO PROTEGIDO C", "", -5.9),
  tx(34, "SEGURO CARTAO PROTEGIDO E", "", 15.9),
  tx(35, "ESTORNO LOJA X", "", -20),
];
ok(offsetPairs(fees).length === 2, "Encontra os dois pares que se anulam");
ok(settleOffsets(fees) === 2, "Ajusta os dois pares");
ok(fees[1].owner === "Rosa" && fees[2].owner === "Rosa" && fees[3].owner === "Rosa", "Desconto segue a anuidade; seguro sem dono vai para Rosa");
ok(!allocations(fees[4]).length && !allocations(fees[5]).length, "Cobrança ou estorno sem par continuam sem dono");
close(ownerTotals(fees, owners).people.Rosa.total, 0, "Pares somam zero para a Rosa");

// Arquivamento do mês
archiveActive(state);
ok(state.invoices.find(i => i.id === "nov").transactions.length === month.length, "Arquiva lançamentos do mês");

console.log("Testes financeiros, de rateio, sugestões e link pessoal concluídos.");
