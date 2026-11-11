import type { Invoice, PaymentInstruction } from "../../../../api/tenantMgmt";

const DAY = 86_400_000;
export const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

export const makeInvoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 41,
  number: "INV-2026-0041",
  kind: "CHANGE",
  applicationId: null,
  tenantId: 7,
  packageCode: "gold",
  billingCycle: "TERM",
  periodStart: iso(-10),
  periodEnd: iso(80),
  amount: 250000,
  currency: "RWF",
  status: "ISSUED",
  issuedAt: iso(-9),
  dueAt: iso(5),
  paidAt: null,
  lines: [{ label: "Gold, term", amount: 250000 }],
  notes: null,
  pdfUrl: "https://api.example/tenant/invoices/41/pdf",
  payments: [],
  ...over,
});

export const INSTRUCTIONS: PaymentInstruction[] = [
  { id: 1, method: "MOMO", label: "MoMo", details: "*182*8*1*123456#", sortOrder: 1, isActive: true },
  { id: 2, method: "BANK_TRANSFER", label: "BK", details: "000-111-2222", sortOrder: 2, isActive: true },
];
