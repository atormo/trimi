import { colorFilterCss, temperatureOverlayStyle } from "../colorFilter";
import type { ColorAdjustments } from "../../types";

export { colorFilterCss };

/**
 * Canvas equivalent of the preview's temperature overlay div (see VideoStage + colorFilter.ts).
 * Painted as its own pass, with the CSS filter reset first — in the preview the overlay is a
 * separate DOM layer that never has the video's `filter` applied to it, so replicating that
 * order here is what keeps export pixels matching what was previewed.
 */
export function paintTemperatureOverlay(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  temperature: ColorAdjustments["temperature"],
) {
  const style = temperatureOverlayStyle(temperature);
  const opacity = typeof style.opacity === "number" ? style.opacity : 0;
  if (opacity <= 0) return;

  ctx.save();
  ctx.filter = "none";
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = opacity;
  ctx.fillStyle = temperature > 0 ? "#ff9d3f" : "#3fa9ff";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
