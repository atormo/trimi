import { useEffect, useRef, useState, type RefObject } from "react";
import type { CropRect } from "../types";

type DragKind = "move" | "top" | "bottom" | "left" | "right" | "tl" | "tr" | "bl" | "br" | null;

const HIT = 32;

function applyDrag(kind: DragKind, c: CropRect, dx: number, dy: number): CropRect {
  const next = { ...c };
  if (kind === "move") { next.x = c.x + dx; next.y = c.y + dy; }
  if (kind === "left" || kind === "tl" || kind === "bl") { next.x = c.x + dx; next.width = c.width - dx; }
  if (kind === "right" || kind === "tr" || kind === "br") { next.width = c.width + dx; }
  if (kind === "top" || kind === "tl" || kind === "tr") { next.y = c.y + dy; next.height = c.height - dy; }
  if (kind === "bottom" || kind === "bl" || kind === "br") { next.height = c.height + dy; }
  return next;
}

const cursorFor: Record<Exclude<DragKind, null>, string> = {
  move: "move", top: "ns-resize", bottom: "ns-resize", left: "ew-resize", right: "ew-resize",
  tl: "nwse-resize", br: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize",
};

function EdgeHandle({ kind, onDown, style }: { kind: DragKind; onDown: (k: DragKind) => (e: React.PointerEvent) => void; style: React.CSSProperties }) {
  const horizontal = kind === "top" || kind === "bottom";
  return (
    <div onPointerDown={onDown(kind)} style={{ position: "absolute", cursor: cursorFor[kind as Exclude<DragKind, null>], display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
      <div style={{
        width: horizontal ? 24 : 3,
        height: horizontal ? 3 : 24,
        borderRadius: 999,
        background: "#ffffff",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.38)",
      }} />
    </div>
  );
}

function CornerHandle({ kind, onDown, style }: { kind: DragKind; onDown: (k: DragKind) => (e: React.PointerEvent) => void; style: React.CSSProperties }) {
  const borders: React.CSSProperties = {
    borderTop: kind === "tl" || kind === "tr" ? "3px solid #ffffff" : undefined,
    borderBottom: kind === "bl" || kind === "br" ? "3px solid #ffffff" : undefined,
    borderLeft: kind === "tl" || kind === "bl" ? "3px solid #ffffff" : undefined,
    borderRight: kind === "tr" || kind === "br" ? "3px solid #ffffff" : undefined,
  };
  return (
    <div onPointerDown={onDown(kind)} style={{ position: "absolute", width: HIT, height: HIT, cursor: cursorFor[kind as Exclude<DragKind, null>], display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
      <div style={{ width: 13, height: 13, filter: "drop-shadow(0 0 1px rgba(0,0,0,0.75))", ...borders }} />
    </div>
  );
}

export function CropOverlay({ crop, onChange, boxRef, color }: {
  crop: CropRect;
  onChange: (rect: CropRect) => void;
  boxRef: RefObject<HTMLDivElement | null>;
  color: string;
}) {
  const [drag, setDrag] = useState<DragKind>(null);
  const startRef = useRef<{ x: number; y: number; crop: CropRect } | null>(null);

  const beginDrag = (kind: DragKind) => (e: React.PointerEvent) => {
    e.stopPropagation();
    startRef.current = { x: e.clientX, y: e.clientY, crop };
    setDrag(kind);
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const box = boxRef.current;
      const start = startRef.current;
      if (!box || !start) return;
      const rect = box.getBoundingClientRect();
      const dx = (e.clientX - start.x) / rect.width;
      const dy = (e.clientY - start.y) / rect.height;
      onChange(applyDrag(drag, start.crop, dx, dy));
    };
    const onUp = () => setDrag(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, boxRef, onChange]);

  const isDragging = drag !== null;
  const half = HIT / 2;

  return (
    <div
      data-testid="crop-rect"
      data-crop-overlay
      onPointerDown={beginDrag("move")}
      style={{
        position: "absolute",
        left: `${crop.x * 100}%`,
        top: `${crop.y * 100}%`,
        width: `${crop.width * 100}%`,
        height: `${crop.height * 100}%`,
        boxSizing: "border-box",
        border: `1.5px solid ${color}`,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.38)",
        cursor: "move",
      }}
    >
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: isDragging ? 0.72 : 0.5 }}>
        {["33.333%", "66.667%"].map((position) => (
          <div key={`vertical-${position}`} style={{ position: "absolute", top: 0, bottom: 0, left: position, width: 1, background: "rgba(255,255,255,0.9)", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.22)" }} />
        ))}
        {["33.333%", "66.667%"].map((position) => (
          <div key={`horizontal-${position}`} style={{ position: "absolute", left: 0, right: 0, top: position, height: 1, background: "rgba(255,255,255,0.9)", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.22)" }} />
        ))}
      </div>

      {/* edge grips — generous hit area, small visible pill centered on the border */}
      <EdgeHandle kind="top" onDown={beginDrag} style={{ top: -half, left: "50%", width: 48, height: HIT, marginLeft: -24 }} />
      <EdgeHandle kind="bottom" onDown={beginDrag} style={{ bottom: -half, left: "50%", width: 48, height: HIT, marginLeft: -24 }} />
      <EdgeHandle kind="left" onDown={beginDrag} style={{ left: -half, top: "50%", height: 48, width: HIT, marginTop: -24 }} />
      <EdgeHandle kind="right" onDown={beginDrag} style={{ right: -half, top: "50%", height: 48, width: HIT, marginTop: -24 }} />

      {/* corner grips — 2-axis resize */}
      <CornerHandle kind="tl" onDown={beginDrag} style={{ top: -half, left: -half }} />
      <CornerHandle kind="tr" onDown={beginDrag} style={{ top: -half, right: -half }} />
      <CornerHandle kind="bl" onDown={beginDrag} style={{ bottom: -half, left: -half }} />
      <CornerHandle kind="br" onDown={beginDrag} style={{ bottom: -half, right: -half }} />
    </div>
  );
}
