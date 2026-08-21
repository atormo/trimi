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
import type { ExportQuality, ExportScale } from "../export";
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

/** Bits per pixel per second at the UI's assumed 30fps — kept identical to estimateExportBytes()
 * in lib/export.ts so the size shown in the sidebar is a prediction of what this actually produces. */
const VIDEO_BITS_PER_PIXEL: Record<ExportQuality, number> = { high: 0.12, balanced: 0.07, small: 0.035 };
const ASSUMED_FPS = 30;
const AUDIO_BITRATE = 96_000;
const MIN_VIDEO_BITRATE = 300_000;

export async function exportMp4({ file, edit, scale, quality, filename, onProgress, signal }: ExportMp4Options): Promise<{ blob: Blob; filename: string }> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode())) {
      throw new Error("This browser can't decode this video's format.");
    }

    const { cropPx, outSize } = await computeFramePlan(videoTrack, edit.crop, scale, "mp4");

    const videoBitrate = Math.max(
      MIN_VIDEO_BITRATE,
      Math.round(outSize.width * outSize.height * ASSUMED_FPS * VIDEO_BITS_PER_PIXEL[quality]),
    );
    // { bitrate } picks quantitative (bits/sec) rate control — a bare number is instead read as a
    // 0..1 qualitative quality level, which silently misinterprets any real bitrate as "extreme".
    const videoQuality = new Quality({ bitrate: videoBitrate });

    const videoOk = await canEncodeVideo("avc", { width: outSize.width, height: outSize.height, quality: videoQuality });
    if (!videoOk) throw new Error("This browser can't encode H.264 at this resolution.");

    const audioQuality = new Quality({ bitrate: AUDIO_BITRATE });

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

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });

    const canvas = new OffscreenCanvas(outSize.width, outSize.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't create a canvas for rendering frames.");

    const videoSource = new CanvasSource(canvas, { codec: "avc", quality: videoQuality });
    output.addVideoTrack(videoSource);

    const audioSource = hasAudio ? new AudioBufferSource({ codec: "aac", quality: audioQuality }) : null;
    if (audioSource) output.addAudioTrack(audioSource);

    await output.start();

    const trimStart = edit.trimStart;
    const trimEnd = Math.max(edit.trimEnd, trimStart + 0.001);
    const speed = Math.max(0.01, edit.speed);

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
    for await (const sample of sink.samples(trimStart, trimEnd)) {
      if (signal?.aborted) {
        sample.close();
        break;
      }

      const sampleTimestamp = sample.timestamp;
      const sampleDuration = sample.duration;

      ctx.filter = filter;
      sample.draw(ctx, cropPx.left, cropPx.top, cropPx.width, cropPx.height, 0, 0, outSize.width, outSize.height);
      ctx.filter = "none";
      paintTemperatureOverlay(ctx, outSize.width, outSize.height, edit.color.temperature);
      sample.close();

      const timestamp = (sampleTimestamp - trimStart) / speed;
      const duration = sampleDuration / speed;
      await videoSource.add(timestamp, duration);

      const frac = Math.min(1, Math.max(0, (sampleTimestamp - trimStart) / trimDuration));
      onProgress?.(audioProgressShare + frac * (1 - audioProgressShare));
    }

    if (signal?.aborted) {
      await output.cancel();
      throw new ExportCanceledError();
    }

    await output.finalize();
    onProgress?.(1);

    const buffer = output.target.buffer;
    if (!buffer) throw new Error("Export finished with no output data.");

    return { blob: new Blob([buffer], { type: "video/mp4" }), filename: `${filename}.mp4` };
  } finally {
    input.dispose();
  }
}
