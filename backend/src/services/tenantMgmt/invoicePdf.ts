/**
 * Invoice PDF (plan §6.4, M4): A4, primary-tenant branding, number, dates,
 * bill-to, lines, total, a PAID / VOID stamp and the payment instructions.
 * Same stack as services/pdfExport.ts (Puppeteer printing an HTML page), no new
 * dependency. Rendered on demand, never stored.
 */
import puppeteer from "puppeteer";
import { sql } from "drizzle-orm";
import { primaryDb } from "../../db";
import { LOGO_DATA_URI } from "../pdfAssets";
import type { SerializedInvoice } from "./billing";

export interface InvoicePdfInput {
  invoice: SerializedInvoice;
  billTo: { name: string; lines: string[] };
  instructions: Array<{ method: string; label: string; details: string }>;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number, currency: string) => `${new Intl.NumberFormat("en-RW").format(n)} ${esc(currency)}`;
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Kigali" }) : "—";

/** The primary tenant's school (the platform operator) as the issuer. */
async function issuer(): Promise<{ name: string; address: string | null; email: string | null; phone: string | null }> {
  try {
    const rows = (await primaryDb().execute(
      sql`SELECT name, address, contact_email, contact_phone FROM School WHERE status = 'ACTIVE' ORDER BY school_id LIMIT 1`,
    )) as any;
    const r = rows[0]?.[0];
    if (r) return { name: String(r.name), address: r.address ?? null, email: r.contact_email ?? null, phone: r.contact_phone ?? null };
  } catch {
    /* no School table: generic issuer */
  }
  return { name: "NGA Central MIS", address: null, email: null, phone: null };
}

export function buildInvoiceHtml(input: InvoicePdfInput, from: Awaited<ReturnType<typeof issuer>>): string {
  const inv = input.invoice;
  const stamp = inv.status === "PAID" ? "PAID" : inv.status === "VOID" ? "VOID" : inv.status === "DRAFT" ? "DRAFT" : null;
  const stampColor = inv.status === "PAID" ? "#047857" : inv.status === "VOID" ? "#b91c1c" : "#64748b";
  const lines = inv.lines.length ? inv.lines : [{ label: `${inv.packageCode} package`, amount: inv.amount }];
  const period = inv.periodStart || inv.periodEnd ? `${day(inv.periodStart)} – ${day(inv.periodEnd)}` : inv.billingCycle === "YEAR" ? "One year" : "One term";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #374151; font-size: 12.5px; margin: 0; }
  .top { display: table; width: 100%; margin-bottom: 28px; }
  .top > div { display: table-cell; vertical-align: top; }
  .brand img { height: 46px; }
  .brand .name { font-size: 15px; font-weight: 700; color: #1a2333; margin-top: 6px; }
  .brand .meta, .muted { color: #6b7280; font-size: 11px; line-height: 1.5; }
  .title { text-align: right; }
  .title h1 { font-size: 26px; margin: 0; color: #1d4ed8; letter-spacing: 0.04em; }
  .title .num { font-size: 13px; font-weight: 600; color: #1a2333; margin-top: 4px; }
  .grid { display: table; width: 100%; margin-bottom: 22px; }
  .grid > div { display: table-cell; width: 50%; vertical-align: top; }
  .label { font-size: 9.5px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #1d4ed8; margin-bottom: 4px; }
  .billto { font-size: 14px; font-weight: 600; color: #1a2333; }
  table.dates td { padding: 2px 0; } table.dates td:first-child { color: #6b7280; padding-right: 14px; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.lines th { background: #f6f7fb; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; padding: 8px 10px; border-bottom: 1px solid #e2e6ee; }
  table.lines td { padding: 9px 10px; border-bottom: 1px solid #e2e6ee; }
  .r { text-align: right; }
  .total td { font-size: 14px; font-weight: 700; color: #1a2333; border-bottom: none; }
  .stamp { position: fixed; top: 300px; left: 140px; transform: rotate(-18deg); font-size: 88px; font-weight: 800; letter-spacing: 0.12em;
           color: ${stampColor}; opacity: 0.16; border: 8px solid ${stampColor}; padding: 4px 30px; border-radius: 14px; }
  .pay { margin-top: 28px; padding: 14px 16px; background: #eef2ff; border-radius: 6px; }
  .pay .item { margin-top: 8px; } .pay b { color: #1a2333; }
  .foot { margin-top: 24px; color: #9ca3af; font-size: 10px; }
</style></head><body>
  ${stamp ? `<div class="stamp">${stamp}</div>` : ""}
  <div class="top">
    <div class="brand">
      <img src="${LOGO_DATA_URI}" alt="" />
      <div class="name">${esc(from.name)}</div>
      <div class="meta">${[from.address, from.email, from.phone].filter(Boolean).map(esc).join("<br/>")}</div>
    </div>
    <div class="title">
      <h1>INVOICE</h1>
      <div class="num">${esc(inv.number ?? `Draft #${inv.id}`)}</div>
    </div>
  </div>
  <div class="grid">
    <div>
      <div class="label">Bill to</div>
      <div class="billto">${esc(input.billTo.name)}</div>
      <div class="muted">${input.billTo.lines.map(esc).join("<br/>")}</div>
    </div>
    <div>
      <table class="dates">
        <tr><td>Issued</td><td>${day(inv.issuedAt)}</td></tr>
        <tr><td>Due</td><td>${day(inv.dueAt)}</td></tr>
        ${inv.paidAt ? `<tr><td>Paid</td><td>${day(inv.paidAt)}</td></tr>` : ""}
        <tr><td>Period</td><td>${esc(period)}</td></tr>
        <tr><td>Package</td><td>${esc(inv.packageCode)} · ${inv.billingCycle === "YEAR" ? "yearly" : "per term"}</td></tr>
      </table>
    </div>
  </div>
  <table class="lines">
    <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
    <tbody>
      ${lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="r">${money(l.amount, inv.currency)}</td></tr>`).join("")}
      <tr class="total"><td class="r">Total</td><td class="r">${money(inv.amount, inv.currency)}</td></tr>
    </tbody>
  </table>
  ${inv.notes ? `<p class="muted" style="white-space:pre-line">${esc(inv.notes)}</p>` : ""}
  ${
    input.instructions.length && inv.status !== "PAID" && inv.status !== "VOID"
      ? `<div class="pay"><div class="label">How to pay</div>
         <div class="muted">Use <b>${esc(inv.number ?? `#${inv.id}`)}</b> as the payment reference, then upload the proof.</div>
         ${input.instructions.map((i) => `<div class="item"><b>${esc(i.label)}</b><br/>${esc(i.details)}</div>`).join("")}</div>`
      : ""
  }
  <div class="foot">${esc(from.name)} · ${esc(inv.number ?? "")}</div>
</body></html>`;
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const html = buildInvoiceHtml(input, await issuer());
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "a4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "16mm", right: "16mm" } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
