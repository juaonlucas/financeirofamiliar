import { readFileSync } from "node:fs";
import vm from "node:vm";

let source = readFileSync("app.js", "utf8");
source = source.slice(0, source.lastIndexOf("init();"));
source += `\n;globalThis.__finance={transactions,allocations,ownerTotals};`;
const context = { localStorage: { getItem: () => null, setItem: () => {} }, structuredClone, console };
vm.createContext(context);
vm.runInContext(source, context);

const { transactions, allocations, ownerTotals } = context.__finance;
const close = (actual, expected, label) => {
  if (Math.abs(actual - expected) > 0.009) throw new Error(`${label}: esperado ${expected}, recebido ${actual}`);
};
const launches = transactions.reduce((sum, tx) => sum + tx.amount, 0);
const identified = transactions.filter(tx => allocations(tx).length).reduce((sum, tx) => sum + tx.amount, 0);
const unknown = transactions.filter(tx => !allocations(tx).length).reduce((sum, tx) => sum + tx.amount, 0);
const totals = ownerTotals();
close(launches, 8189.95, "Total dos lançamentos");
close(identified, 7141.72, "Total identificado");
close(unknown, 1048.23, "Total sem dono");
close(identified + unknown, launches, "Reconciliação geral");
close(Object.values(totals).reduce((sum, item) => sum + item.total, 0), identified, "Rateio por pessoa");

const tv = transactions.find(tx => tx.owner === "Kauany" && /televis/i.test(tx.note || ""));
if (!tv) throw new Error("Compra da televisão da Kauany não encontrada.");
tv.dueNow = 50;
tv.payTo = "Rosa";
const varied = ownerTotals();
close(varied.Kauany.pending, tv.amount - 50, "Pendência da Kauany");
close(varied.Rosa.covers, tv.amount - 50, "Cobertura automática da Rosa");
console.log("Testes financeiros e de reconciliação concluídos.");

