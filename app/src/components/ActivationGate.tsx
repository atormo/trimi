import { useEffect, useRef, useState, type CSSProperties } from "react";
import { IconCheck, IconKey, IconLoader2, IconX } from "@tabler/icons-react";

const backdropStyle: CSSProperties = {
  position: "fixed", inset: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(5, 10, 20, 0.58)", padding: 20,
};

const panelStyle: CSSProperties = {
  position: "relative", width: "min(100%, 420px)", display: "flex", flexDirection: "column",
  alignItems: "center", gap: 20, borderRadius: 14, background: "var(--bg-panel-solid)",
  boxShadow: "var(--island-shadow)", padding: "34px 28px 28px",
};

const iconBubbleStyle: CSSProperties = {
  width: 56, height: 56, borderRadius: "50%", background: "var(--bg-chip)",
  display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--control-shadow)",
};

const primaryActionStyle: CSSProperties = {
  height: 40, borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
  background: "var(--text-1)", color: "var(--accent-ink)", boxShadow: "var(--control-shadow)",
  padding: "0 24px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center",
  justifyContent: "center", gap: 7,
};

export function ActivationGate({
  mode,
  onActivate,
  activating,
  error,
  onRetry,
  onClose,
}: {
  mode: "checking" | "offline" | "locked" | "unlocked";
  onActivate: (key: string) => void;
  activating: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>("input, button:not(:disabled), a[href]"));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    const preferred = panel?.querySelector<HTMLElement>("[data-dialog-initial-focus]");
    const fallback = panel?.querySelector<HTMLElement>("button:not(:disabled), input, a[href]");
    (preferred ?? fallback)?.focus();
  }, [mode]);

  return (
    <div style={backdropStyle} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="license-dialog-title" style={panelStyle}>
        <button type="button" className="license-dialog-close" aria-label="Close license dialog" onClick={onClose}>
          <IconX size={18} stroke={2} aria-hidden="true" />
        </button>

        {mode === "checking" && (
          <>
            <div style={iconBubbleStyle}>
              <IconLoader2 size={22} stroke={1.8} color="var(--text-1)" className="trimi-spin" aria-hidden="true" />
            </div>
            <div id="license-dialog-title" role="status" style={{ fontSize: 15, fontWeight: 500, color: "var(--text-1)" }}>
              Checking your license…
            </div>
          </>
        )}

        {mode === "offline" && (
          <>
            <div style={iconBubbleStyle}>
              <IconKey size={22} stroke={1.8} color="var(--text-1)" aria-hidden="true" />
            </div>
            <div style={{ textAlign: "center", maxWidth: 320 }}>
              <div id="license-dialog-title" style={{ fontSize: 15, fontWeight: 500, color: "var(--text-1)" }}>Couldn't verify your license</div>
              <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4, lineHeight: 1.4 }}>Check your connection and try again.</div>
            </div>
            <button type="button" className="license-dialog-action" data-dialog-initial-focus onClick={onRetry} style={primaryActionStyle}>Retry</button>
          </>
        )}

        {mode === "locked" && (
          <>
            <div style={iconBubbleStyle}>
              <IconKey size={22} stroke={1.8} color="var(--text-1)" aria-hidden="true" />
            </div>
            <div id="license-dialog-title" style={{ fontSize: 15, fontWeight: 500, color: "var(--text-1)", textWrap: "balance", textAlign: "center" }}>
              Unlock Trimi forever with your key
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!activating) onActivate(key);
              }}
              style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 340 }}
            >
              <input
                id="license-key" type="text" value={key} onChange={(event) => setKey(event.target.value)} data-dialog-initial-focus
                placeholder="TRM-XXXX-XXXX-XXXX" aria-label="License key"
                aria-describedby={error ? "license-key-error license-browser-note" : "license-browser-note"}
                aria-invalid={Boolean(error)} autoCapitalize="off" autoCorrect="off" spellCheck={false}
                style={{
                  height: 40, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
                  background: "var(--bg-panel-solid)", color: "var(--text-1)", fontSize: 13,
                  padding: "0 12px", boxShadow: "var(--control-shadow)", textAlign: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              />
              {error && <div id="license-key-error" role="alert" style={{ fontSize: 12, color: "var(--danger)", textAlign: "center", lineHeight: 1.4 }}>{error}</div>}
              <button
                type="submit" className="license-dialog-action" disabled={activating || !key.trim()}
                style={{ ...primaryActionStyle, cursor: activating || !key.trim() ? "not-allowed" : "pointer", opacity: activating || !key.trim() ? 0.6 : 1 }}
              >
                {activating ? <IconLoader2 size={15} stroke={2.2} className="trimi-spin" aria-hidden="true" /> : null}
                {activating ? "Activating…" : "Activate"}
              </button>
            </form>
            <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, textAlign: "center" }}>
              <a
                href="https://polar.sh/checkout/polar_c_iX6OeQw78TX3oxQA7cye3PBCxfcxaiKD28us84ZAEMi"
                target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}
              >
                Don't have a key? Buy Trimi for €15
              </a>
              <div id="license-browser-note" style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.45, textWrap: "pretty" }}>
                Already licensed? Your activation is tied to one browser. To switch browsers or devices, choose Account → Unlink this device in the currently linked browser first.
              </div>
            </div>
          </>
        )}

        {mode === "unlocked" && (
          <>
            <div style={iconBubbleStyle}>
              <IconCheck size={24} stroke={2.2} color="var(--tool-speed)" aria-hidden="true" />
            </div>
            <div id="license-dialog-title" role="status" aria-live="polite" style={{ fontSize: 15, fontWeight: 500, color: "var(--text-1)" }}>License added</div>
          </>
        )}
      </div>
    </div>
  );
}
