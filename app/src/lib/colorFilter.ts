import type { CSSProperties } from "react";
import type { ColorAdjustments } from "../types";

export function colorFilterCss(color: Pick<ColorAdjustments, "exposure" | "contrast" | "saturation">) {
  const brightness = 1 + color.exposure * 0.3;
  return `brightness(${brightness}) contrast(${color.contrast}) saturate(${color.saturation})`;
}

export function temperatureOverlayStyle(temperature: number): CSSProperties {
  if (Math.abs(temperature) < 0.01) return { opacity: 0 };
  const warm = temperature > 0;
  return {
    opacity: Math.min(Math.abs(temperature) * 0.35, 0.35),
    background: warm
      ? "linear-gradient(0deg, #ff9d3f, #ff9d3f)"
      : "linear-gradient(0deg, #3fa9ff, #3fa9ff)",
    mixBlendMode: "overlay",
  };
}
