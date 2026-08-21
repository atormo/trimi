/**
 * Licensing runs entirely on Polar — no backend of ours in this path at all. These are Polar's
 * public "customer portal" endpoints: CORS is wide open (`Access-Control-Allow-Origin: *`) and
 * they're explicitly documented as safe to call unauthenticated from a public client, using only
 * the org id (not secret — the equivalent of a Stripe publishable key) and the buyer's own key.
 * See TRIMI-PLAN.md §5.2.
 */

const POLAR_API_BASE = "https://api.polar.sh/v1/customer-portal/license-keys";
const ORGANIZATION_ID = "a61088f0-4128-462e-bbc7-822f0d0a38d6";

export type LicenseErrorReason = "not_found" | "limit_reached" | "network" | "unknown";

export class LicenseError extends Error {
  reason: LicenseErrorReason;
  constructor(reason: LicenseErrorReason, message: string) {
    super(message);
    this.name = "LicenseError";
    this.reason = reason;
  }
}

async function polarPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${POLAR_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, organization_id: ORGANIZATION_ID }),
    });
  } catch {
    throw new LicenseError("network", "Couldn't reach the license server — check your connection.");
  }

  if (response.status === 404 || response.status === 422) {
    // 422 shows up for a malformed activation_id (e.g. a forged one that isn't even a valid v4
    // UUID) — functionally the same "this isn't a real, valid credential" outcome as a 404.
    throw new LicenseError("not_found", "That doesn't look like a valid trimi license key.");
  }
  if (response.status === 403) {
    throw new LicenseError("limit_reached", "This key is already active on another device.");
  }
  if (!response.ok) {
    throw new LicenseError("unknown", "Something went wrong talking to the license server.");
  }
  return response.json() as Promise<T>;
}

interface ActivateResponse {
  id: string;
  license_key: { status: string };
}

export async function activateLicense(key: string, label: string): Promise<{ activationId: string; status: string }> {
  const data = await polarPost<ActivateResponse>("/activate", { key, label });
  return { activationId: data.id, status: data.license_key.status };
}

interface ValidateResponse {
  status: string;
}

export async function validateLicense(key: string, activationId: string): Promise<{ status: string }> {
  const data = await polarPost<ValidateResponse>("/validate", { key, activation_id: activationId });
  return { status: data.status };
}

/** 204 on success — deliberately not routed through polarPost, which always parses a JSON body. */
export async function deactivateLicense(key: string, activationId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${POLAR_API_BASE}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, activation_id: activationId, organization_id: ORGANIZATION_ID }),
    });
  } catch {
    throw new LicenseError("network", "Couldn't reach the license server — check your connection.");
  }
  // A 404 here means the activation is already gone (e.g. the buyer deactivated it themselves via
  // Polar's own customer portal) — treat that as success, since the end state is what we wanted.
  if (!response.ok && response.status !== 404) {
    throw new LicenseError("unknown", "Couldn't deactivate this device.");
  }
}
