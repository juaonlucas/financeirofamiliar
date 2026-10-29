// Utilidades de interface compartilhadas pelas telas.
import { DEFAULT_COLORS, monthView, ownerTotals, paymentStatus, invoiceDueDate } from "./finance.js";
import { store } from "./store.js";

export const app = { monthId: null };
export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];
export const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const first = owner => String(owner).split("/")[0].split(" ")[0];
export const slug = owner => String(owner).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const color = owner => store.state?.profiles?.[owner]?.color || DEFAULT_COLORS[owner] || "#64748b";
export const canEdit = () => store.mode === "admin";
export const describe = tx => tx.note && !/Importado do PDF|identificar respons|revisar descri/i.test(tx.note) ? tx.note : "";

export function avatar(owner, size = "") {
  return `<span class="av ${size}" style="--c:${color(owner)}" aria-hidden="true"><img src="assets/rostos/${slug(owner)}.png" alt="" loading="lazy" onerror="this.remove()">${esc(String(owner)[0] || "?")}</span>`;
}

/** Tudo que as telas precisam saber do mês selecionado. */
export function month() {
  const state = store.state, view = monthView(state, app.monthId);
  const totals = ownerTotals(view.transactions, state.owners);
  const due = invoiceDueDate(view.invoice || { year: new Date().getFullYear(), month: "Janeiro" }, state.settings?.dueDay || 1);
  const status = owner => paymentStatus(view.settlement(owner), totals.people[owner]?.pay || 0);
  const owners = state.owners.filter(o => totals.people[o]?.count);
  return { ...view, totals, due, status, owners, state };
}

export function settlementTarget(owner) {
  const state = store.state, view = monthView(state, app.monthId);
  if (view.active) return (state.profiles[owner] ||= {});
  view.invoice.settlementState ||= {};
  return (view.invoice.settlementState[owner] ||= {});
}

export const PILL = {
  pend: '<span class="pill pend">A cobrar</span>',
  sent: '<span class="pill sent">Cobrança enviada</span>',
  paid: '<span class="pill paid">✓ Pago</span>',
};

let toastTimer;
export function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 2200);
}

/** Abre um diálogo com o HTML dado; retorna o elemento <dialog>. */
export function openDialog(html, { wide = false } = {}) {
  const dialog = $("#dialog");
  dialog.className = wide ? "wide" : "";
  dialog.innerHTML = `<div class="dlg">${html}</div>`;
  dialog.showModal();
  dialog.querySelectorAll("[data-close]").forEach(b => b.onclick = () => dialog.close());
  return dialog;
}

export function daysUntil(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 864e5);
}
