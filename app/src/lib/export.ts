import type { CropRect } from "../types";

export type ExportFormat = "mp4" | "gif";
export type ExportQuality = "high" | "balanced" | "small";
export type ExportScale = "original" | "1080" | "720" | "480";

export const GIF_LONG_CLIP_SECONDS = 10;

/** GIF quality changes temporal/color fidelity. Spatial resolution is controlled separately by
 * the Size selector; in particular, "Original" must never silently shrink the source. */
export const GIF_FPS_BY_QUALITY: Record<ExportQuality, number> = {
  high: 20,
  balanced: 12,
  small: 8,
};

export const GIF_COLORS_BY_QUALITY: Record<ExportQuality, number> = {
  high: 256,
  balanced: 192,
  small: 128,
};

export const MP4_AUDIO_BITRATE_BY_QUALITY: Record<ExportQuality, number> = {
  high: 192_000,
  balanced: 128_000,
  small: 96_000,
};

/** Mirrors mediabunny's named H.264 quality levels used by mp4.ts:
 * very-high (High), high (Balanced), and medium (Small). */
const MP4_BITRATE_FACTOR_BY_QUALITY: Record<ExportQuality, number> = {
  high: 4,
  balanced: 2,
  small: 1,
};

function estimateMp4VideoBitrate(size: SourceSize, quality: ExportQuality) {
  const referencePixels = 1920 * 1080;
  const referenceBitrate = 3_000_000;
  const resolutionFactor = Math.pow((size.width * size.height) / referencePixels, 0.95);
  return referenceBitrate * resolutionFactor * MP4_BITRATE_FACTOR_BY_QUALITY[quality];
}

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
export function scaledSize(source: SourceSize, scale: ExportScale, _format: ExportFormat): SourceSize {
  let { width, height } = source;
  if (scale !== "original") {
    const cap = Number(scale);
    const primary = width >= height ? height : width;
    const factor = Math.min(1, cap / primary);
    width *= factor;
    height *= factor;
  }
  return { width: even(width), height: even(height) };
}

/** A preset at or above the source's short edge would either upscale or produce the same pixels.
 * Both are hidden: Original already represents that output honestly. */
export function wouldNotReduce(source: SourceSize, scale: ExportScale, _format: ExportFormat) {
  if (scale === "original") return false;
  const cap = Number(scale);
  const primary = source.width >= source.height ? source.height : source.width;
  return primary <= cap;
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
    const fps = GIF_FPS_BY_QUALITY[quality];
    const bytesPerPixel = quality === "high" ? 0.55 : quality === "balanced" ? 0.4 : 0.28;
    return pixels * fps * bytesPerPixel * seconds;
  }

  const videoBits = estimateMp4VideoBitrate(size, quality) * seconds;
  const audioBits = muted ? 0 : MP4_AUDIO_BITRATE_BY_QUALITY[quality] * seconds;
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
