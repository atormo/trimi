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
  | { status: "unlocked"; key: string; activationId: string };

export function useLicense() {
  const [state, setState] = useState<LicenseState>({ status: "checking" });
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const bootChecked = useRef(false);

  useEffect(() => {
    if (bootChecked.current) return;
    bootChecked.current = true;

    const stored = readStored();
    if (!stored) {
      setState({ status: "locked" });
      return;
    }
    // Optimistic: unlock immediately from the stored activation, then confirm in the background.
    // Only a definitive "this activation no longer exists" response should ever re-lock — a
    // network hiccup or a flaky response must not lock out someone who's already paid.
    setState({ status: "unlocked", key: stored.key, activationId: stored.activationId });
    validateLicense(stored.key, stored.activationId)
      .then(({ status }) => {
        if (status !== "granted") {
          writeStored(null);
          setState({ status: "locked" });
        }
      })
      .catch((err) => {
        if (err instanceof LicenseError && err.reason === "not_found") {
          writeStored(null);
          setState({ status: "locked" });
        }
        // network / unknown: stay unlocked on the strength of the stored activation.
      });
  }, []);

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

  return { state, activate, activating, activateError, unlink, unlinking };
}
