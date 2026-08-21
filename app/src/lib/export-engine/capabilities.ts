import { canEncodeVideo } from "mediabunny";

export interface ExportSupport {
  supported: boolean;
  reason?: string;
}

const UNSUPPORTED_MESSAGE = "This browser can't encode video the way trimi needs. Try a recent Chrome, Edge, or Safari.";

let cached: Promise<ExportSupport> | null = null;

/** Feature-detects once and caches — per TRIMI-PLAN.md's trap #2: fail honestly, never silently produce a broken export. */
export function checkExportSupport(): Promise<ExportSupport> {
  cached ??= (async (): Promise<ExportSupport> => {
    if (typeof VideoEncoder === "undefined" || typeof OffscreenCanvas === "undefined") {
      return { supported: false, reason: UNSUPPORTED_MESSAGE };
    }
    const ok = await canEncodeVideo("avc", { width: 1280, height: 720 }).catch(() => false);
    if (!ok) return { supported: false, reason: UNSUPPORTED_MESSAGE };
    return { supported: true };
  })();
  return cached;
}
