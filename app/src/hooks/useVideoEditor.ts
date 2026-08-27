import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FULL_CROP,
  MIN_CROP_SIZE,
  centeredCropForRatio,
  defaultEditState,
  labelForCrop,
  type ColorAdjustments,
  type CropRect,
  type VideoClip,
} from "../types";

export const CUT_COMPRESS_MS = 180;

const makeClip = (file: File): VideoClip => ({
  id: crypto.randomUUID(),
  file,
  url: URL.createObjectURL(file),
  duration: 0,
  naturalAspect: null,
  sourceSize: null,
  edit: defaultEditState(0),
  trimView: { start: 0, end: 0 },
});

export function useVideoEditor() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cropEditing, setCropEditing] = useState(false);
  const [trimEditing, setTrimEditing] = useState(false);
  const [cropEditStart, setCropEditStart] = useState<CropRect>(FULL_CROP);
  const [cropPresetLabel, setCropPresetLabel] = useState<string | null>(null);
  const [trimEditStart, setTrimEditStart] = useState({ start: 0, end: 0 });
  const [cutPending, setCutPending] = useState(false);

  const clipsRef = useRef(clips);
  const activeClipIdRef = useRef(activeClipId);
  const pendingCutRef = useRef<{ clipId: string; start: number; end: number } | null>(null);
  const pendingAutoPlayRef = useRef(false);
  const scrubTargetRef = useRef<number | null>(null);
  const scrubSeekingRef = useRef(false);
  const scrubUsesFrameCallbackRef = useRef(false);
  const scrubFrameRequestRef = useRef<number | null>(null);
  const advanceScrubRef = useRef<() => void>(() => {});
  clipsRef.current = clips;
  activeClipIdRef.current = activeClipId;

  const activeClip = useMemo(
    () => clips.find((clip) => clip.id === activeClipId) ?? clips[0] ?? null,
    [activeClipId, clips],
  );

  const updateClip = useCallback((id: string, update: (clip: VideoClip) => VideoClip) => {
    setClips((current) => current.map((clip) => clip.id === id ? update(clip) : clip));
  }, []);

  const updateActiveClip = useCallback((update: (clip: VideoClip) => VideoClip) => {
    const id = activeClipIdRef.current;
    if (id) updateClip(id, update);
  }, [updateClip]);

  const resetScrubPipeline = useCallback(() => {
    const video = videoRef.current as (HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void }) | null;
    if (video && scrubFrameRequestRef.current !== null && video.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(scrubFrameRequestRef.current);
    }
    scrubTargetRef.current = null;
    scrubSeekingRef.current = false;
    scrubUsesFrameCallbackRef.current = false;
    scrubFrameRequestRef.current = null;
  }, []);

  const resetEditingModes = useCallback(() => {
    pendingCutRef.current = null;
    setCropEditing(false);
    setTrimEditing(false);
    setCutPending(false);
    setCropPresetLabel(null);
  }, []);

  const selectClip = useCallback((id: string, autoplay = false) => {
    const clip = clipsRef.current.find((item) => item.id === id);
    if (!clip) return;
    videoRef.current?.pause();
    resetScrubPipeline();
    resetEditingModes();
    pendingAutoPlayRef.current = autoplay;
    setIsPlaying(false);
    setCurrentTime(clip.edit.trimStart);
    setActiveClipId(id);
  }, [resetEditingModes, resetScrubPipeline]);

  const loadFile = useCallback((file: File) => {
    videoRef.current?.pause();
    for (const clip of clipsRef.current) URL.revokeObjectURL(clip.url);
    const clip = makeClip(file);
    resetScrubPipeline();
    resetEditingModes();
    setClips([clip]);
    setActiveClipId(clip.id);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [resetEditingModes, resetScrubPipeline]);

  const addFile = useCallback((file: File) => {
    const clip = makeClip(file);
    videoRef.current?.pause();
    resetScrubPipeline();
    resetEditingModes();
    setClips((current) => [...current, clip]);
    setActiveClipId(clip.id);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [resetEditingModes, resetScrubPipeline]);

  const clearFile = useCallback(() => {
    videoRef.current?.pause();
    for (const clip of clipsRef.current) URL.revokeObjectURL(clip.url);
    resetScrubPipeline();
    resetEditingModes();
    setClips([]);
    setActiveClipId(null);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [resetEditingModes, resetScrubPipeline]);

  useEffect(() => () => {
    for (const clip of clipsRef.current) URL.revokeObjectURL(clip.url);
  }, []);

  const removeClip = useCallback((id: string) => {
    const current = clipsRef.current;
    const index = current.findIndex((clip) => clip.id === id);
    if (index < 0 || current.length <= 1) return;
    URL.revokeObjectURL(current[index].url);
    const remaining = current.filter((clip) => clip.id !== id);
    setClips(remaining);
    if (activeClipIdRef.current === id) {
      const next = remaining[Math.min(index, remaining.length - 1)];
      setActiveClipId(next.id);
      setCurrentTime(next.edit.trimStart);
      resetEditingModes();
    }
  }, [resetEditingModes]);

  const moveClip = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setClips((current) => {
      const sourceIndex = current.findIndex((clip) => clip.id === sourceId);
      const targetIndex = current.findIndex((clip) => clip.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [source] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
  }, []);

  const reorderClip = useCallback((id: string, direction: -1 | 1) => {
    setClips((current) => {
      const index = current.findIndex((clip) => clip.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    const id = activeClipIdRef.current;
    if (!video || !id) return;
    const duration = video.duration;
    const prior = clipsRef.current.find((item) => item.id === id);
    const firstLoad = !prior || prior.duration <= 0;
    updateClip(id, (clip) => ({
      ...clip,
      duration,
      edit: firstLoad ? defaultEditState(duration) : clip.edit,
      trimView: firstLoad ? { start: 0, end: duration } : clip.trimView,
      naturalAspect: video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : null,
      sourceSize: video.videoWidth && video.videoHeight ? { width: video.videoWidth, height: video.videoHeight } : null,
    }));
    const start = firstLoad ? 0 : (prior?.edit.trimStart ?? 0);
    video.currentTime = start;
    setCurrentTime(start);
    if (pendingAutoPlayRef.current) {
      pendingAutoPlayRef.current = false;
      void video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [updateClip]);

  const edit = activeClip?.edit ?? defaultEditState(0);
  const duration = activeClip?.duration ?? 0;
  const trimView = activeClip?.trimView ?? { start: 0, end: 0 };

  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & { webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean }) | null;
    if (!video) return;
    video.playbackRate = edit.speed;
    video.preservesPitch = edit.preservesPitch;
    video.webkitPreservesPitch = edit.preservesPitch;
    video.mozPreservesPitch = edit.preservesPitch;
    video.muted = edit.isMuted;
  }, [activeClipId, edit.isMuted, edit.preservesPitch, edit.speed]);

  const advanceToNextClip = useCallback(() => {
    const current = clipsRef.current;
    const index = current.findIndex((clip) => clip.id === activeClipIdRef.current);
    if (index >= 0 && index < current.length - 1) {
      selectClip(current[index + 1].id, true);
      return true;
    }
    return false;
  }, [selectClip]);

  const finishPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    resetScrubPipeline();
    if (advanceToNextClip()) return;
    video.currentTime = edit.trimEnd;
    setCurrentTime(edit.trimEnd);
    setIsPlaying(false);
  }, [advanceToNextClip, edit.trimEnd, resetScrubPipeline]);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || scrubSeekingRef.current) return;
    if (video.currentTime >= edit.trimEnd - 0.01) return finishPlayback();
    setCurrentTime(Math.min(edit.trimEnd, Math.max(edit.trimStart, video.currentTime)));
  }, [edit.trimEnd, edit.trimStart, finishPlayback]);

  useEffect(() => {
    if (!isPlaying) return;
    let frameId = 0;
    const sync = () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.currentTime >= edit.trimEnd - 0.01) return finishPlayback();
      if (video.paused) return setIsPlaying(false);
      setCurrentTime(Math.min(edit.trimEnd, Math.max(edit.trimStart, video.currentTime)));
      frameId = requestAnimationFrame(sync);
    };
    frameId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frameId);
  }, [edit.trimEnd, edit.trimStart, finishPlayback, isPlaying]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    resetScrubPipeline();
    if (video.paused) {
      if (video.currentTime >= edit.trimEnd - 0.01) {
        if (advanceToNextClip()) return;
        video.currentTime = edit.trimStart;
        setCurrentTime(edit.trimStart);
      } else if (video.currentTime < edit.trimStart) {
        video.currentTime = edit.trimStart;
        setCurrentTime(edit.trimStart);
      }
      void video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [advanceToNextClip, edit.trimEnd, edit.trimStart, resetScrubPipeline]);

  useEffect(() => {
    if (!activeClip) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && target.closest("button, input, textarea, select, a, [contenteditable='true']")) return;
      event.preventDefault();
      togglePlay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeClip, togglePlay]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    resetScrubPipeline();
    const clamped = Math.min(Math.max(time, edit.trimStart), edit.trimEnd);
    video.currentTime = clamped;
    setCurrentTime(clamped);
  }, [edit.trimEnd, edit.trimStart, resetScrubPipeline]);

  const advanceScrub = useCallback(() => {
    const video = videoRef.current;
    if (!video || !scrubSeekingRef.current) return;
    const target = scrubTargetRef.current;
    scrubTargetRef.current = null;
    if (target === null || Math.abs(video.currentTime - target) < 0.0005) {
      scrubSeekingRef.current = false;
      scrubUsesFrameCallbackRef.current = false;
      return;
    }
    const enhanced = video as HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number };
    scrubUsesFrameCallbackRef.current = Boolean(enhanced.requestVideoFrameCallback);
    if (enhanced.requestVideoFrameCallback) {
      scrubFrameRequestRef.current = enhanced.requestVideoFrameCallback(() => {
        scrubFrameRequestRef.current = null;
        advanceScrubRef.current();
      });
    }
    video.currentTime = target;
  }, []);
  advanceScrubRef.current = advanceScrub;

  const previewFrame = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = Math.min(Math.max(time, 0), Number.isFinite(video.duration) ? video.duration : duration);
    scrubTargetRef.current = target;
    if (scrubSeekingRef.current) return;
    scrubSeekingRef.current = true;
    advanceScrubRef.current();
  }, [duration]);

  const commitPreviewFrame = useCallback((time: number) => {
    setCurrentTime(time);
    previewFrame(time);
  }, [previewFrame]);

  const onSeeked = useCallback(() => {
    if (!scrubSeekingRef.current || scrubUsesFrameCallbackRef.current) return;
    requestAnimationFrame(() => advanceScrubRef.current());
  }, []);

  const setTrim = useCallback((start: number, end: number) => {
    updateActiveClip((clip) => {
      const lo = clip.trimView.start;
      const hi = clip.trimView.end || clip.duration;
      const trimStart = Math.max(lo, Math.min(start, end - 0.1));
      const trimEnd = Math.min(hi, Math.max(end, start + 0.1));
      const video = videoRef.current;
      if (video && !scrubSeekingRef.current && (video.currentTime < trimStart || video.currentTime > trimEnd)) {
        video.currentTime = trimStart;
        setCurrentTime(trimStart);
      }
      return { ...clip, edit: { ...clip.edit, trimStart, trimEnd } };
    });
  }, [updateActiveClip]);

  const commitTrim = useCallback(() => {
    if (!activeClip) return;
    pendingCutRef.current = { clipId: activeClip.id, start: edit.trimStart, end: edit.trimEnd };
    setCutPending(true);
  }, [activeClip, edit.trimEnd, edit.trimStart]);

  useEffect(() => {
    if (!cutPending) return;
    const timer = setTimeout(() => {
      const pending = pendingCutRef.current;
      if (pending) updateClip(pending.clipId, (clip) => ({ ...clip, trimView: { start: pending.start, end: pending.end } }));
      pendingCutRef.current = null;
      setTrimEditing(false);
      setCutPending(false);
    }, CUT_COMPRESS_MS);
    return () => clearTimeout(timer);
  }, [cutPending, updateClip]);

  const resetTrim = useCallback(() => {
    updateActiveClip((clip) => ({ ...clip, edit: { ...clip.edit, trimStart: 0, trimEnd: clip.duration }, trimView: { start: 0, end: clip.duration } }));
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    setTrimEditing(false);
    setCutPending(false);
  }, [updateActiveClip]);

  const startTrimEdit = useCallback(() => {
    setTrimEditStart({ start: edit.trimStart, end: edit.trimEnd });
    setTrimEditing(true);
  }, [edit.trimEnd, edit.trimStart]);
  const cancelTrimEdit = useCallback(() => {
    updateActiveClip((clip) => ({ ...clip, edit: { ...clip.edit, trimStart: trimEditStart.start, trimEnd: trimEditStart.end } }));
    setTrimEditing(false);
  }, [trimEditStart, updateActiveClip]);

  const patchEdit = useCallback((patch: Partial<VideoClip["edit"]>) => {
    updateActiveClip((clip) => ({ ...clip, edit: { ...clip.edit, ...patch } }));
  }, [updateActiveClip]);
  const setSpeed = useCallback((speed: number) => patchEdit({ speed }), [patchEdit]);
  const setPreservesPitch = useCallback((preservesPitch: boolean) => patchEdit({ preservesPitch }), [patchEdit]);
  const setMuted = useCallback((isMuted: boolean) => patchEdit({ isMuted }), [patchEdit]);

  const applyCropRect = useCallback((rect: CropRect) => {
    const width = Math.min(1, Math.max(MIN_CROP_SIZE, rect.width));
    const height = Math.min(1, Math.max(MIN_CROP_SIZE, rect.height));
    patchEdit({ crop: { x: Math.min(Math.max(0, rect.x), 1 - width), y: Math.min(Math.max(0, rect.y), 1 - height), width, height } });
  }, [patchEdit]);
  const setCrop = useCallback((rect: CropRect) => {
    setCropPresetLabel((label) => label === null ? null : labelForCrop(rect, activeClip?.naturalAspect ?? null));
    applyCropRect(rect);
  }, [activeClip?.naturalAspect, applyCropRect]);
  const setCropPreset = useCallback((label: string | null, ratio: number | null) => {
    if (!activeClip?.naturalAspect) return;
    setCropPresetLabel(label);
    applyCropRect(centeredCropForRatio(ratio, activeClip.naturalAspect));
  }, [activeClip?.naturalAspect, applyCropRect]);
  const startCropEdit = useCallback(() => {
    setCropEditStart(edit.crop);
    setCropPresetLabel(labelForCrop(edit.crop, activeClip?.naturalAspect ?? null));
    setCropEditing(true);
  }, [activeClip?.naturalAspect, edit.crop]);
  const applyCrop = useCallback(() => setCropEditing(false), []);
  const cancelCropEdit = useCallback(() => {
    patchEdit({ crop: cropEditStart });
    setCropPresetLabel(labelForCrop(cropEditStart, activeClip?.naturalAspect ?? null));
    setCropEditing(false);
  }, [activeClip?.naturalAspect, cropEditStart, patchEdit]);
  const setColor = useCallback((patch: Partial<ColorAdjustments>) => {
    updateActiveClip((clip) => ({ ...clip, edit: { ...clip.edit, color: { ...clip.edit.color, ...patch } } }));
  }, [updateActiveClip]);
  const resetColor = useCallback(() => setColor({ exposure: 0, contrast: 1, saturation: 1, temperature: 0 }), [setColor]);

  const totalDuration = clips.reduce((sum, clip) => sum + Math.max(0, clip.edit.trimEnd - clip.edit.trimStart) / Math.max(clip.edit.speed, 0.01), 0);

  return {
    videoRef, clips, activeClip, activeClipId, totalDuration,
    file: activeClip?.file ?? null, videoUrl: activeClip?.url ?? null,
    duration, currentTime, isPlaying, edit,
    naturalAspect: activeClip?.naturalAspect ?? null,
    sourceSize: activeClip?.sourceSize ?? null,
    trimView, cropEditing, cropEditStart, cropPresetLabel,
    trimEditing, trimEditStart, cutPending,
    loadFile, addFile, clearFile, removeClip, selectClip, moveClip, reorderClip,
    onLoadedMetadata, onTimeUpdate, togglePlay, seek, previewFrame, commitPreviewFrame, onSeeked,
    setTrim, commitTrim, resetTrim, startTrimEdit, cancelTrimEdit,
    setSpeed, setPreservesPitch, setMuted, setCrop, setCropPreset,
    startCropEdit, applyCrop, cancelCropEdit, setColor, resetColor,
  };
}

export type VideoEditor = ReturnType<typeof useVideoEditor>;
