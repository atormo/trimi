import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { VideoEditor } from "../hooks/useVideoEditor";
import { CUT_COMPRESS_MS } from "../hooks/useVideoEditor";
import { formatTime, formatTimePrecise } from "../lib/format";
import { colorFilterCss, temperatureOverlayStyle } from "../lib/colorFilter";
import { drawCover, generateThumbnails } from "../lib/thumbnails";
import type { CropRect } from "../types";

type DragMode = "start" | "end" | "scrub" | null;

function filmstripCount(width: number, height: number, aspect: number) {
  const slotWidth = Math.max(height * Math.max(aspect, 0.2), 1);
  return Math.max(1, Math.ceil(width / slotWidth));
}

function Filmstrip({
  videoUrl,
  rangeStart,
  rangeEnd,
  crop,
  naturalAspect,
  filter,
}: {
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
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) return;
    const update = () => {
      const rect = parent.getBoundingClientRect();
      setViewport({
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const count = viewport.width > 0
    ? filmstripCount(viewport.width, viewport.height, naturalAspect ?? 16 / 9)
    : 0;

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
    if (frames.length === 0) return;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const slotWidth = viewport.width / frames.length;
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const sourceX = frame.width * crop.x;
      const sourceY = frame.height * crop.y;
      const sourceWidth = Math.max(1, frame.width * crop.width);
      const sourceHeight = Math.max(1, frame.height * crop.height);
      drawCover(
        context,
        frame,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        i * slotWidth,
        0,
        slotWidth + 0.75,
        viewport.height,
      );
    }
  }, [crop.height, crop.width, crop.x, crop.y, frameVersion, viewport.height, viewport.width]);

  useEffect(() => () => {
    for (const frame of framesRef.current) frame.close();
    framesRef.current = [];
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", filter }}
    />
  );
}

function TrimHandle({ side, pct, onDown }: {
  side: "start" | "end";
  pct: number;
  onDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      data-testid={`trim-${side}-handle`}
      onPointerDown={(e) => { e.stopPropagation(); onDown(e); }}
      style={{
        position: "absolute", top: -8, bottom: -8, left: `calc(${pct}% - 20px)`, width: 40,
        cursor: "ew-resize", display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        width: 12, height: "calc(100% - 8px)", borderRadius: 6, background: "var(--tool-trim-strong)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", gap: 2,
      }}>
        <div style={{ width: 1.5, height: 10, borderRadius: 1, background: "rgba(255,255,255,0.9)" }} />
        <div style={{ width: 1.5, height: 10, borderRadius: 1, background: "rgba(255,255,255,0.9)" }} />
      </div>
    </div>
  );
}

export function Timeline({ editor }: { editor: VideoEditor }) {
  const { duration, currentTime, edit, videoUrl, naturalAspect, trimView, trimEditing, cutPending, isPlaying, togglePlay, setTrim, seek, previewFrame, commitPreviewFrame } = editor;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragMode>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const trimBoundsRef = useRef({ start: edit.trimStart, end: edit.trimEnd });
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
  trimBoundsRef.current = { start: edit.trimStart, end: edit.trimEnd };

  // Scrubbing or dragging a trim handle previews a specific frame — playback fighting that
  // seek (especially backward) is what made the preview look stuck, so pause first.
  const viewStart = trimView.start;
  const viewEnd = trimView.end || duration;
  const viewSpan = Math.max(viewEnd - viewStart, 0.001);

  const applyInteractionAt = useCallback((clientX: number) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const ratio = Math.min(Math.max((clientX - interaction.left) / interaction.width, 0), 1);
    const time = interaction.viewStart + ratio * interaction.viewSpan;
    interaction.lastTime = time;
    setScrubTime(time);
    previewFrame(time);

    if (interaction.mode === "start") {
      setTrim(time, trimBoundsRef.current.end);
    } else if (interaction.mode === "end") {
      setTrim(trimBoundsRef.current.start, time);
    }
  }, [previewFrame, setTrim]);

  const beginInteraction = useCallback((mode: Exclude<DragMode, null>, event: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track) return;
    if (isPlaying) togglePlay();
    const rect = track.getBoundingClientRect();
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      left: rect.left,
      width: Math.max(1, rect.width),
      viewStart,
      viewSpan,
      pendingClientX: event.clientX,
      lastTime: viewStart,
    };
    setDrag(mode);
    applyInteractionAt(event.clientX);
  }, [applyInteractionAt, isPlaying, togglePlay, viewSpan, viewStart]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || interaction.pointerId !== e.pointerId) return;
      interaction.pendingClientX = e.clientX;
      if (scrubFrameRef.current !== null) return;
      scrubFrameRef.current = requestAnimationFrame(() => {
        scrubFrameRef.current = null;
        const latest = interactionRef.current;
        if (latest) applyInteractionAt(latest.pendingClientX);
      });
    };
    const onUp = (e: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || interaction.pointerId !== e.pointerId) return;
      if (scrubFrameRef.current !== null) {
        cancelAnimationFrame(scrubFrameRef.current);
        scrubFrameRef.current = null;
      }
      applyInteractionAt(e.type === "pointercancel" ? interaction.pendingClientX : e.clientX);
      commitPreviewFrame(interaction.lastTime);
      setScrubTime(null);
      interactionRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      if (scrubFrameRef.current !== null) {
        cancelAnimationFrame(scrubFrameRef.current);
        scrubFrameRef.current = null;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyInteractionAt, commitPreviewFrame, drag]);

  const startPct = duration ? ((edit.trimStart - viewStart) / viewSpan) * 100 : 0;
  const endPct = duration ? ((edit.trimEnd - viewStart) / viewSpan) * 100 : 100;

  if (!duration) return null;

  const trimFeedbackTransition = `transform ${CUT_COMPRESS_MS}ms ease-out, opacity ${CUT_COMPRESS_MS}ms ease-out`;

  const timelineTime = scrubTime ?? currentTime;
  const playheadPct = Math.min(100, Math.max(0, ((timelineTime - viewStart) / viewSpan) * 100));
  // The playhead only makes sense outside trim editing — while adjusting the selection
  // it would sit on top of the handle it's tracking, which just reads as "the cursor vanished"
  const showPlayhead = !trimEditing;

  // Only a committed trim changes the physical length of the strip. Speed changes the
  // displayed duration, but keeps the frames readable at their current visual width.
  const timelineScale = Math.min(1, Math.max(0.14, viewSpan / duration));
  const displayedStart = trimEditing ? edit.trimStart : viewStart;
  const displayedSpan = trimEditing ? edit.trimEnd - edit.trimStart : viewSpan;
  const displayedElapsed = Math.min(displayedSpan, Math.max(0, timelineTime - displayedStart)) / edit.speed;
  const displayedDuration = displayedSpan / edit.speed;
  const counterTime = drag ? timelineTime : displayedElapsed;
  const counterDuration = drag ? duration : displayedDuration;
  const thumbFilter = colorFilterCss(edit.color);

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        borderRadius: "var(--radius-lg)",
        border: "none",
        background: "var(--bg-panel-solid)",
        boxShadow: "var(--island-shadow)",
        padding: "14px 20px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{drag ? formatTimePrecise(counterTime) : formatTime(counterTime)}</span>
          <span style={{ color: "var(--text-3)" }}> / {formatTime(counterDuration)}</span>
        </div>
      </div>

      <div style={{ position: "relative", height: 76 }}>
        <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "var(--border-strong)" }} />
        <div aria-hidden style={{ position: "absolute", right: 0, top: "calc(50% - 4px)", width: 1, height: 9, background: "var(--border-strong)" }} />
        <div
          ref={trackRef}
          data-testid="trim-track"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: `${timelineScale * 100}%`,
            userSelect: "none",
          }}
        >
        <div
          role="slider"
          aria-label="Video position"
          aria-valuemin={viewStart}
          aria-valuemax={viewEnd}
          aria-valuenow={timelineTime}
          aria-valuetext={drag ? formatTimePrecise(timelineTime) : formatTime(timelineTime)}
          tabIndex={0}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            background: "var(--bg-chip)",
            outline: "1px solid var(--image-outline)",
            outlineOffset: -1,
            cursor: "pointer",
          }}
          onPointerDown={(e) => beginInteraction("scrub", e)}
          onKeyDown={(event) => {
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
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "repeating-linear-gradient(90deg, var(--bg-chip) 0px, var(--bg-chip) 38px, var(--bg-chip-hover) 38px, var(--bg-chip-hover) 40px)",
            }}
          />
          {videoUrl && (
            <Filmstrip
              videoUrl={videoUrl}
              rangeStart={viewStart}
              rangeEnd={viewEnd}
              crop={edit.crop}
              naturalAspect={naturalAspect}
              filter={thumbFilter}
            />
          )}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", ...temperatureOverlayStyle(edit.color.temperature) }} />

          {/* trim adjustment is opt-in — nothing here by default, only once "Edit trim" is on */}
          {trimEditing && (
            <>
              {/* The discarded edges retreat toward their nearest side using compositor-only motion. */}
              <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${startPct}%`, background: "var(--bg-window)", opacity: cutPending ? 0 : 0.72, transform: `scaleX(${cutPending ? 0 : 1})`, transformOrigin: "left center", transition: trimFeedbackTransition, pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${endPct}%`, right: 0, background: "var(--bg-window)", opacity: cutPending ? 0 : 0.72, transform: `scaleX(${cutPending ? 0 : 1})`, transformOrigin: "right center", transition: trimFeedbackTransition, pointerEvents: "none" }} />
              {/* The selection frame clears before the committed track contracts. */}
              <div style={{
                position: "absolute", top: 0, bottom: 0, left: `${startPct}%`, right: `${100 - endPct}%`,
                border: "2px solid var(--tool-trim)", boxSizing: "border-box", pointerEvents: "none",
                opacity: cutPending ? 0 : 1,
                transition: `opacity ${CUT_COMPRESS_MS}ms ease-out`,
              }} />
            </>
          )}
        </div>

        {trimEditing && !cutPending && (
          <>
            <TrimHandle side="start" pct={startPct} onDown={(event) => beginInteraction("start", event)} />
            <TrimHandle side="end" pct={endPct} onDown={(event) => beginInteraction("end", event)} />
          </>
        )}

        {showPlayhead && (
          <div data-testid="playhead" style={{
            position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
            transform: `translateX(${playheadPct}%)`,
            willChange: isPlaying ? "transform" : undefined,
          }}>
            <div style={{
              position: "absolute", top: 0, bottom: 0, left: 0, width: 2,
              borderRadius: 999, background: "var(--tool-trim-strong)",
              boxShadow: "0 0 0 1px var(--bg-panel-solid)",
              transform: "translateX(-50%)",
            }} />
            <div style={{
              position: "absolute", top: -4, left: 0, width: 9, height: 9,
              boxSizing: "border-box", borderRadius: "50%",
              background: "var(--tool-trim-strong)",
              boxShadow: "0 0 0 2px var(--bg-panel-solid)",
              transform: "translateX(-50%)",
            }} />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
