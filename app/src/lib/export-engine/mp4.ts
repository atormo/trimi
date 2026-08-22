import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSampleSink,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import type { EditState } from "../../types";
import { MP4_AUDIO_BITRATE_BY_QUALITY, type ExportQuality, type ExportScale } from "../export";
import { colorFilterCss, paintTemperatureOverlay } from "./color";
import { buildExportAudio } from "./audio";
import { computeFramePlan } from "./frame";
import { ExportCanceledError } from "./errors";

export interface ExportMp4Options {
  file: File;
  edit: EditState;
  scale: ExportScale;
  quality: ExportQuality;
  filename: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Use mediabunny's constant-quality ladder. H.264 gets quantizer-based encoding where the
 * browser supports it, with an automatically calculated bitrate fallback everywhere else. */
const MP4_QUALITY_LEVEL: Record<ExportQuality, "very-high" | "high" | "medium"> = {
  high: "very-high",
  balanced: "high",
  small: "medium",
};

export async function exportMp4({ file, edit, scale, quality, filename, onProgress, signal }: ExportMp4Options): Promise<{ blob: Blob; filename: string }> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let output: Output<Mp4OutputFormat, BufferTarget> | null = null;
  let outputSettled = false;

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode())) {
      throw new Error("This browser can't decode this video's format.");
    }

    const { cropPx, outSize } = await computeFramePlan(videoTrack, edit.crop, scale, "mp4");

    const videoQuality = new Quality(MP4_QUALITY_LEVEL[quality]);

    const videoOk = await canEncodeVideo("avc", { width: outSize.width, height: outSize.height, quality: videoQuality });
    if (!videoOk) throw new Error("This browser can't encode H.264 at this resolution.");

    const audioQuality = new Quality({ bitrate: MP4_AUDIO_BITRATE_BY_QUALITY[quality] });

    const audioTrack = edit.isMuted ? null : await input.getPrimaryAudioTrack();
    let hasAudio = !!audioTrack && (await audioTrack.canDecode());
    if (hasAudio && audioTrack) {
      const audioOk = await canEncodeAudio("aac", {
        numberOfChannels: await audioTrack.getNumberOfChannels(),
        sampleRate: await audioTrack.getSampleRate(),
        quality: audioQuality,
      });
      // Missing AAC support is not fatal — ship a silent export rather than failing the whole thing.
      if (!audioOk) hasAudio = false;
    }

    output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });

    const canvas = new OffscreenCanvas(outSize.width, outSize.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't create a canvas for rendering frames.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const videoSource = new CanvasSource(canvas, { codec: "avc", quality: videoQuality });
    output.addVideoTrack(videoSource);

    const audioSource = hasAudio ? new AudioBufferSource({ codec: "aac", quality: audioQuality }) : null;
    if (audioSource) output.addAudioTrack(audioSource);

    await output.start();

    // State normally comes from constrained controls, but an imported/corrupt edit must not be
    // able to pass NaN/Infinity into WebCodecs (which reports the rather opaque timestamp error).
    const trimStart = Number.isFinite(edit.trimStart) ? Math.max(0, edit.trimStart) : 0;
    const trimEnd = Number.isFinite(edit.trimEnd) ? Math.max(edit.trimEnd, trimStart + 0.001) : trimStart + 0.001;
    const speed = Number.isFinite(edit.speed) ? Math.max(0.01, edit.speed) : 1;

    const throwIfCanceled = () => {
      if (signal?.aborted) throw new ExportCanceledError();
    };

    // Audio is a single bounded render, not a per-frame loop — do it before the video pass so a
    // failure there surfaces before any encoding work has started.
    const audioProgressShare = hasAudio ? 0.15 : 0;
    if (audioSource && audioTrack) {
      throwIfCanceled();
      const audioBuffer = await buildExportAudio({
        audioTrack,
        trimStart,
        trimEnd,
        speed,
        preservesPitch: edit.preservesPitch,
      });
      throwIfCanceled();
      await audioSource.add(audioBuffer);
      onProgress?.(audioProgressShare);
    }

    const filter = colorFilterCss(edit.color);
    const trimDuration = trimEnd - trimStart;

    const sink = new VideoSampleSink(videoTrack);
    let writtenFrames = 0;
    for await (const sample of sink.samples(trimStart, trimEnd)) {
      if (signal?.aborted) {
        sample.close();
        break;
      }

      const sampleTimestamp = sample.timestamp;
      const sampleDuration = sample.duration;

      // Intersect the decoded frame with the requested trim interval before rebasing it. Decoders
      // may emit a preroll frame before trimStart; malformed containers can also expose non-finite
      // timing metadata. CanvasSource only accepts finite, non-negative timing values.
      if (!Number.isFinite(sampleTimestamp) || !Number.isFinite(sampleDuration) || sampleDuration <= 0) {
        sample.close();
        continue;
      }
      const frameStart = Math.max(sampleTimestamp, trimStart);
      const frameEnd = Math.min(sampleTimestamp + sampleDuration, trimEnd);
      const timestamp = Math.max(0, (frameStart - trimStart) / speed);
      const duration = (frameEnd - frameStart) / speed;
      if (!Number.isFinite(timestamp) || !Number.isFinite(duration) || duration <= 0) {
        sample.close();
        continue;
      }

      ctx.filter = filter;
      sample.draw(ctx, cropPx.left, cropPx.top, cropPx.width, cropPx.height, 0, 0, outSize.width, outSize.height);
      ctx.filter = "none";
      paintTemperatureOverlay(ctx, outSize.width, outSize.height, edit.color.temperature);
      sample.close();

      await videoSource.add(timestamp, duration);
      writtenFrames += 1;

      const frac = Math.min(1, Math.max(0, (sampleTimestamp - trimStart) / trimDuration));
      onProgress?.(audioProgressShare + frac * (1 - audioProgressShare));
    }

    if (signal?.aborted) {
      await output.cancel();
      outputSettled = true;
      throw new ExportCanceledError();
    }

    if (writtenFrames === 0) {
      await output.cancel();
      outputSettled = true;
      throw new Error("The selected range doesn't contain any exportable video frames.");
    }

    await output.finalize();
    outputSettled = true;
    onProgress?.(1);

    const buffer = output.target.buffer;
    if (!buffer) throw new Error("Export finished with no output data.");

    return { blob: new Blob([buffer], { type: "video/mp4" }), filename: `${filename}.mp4` };
  } catch (error) {
    if (output && !outputSettled) {
      try {
        await output.cancel();
      } catch {
        // Preserve the original export error; cleanup failure is secondary.
      }
    }
    throw error;
  } finally {
    input.dispose();
  }
}
