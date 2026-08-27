import { ALL_FORMATS, BlobSource, Input, VideoSampleSink, type InputVideoTrack } from "mediabunny";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { EditState } from "../../types";
import { GIF_COLORS_BY_QUALITY, GIF_FPS_BY_QUALITY, type ExportQuality, type ExportScale } from "../export";
import { colorFilterCss, paintTemperatureOverlay } from "./color";
import { computeFramePlan, type FramePlan } from "./frame";
import { ExportCanceledError } from "./errors";

export interface ExportGifOptions {
  clips: Array<{ file: File; edit: EditState }>;
  scale: ExportScale;
  quality: ExportQuality;
  filename: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export async function exportGif({ clips, scale, quality, filename, onProgress, signal }: ExportGifOptions): Promise<{ blob: Blob; filename: string }> {
  if (!clips.length) throw new Error("Add at least one clip before exporting.");
  const sources: Array<{ input: Input; videoTrack: InputVideoTrack; plan: FramePlan; edit: EditState }> = [];

  try {
    for (const clip of clips) {
      const input = new Input({ source: new BlobSource(clip.file), formats: ALL_FORMATS });
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack || !(await videoTrack.canDecode())) {
        input.dispose();
        throw new Error(`This browser can't decode ${clip.file.name}.`);
      }
      sources.push({ input, videoTrack, plan: await computeFramePlan(videoTrack, clip.edit.crop, scale, "gif"), edit: clip.edit });
    }

    const outSize = sources[0].plan.outSize;
    const canvas = new OffscreenCanvas(outSize.width, outSize.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Couldn't create a canvas for rendering frames.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const fps = GIF_FPS_BY_QUALITY[quality];
    const maxColors = GIF_COLORS_BY_QUALITY[quality];
    const delayMs = Math.round(1000 / fps);
    const plans = sources.map((source) => {
      const trimStart = Number.isFinite(source.edit.trimStart) ? Math.max(0, source.edit.trimStart) : 0;
      const trimEnd = Number.isFinite(source.edit.trimEnd) ? Math.max(source.edit.trimEnd, trimStart + 0.001) : trimStart + 0.001;
      const speed = Number.isFinite(source.edit.speed) ? Math.max(0.01, source.edit.speed) : 1;
      return { trimStart, trimEnd, speed, frameCount: Math.max(1, Math.round(((trimEnd - trimStart) / speed) * fps)) };
    });
    const totalFrames = plans.reduce((sum, plan) => sum + plan.frameCount, 0);
    const gif = GIFEncoder();
    let attemptedFrames = 0;
    let writtenFrames = 0;

    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
      const source = sources[sourceIndex];
      const framePlan = plans[sourceIndex];
      const filter = colorFilterCss(source.edit.color);
      const sink = new VideoSampleSink(source.videoTrack);
      for (let i = 0; i < framePlan.frameCount; i++) {
        if (signal?.aborted) throw new ExportCanceledError();
        const outputTimestamp = i / fps;
        const sourceTimestamp = Math.min(framePlan.trimEnd - 0.0001, framePlan.trimStart + outputTimestamp * framePlan.speed);
        const sample = await sink.getSample(sourceTimestamp);
        attemptedFrames += 1;
        if (!sample) {
          onProgress?.(attemptedFrames / totalFrames);
          continue;
        }

        context.filter = "none";
        context.fillStyle = "#000000";
        context.fillRect(0, 0, outSize.width, outSize.height);
        const sourceAspect = source.plan.cropPx.width / source.plan.cropPx.height;
        const outputAspect = outSize.width / outSize.height;
        const drawWidth = sourceAspect > outputAspect ? outSize.width : outSize.height * sourceAspect;
        const drawHeight = sourceAspect > outputAspect ? outSize.width / sourceAspect : outSize.height;
        const drawX = (outSize.width - drawWidth) / 2;
        const drawY = (outSize.height - drawHeight) / 2;
        context.filter = filter;
        sample.draw(context, source.plan.cropPx.left, source.plan.cropPx.top, source.plan.cropPx.width, source.plan.cropPx.height, drawX, drawY, drawWidth, drawHeight);
        context.filter = "none";
        paintTemperatureOverlay(context, outSize.width, outSize.height, source.edit.color.temperature);
        sample.close();

        const { data } = context.getImageData(0, 0, outSize.width, outSize.height);
        const palette = quantize(data, maxColors);
        gif.writeFrame(applyPalette(data, palette), outSize.width, outSize.height, { palette, delay: delayMs, repeat: 0 });
        writtenFrames += 1;
        onProgress?.(attemptedFrames / totalFrames);
      }
    }

    if (!writtenFrames) throw new Error("The selected clips don't contain any exportable video frames.");
    gif.finish();
    return { blob: new Blob([new Uint8Array(gif.bytes())], { type: "image/gif" }), filename: `${filename}.gif` };
  } finally {
    for (const source of sources) source.input.dispose();
  }
}
