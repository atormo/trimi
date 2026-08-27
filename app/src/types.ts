export interface ColorAdjustments {
  exposure: number; // -2 ... 2
  contrast: number; // 0.5 ... 1.5
  saturation: number; // 0 ... 2
  temperature: number; // -1 ... 1
}

export const NEUTRAL_COLOR: ColorAdjustments = {
  exposure: 0,
  contrast: 1,
  saturation: 1,
  temperature: 0,
};

export interface CropPreset {
  id: string;
  label: string;
  ratio: number | null; // null = original, uncropped
}

export const CROP_PRESETS: CropPreset[] = [
  { id: "original", label: "Free", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
];

/** Normalized crop window, 0...1 on each axis — mirrors the native EditState's `crop: CGRect`. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };
export const MIN_CROP_SIZE = 0.1;

/** A centered crop window matching `ratio`, given the source's natural (width / height) aspect. */
export function centeredCropForRatio(ratio: number | null, naturalAspect: number): CropRect {
  if (!ratio) return FULL_CROP;
  if (ratio < naturalAspect) {
    const width = ratio / naturalAspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = naturalAspect / ratio;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

const CROP_EPSILON = 0.01;

/**
 * Best-effort label for the current crop, purely from geometry — used only to bootstrap which
 * preset button looks "active" the moment crop editing opens (or is cancelled back to its start).
 * Full frame reads as Free even when the source's natural aspect happens to equal a preset's
 * ratio (e.g. a 16:9 video): the two are geometrically identical, and Free is the more honest
 * default. Once the user actually clicks a preset, the editor tracks that choice explicitly
 * instead of re-deriving it from geometry — see `cropPresetLabel` in useVideoEditor.
 */
export function labelForCrop(crop: CropRect, naturalAspect: number | null): string | null {
  if (Math.abs(crop.width - 1) < CROP_EPSILON && Math.abs(crop.height - 1) < CROP_EPSILON) return null;
  if (naturalAspect) {
    for (const preset of CROP_PRESETS) {
      if (!preset.ratio) continue;
      const target = centeredCropForRatio(preset.ratio, naturalAspect);
      if (
        Math.abs(target.x - crop.x) < CROP_EPSILON &&
        Math.abs(target.y - crop.y) < CROP_EPSILON &&
        Math.abs(target.width - crop.width) < CROP_EPSILON &&
        Math.abs(target.height - crop.height) < CROP_EPSILON
      ) {
        return preset.label;
      }
    }
  }
  return "Custom";
}

export interface EditState {
  trimStart: number; // seconds
  trimEnd: number; // seconds
  crop: CropRect;
  speed: number; // 0.25 ... 4.0
  isMuted: boolean;
  preservesPitch: boolean;
  color: ColorAdjustments;
}

export interface VideoClip {
  id: string;
  file: File;
  url: string;
  duration: number;
  naturalAspect: number | null;
  sourceSize: { width: number; height: number } | null;
  edit: EditState;
  trimView: { start: number; end: number };
}

export function defaultEditState(duration: number): EditState {
  return {
    trimStart: 0,
    trimEnd: duration,
    crop: FULL_CROP,
    speed: 1,
    isMuted: false,
    preservesPitch: true,
    color: { ...NEUTRAL_COLOR },
  };
}
