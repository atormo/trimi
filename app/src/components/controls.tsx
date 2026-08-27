import { IconCheck, IconChevronDown } from "@tabler/icons-react";

export function Slider({ label, value, display, min, max, step, onChange, color = "var(--text-1)", snapTo, scale = "linear" }: {
  label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void; color?: string;
  /** A value (e.g. 1x speed) shown as a tick on the track — dragging near it snaps to it exactly. */
  snapTo?: number;
  scale?: "linear" | "logarithmic";
}) {
  const valueToPct = (input: number) => scale === "logarithmic"
    ? (Math.log(input / min) / Math.log(max / min)) * 100
    : ((input - min) / (max - min)) * 100;
  const pctToValue = (input: number) => scale === "logarithmic"
    ? min * Math.pow(max / min, input / 100)
    : input;
  const pct = valueToPct(value);
  const snapThreshold = (max - min) * 0.025;

  const handleChange = (raw: number) => {
    if (snapTo !== undefined && Math.abs(raw - snapTo) < snapThreshold) {
      onChange(snapTo);
    } else {
      onChange(raw);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{label}</span>
        <span style={{ fontSize: 12, color: "var(--text-1)", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{display}</span>
      </div>
      <div style={{ position: "relative", height: 16, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 4, borderRadius: 2, background: "var(--bg-chip)" }} />
        <div style={{ position: "absolute", left: 0, width: `${pct}%`, height: 4, borderRadius: 2, background: color }} />
        {snapTo !== undefined && (
          // Sits behind the thumb in DOM order (no z-index — an explicit one would paint it
          // over the native thumb and any sub-pixel offset between our own layout math and the
          // browser's thumb-centering math would show up as a visible seam). Small enough that
          // the thumb fully swallows it once the value snaps, which reads as its own "snapped"
          // feedback — no extra color-matching logic needed.
          <div
            title={`Reset to ${snapTo}`}
            onClick={() => handleChange(snapTo)}
            style={{
              position: "absolute", left: `${valueToPct(snapTo)}%`, top: "50%",
              width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, borderRadius: "50%",
              background: "var(--text-3)",
              cursor: "pointer", pointerEvents: "auto",
            }}
          />
        )}
        <input
          type="range"
          min={scale === "logarithmic" ? 0 : min}
          max={scale === "logarithmic" ? 100 : max}
          step={scale === "logarithmic" ? 0.1 : step}
          value={scale === "logarithmic" ? pct : value}
          aria-label={label}
          onChange={(e) => {
            const raw = pctToValue(parseFloat(e.target.value));
            const stepped = Math.min(max, Math.max(min, min + Math.round((raw - min) / step) * step));
            handleChange(Number(stepped.toFixed(10)));
          }}
          style={{ position: "relative", width: "100%", margin: 0, background: "transparent", appearance: "none", cursor: "pointer" }}
          className="trimi-range"
        />
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, color = "var(--text-1)" }: { on: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <div
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 34, height: 20, borderRadius: 999, cursor: "pointer", position: "relative",
        background: on ? color : "var(--bg-chip)",
        border: `1px solid ${on ? color : "var(--border-strong)"}`,
        transition: "background .15s ease, border-color .15s ease",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 1, left: on ? 15 : 1, width: 16, height: 16, borderRadius: "50%",
        background: on ? "var(--accent-ink)" : "var(--text-2)",
        transition: "left .16s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  );
}

export function Checkbox({ checked, onChange, label, color = "var(--text-1)" }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; color?: string;
}) {
  return (
    <label
      style={{ position: "relative", minHeight: 40, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}
    >
      <input
        type="checkbox"
        className="trimi-checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
      />
      <span
        className="trimi-checkbox-box"
        aria-hidden="true"
        style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          border: `1px solid ${checked ? color : "var(--border-strong)"}`,
          background: checked ? color : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background .12s ease, border-color .12s ease",
        }}
      >
        {checked && <IconCheck size={11} stroke={3.5} color="var(--accent-ink)" />}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--text-1)" }}>{label}</span>
    </label>
  );
}

export function Select<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          width: "100%", height: 32, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
          background: "var(--bg-chip)", color: "var(--text-1)", fontSize: 12.5, padding: "0 28px 0 10px",
          boxShadow: "var(--control-shadow)",
          appearance: "none", cursor: "pointer",
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <IconChevronDown
        size={13} stroke={2.3} color="var(--text-3)"
        style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
      />
    </div>
  );
}

export function TextField({ value, onChange, placeholder, suffix }: {
  value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", height: 32, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
          background: "var(--bg-chip)", color: "var(--text-1)", fontSize: 12.5,
          padding: suffix ? "0 46px 0 10px" : "0 10px",
          boxShadow: "var(--control-shadow)",
        }}
      />
      {suffix && (
        <span style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          fontSize: 12, color: "var(--text-3)", pointerEvents: "none", fontVariantNumeric: "tabular-nums",
        }}>
          {suffix}
        </span>
      )}
    </div>
  );
}
