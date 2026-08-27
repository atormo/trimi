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
  type InputAudioTrack,
  type InputVideoTrack,
} from "mediabunny";
import type { EditState } from "../../types";
import { MP4_AUDIO_BITRATE_BY_QUALITY, type ExportQuality, type ExportScale } from "../export";
import { colorFilterCss, paintTemperatureOverlay } from "./color";
import { buildExportAudio } from "./audio";
import { computeFramePlan, type FramePlan } from "./frame";
import { ExportCanceledError } from "./errors";

export interface ExportClipInput {
  file: File;
  edit: EditState;
}

export interface ExportMp4Options {
  clips: ExportClipInput[];
  scale: ExportScale;
  quality: ExportQuality;
  filename: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const MP4_QUALITY_LEVEL: Record<ExportQuality, "very-high" | "high" | "medium"> = {
  high: "very-high",
  balanced: "high",
  small: "medium",
};

function safeTiming(edit: EditState) {
  const trimStart = Number.isFinite(edit.trimStart) ? Math.max(0, edit.trimStart) : 0;
  const trimEnd = Number.isFinite(edit.trimEnd) ? Math.max(edit.trimEnd, trimStart + 0.001) : trimStart + 0.001;
  const speed = Number.isFinite(edit.speed) ? Math.max(0.01, edit.speed) : 1;
  return { trimStart, trimEnd, speed, outputDuration: (trimEnd - trimStart) / speed };
}

async function normalizeAudio(buffer: AudioBuffer, duration: number, sampleRate: number, numberOfChannels: number) {
  const frameCount = Math.max(1, Math.round(duration * sampleRate));
  const context = new OfflineAudioContext(numberOfChannels, frameCount, sampleRate);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);
  return context.startRendering();
}

function silentAudio(duration: number, sampleRate: number, numberOfChannels: number) {
  return new AudioBuffer({ length: Math.max(1, Math.round(duration * sampleRate)), sampleRate, numberOfChannels });
}

