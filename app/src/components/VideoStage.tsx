import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconPlayerSkipBackFilled, IconPlayerSkipForwardFilled } from "@tabler/icons-react";
import type { VideoEditor } from "../hooks/useVideoEditor";
import { colorFilterCss, temperatureOverlayStyle } from "../lib/colorFilter";
import { FULL_CROP } from "../types";
import { CropOverlay } from "./CropOverlay";

const STAGE_PADDING = 24;

const transportBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
  background: "transparent", color: "var(--text-2)",
  display: "flex", alignItems: "center", justifyContent: "center",
};

/** Fits a box of the given aspect ratio inside `stageRef`'s content area, like `object-fit: contain`.
 *  Computed explicitly because boxRef's only children are position:absolute (the clipped video
 *  wrapper and the crop overlay), so it has no in-flow content to size itself from. */
function useFitSize(stageRef: RefObject<HTMLDivElement | null>, aspect: number | undefined) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !aspect) {
      setSize(null);
      return;
    }
    const compute = () => {
      const availW = el.clientWidth - STAGE_PADDING * 2;
      const availH = el.clientHeight - STAGE_PADDING * 2;
      if (availW <= 0 || availH <= 0) return;
      let w = availW;
      let h = availW / aspect;
      if (h > availH) {
        h = availH;
        w = availH * aspect;
      }
      setSize({ width: w, height: h });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageRef, aspect]);

  return size;
}

