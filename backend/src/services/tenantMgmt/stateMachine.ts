/**
 * The lifecycles of plan §2 as data. Every status change goes through
 * assertTransition(); an invalid move is a ConflictError (HTTP 409).
 */
import { ConflictError } from "../../errors/CustomError";

export const APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "REJECTED",
  "WITHDRAWN",
  "APPROVED_AWAITING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "PAYMENT_REJECTED",
  "PAYMENT_CONFIRMED",
  "EXPIRED",
  "PROVISIONING",
  "PROVISIONING_FAILED",
  "ACTIVE",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

const APPLICATION: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: ["SUBMITTED", "WITHDRAWN", "EXPIRED"],
  SUBMITTED: ["UNDER_REVIEW", "WITHDRAWN", "CHANGES_REQUESTED", "REJECTED", "APPROVED_AWAITING_PAYMENT"],
  UNDER_REVIEW: ["CHANGES_REQUESTED", "REJECTED", "APPROVED_AWAITING_PAYMENT", "WITHDRAWN"],
  CHANGES_REQUESTED: ["UNDER_REVIEW", "WITHDRAWN", "REJECTED", "EXPIRED"],
  REJECTED: [],
  WITHDRAWN: [],
  // Waiver: straight to PAYMENT_CONFIRMED (platform.billing.waive).
  APPROVED_AWAITING_PAYMENT: ["PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "EXPIRED", "WITHDRAWN"],
  PAYMENT_SUBMITTED: ["PAYMENT_CONFIRMED", "PAYMENT_REJECTED"],
  PAYMENT_REJECTED: ["PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "EXPIRED", "WITHDRAWN"],
  PAYMENT_CONFIRMED: ["PROVISIONING"],
  // The platform can reopen an expired application.
  EXPIRED: ["APPROVED_AWAITING_PAYMENT", "UNDER_REVIEW"],
  PROVISIONING: ["ACTIVE", "PROVISIONING_FAILED"],
  PROVISIONING_FAILED: ["PROVISIONING"],
  ACTIVE: [],
};

/** Statuses in which the applicant may still edit the school details. */
export const APPLICANT_EDITABLE: ApplicationStatus[] = ["DRAFT", "CHANGES_REQUESTED"];
/** An account may hold one application that is not finished. */
export const OPEN_APPLICATION: ApplicationStatus[] = APPLICATION_STATUSES.filter(
  (s) => !["REJECTED", "WITHDRAWN", "EXPIRED", "ACTIVE"].includes(s),
) as ApplicationStatus[];

/** The applicant's six-step tracker (plan §6.2). */
export const TRACKER_STEPS = ["submitted", "review", "approved", "payment", "setup", "live"] as const;
export type TrackerStep = (typeof TRACKER_STEPS)[number];

export function trackerStep(s: ApplicationStatus): TrackerStep {
  switch (s) {
    case "DRAFT":
    case "SUBMITTED":
      return "submitted";
    case "UNDER_REVIEW":
    case "CHANGES_REQUESTED":
    case "REJECTED":
    case "WITHDRAWN":
      return "review";
    case "APPROVED_AWAITING_PAYMENT":
    case "EXPIRED":
      return "approved";
    case "PAYMENT_SUBMITTED":
    case "PAYMENT_REJECTED":
      return "payment";
    case "PAYMENT_CONFIRMED":
    case "PROVISIONING":
    case "PROVISIONING_FAILED":
      return "setup";
    case "ACTIVE":
      return "live";
  }
}

export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PAID", "VOID", "OVERDUE"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
const INVOICE: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["ISSUED", "VOID", "PAID"],
  ISSUED: ["PAID", "VOID", "OVERDUE"],
  OVERDUE: ["PAID", "VOID"],
  PAID: [],
  VOID: [],
};

export const PAYMENT_STATUSES = ["SUBMITTED", "CONFIRMED", "REJECTED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
const PAYMENT: Record<PaymentStatus, PaymentStatus[]> = {
  SUBMITTED: ["CONFIRMED", "REJECTED"],
  CONFIRMED: [],
  REJECTED: [],
};

export const TENANT_LIFECYCLE = ["PENDING", "ACTIVE", "GRACE", "SUSPENDED", "ARCHIVED"] as const;
export type TenantLifecycle = (typeof TENANT_LIFECYCLE)[number];
const TENANT: Record<TenantLifecycle, TenantLifecycle[]> = {
  PENDING: ["ACTIVE"],
  ACTIVE: ["GRACE", "SUSPENDED"],
  GRACE: ["ACTIVE", "SUSPENDED"],
  SUSPENDED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

const MACHINES = { application: APPLICATION, invoice: INVOICE, payment: PAYMENT, tenant: TENANT } as const;
export type Machine = keyof typeof MACHINES;

export function canTransition(machine: Machine, from: string, to: string): boolean {
  const table = MACHINES[machine] as Record<string, string[]>;
  return (table[from] ?? []).includes(to);
}

export function assertTransition(machine: Machine, from: string, to: string): void {
  if (!canTransition(machine, from, to)) {
    throw new ConflictError(`Cannot move this ${machine} from ${from} to ${to}.`, [{ code: "INVALID_TRANSITION", machine, from, to }]);
  }
}

export function allowedNext(machine: Machine, from: string): string[] {
  return [...((MACHINES[machine] as Record<string, string[]>)[from] ?? [])];
}