export async function exportMp4({ clips, scale, quality, filename, onProgress, signal }: ExportMp4Options): Promise<{ blob: Blob; filename: string }> {
  if (!clips.length) throw new Error("Add at least one clip before exporting.");

  const sources: Array<{
    input: Input;
    videoTrack: InputVideoTrack;
    audioTrack: InputAudioTrack | null;
    plan: FramePlan;
    edit: EditState;
    timing: ReturnType<typeof safeTiming>;
  }> = [];
  let output: Output<Mp4OutputFormat, BufferTarget> | null = null;
  let outputSettled = false;

  try {
    for (const clip of clips) {
      const input = new Input({ source: new BlobSource(clip.file), formats: ALL_FORMATS });
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack || !(await videoTrack.canDecode())) {
        input.dispose();
        throw new Error(`This browser can't decode ${clip.file.name}.`);
      }
      const audioTrack = clip.edit.isMuted ? null : await input.getPrimaryAudioTrack();
      sources.push({
        input,
        videoTrack,
        audioTrack: audioTrack && await audioTrack.canDecode() ? audioTrack : null,
        plan: await computeFramePlan(videoTrack, clip.edit.crop, scale, "mp4"),
        edit: clip.edit,
        timing: safeTiming(clip.edit),
      });
    }

    const outSize = sources[0].plan.outSize;
    const videoQuality = new Quality(MP4_QUALITY_LEVEL[quality]);
    if (!(await canEncodeVideo("avc", { width: outSize.width, height: outSize.height, quality: videoQuality }))) {
      throw new Error("This browser can't encode H.264 at this resolution.");
    }

    const firstAudio = sources.find((source) => source.audioTrack)?.audioTrack ?? null;
    const audioQuality = new Quality({ bitrate: MP4_AUDIO_BITRATE_BY_QUALITY[quality] });
    let audioConfig: { sampleRate: number; numberOfChannels: number } | null = null;
    if (firstAudio) {
      const sampleRate = await firstAudio.getSampleRate();
      const numberOfChannels = await firstAudio.getNumberOfChannels();
      if (await canEncodeAudio("aac", { sampleRate, numberOfChannels, quality: audioQuality })) {
        audioConfig = { sampleRate, numberOfChannels };
      }
    }

    output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const canvas = new OffscreenCanvas(outSize.width, outSize.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn't create a canvas for rendering frames.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const videoSource = new CanvasSource(canvas, { codec: "avc", quality: videoQuality });
    output.addVideoTrack(videoSource);
    const audioSource = audioConfig ? new AudioBufferSource({ codec: "aac", quality: audioQuality }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    const throwIfCanceled = () => {
      if (signal?.aborted) throw new ExportCanceledError();
    };
    const totalDuration = sources.reduce((sum, source) => sum + source.timing.outputDuration, 0);
    const audioProgressShare = audioSource ? 0.15 : 0;

    if (audioSource && audioConfig) {
      let audioDone = 0;
      for (const source of sources) {
        throwIfCanceled();
        let audioBuffer: AudioBuffer;
        if (source.audioTrack) {
          const rendered = await buildExportAudio({
            audioTrack: source.audioTrack,
            trimStart: source.timing.trimStart,
            trimEnd: source.timing.trimEnd,
            speed: source.timing.speed,
            preservesPitch: source.edit.preservesPitch,
          });
          audioBuffer = await normalizeAudio(rendered, source.timing.outputDuration, audioConfig.sampleRate, audioConfig.numberOfChannels);
        } else {
          audioBuffer = silentAudio(source.timing.outputDuration, audioConfig.sampleRate, audioConfig.numberOfChannels);
        }
        throwIfCanceled();
        await audioSource.add(audioBuffer);
        audioDone += source.timing.outputDuration;
        onProgress?.((audioDone / totalDuration) * audioProgressShare);
      }
    }

    let outputOffset = 0;
    let writtenFrames = 0;
    for (const source of sources) {
      const sink = new VideoSampleSink(source.videoTrack);
      const filter = colorFilterCss(source.edit.color);
      const { trimStart, trimEnd, speed, outputDuration } = source.timing;
      for await (const sample of sink.samples(trimStart, trimEnd)) {
        if (signal?.aborted) {
          sample.close();
          break;
        }
        const sampleTimestamp = sample.timestamp;
        const sampleDuration = sample.duration;
        if (!Number.isFinite(sampleTimestamp) || !Number.isFinite(sampleDuration) || sampleDuration <= 0) {
          sample.close();
          continue;
        }
        const frameStart = Math.max(sampleTimestamp, trimStart);
        const frameEnd = Math.min(sampleTimestamp + sampleDuration, trimEnd);
        const timestamp = outputOffset + Math.max(0, (frameStart - trimStart) / speed);
        const duration = (frameEnd - frameStart) / speed;
        if (!Number.isFinite(timestamp) || !Number.isFinite(duration) || duration <= 0) {
          sample.close();
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

        await videoSource.add(timestamp, duration);
        writtenFrames += 1;
        const videoProgress = Math.min(1, (outputOffset + Math.max(0, sampleTimestamp - trimStart) / speed) / totalDuration);
        onProgress?.(audioProgressShare + videoProgress * (1 - audioProgressShare));
      }
      if (signal?.aborted) break;
      outputOffset += outputDuration;
    }

    if (signal?.aborted) {
      await output.cancel();
      outputSettled = true;
      throw new ExportCanceledError();
    }
    if (!writtenFrames) {
      await output.cancel();
      outputSettled = true;
      throw new Error("The selected clips don't contain any exportable video frames.");
    }

    await output.finalize();
    outputSettled = true;
    onProgress?.(1);
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("Export finished with no output data.");
    return { blob: new Blob([buffer], { type: "video/mp4" }), filename: `${filename}.mp4` };
  } catch (error) {
    if (output && !outputSettled) {
      try { await output.cancel(); } catch { /* Preserve the original error. */ }
    }
    throw error;
  } finally {
    for (const source of sources) source.input.dispose();
  }
}
