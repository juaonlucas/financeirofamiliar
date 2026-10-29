// Leitura da fatura BV em PDF no próprio navegador (pdf.js). Mesma lógica validada na importação anterior.
import { plain } from "./finance.js";

function amountFrom(value = "") {
  const negative = /\(-\)|^-/.test(value);
  const number = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".").replace(/(?!^)-/g, "");
  return (negative ? -1 : 1) * Math.abs(Number(number) || 0);
}

function groupPageRows(content) {
  const groups = [];
  content.items.filter(item => item.str?.trim()).forEach(item => {
    const y = Math.round(item.transform[5] * 2) / 2, x = item.transform[4];
    const found = groups.find(group => Math.abs(group.y - y) <= 1.5);
    (found || groups[groups.push({ y, items: [] }) - 1]).items.push({ x, text: item.str.trim() });
  });
  return groups.sort((a, b) => b.y - a.y).map(group => ({ y: group.y, items: group.items.sort((a, b) => a.x - b.x) }));
}

function parseTransactionRow(row, page) {
  const items = row.items, dateIndex = items.findIndex(item => /^\d{2}\/\d{2}$/.test(item.text));
  if (dateIndex < 0) return null;
  const moneyIndex = items.findIndex((item, index) => index > dateIndex && /(?:R\$\s*)?[\d.]+,\d{2}$/.test(item.text) && !/^\d{2}\/\d{2}$/.test(item.text));
  if (moneyIndex < 0) return null;
  const valueItems = items.slice(dateIndex + 1, moneyIndex + 1);
  const negative = valueItems.some(item => item.text.includes("(-)")) || /^\s*-/.test(items[moneyIndex].text);
  const amount = (negative ? -1 : 1) * Math.abs(amountFrom(items[moneyIndex].text));
  if (!amount) return null;
  const middle = items.slice(dateIndex + 1, moneyIndex).filter(item => !/^R\$$/.test(item.text) && !/^\(-\)$/.test(item.text));
  if (!middle.length) return null;
  const instIndex = middle.findIndex(item => /^\d{2}\/\d{2}$/.test(item.text));
  const merchantItems = instIndex >= 0 ? middle.slice(0, instIndex) : middle.slice(0, Math.max(1, middle.length - 1));
  const locationItems = instIndex >= 0 ? middle.slice(instIndex + 1) : middle.slice(merchantItems.length);
  const merchant = merchantItems.map(i => i.text).join(" ").replace(/\s+/g, " ").trim();
  const location = locationItems.map(i => i.text).join(" ").replace(/\s+/g, " ").trim();
  if (!merchant || /^(DATA|TOTAL|VALOR|DESCRI)(?:\s|$)/i.test(merchant) || /PAGAMENTO EFETUADO/i.test(merchant)) return null;
  return { date: items[dateIndex].text, merchant, installment: instIndex >= 0 ? middle[instIndex].text : "", location: location === "-" ? "" : location, amount: Math.round(amount * 100) / 100, page };
}

function summaryFromLines(lines) {
  const all = lines.join(" ").replace(/\s+/g, " ");
  const last = re => [...all.matchAll(re)].at(-1);
  const total = last(/Total (?:desta fatura|da fatura).*?R\$\s*([\d.]+,\d{2})/gi);
  const national = last(/Total (?:nacional|de lan[^R]{0,30}nacionais).*?R\$\s*([\d.]+,\d{2})/gi);
  const month = all.match(/fatura de\s+([A-Za-zÀ-ÿ]+)/i), due = all.match(/Vencimento:?.{0,20}(\d{2})\/(\d{2})\/(\d{4})/i);
  const limit = all.match(/Limite dispon[ií]vel para uso R\$\s*([\d.]+,\d{2})/i), next = all.match(/Parcelados \(compras parceladas[^)]*\) R\$\s*([\d.]+,\d{2})/i);
  return {
    invoiceTotal: total ? amountFrom(total[1]) : 0, nationalTotal: national ? amountFrom(national[1]) : 0,
    month: month?.[1] || "", year: due ? Number(due[3]) : 0, dueDate: due ? `${due[1]}/${due[2]}/${due[3]}` : "",
    availableLimit: limit ? amountFrom(limit[1]) : null, nextInstallments: next ? amountFrom(next[1]) : null,
  };
}

export async function readInvoicePdf(file, onProgress = () => {}) {
  const pdfjs = await import("../assets/pdfjs/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../assets/pdfjs/pdf.worker.mjs", import.meta.url).href;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const found = [], lines = [];
  let started = false;
  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress(`Lendo página ${n} de ${pdf.numPages}…`);
    const rows = groupPageRows(await (await pdf.getPage(n)).getTextContent());
    lines.push(...rows.map(row => row.items.map(i => i.text).join(" ")));
    for (const row of rows) {
      const text = plain(row.items.map(i => i.text).join(" "));
      if (!text.startsWith("TOTAL") && /^LAN.*AMENTOS NACIONAIS$/.test(text)) started = true;
      if (!started) continue;
      const parsed = parseTransactionRow(row, n);
      if (parsed) found.push(parsed);
    }
  }
  return { found, summary: summaryFromLines(lines) };
}
