import type { CropRect } from "../types";

export type ExportFormat = "mp4" | "gif";
export type ExportQuality = "high" | "balanced" | "small";
export type ExportScale = "original" | "1080" | "720" | "480";

export const GIF_MAX_WIDTH = 640;
export const GIF_LONG_CLIP_SECONDS = 10;

export interface SourceSize {
  width: number;
  height: number;
}

function even(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

export function croppedSize(source: SourceSize, crop: CropRect): SourceSize {
  return {
    width: even(source.width * crop.width),
    height: even(source.height * crop.height),
  };
}

/** 1080p means 1080 lines: height for landscape, width for portrait. Never upscale. */
export function scaledSize(source: SourceSize, scale: ExportScale, format: ExportFormat): SourceSize {
  let { width, height } = source;
  if (format === "gif") {
    const maxWidth = scale === "480" ? 480 : GIF_MAX_WIDTH;
    const factor = Math.min(1, maxWidth / width);
    width *= factor;
    height *= factor;
    return { width: even(width), height: even(height) };
  }
  if (scale !== "original") {
    const cap = Number(scale);
    const primary = width >= height ? height : width;
    const factor = Math.min(1, cap / primary);
    width *= factor;
    height *= factor;
  }
  return { width: even(width), height: even(height) };
}

export function wouldUpscale(source: SourceSize, scale: ExportScale, format: ExportFormat) {
  if (scale === "original") return false;
  if (format === "gif") {
    return source.width < (scale === "480" ? 480 : GIF_MAX_WIDTH) - 1;
  }
  const cap = Number(scale);
  const primary = source.width >= source.height ? source.height : source.width;
  return primary < cap - 1;
}

export function formatResolution(size: SourceSize) {
  return `${size.width}×${size.height}`;
}

export function estimateExportBytes(options: {
  size: SourceSize;
  duration: number;
  format: ExportFormat;
  quality: ExportQuality;
  muted: boolean;
}) {
  const { size, duration, format, quality, muted } = options;
  const seconds = Math.max(duration, 0.1);
  const pixels = size.width * size.height;

  if (format === "gif") {
    const fps = quality === "high" ? 15 : quality === "balanced" ? 12 : 8;
    const bytesPerPixel = quality === "high" ? 0.55 : quality === "balanced" ? 0.4 : 0.28;
    return pixels * fps * bytesPerPixel * seconds;
  }

  const fps = 30;
  const bitsPerPixel = quality === "high" ? 0.12 : quality === "balanced" ? 0.07 : 0.035;
  const videoBits = pixels * fps * bitsPerPixel * seconds;
  const audioBits = muted ? 0 : 96_000 * seconds;
  return (videoBits + audioBits) / 8;
}

export const SCALE_OPTIONS: { value: ExportScale; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
];

export const QUALITY_OPTIONS: { value: ExportQuality; label: string }[] = [
  { value: "high", label: "High" },
  { value: "balanced", label: "Balanced" },
  { value: "small", label: "Small" },
];