export function VideoStage({ editor }: { editor: VideoEditor }) {
  const { videoRef, edit, naturalAspect, cropEditing, isPlaying, onLoadedMetadata, onTimeUpdate, onSeeked, togglePlay, seek, setCrop } = editor;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const transportRef = useRef<HTMLDivElement | null>(null);
  const transportPositionRef = useRef<{ x: number; y: number } | null>(null);
  const videoPositionRef = useRef({ x: 0, y: 0 });
  const videoDragFrameRef = useRef<number | null>(null);
  const videoDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    maxX: number;
    maxY: number;
    pendingX: number;
    pendingY: number;
  } | null>(null);
  const transportDragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
    clickTarget: HTMLButtonElement | null;
  } | null>(null);
  const suppressTransportClickRef = useRef(false);

  const positionTransport = useCallback((x: number, y: number) => {
    const stage = stageRef.current;
    const transport = transportRef.current;
    if (!stage || !transport) return;
    const inset = 8;
    const maxX = Math.max(inset, stage.clientWidth - transport.offsetWidth - inset);
    const maxY = Math.max(inset, stage.clientHeight - transport.offsetHeight - inset);
    const clamped = {
      x: Math.min(maxX, Math.max(inset, x)),
      y: Math.min(maxY, Math.max(inset, y)),
    };
    transportPositionRef.current = clamped;
    transport.style.left = "0";
    transport.style.top = "0";
    transport.style.right = "auto";
    transport.style.bottom = "auto";
    transport.style.transform = `translate3d(${clamped.x}px, ${clamped.y}px, 0)`;
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => {
      const position = transportPositionRef.current;
      if (position) positionTransport(position.x, position.y);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [positionTransport]);

  const positionVideo = useCallback((x: number, y: number, maxX?: number, maxY?: number) => {
    const stage = stageRef.current;
    const box = boxRef.current;
    if (!stage || !box) return;
    const horizontalLimit = maxX ?? Math.max(0, (stage.clientWidth - box.offsetWidth) / 2 - 8);
    const verticalLimit = maxY ?? Math.max(0, (stage.clientHeight - box.offsetHeight) / 2 - 8);
    const clamped = {
      x: Math.min(horizontalLimit, Math.max(-horizontalLimit, x)),
      y: Math.min(verticalLimit, Math.max(-verticalLimit, y)),
    };
    videoPositionRef.current = clamped;
    box.style.transform = `translate3d(${clamped.x}px, ${clamped.y}px, 0)`;
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => {
      const position = videoPositionRef.current;
      positionVideo(position.x, position.y);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [positionVideo]);

  useEffect(() => {
    videoPositionRef.current = { x: 0, y: 0 };
    if (boxRef.current) boxRef.current.style.transform = "translate3d(0, 0, 0)";
  }, [editor.videoUrl]);

  const applyVideoDrag = useCallback(() => {
    const drag = videoDragRef.current;
    if (!drag) return;
    positionVideo(
      drag.originX + drag.pendingX - drag.startX,
      drag.originY + drag.pendingY - drag.startY,
      drag.maxX,
      drag.maxY,
    );
  }, [positionVideo]);

  const startVideoDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (cropEditing || !event.isPrimary || event.button !== 0) return;
    const stage = stageRef.current;
    const box = boxRef.current;
    if (!stage || !box) return;
    const position = videoPositionRef.current;
    videoDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      maxX: Math.max(0, (stage.clientWidth - box.offsetWidth) / 2 - 8),
      maxY: Math.max(0, (stage.clientHeight - box.offsetHeight) / 2 - 8),
      pendingX: event.clientX,
      pendingY: event.clientY,
    };
    box.dataset.dragging = "true";
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveVideo = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = videoDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.pendingX = event.clientX;
    drag.pendingY = event.clientY;
    if (videoDragFrameRef.current !== null) return;
    videoDragFrameRef.current = requestAnimationFrame(() => {
      videoDragFrameRef.current = null;
      applyVideoDrag();
    });
  };

  const endVideoDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = videoDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.pendingX = event.clientX;
    drag.pendingY = event.clientY;
    if (videoDragFrameRef.current !== null) {
      cancelAnimationFrame(videoDragFrameRef.current);
      videoDragFrameRef.current = null;
    }
    if (event.type !== "pointercancel") applyVideoDrag();
    videoDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.dataset.dragging = "false";
  };

  const startTransportDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    const stage = stageRef.current;
    const transport = transportRef.current;
    if (!stage || !transport) return;
    const stageRect = stage.getBoundingClientRect();
    const transportRect = transport.getBoundingClientRect();
    transportDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - transportRect.left,
      offsetY: event.clientY - transportRect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      clickTarget: (event.target as HTMLElement).closest("button"),
    };
    positionTransport(transportRect.left - stageRect.left, transportRect.top - stageRect.top);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveTransport = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = transportDragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stage) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    const stageRect = stage.getBoundingClientRect();
    if (!drag.moved) {
      const transport = transportRef.current;
      if (!transport) return;
      drag.moved = true;
      transport.dataset.dragging = "true";
    }
    positionTransport(
      event.clientX - stageRect.left - drag.offsetX,
      event.clientY - stageRect.top - drag.offsetY,
    );
    event.preventDefault();
  };

  const endTransportDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = transportDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const cancelled = event.type === "pointercancel";
    suppressTransportClickRef.current = !cancelled;
    transportDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (transportRef.current) transportRef.current.dataset.dragging = "false";
    if (!cancelled && !drag.moved && drag.clickTarget) drag.clickTarget.click();
    window.setTimeout(() => {
      suppressTransportClickRef.current = false;
    }, 0);
  };

  const moveTransportWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    const stage = stageRef.current;
    const transport = transportRef.current;
    if (!stage || !transport) return;
    event.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    const transportRect = transport.getBoundingClientRect();
    const step = event.shiftKey ? 32 : 12;
    positionTransport(
      transportRect.left - stageRect.left + direction[0] * step,
      transportRect.top - stageRect.top + direction[1] * step,
    );
  };

  // While editing, show the full frame with the draggable window on top. Otherwise, render
  // the locked-in crop — video zoomed/panned so only that window is visible.
  const displayedCrop = cropEditing ? FULL_CROP : edit.crop;
  const containerAspect = naturalAspect
    ? (displayedCrop.width / displayedCrop.height) * naturalAspect
    : undefined;
  const fitSize = useFitSize(stageRef, containerAspect);

  return (
    <div
      ref={stageRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        borderRadius: "var(--radius-lg)",
        border: "none",
        backgroundColor: "var(--bg-stage)",
        backgroundImage: "radial-gradient(circle, var(--stage-dot) 1px, transparent 1.15px)",
        backgroundSize: "18px 18px",
        backgroundPosition: "-1px -1px",
        boxShadow: "var(--island-shadow)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        padding: STAGE_PADDING,
      }}
    >
      {editor.videoUrl && (
        <>
        {/* boxRef never clips — the crop overlay's grab handles extend past the video's edges,
            and clipping here would cut them off exactly when the crop is at full frame. */}
        <div
        ref={boxRef}
        className="video-canvas-item"
        data-dragging="false"
        onPointerDown={startVideoDrag}
        onPointerMove={moveVideo}
        onPointerUp={endVideoDrag}
        onPointerCancel={endVideoDrag}
        style={{
          position: "relative",
          width: fitSize ? fitSize.width : undefined,
          height: fitSize ? fitSize.height : undefined,
          maxWidth: fitSize ? undefined : "100%",
          maxHeight: fitSize ? undefined : "100%",
          cursor: cropEditing ? "default" : "grab",
          touchAction: cropEditing ? "auto" : "none",
        }}
      >
        {/* the video's rounded corners are clipped in this inner wrapper instead */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "var(--radius-md)", overflow: "hidden",
          outline: "1px solid var(--image-outline)", outlineOffset: -1,
        }}>
          <video
            ref={videoRef}
            src={editor.videoUrl ?? undefined}
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onSeeked={onSeeked}
            playsInline
            preload="auto"
            style={{
              display: "block",
              position: fitSize ? "absolute" : "static",
              width: fitSize ? `${100 / displayedCrop.width}%` : "auto",
              height: fitSize ? `${100 / displayedCrop.height}%` : "auto",
              left: fitSize ? `${(-displayedCrop.x / displayedCrop.width) * 100}%` : undefined,
              top: fitSize ? `${(-displayedCrop.y / displayedCrop.height) * 100}%` : undefined,
              maxWidth: fitSize ? undefined : "80vw",
              maxHeight: fitSize ? undefined : "60vh",
              objectFit: fitSize ? undefined : "contain",
              filter: colorFilterCss(edit.color),
            }}
          />
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", ...temperatureOverlayStyle(edit.color.temperature) }} />
        </div>

        {cropEditing && naturalAspect && (
          <CropOverlay crop={edit.crop} onChange={setCrop} boxRef={boxRef} color="var(--tool-crop)" />
        )}
        </div>

        {/* A movable playback island. Its position is updated with transform only while dragging. */}
        <div
        ref={transportRef}
        className="transport-island"
        data-dragging="false"
        role="group"
        aria-label="Movable playback controls"
        tabIndex={0}
        title="Drag to move · Focus and use arrow keys to adjust"
        onPointerDown={startTransportDrag}
        onPointerMove={moveTransport}
        onPointerUp={endTransportDrag}
        onPointerCancel={endTransportDrag}
        onKeyDown={moveTransportWithKeyboard}
        onClickCapture={(event) => {
          if (!suppressTransportClickRef.current || event.detail === 0) return;
          suppressTransportClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute", right: 16, bottom: 16,
          display: "flex", alignItems: "center", gap: 2, padding: 3,
          borderRadius: 999, border: "none",
          background: "var(--bg-panel-solid)", boxShadow: "var(--control-shadow)",
        }}
      >
        <button onClick={() => seek(edit.trimStart)} aria-label="Go to start" title="Go to start" style={transportBtn}>
          <IconPlayerSkipBackFilled size={13} />
        </button>
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          aria-keyshortcuts="Space"
          title={isPlaying ? "Pause · Space" : "Play · Space"}
          style={{
            width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "var(--text-1)", color: "var(--accent-ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {isPlaying ? <IconPlayerPauseFilled size={13} /> : <IconPlayerPlayFilled size={13} style={{ marginLeft: 1.5 }} />}
        </button>
        <button onClick={() => seek(edit.trimEnd)} aria-label="Go to end" title="Go to end" style={transportBtn}>
          <IconPlayerSkipForwardFilled size={13} />
        </button>
        </div>
        </>
      )}
    </div>
  );
}
