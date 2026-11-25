/**
 * Application-step helpers shared by the dashboard and the applications board.
 * (The old Overview page became DashboardPage.tsx.)
 */
import type { ApplicationStatus, AttentionItem, TrackerStep } from "../../../api/tenantMgmt";

/** Which application statuses sit on each journey step (pipeline strip + filters). */
export const STEP_STATUSES: Record<TrackerStep, ApplicationStatus[]> = {
  submitted: ["SUBMITTED"],
  review: ["UNDER_REVIEW", "CHANGES_REQUESTED"],
  approved: ["APPROVED_AWAITING_PAYMENT"],
  payment: ["PAYMENT_SUBMITTED", "PAYMENT_REJECTED", "PAYMENT_CONFIRMED"],
  setup: ["PROVISIONING", "PROVISIONING_FAILED"],
  live: ["ACTIVE"],
};

/** The next thing the platform team does for an application in this state. */
export function nextAction(a: Pick<AttentionItem, "status"> & { invoiceStatus?: AttentionItem["invoiceStatus"] | null }): { label: string; tone: "danger" | "brand" | "muted" } {
  switch (a.status) {
    case "PROVISIONING_FAILED":
      return { label: "Retry setup", tone: "danger" };
    case "PAYMENT_SUBMITTED":
      return { label: "Confirm payment", tone: "brand" };
    case "SUBMITTED":
      return { label: "Start review", tone: "brand" };
    case "UNDER_REVIEW":
      return { label: "Decide", tone: "brand" };
    case "APPROVED_AWAITING_PAYMENT":
      return a.invoiceStatus === "DRAFT" ? { label: "Issue the invoice", tone: "brand" } : { label: "Waiting for the school to pay", tone: "muted" };
    case "PAYMENT_CONFIRMED":
      return { label: "Start setup", tone: "brand" };
    case "PROVISIONING":
      return { label: "Setting up…", tone: "muted" };
    default:
      return { label: "Open", tone: "muted" };
  }
}
