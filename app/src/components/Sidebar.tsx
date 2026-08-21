import { useEffect, useState } from "react";
import { IconAspectRatio, IconCheck, IconCrop, IconFileExport, IconFileText, IconGauge, IconPalette, IconRotate, IconScissors, IconVideo, IconVolume } from "@tabler/icons-react";
import type { VideoEditor } from "../hooks/useVideoEditor";
import { CROP_PRESETS } from "../types";
import { Checkbox, Slider, TextField, Toggle } from "./controls";
import { formatFileSize, formatTime } from "../lib/format";
import {
  GIF_LONG_CLIP_SECONDS,
  QUALITY_OPTIONS,
  SCALE_OPTIONS,
  croppedSize,
  estimateExportBytes,
  formatResolution,
  scaledSize,
  wouldUpscale,
  type ExportFormat,
  type ExportQuality,
  type ExportScale,
} from "../lib/export";

function Section({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {icon}
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  height: 34, borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
  background: "var(--text-1)", color: "var(--accent-ink)",
  boxShadow: "var(--control-shadow)",
  fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
};

const secondaryBtn: React.CSSProperties = {
  height: 34, borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
  background: "var(--bg-chip)", color: "var(--text-1)",
  boxShadow: "var(--control-shadow)",
  fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
};

const resetLink: React.CSSProperties = {
  height: 40, margin: "-10px 0", padding: 0, border: "none", background: "transparent",
  fontSize: 11.5, color: "var(--text-3)", cursor: "pointer", textAlign: "center",
};

type Tab = "edit" | "export";

function OptionGrid<T extends string>({
  value,
  onChange,
  options,
  columns,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string; disabled?: boolean }[];
  columns: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            aria-pressed={active}
            title={option.disabled ? "Source is smaller than this size" : undefined}
            onClick={() => onChange(option.value)}
            style={{
              padding: option.hint ? "8px 4px 7px" : "9px 4px",
              borderRadius: "var(--radius-sm)",
              cursor: option.disabled ? "not-allowed" : "pointer",
              border: "none",
              boxShadow: active ? "none" : "var(--control-shadow)",
              background: active ? "var(--brand-blue)" : "var(--bg-chip)",
              color: active ? "var(--ink-solid)" : "var(--text-2)",
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              opacity: option.disabled ? 0.4 : 1,
              lineHeight: 1.2,
            }}
          >
            {option.label}
            {option.hint && (
              <div style={{ marginTop: 3, fontSize: 10.5, fontWeight: 500, color: active ? "var(--ink-muted)" : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                {option.hint}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Sidebar({ editor }: { editor: VideoEditor }) {
  const {
    file, edit, trimView, duration, naturalAspect, sourceSize,
    commitTrim, resetTrim, trimEditing, cutPending, startTrimEdit, cancelTrimEdit,
    cropEditing, cropEditStart, cropPresetLabel, startCropEdit, applyCrop, cancelCropEdit, setCropPreset,
    setSpeed, setPreservesPitch, setMuted, setColor, resetColor,
  } = editor;

  const [tab, setTab] = useState<Tab>("edit");
  const [filename, setFilename] = useState("");
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [scale, setScale] = useState<ExportScale>("original");
  const [quality, setQuality] = useState<ExportQuality>("balanced");

  useEffect(() => {
    if (file && !filename) setFilename(file.name.replace(/\.[^.]+$/, "") + "-trimi");
  }, [file, filename]);

  const canCut = edit.trimStart > trimView.start + 0.05 || edit.trimEnd < trimView.end - 0.05;
  const isTrimmed = trimView.start > 0.01 || (trimView.end > 0 && trimView.end < duration - 0.01);
  const cropChanged = Math.abs(edit.crop.width - cropEditStart.width) > 0.001 || Math.abs(edit.crop.height - cropEditStart.height) > 0.001
    || Math.abs(edit.crop.x - cropEditStart.x) > 0.001 || Math.abs(edit.crop.y - cropEditStart.y) > 0.001;
  const cropped = sourceSize ? croppedSize(sourceSize, edit.crop) : null;
  const outputSize = cropped ? scaledSize(cropped, scale, format) : null;
  const exportDuration = Math.max(0, (edit.trimEnd - edit.trimStart) / Math.max(edit.speed, 0.01));
  const exportEstimate = outputSize
    ? estimateExportBytes({
        size: outputSize,
        duration: exportDuration,
        format,
        quality,
        muted: edit.isMuted || format === "gif",
      })
    : 0;

  useEffect(() => {
    if (!sourceSize) return;
    const next = croppedSize(sourceSize, edit.crop);
    if (wouldUpscale(next, scale, format) || (format === "gif" && (scale === "1080" || scale === "720"))) {
      setScale("original");
    }
  }, [edit.crop, format, scale, sourceSize]);

  return (
    <div style={{
      gridColumn: 2, gridRow: "1 / span 2",
      width: "100%", minWidth: 0, minHeight: 0, height: "100%", borderRadius: "var(--radius-lg)",
      border: "none", background: "var(--bg-panel-solid)",
      boxShadow: "var(--island-shadow)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ position: "relative", display: "flex", background: "var(--bg-chip)", borderRadius: "var(--radius-md)", padding: 4, margin: 10 }}>
        <div style={{
          position: "absolute", top: 4, left: 4, bottom: 4, width: "calc(50% - 4px)",
          background: "var(--bg-panel-solid)", borderRadius: "var(--radius-sm)",
          boxShadow: "var(--control-shadow)",
          transform: tab === "export" ? "translateX(100%)" : "translateX(0)",
          transition: "transform .28s cubic-bezier(.16,1,.3,1)",
        }} />
        {(["edit", "export"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, height: 28, position: "relative", zIndex: 1, borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
              background: "transparent",
              color: tab === t ? "var(--text-1)" : "var(--text-3)",
              fontSize: 12.5, fontWeight: 500, textTransform: "capitalize",
              transition: "color .2s ease",
            }}
          >
            {t === "edit" ? "Edit" : "Export"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "8px 18px 18px", overflowY: "auto" }}>
        {tab === "edit" ? (
          <>
            <Section title="Trim" icon={<IconScissors size={14} stroke={2} color="var(--tool-trim)" />}>
              {trimEditing ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: "var(--text-3)" }}>Selection</span>
                    <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{formatTime(edit.trimEnd - edit.trimStart)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled={!canCut || cutPending} onClick={commitTrim} style={{ ...primaryBtn, flex: 1, opacity: canCut && !cutPending ? 1 : 0.4, cursor: canCut && !cutPending ? "pointer" : "not-allowed" }}>
                      <IconScissors size={13} stroke={2} />
                      Cut
                    </button>
                    {/* always enabled while editing — this just exits trim mode, changed or not */}
                    <button
                      disabled={cutPending}
                      onClick={cancelTrimEdit}
                      style={{
                        ...secondaryBtn, flex: 1,
                        background: !cutPending ? "var(--danger-solid)" : "var(--bg-chip)",
                        color: !cutPending ? "#ffffff" : "var(--text-3)",
                        opacity: !cutPending ? 1 : 0.45,
                        cursor: !cutPending ? "pointer" : "not-allowed",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {isTrimmed && <button type="button" onClick={resetTrim} style={resetLink}>Reset to original clip</button>}
                </>
              ) : (
                <button onClick={startTrimEdit} style={secondaryBtn}>
                  Edit trim
                </button>
              )}
            </Section>

            <Section title="Crop" icon={<IconCrop size={16} stroke={2.1} color="var(--tool-crop)" />}>
              {cropEditing ? (
                <>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      disabled={!cropChanged}
                      onClick={applyCrop}
                      style={{
                        ...primaryBtn, flex: 1,
                        opacity: cropChanged ? 1 : 0.4,
                        cursor: cropChanged ? "pointer" : "not-allowed",
                      }}
                    >
                      <IconCheck size={14} stroke={2.5} />
                      Apply
                    </button>
                    {/* always enabled while editing — this just exits crop mode, changed or not */}
                    <button
                      onClick={cancelCropEdit}
                      style={{
                        ...secondaryBtn, flex: 1,
                        background: "var(--danger-solid)",
                        color: "#ffffff",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {CROP_PRESETS.map((preset) => {
                      const active = preset.ratio === null ? cropPresetLabel === null : cropPresetLabel === preset.label;
                      return (
                        <button
                          key={preset.id}
                          disabled={!naturalAspect}
                          onClick={() => setCropPreset(preset.ratio === null ? null : preset.label, preset.ratio)}
                          style={{
                            padding: "9px 0", borderRadius: "var(--radius-sm)", cursor: "pointer",
                            border: "none",
                            boxShadow: active ? "none" : "var(--control-shadow)",
                            background: active ? "var(--tool-crop)" : "var(--bg-chip)",
                            color: active ? "var(--ink-solid)" : "var(--text-2)",
                            fontSize: 12, fontWeight: active ? 600 : 500,
                          }}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <button onClick={startCropEdit} style={secondaryBtn}>
                  Edit crop
                </button>
              )}
            </Section>

            <Section title="Audio" icon={<IconVolume size={14} stroke={2} color="var(--tool-audio)" />}>
              <Checkbox checked={edit.isMuted} onChange={setMuted} label="Mute audio" />
            </Section>

            <Section title="Speed" icon={<IconGauge size={14} stroke={2} color="var(--tool-speed)" />}>
              <Slider label="Speed" value={edit.speed} display={`${edit.speed.toFixed(2)}x`} min={0.25} max={4} step={0.05} onChange={setSpeed} color="var(--tool-speed)" snapTo={1} scale="logarithmic" />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-1)" }}>Preserve pitch</span>
                <Toggle on={edit.preservesPitch} onChange={setPreservesPitch} color="var(--tool-speed)" />
              </div>
            </Section>

            <Section
              title="Color"
              icon={<IconPalette size={14} stroke={2} color="var(--tool-color)" />}
              action={(
                <button
                  type="button"
                  onClick={resetColor}
                  style={{ height: 40, margin: "-10px 0", padding: "0 0 0 10px", border: "none", background: "transparent", display: "flex", alignItems: "center", gap: 4, color: "var(--text-3)", cursor: "pointer", fontSize: 11 }}
                >
                  <IconRotate size={12} stroke={2} aria-hidden="true" />
                  Reset
                </button>
              )}
            >
              <Slider label="Exposure" value={edit.color.exposure} display={edit.color.exposure.toFixed(2)} min={-2} max={2} step={0.05} onChange={(v) => setColor({ exposure: v })} color="var(--tool-color)" snapTo={0} />
              <Slider label="Contrast" value={edit.color.contrast} display={edit.color.contrast.toFixed(2)} min={0.5} max={1.5} step={0.01} onChange={(v) => setColor({ contrast: v })} color="var(--tool-color)" snapTo={1} />
              <Slider label="Saturation" value={edit.color.saturation} display={edit.color.saturation.toFixed(2)} min={0} max={2} step={0.05} onChange={(v) => setColor({ saturation: v })} color="var(--tool-color)" snapTo={1} />
              <Slider label="Temperature" value={edit.color.temperature} display={edit.color.temperature.toFixed(2)} min={-1} max={1} step={0.05} onChange={(v) => setColor({ temperature: v })} color="var(--tool-color)" snapTo={0} />
            </Section>
          </>
        ) : (
          <>
            <Section title="File" icon={<IconFileText size={14} stroke={2} color="var(--text-2)" />}>
              <TextField value={filename} onChange={setFilename} placeholder="my-video" suffix={`.${format}`} />
            </Section>

            <Section title="Format" icon={<IconVideo size={14} stroke={2} color="var(--text-2)" />}>
              <OptionGrid
                value={format}
                onChange={(next) => {
                  setFormat(next);
                  if (next === "gif" && (scale === "1080" || scale === "720")) setScale("original");
                }}
                columns={2}
                options={[
                  { value: "mp4", label: "MP4", hint: "H.264" },
                  { value: "gif", label: "GIF", hint: "Animated" },
                ]}
              />
            </Section>

            <Section title="Size" icon={<IconAspectRatio size={14} stroke={2} color="var(--text-2)" />}>
              <OptionGrid
                value={scale}
                onChange={setScale}
                columns={2}
                options={SCALE_OPTIONS
                  .filter((option) => {
                    if (format === "gif" && option.value !== "original" && option.value !== "480") return false;
                    if (cropped && wouldUpscale(cropped, option.value, format)) return false;
                    return true;
                  })
                  .map((option) => {
                    const output = cropped ? scaledSize(cropped, option.value, format) : null;
                    return {
                      value: option.value,
                      label: option.label,
                      hint: output ? formatResolution(output) : undefined,
                    };
                  })}
              />
            </Section>

            <Section title="Quality" icon={<IconGauge size={14} stroke={2} color="var(--text-2)" />}>
              <OptionGrid
                value={quality}
                onChange={setQuality}
                columns={3}
                options={QUALITY_OPTIONS}
              />
            </Section>

            <div style={{
              padding: "12px 12px 11px",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-chip)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>
                {outputSize ? formatResolution(outputSize) : "—"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                {formatTime(exportDuration)}
                {" · "}~{formatFileSize(exportEstimate)}
                {" · "}{format === "mp4" ? "H.264" : "GIF"}
                {" · "}{format === "gif" || edit.isMuted ? "No audio" : "Audio"}
              </div>
            </div>
            {format === "gif" && exportDuration > GIF_LONG_CLIP_SECONDS && (
              <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.45 }}>
                GIFs longer than {GIF_LONG_CLIP_SECONDS}s get large. Trim first if you can.
              </div>
            )}

            <button disabled title="Export is coming next" style={{ ...primaryBtn, background: "var(--bg-chip)", color: "var(--text-3)", cursor: "not-allowed" }}>
              <IconFileExport size={14} stroke={2} />
              Export
            </button>
          </>
        )}
      </div>
    </div>
  );
}
