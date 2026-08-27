import { useCallback, useEffect, useRef, useState } from "react";
import { LicenseError, activateLicense, deactivateLicense, validateLicense } from "../lib/license";

const STORAGE_KEY = "trimi.license";

interface StoredLicense {
  key: string;
  activationId: string;
}

function readStored(): StoredLicense | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredLicense) : null;
  } catch {
    return null;
  }
}

function writeStored(value: StoredLicense | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private browsing / lockdown mode) — activation still works for the
    // session via React state, it just won't be remembered on reload. Never let this look like an
    // invalid license.
  }
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" · ");
}

export type LicenseState =
  | { status: "checking" }
  | { status: "locked" }
  | { status: "offline" }
  | { status: "unlocked"; key: string; activationId: string };

export function useLicense() {
  const [state, setState] = useState<LicenseState>({ status: "checking" });
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const bootChecked = useRef(false);

  // The app never unlocks on the strength of localStorage alone — that's attacker-controlled
  // (one line pasted into devtools sets any key/activationId it likes). Every boot needs a real,
  // live "granted" response from Polar before allowing video imports. A stored license that can't
  // be verified right now keeps imports locked and exposes a retry state in the editor header.
  const verify = useCallback((stored: StoredLicense) => {
    setState({ status: "checking" });
    validateLicense(stored.key, stored.activationId)
      .then(({ status }) => {
        if (status === "granted") {
          setState({ status: "unlocked", key: stored.key, activationId: stored.activationId });
        } else {
          writeStored(null);
          setState({ status: "locked" });
        }
      })
      .catch((err) => {
        if (err instanceof LicenseError && err.reason === "not_found") {
          // Definitive rejection: revoked, or deactivated elsewhere (e.g. via Polar's own portal).
          writeStored(null);
          setState({ status: "locked" });
        } else {
          // Couldn't reach Polar at all — keep the stored key (it may well still be valid) but
          // don't unlock on an unverified claim. Retry re-runs this same check.
          setState({ status: "offline" });
        }
      });
  }, []);

  useEffect(() => {
    if (bootChecked.current) return;
    bootChecked.current = true;

    const stored = readStored();
    if (!stored) {
      setState({ status: "locked" });
      return;
    }
    verify(stored);
  }, [verify]);

  const retry = useCallback(() => {
    const stored = readStored();
    if (stored) verify(stored);
    else setState({ status: "locked" });
  }, [verify]);

  const activate = useCallback(async (rawKey: string) => {
    const key = rawKey.trim();
    if (!key) return;
    setActivating(true);
    setActivateError(null);
    try {
      const { activationId, status } = await activateLicense(key, deviceLabel());
      if (status !== "granted") {
        setActivateError("This license key isn't active — contact support if you think that's wrong.");
        return;
      }
      writeStored({ key, activationId });
      setState({ status: "unlocked", key, activationId });
    } catch (err) {
      setActivateError(err instanceof LicenseError ? err.message : "Couldn't activate — try again.");
    } finally {
      setActivating(false);
    }
  }, []);

  const unlink = useCallback(async () => {
    if (state.status !== "unlocked") return;
    setUnlinking(true);
    try {
      await deactivateLicense(state.key, state.activationId);
    } catch {
      // Even if the network call fails, still drop it locally — worst case the seat is freed
      // late server-side, which only ever makes re-activating elsewhere easier, never harder.
    } finally {
      writeStored(null);
      setState({ status: "locked" });
      setUnlinking(false);
    }
  }, [state]);

  return { state, activate, activating, activateError, unlink, unlinking, retry };
}
