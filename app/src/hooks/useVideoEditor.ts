import { useCallback, useEffect, useRef, useState } from "react";
import {
  FULL_CROP,
  MIN_CROP_SIZE,
  centeredCropForRatio,
  defaultEditState,
  labelForCrop,
  type ColorAdjustments,
  type CropRect,
  type EditState,
} from "../types";

// Shared by the timeline feedback and the committed trim state swap.
export const CUT_COMPRESS_MS = 180;

export function useVideoEditor() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [edit, setEdit] = useState<EditState>(defaultEditState(0));
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [cropEditing, setCropEditing] = useState(false);
  const [trimEditing, setTrimEditing] = useState(false);
  // The window the timeline currently displays as "the whole clip" — starts as the full
  // source, and snaps to [trimStart, trimEnd] once the user commits a cut.
  const [trimView, setTrimView] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [cropEditStart, setCropEditStart] = useState<CropRect>(FULL_CROP);
  // Which preset button should read as "active" — tracked explicitly (not re-derived from crop
  // geometry) so that clicking a preset whose ratio happens to match the source's natural aspect
  // (its crop rect is then identical to full-frame Free) still highlights that preset, and clicking
  // Free right after still highlights Free even though the rect didn't change. null = Free.
  const [cropPresetLabel, setCropPresetLabel] = useState<string | null>(null);
  const [trimEditStart, setTrimEditStart] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  // True while the timeline clears the trimmed-away edges before committing the shorter view.
  const [cutPending, setCutPending] = useState(false);
  const pendingCutRef = useRef<{ start: number; end: number } | null>(null);
  const scrubTargetRef = useRef<number | null>(null);
  const scrubSeekingRef = useRef(false);
  const scrubUsesFrameCallbackRef = useRef(false);
  const scrubFrameRequestRef = useRef<number | null>(null);
  const advanceScrubRef = useRef<() => void>(() => {});

  const resetScrubPipeline = useCallback(() => {
    const v = videoRef.current as (HTMLVideoElement & {
      cancelVideoFrameCallback?: (id: number) => void;
    }) | null;
    if (v && scrubFrameRequestRef.current !== null && v.cancelVideoFrameCallback) {
      v.cancelVideoFrameCallback(scrubFrameRequestRef.current);
    }
    scrubTargetRef.current = null;
    scrubSeekingRef.current = false;
    scrubUsesFrameCallbackRef.current = false;
    scrubFrameRequestRef.current = null;
  }, []);

  const loadFile = useCallback((f: File) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(f);
    setFile(f);
    setVideoUrl(url);
    setIsPlaying(false);
    setCurrentTime(0);
    setNaturalAspect(null);
    setSourceSize(null);
    setCropEditing(false);
    setTrimEditing(false);
    setCutPending(false);
    setCropPresetLabel(null);
    pendingCutRef.current = null;
    resetScrubPipeline();
    setTrimView({ start: 0, end: 0 });
  }, [resetScrubPipeline, videoUrl]);

  const clearFile = useCallback(() => {
    const v = videoRef.current;
    if (v) v.pause();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    pendingCutRef.current = null;
    resetScrubPipeline();
    setFile(null);
    setVideoUrl(null);
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setEdit(defaultEditState(0));
    setNaturalAspect(null);
    setSourceSize(null);
    setCropEditing(false);
    setTrimEditing(false);
    setTrimView({ start: 0, end: 0 });
    setCropEditStart(FULL_CROP);
    setCropPresetLabel(null);
    setTrimEditStart({ start: 0, end: 0 });
    setCutPending(false);
  }, [resetScrubPipeline, videoUrl]);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    setDuration(d);
    setEdit(defaultEditState(d));
    setTrimView({ start: 0, end: d });
    if (v.videoWidth && v.videoHeight) {
      setNaturalAspect(v.videoWidth / v.videoHeight);
      setSourceSize({ width: v.videoWidth, height: v.videoHeight });
    } else {
      setNaturalAspect(null);
      setSourceSize(null);
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current as (HTMLVideoElement & { webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean }) | null;
    if (!v) return;
    v.playbackRate = edit.speed;
    v.preservesPitch = edit.preservesPitch;
    v.webkitPreservesPitch = edit.preservesPitch;
    v.mozPreservesPitch = edit.preservesPitch;
  }, [edit.speed, edit.preservesPitch]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = edit.isMuted;
  }, [edit.isMuted]);

  const finishPlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const rangeEnd = Math.min(edit.trimEnd, Number.isFinite(v.duration) ? v.duration : edit.trimEnd);
    v.pause();
    resetScrubPipeline();
    v.currentTime = rangeEnd;
    setCurrentTime(rangeEnd);
    setIsPlaying(false);
  }, [edit.trimEnd, resetScrubPipeline]);

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (scrubSeekingRef.current) return;
    if (v.currentTime >= edit.trimEnd - 0.01) {
      finishPlayback();
      return;
    }
    setCurrentTime(Math.min(edit.trimEnd, Math.max(edit.trimStart, v.currentTime)));
  }, [edit.trimEnd, edit.trimStart, finishPlayback]);

  // timeupdate can be very sparse at high playback rates. Syncing while playback is active
  // keeps the playhead travelling smoothly across the complete selected range.
  useEffect(() => {
    if (!isPlaying) return;
    let frameId = 0;
    const syncPlayhead = () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.currentTime >= edit.trimEnd - 0.01) {
        finishPlayback();
        return;
      }
      if (v.paused) {
        setIsPlaying(false);
        return;
      }
      setCurrentTime(Math.min(edit.trimEnd, Math.max(edit.trimStart, v.currentTime)));
      frameId = requestAnimationFrame(syncPlayhead);
    };
    frameId = requestAnimationFrame(syncPlayhead);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, edit.trimEnd, edit.trimStart, finishPlayback]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    resetScrubPipeline();
    if (v.paused) {
      if (v.currentTime >= edit.trimEnd - 0.01 || v.currentTime < edit.trimStart) {
        v.currentTime = edit.trimStart;
        setCurrentTime(edit.trimStart);
      }
      void v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, [edit.trimStart, edit.trimEnd, resetScrubPipeline]);

  useEffect(() => {
    if (!videoUrl) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && target.closest("button, input, textarea, select, a, [contenteditable='true']")) return;
      event.preventDefault();
      togglePlay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay, videoUrl]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    resetScrubPipeline();
    const clamped = Math.min(Math.max(t, edit.trimStart), edit.trimEnd);
    v.currentTime = clamped;
    setCurrentTime(clamped);
  }, [edit.trimStart, edit.trimEnd, resetScrubPipeline]);

  const advanceScrub = useCallback(() => {
    const v = videoRef.current;
    if (!v || !scrubSeekingRef.current) return;
    const target = scrubTargetRef.current;
    scrubTargetRef.current = null;
    if (target === null || Math.abs(v.currentTime - target) < 0.0005) {
      scrubSeekingRef.current = false;
      scrubUsesFrameCallbackRef.current = false;
      return;
    }

    const videoWithFrameCallback = v as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
    };
    scrubUsesFrameCallbackRef.current = Boolean(videoWithFrameCallback.requestVideoFrameCallback);
    if (videoWithFrameCallback.requestVideoFrameCallback) {
      scrubFrameRequestRef.current = videoWithFrameCallback.requestVideoFrameCallback(() => {
        scrubFrameRequestRef.current = null;
        advanceScrubRef.current();
      });
    }
    v.currentTime = target;
  }, []);
  advanceScrubRef.current = advanceScrub;

  // Pointer events can arrive much faster than the video decoder. Preserve only the newest
  // target and start the next exact seek after the previous frame reaches the compositor.
  const previewFrame = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const upperBound = Number.isFinite(v.duration) ? v.duration : duration;
    const target = Math.min(Math.max(t, 0), upperBound);
    scrubTargetRef.current = target;
    if (scrubSeekingRef.current) return;
    scrubSeekingRef.current = true;
    advanceScrubRef.current();
  }, [duration]);

  const commitPreviewFrame = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const upperBound = Number.isFinite(v.duration) ? v.duration : duration;
    const target = Math.min(Math.max(t, 0), upperBound);
    setCurrentTime(target);
    previewFrame(target);
  }, [duration, previewFrame]);

  const onSeeked = useCallback(() => {
    if (!scrubSeekingRef.current || scrubUsesFrameCallbackRef.current) return;
    requestAnimationFrame(() => advanceScrubRef.current());
  }, []);

  const setTrim = useCallback((start: number, end: number) => {
    setEdit((prev) => {
      const lo = trimView.start;
      const hi = trimView.end || duration;
      const trimStart = Math.max(lo, Math.min(start, end - 0.1));
      const trimEnd = Math.min(hi, Math.max(end, start + 0.1));
      const v = videoRef.current;
      if (v && !scrubSeekingRef.current && (v.currentTime < trimStart || v.currentTime > trimEnd)) {
        v.currentTime = trimStart;
        setCurrentTime(trimStart);
      }
      return { ...prev, trimStart, trimEnd };
    });
  }, [duration, trimView]);

  /** Starts the trim feedback; the actual state swap lands on a fixed timer. */
  const commitTrim = useCallback(() => {
    pendingCutRef.current = { start: edit.trimStart, end: edit.trimEnd };
    setCutPending(true);
  }, [edit.trimStart, edit.trimEnd]);

  useEffect(() => {
    if (!cutPending) return;
    const t = setTimeout(() => {
      if (pendingCutRef.current) {
        setTrimView(pendingCutRef.current);
        pendingCutRef.current = null;
      }
      setTrimEditing(false);
      setCutPending(false);
    }, CUT_COMPRESS_MS);
    return () => clearTimeout(t);
  }, [cutPending]);

  const resetTrim = useCallback(() => {
    const fullRange = { start: 0, end: duration };
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
    pendingCutRef.current = null;
    setIsPlaying(false);
    setCurrentTime(0);
    setTrimView(fullRange);
    setEdit((prev) => ({ ...prev, trimStart: 0, trimEnd: duration }));
    setTrimEditStart(fullRange);
    setTrimEditing(false);
    setCutPending(false);
  }, [duration]);

  const startTrimEdit = useCallback(() => {
    setTrimEditStart({ start: edit.trimStart, end: edit.trimEnd });
    setTrimEditing(true);
  }, [edit.trimStart, edit.trimEnd]);
  const cancelTrimEdit = useCallback(() => {
    setEdit((prev) => ({ ...prev, trimStart: trimEditStart.start, trimEnd: trimEditStart.end }));
    setTrimEditing(false);
  }, [trimEditStart]);

  const setSpeed = useCallback((speed: number) => {
    setEdit((prev) => ({ ...prev, speed }));
  }, []);

  const setPreservesPitch = useCallback((preservesPitch: boolean) => {
    setEdit((prev) => ({ ...prev, preservesPitch }));
  }, []);

  const setMuted = useCallback((isMuted: boolean) => {
    setEdit((prev) => ({ ...prev, isMuted }));
  }, []);

  const applyCropRect = useCallback((rect: CropRect) => {
    setEdit((prev) => {
      const width = Math.min(1, Math.max(MIN_CROP_SIZE, rect.width));
      const height = Math.min(1, Math.max(MIN_CROP_SIZE, rect.height));
      const x = Math.min(Math.max(0, rect.x), 1 - width);
      const y = Math.min(Math.max(0, rect.y), 1 - height);
      return { ...prev, crop: { x, y, width, height } };
    });
  }, []);

  const setCrop = useCallback((rect: CropRect) => {
    // Manual drag on the canvas. Free imposes no ratio constraint, so any shape drawn while
    // it's active is still "Free" — only re-derive the label (almost always down to "Custom")
    // when a ratio-constrained preset was active, since dragging immediately breaks that ratio.
    setCropPresetLabel((prevLabel) => (prevLabel === null ? null : labelForCrop(rect, naturalAspect)));
    applyCropRect(rect);
  }, [naturalAspect, applyCropRect]);

  // Preset button clicks — the label is set directly from the clicked preset, not re-derived
  // from the resulting rect, so it stays correct even when that rect is geometrically identical
  // to Free or another preset (see cropPresetLabel above).
  const setCropPreset = useCallback((label: string | null, ratio: number | null) => {
    if (!naturalAspect) return;
    setCropPresetLabel(label);
    applyCropRect(centeredCropForRatio(ratio, naturalAspect));
  }, [naturalAspect, applyCropRect]);

  const startCropEdit = useCallback(() => {
    setCropEditStart(edit.crop);
    setCropPresetLabel(labelForCrop(edit.crop, naturalAspect));
    setCropEditing(true);
  }, [edit.crop, naturalAspect]);
  const applyCrop = useCallback(() => setCropEditing(false), []);
  const cancelCropEdit = useCallback(() => {
    setEdit((prev) => ({ ...prev, crop: cropEditStart }));
    setCropPresetLabel(labelForCrop(cropEditStart, naturalAspect));
    setCropEditing(false);
  }, [cropEditStart, naturalAspect]);

  const setColor = useCallback((patch: Partial<ColorAdjustments>) => {
    setEdit((prev) => ({ ...prev, color: { ...prev.color, ...patch } }));
  }, []);

  const resetColor = useCallback(() => {
    setEdit((prev) => ({ ...prev, color: { exposure: 0, contrast: 1, saturation: 1, temperature: 0 } }));
  }, []);

  return {
    videoRef,
    file,
    videoUrl,
    duration,
    currentTime,
    isPlaying,
    edit,
    naturalAspect,
    sourceSize,
    trimView,
    cropEditing,
    cropEditStart,
    cropPresetLabel,
    trimEditing,
    trimEditStart,
    cutPending,
    loadFile,
    clearFile,
    onLoadedMetadata,
    onTimeUpdate,
    togglePlay,
    seek,
    previewFrame,
    commitPreviewFrame,
    onSeeked,
    setTrim,
    commitTrim,
    resetTrim,
    startTrimEdit,
    cancelTrimEdit,
    setSpeed,
    setPreservesPitch,
    setMuted,
    setCrop,
    setCropPreset,
    startCropEdit,
    applyCrop,
    cancelCropEdit,
    setColor,
    resetColor,
  };
}

export type VideoEditor = ReturnType<typeof useVideoEditor>;
