import type { Database } from "@/server/db/database.types";

type VerificationStatus = Database["public"]["Enums"]["verification_status"];

/**
 * Maps Hunter's Email Verifier status onto HUNTER's verification_status.
 *
 * Only "valid" maps to valid. accept_all becomes catch_all and unknown stays unknown,
 * so neither is ever treated as a verified deliverable address. The exact Hunter status
 * is always stored alongside, in contact_verifications.detail.hunter_status.
 */
const MAP: Record<string, VerificationStatus> = {
  valid: "valid",
  invalid: "invalid",
  accept_all: "catch_all",
  webmail: "risky",
  disposable: "invalid",
  unknown: "unknown",
};

export function mapHunterVerification(status: string): VerificationStatus {
  return MAP[status.toLowerCase()] ?? "unknown";
}

/** True only when Hunter confirmed the mailbox exists. */
export function isConfirmedDeliverable(status: string): boolean {
  return status.toLowerCase() === "valid";
}

export const HUNTER_STATUS_EXPLANATION: Record<string, string> = {
  valid: "Hunter confirmed the mailbox exists.",
  invalid: "Hunter found the address cannot receive email.",
  accept_all: "The mail server accepts every address, so this one cannot be confirmed.",
  webmail: "A personal webmail address, not a business mailbox.",
  disposable: "A temporary, disposable address.",
  unknown: "Hunter could not determine whether the address works.",
};
