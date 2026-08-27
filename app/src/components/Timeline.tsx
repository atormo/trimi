import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconGripVertical } from "@tabler/icons-react";
import type { VideoEditor } from "../hooks/useVideoEditor";
import { CUT_COMPRESS_MS } from "../hooks/useVideoEditor";
import { formatTime, formatTimePrecise } from "../lib/format";
import { colorFilterCss } from "../lib/colorFilter";
import { drawCover, generateThumbnails } from "../lib/thumbnails";
import type { CropRect, VideoClip } from "../types";

type DragMode = "start" | "end" | "scrub" | null;

function filmstripCount(width: number, height: number, aspect: number) {
  const slotWidth = Math.max(height * Math.max(aspect, 0.2), 1);
  return Math.max(1, Math.ceil(width / slotWidth));
}

function Filmstrip({ videoUrl, rangeStart, rangeEnd, crop, naturalAspect, filter }: {
  videoUrl: string;
  rangeStart: number;
  rangeEnd: number;
  crop: CropRect;
  naturalAspect: number | null;
  filter: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<ImageBitmap[]>([]);
  const [frameVersion, setFrameVersion] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 76 });

  useLayoutEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    const update = () => {
      const rect = parent.getBoundingClientRect();
      setViewport({ width: Math.max(0, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const count = viewport.width > 0 ? filmstripCount(viewport.width, viewport.height, naturalAspect ?? 16 / 9) : 0;

  useEffect(() => {
    if (!videoUrl || count < 1 || rangeEnd <= rangeStart) return;
    const controller = new AbortController();
    generateThumbnails(videoUrl, rangeStart, rangeEnd, count, controller.signal).then((frames) => {
      if (controller.signal.aborted) {
        for (const frame of frames) frame.close();
        return;
      }
      for (const frame of framesRef.current) frame.close();
      framesRef.current = frames;
      setFrameVersion((value) => value + 1);
    });
    return () => controller.abort();
  }, [count, rangeEnd, rangeStart, videoUrl]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const frames = framesRef.current;
    if (!canvas || viewport.width < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(viewport.width * dpr));
    canvas.height = Math.max(1, Math.round(viewport.height * dpr));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const slotWidth = frames.length ? viewport.width / frames.length : 0;
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      drawCover(
        context,
        frame,
        frame.width * crop.x,
        frame.height * crop.y,
        Math.max(1, frame.width * crop.width),
        Math.max(1, frame.height * crop.height),
        i * slotWidth,
        0,
        slotWidth + 0.75,
        viewport.height,
      );
    }
  }, [crop.height, crop.width, crop.x, crop.y, frameVersion, viewport.height, viewport.width]);

  useEffect(() => () => {
    for (const frame of framesRef.current) frame.close();
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", filter }} />;
}

function TrimHandle({ side, pct, onDown }: {
  side: "start" | "end";
  pct: number;
  onDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Adjust clip ${side}`}
      data-testid={`trim-${side}-handle`}
      onPointerDown={(event) => { event.stopPropagation(); onDown(event); }}
      style={{
        position: "absolute", top: -8, bottom: -8, left: `calc(${pct}% - 20px)`, width: 40,
        padding: 0, border: 0, background: "transparent", cursor: "ew-resize",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3,
      }}
    >
      <span aria-hidden="true" style={{
        width: 12, height: "calc(100% - 8px)", borderRadius: 6, background: "var(--tool-trim-strong)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", gap: 2,
      }}>
        <span style={{ width: 1.5, height: 10, borderRadius: 1, background: "rgba(255,255,255,0.9)" }} />
        <span style={{ width: 1.5, height: 10, borderRadius: 1, background: "rgba(255,255,255,0.9)" }} />
      </span>
    </button>
  );
}

function outputDuration(clip: VideoClip) {
  return Math.max(0, clip.edit.trimEnd - clip.edit.trimStart) / Math.max(clip.edit.speed, 0.01);
}

export function Timeline({ editor }: { editor: VideoEditor }) {
  const {
    clips, activeClip, activeClipId, totalDuration, currentTime, trimEditing, cutPending,
    isPlaying, togglePlay, setTrim, seek, previewFrame, commitPreviewFrame,
    selectClip, moveClip, reorderClip,
  } = editor;
  const segmentRefs = useRef(new Map<string, HTMLDivElement>());
  const trimBoundsRef = useRef({ start: editor.edit.trimStart, end: editor.edit.trimEnd });
  const [drag, setDrag] = useState<DragMode>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [draggedClipId, setDraggedClipId] = useState<string | null>(null);
  const interactionRef = useRef<{
    mode: Exclude<DragMode, null>;
    pointerId: number;
    left: number;
    width: number;
    viewStart: number;
    viewSpan: number;
    pendingClientX: number;
    lastTime: number;
  } | null>(null);
  const scrubFrameRef = useRef<number | null>(null);
  trimBoundsRef.current = { start: editor.edit.trimStart, end: editor.edit.trimEnd };

  const activeViewStart = activeClip?.trimView.start ?? 0;
  const activeViewEnd = activeClip?.trimView.end || activeClip?.duration || 0;
  const activeViewSpan = Math.max(activeViewEnd - activeViewStart, 0.001);

  const applyInteractionAt = useCallback((clientX: number) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const ratio = Math.min(Math.max((clientX - interaction.left) / interaction.width, 0), 1);
    const time = interaction.viewStart + ratio * interaction.viewSpan;
    interaction.lastTime = time;
    setScrubTime(time);
    previewFrame(time);
    if (interaction.mode === "start") setTrim(time, trimBoundsRef.current.end);
    if (interaction.mode === "end") setTrim(trimBoundsRef.current.start, time);
  }, [previewFrame, setTrim]);

  const beginInteraction = useCallback((mode: Exclude<DragMode, null>, event: React.PointerEvent) => {
    if (!activeClip) return;
    const track = segmentRefs.current.get(activeClip.id);
    if (!track) return;
    if (isPlaying) togglePlay();
    const rect = track.getBoundingClientRect();
    interactionRef.current = {
      mode, pointerId: event.pointerId, left: rect.left, width: Math.max(1, rect.width),
      viewStart: activeViewStart, viewSpan: activeViewSpan,
      pendingClientX: event.clientX, lastTime: activeViewStart,
    };
    setDrag(mode);
    applyInteractionAt(event.clientX);
  }, [activeClip, activeViewSpan, activeViewStart, applyInteractionAt, isPlaying, togglePlay]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      interaction.pendingClientX = event.clientX;
      if (scrubFrameRef.current !== null) return;
      scrubFrameRef.current = requestAnimationFrame(() => {
        scrubFrameRef.current = null;
        if (interactionRef.current) applyInteractionAt(interactionRef.current.pendingClientX);
      });
    };
    const onUp = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      if (scrubFrameRef.current !== null) cancelAnimationFrame(scrubFrameRef.current);
      scrubFrameRef.current = null;
      applyInteractionAt(event.type === "pointercancel" ? interaction.pendingClientX : event.clientX);
      commitPreviewFrame(interaction.lastTime);
      setScrubTime(null);
      interactionRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      if (scrubFrameRef.current !== null) cancelAnimationFrame(scrubFrameRef.current);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyInteractionAt, commitPreviewFrame, drag]);

  if (!clips.length || !activeClip) return null;

  const timelineTime = scrubTime ?? currentTime;
  const elapsedBeforeActive = clips.slice(0, clips.findIndex((clip) => clip.id === activeClip.id)).reduce((sum, clip) => sum + outputDuration(clip), 0);
  const activeElapsed = Math.max(0, timelineTime - activeClip.edit.trimStart) / Math.max(activeClip.edit.speed, 0.01);
  const counterTime = drag ? timelineTime : elapsedBeforeActive + activeElapsed;
  const startPct = ((activeClip.edit.trimStart - activeViewStart) / activeViewSpan) * 100;
  const endPct = ((activeClip.edit.trimEnd - activeViewStart) / activeViewSpan) * 100;
  const trimFeedbackTransition = `transform ${CUT_COMPRESS_MS}ms ease-out, opacity ${CUT_COMPRESS_MS}ms ease-out`;

  return (
    <section aria-label="Video timeline" style={{
      height: "100%", minHeight: 0, borderRadius: "var(--radius-lg)", background: "var(--bg-panel-solid)",
      boxShadow: "var(--island-shadow)", padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 9,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="tabular-nums" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
          <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{drag ? formatTimePrecise(counterTime) : formatTime(counterTime)}</span>
          <span style={{ color: "var(--text-3)" }}> / {formatTime(totalDuration)}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          {clips.length} {clips.length === 1 ? "clip" : "clips"} · drag to reorder
        </div>
      </div>

      <div className="timeline-scroll" style={{ minHeight: 0, overflowX: "auto", overflowY: "visible", padding: "8px 0" }}>
        <div style={{ display: "flex", height: 68, minWidth: "100%", width: clips.length > 4 ? `${clips.length * 25}%` : "100%", gap: 4 }}>
          {clips.map((clip, index) => {
            const active = clip.id === activeClipId;
            const clipDuration = outputDuration(clip);
            const viewStart = clip.trimView.start;
            const viewEnd = clip.trimView.end || clip.duration;
            const viewSpan = Math.max(viewEnd - viewStart, 0.001);
            const localPlayhead = active ? Math.min(100, Math.max(0, ((timelineTime - viewStart) / viewSpan) * 100)) : 0;
            return (
              <div
                key={clip.id}
                ref={(node) => { if (node) segmentRefs.current.set(clip.id, node); else segmentRefs.current.delete(clip.id); }}
                className="timeline-clip"
                data-active={active}
                data-dragging={draggedClipId === clip.id}
                draggable={!trimEditing}
                onDragStart={(event) => {
                  setDraggedClipId(clip.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", clip.id);
                }}
                onDragEnd={() => setDraggedClipId(null)}
                onDragOver={(event) => { if (draggedClipId && draggedClipId !== clip.id) event.preventDefault(); }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData("text/plain") || draggedClipId;
                  if (sourceId) moveClip(sourceId, clip.id);
                  setDraggedClipId(null);
                }}
                style={{
                  position: "relative", minWidth: 84, flexBasis: 0, flexGrow: Math.max(clipDuration, totalDuration * 0.08),
                  borderRadius: "var(--radius-sm)", background: "var(--bg-chip)",
                  outline: active ? "2px solid var(--tool-trim-strong)" : "1px solid var(--image-outline)",
                  outlineOffset: active ? -2 : -1, opacity: draggedClipId === clip.id ? 0.45 : 1,
                  transform: draggedClipId === clip.id ? "scale(0.98)" : "scale(1)",
                  transition: "transform 150ms ease-out, opacity 150ms ease-out", overflow: "visible",
                }}
              >
                <button
                  type="button"
                  aria-label={`${clip.file.name}, clip ${index + 1} of ${clips.length}`}
                  aria-pressed={active}
                  title={`${clip.file.name} · ${formatTime(clipDuration)}`}
                  onClick={() => { if (!active) selectClip(clip.id); }}
                  onPointerDown={(event) => { if (active && !trimEditing) beginInteraction("scrub", event); }}
                  onKeyDown={(event) => {
                    if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
                      event.preventDefault();
                      reorderClip(clip.id, event.key === "ArrowLeft" ? -1 : 1);
                      return;
                    }
                    if (!active) return;
                    let nextTime = timelineTime;
                    if (event.key === "Home") nextTime = viewStart;
                    else if (event.key === "End") nextTime = viewEnd;
                    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") nextTime -= event.shiftKey ? 5 : 1;
                    else if (event.key === "ArrowRight" || event.key === "ArrowUp") nextTime += event.shiftKey ? 5 : 1;
                    else return;
                    event.preventDefault();
                    if (isPlaying) togglePlay();
                    seek(Math.min(viewEnd, Math.max(viewStart, nextTime)));
                  }}
                  style={{ position: "absolute", inset: 0, width: "100%", padding: 0, border: 0, borderRadius: "inherit", overflow: "hidden", background: "transparent", cursor: trimEditing && active ? "default" : "pointer" }}
                >
                  <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "var(--bg-chip)" }} />
                  {clip.duration > 0 && <Filmstrip videoUrl={clip.url} rangeStart={viewStart} rangeEnd={viewEnd} crop={clip.edit.crop} naturalAspect={clip.naturalAspect} filter={colorFilterCss(clip.edit.color)} />}
                  <span aria-hidden="true" style={{ position: "absolute", left: 5, top: 5, display: "flex", alignItems: "center", gap: 3, padding: "2px 5px", borderRadius: 4, background: "rgba(12,18,32,0.72)", color: "#fff", fontSize: 9.5, fontVariantNumeric: "tabular-nums" }}>
                    <IconGripVertical size={10} /> {index + 1}
                  </span>
                </button>

                {active && trimEditing && (
                  <>
                    <div aria-hidden="true" style={{ position: "absolute", inset: `0 ${100 - startPct}% 0 0`, borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)", background: "var(--bg-window)", opacity: cutPending ? 0 : 0.72, transform: `scaleX(${cutPending ? 0 : 1})`, transformOrigin: "left center", transition: trimFeedbackTransition, pointerEvents: "none" }} />
                    <div aria-hidden="true" style={{ position: "absolute", inset: `0 0 0 ${endPct}%`, borderRadius: "0 var(--radius-sm) var(--radius-sm) 0", background: "var(--bg-window)", opacity: cutPending ? 0 : 0.72, transform: `scaleX(${cutPending ? 0 : 1})`, transformOrigin: "right center", transition: trimFeedbackTransition, pointerEvents: "none" }} />
                    <div aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: `${startPct}%`, right: `${100 - endPct}%`, border: "2px solid var(--tool-trim)", opacity: cutPending ? 0 : 1, transition: `opacity ${CUT_COMPRESS_MS}ms ease-out`, pointerEvents: "none" }} />
                    {!cutPending && <TrimHandle side="start" pct={startPct} onDown={(event) => beginInteraction("start", event)} />}
                    {!cutPending && <TrimHandle side="end" pct={endPct} onDown={(event) => beginInteraction("end", event)} />}
                  </>
                )}

                {active && !trimEditing && (
                  <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none", transform: `translateX(${localPlayhead}%)`, willChange: isPlaying ? "transform" : undefined }}>
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 2, borderRadius: 999, background: "var(--tool-trim-strong)", boxShadow: "0 0 0 1px var(--bg-panel-solid)", transform: "translateX(-50%)" }} />
                    <div style={{ position: "absolute", top: -4, left: 0, width: 9, height: 9, borderRadius: "50%", background: "var(--tool-trim-strong)", boxShadow: "0 0 0 2px var(--bg-panel-solid)", transform: "translateX(-50%)" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
