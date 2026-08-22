import { useState, type CSSProperties } from "react";
import { IconKey, IconLoader2 } from "@tabler/icons-react";

const shellStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 20,
  margin: "8px 16px 16px",
  borderRadius: "var(--radius-lg)",
  background: "var(--bg-dropzone)",
  padding: "32px 24px",
};

const iconBubbleStyle: CSSProperties = {
  width: 56, height: 56, borderRadius: "50%",
  background: "var(--bg-panel-solid)",
  display: "flex", alignItems: "center", justifyContent: "center",
  boxShadow: "var(--control-shadow)",
};

export function ActivationGate({
  mode,
  onActivate,
  activating,
  error,
  onRetry,
}: {
  mode: "checking" | "offline" | "locked";
  onActivate: (key: string) => void;
  activating: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [key, setKey] = useState("");

  if (mode === "checking") {
    return (
      <div style={shellStyle}>
        <div style={iconBubbleStyle}>
          <IconLoader2 size={22} stroke={1.8} color="var(--text-1)" className="trimi-spin" aria-hidden="true" />
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-1)" }}>
          Checking your license…
        </div>
      </div>
    );
  }

  if (mode === "offline") {
    return (
      <div style={shellStyle}>
        <div style={iconBubbleStyle}>
          <IconKey size={22} stroke={1.8} color="var(--text-1)" aria-hidden="true" />
        </div>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-1)" }}>
            Couldn't verify your license
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4, lineHeight: 1.4 }}>
            Check your connection and try again.
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          style={{
            height: 40, borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
            background: "var(--text-1)", color: "var(--accent-ink)",
            boxShadow: "var(--control-shadow)", padding: "0 24px",
            fontSize: 13, fontWeight: 600,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={iconBubbleStyle}>
        <IconKey size={22} stroke={1.8} color="var(--text-1)" aria-hidden="true" />
      </div>

      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-1)" }}>
        Unlock Trimi forever with your key
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!activating) onActivate(key);
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 340 }}
      >
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="TRM-XXXX-XXXX-XXXX"
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            height: 40, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
            background: "var(--bg-panel-solid)", color: "var(--text-1)", fontSize: 13,
            padding: "0 12px", boxShadow: "var(--control-shadow)", textAlign: "center",
            fontVariantNumeric: "tabular-nums",
          }}
        />

        {error && (
          <div style={{ fontSize: 12, color: "var(--danger)", textAlign: "center", lineHeight: 1.4 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={activating || !key.trim()}
          style={{
            height: 40, borderRadius: "var(--radius-sm)", border: "none", cursor: activating || !key.trim() ? "not-allowed" : "pointer",
            background: "var(--text-1)", color: "var(--accent-ink)",
            boxShadow: "var(--control-shadow)", opacity: activating || !key.trim() ? 0.6 : 1,
            fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}
        >
          {activating ? <IconLoader2 size={15} stroke={2.2} className="trimi-spin" /> : null}
          {activating ? "Activating…" : "Activate"}
        </button>
      </form>

      <a
        href="https://polar.sh/checkout/polar_c_iX6OeQw78TX3oxQA7cye3PBCxfcxaiKD28us84ZAEMi"
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}
      >
        Don't have a key? Buy Trimi for €15
      </a>
    </div>
  );
}
