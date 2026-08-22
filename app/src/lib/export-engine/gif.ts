import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { EditState } from "../../types";
import { GIF_COLORS_BY_QUALITY, GIF_FPS_BY_QUALITY, type ExportQuality, type ExportScale } from "../export";
import { colorFilterCss, paintTemperatureOverlay } from "./color";
import { computeFramePlan } from "./frame";
import { ExportCanceledError } from "./errors";

export interface ExportGifOptions {
  file: File;
  edit: EditState;
  scale: ExportScale;
  quality: ExportQuality;
  filename: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export async function exportGif({ file, edit, scale, quality, filename, onProgress, signal }: ExportGifOptions): Promise<{ blob: Blob; filename: string }> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode())) {
      throw new Error("This browser can't decode this video's format.");
    }

    const { cropPx, outSize } = await computeFramePlan(videoTrack, edit.crop, scale, "gif");

    const canvas = new OffscreenCanvas(outSize.width, outSize.height);
    // Every frame gets read back via getImageData for quantization — willReadFrequently avoids
    // the GPU-backed canvas fast path here, which is a net win given the readback pattern.
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Couldn't create a canvas for rendering frames.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const trimStart = Number.isFinite(edit.trimStart) ? Math.max(0, edit.trimStart) : 0;
    const trimEnd = Number.isFinite(edit.trimEnd) ? Math.max(edit.trimEnd, trimStart + 0.001) : trimStart + 0.001;
    const speed = Number.isFinite(edit.speed) ? Math.max(0.01, edit.speed) : 1;
    const outDuration = (trimEnd - trimStart) / speed;

    const fps = GIF_FPS_BY_QUALITY[quality];
    const maxColors = GIF_COLORS_BY_QUALITY[quality];
    const frameCount = Math.max(1, Math.round(outDuration * fps));
    const delayMs = Math.round(1000 / fps);

    const filter = colorFilterCss(edit.color);
    const sink = new VideoSampleSink(videoTrack);
    const gif = GIFEncoder();
    let writtenFrames = 0;

    for (let i = 0; i < frameCount; i++) {
      if (signal?.aborted) throw new ExportCanceledError();

      // Each output frame maps back to the source timestamp it corresponds to at this speed —
      // sample-accurate regardless of the source's own frame rate, same principle as mp4.ts.
      const outTimestamp = i / fps;
      const sourceTimestamp = Math.min(trimEnd - 0.0001, trimStart + outTimestamp * speed);
      const sample = await sink.getSample(sourceTimestamp);
      if (!sample) {
        onProgress?.((i + 1) / frameCount);
        continue;
      }

      ctx.filter = filter;
      sample.draw(ctx, cropPx.left, cropPx.top, cropPx.width, cropPx.height, 0, 0, outSize.width, outSize.height);
      ctx.filter = "none";
      paintTemperatureOverlay(ctx, outSize.width, outSize.height, edit.color.temperature);
      sample.close();

      // A fresh local palette per frame (the pattern gifenc's own examples use) — a single global
      // palette taken from frame one looks noticeably worse once color grading or scene content
      // shifts over the clip.
      const { data } = ctx.getImageData(0, 0, outSize.width, outSize.height);
      const palette = quantize(data, maxColors);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, outSize.width, outSize.height, {
        palette,
        delay: delayMs,
        repeat: 0,
      });
      writtenFrames += 1;

      onProgress?.((i + 1) / frameCount);
    }

    if (writtenFrames === 0) {
      throw new Error("The selected range doesn't contain any exportable video frames.");
    }

    gif.finish();
    const bytes = new Uint8Array(gif.bytes());
    return { blob: new Blob([bytes], { type: "image/gif" }), filename: `${filename}.gif` };
  } finally {
    input.dispose();
  }
}
