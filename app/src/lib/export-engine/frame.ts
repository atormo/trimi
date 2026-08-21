import type { InputVideoTrack } from "mediabunny";
import type { CropRect } from "../../types";
import { croppedSize, scaledSize, type ExportFormat, type ExportScale, type SourceSize } from "../export";

export interface FramePlan {
  /** Rotation-corrected source dimensions (mediabunny's "display" size). */
  displayWidth: number;
  displayHeight: number;
  /** Source-space crop rect, in pixels, for VideoSample.draw()'s source-rect args. */
  cropPx: { left: number; top: number; width: number; height: number };
  /** Final encoded frame size, after crop and the user's chosen scale. */
  outSize: SourceSize;
}

/** Shared by mp4.ts and gif.ts so both encode the exact same framing for the same edit. */
export async function computeFramePlan(
  videoTrack: InputVideoTrack,
  crop: CropRect,
  scale: ExportScale,
  format: ExportFormat,
): Promise<FramePlan> {
  const displayWidth = await videoTrack.getDisplayWidth();
  const displayHeight = await videoTrack.getDisplayHeight();
  const cropped = croppedSize({ width: displayWidth, height: displayHeight }, crop);
  const outSize = scaledSize(cropped, scale, format);
  return {
    displayWidth,
    displayHeight,
    cropPx: {
      left: Math.round(crop.x * displayWidth),
      top: Math.round(crop.y * displayHeight),
      width: cropped.width,
      height: cropped.height,
    },
    outSize,
  };
}
