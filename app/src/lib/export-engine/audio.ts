import { AudioSampleSink, type InputAudioTrack } from "mediabunny";
import { processOffline } from "@soundtouchjs/audio-worklet";
import soundtouchProcessorUrl from "@soundtouchjs/audio-worklet/processor?url";

export interface BuildExportAudioOptions {
  audioTrack: InputAudioTrack;
  trimStart: number;
  trimEnd: number;
  speed: number;
  preservesPitch: boolean;
}

/**
 * Renders the trimmed audio range into one AudioBuffer at the source's native rate, then applies
 * speed:
 *  - preservesPitch: WSOLA time-stretch (tempo only, no pitch shift) via SoundTouch, run offline
 *    through an AudioWorklet — matches what <video preservesPitch> does natively in the preview.
 *  - otherwise: plain resampling via AudioBufferSourceNode.playbackRate ("varispeed" — pitch
 *    shifts with speed, same as the preview with preservesPitch off).
 */
export async function buildExportAudio(options: BuildExportAudioOptions): Promise<AudioBuffer> {
  const { audioTrack, trimStart, trimEnd, speed, preservesPitch } = options;
  const sampleRate = await audioTrack.getSampleRate();
  const numberOfChannels = await audioTrack.getNumberOfChannels();
  const sink = new AudioSampleSink(audioTrack);

  const totalFrames = Math.max(1, Math.round((trimEnd - trimStart) * sampleRate));
  const raw = new AudioBuffer({ length: totalFrames, sampleRate, numberOfChannels });
  const channelData = Array.from({ length: numberOfChannels }, (_, i) => raw.getChannelData(i));

  for await (const sample of sink.samples(trimStart, trimEnd)) {
    const chunk = sample.toAudioBuffer();
    let offsetFrames = Math.round((sample.timestamp - trimStart) * sampleRate);
    let srcStart = 0;
    if (offsetFrames < 0) {
      srcStart = -offsetFrames;
      offsetFrames = 0;
    }
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const src = chunk.getChannelData(Math.min(ch, chunk.numberOfChannels - 1));
      const dst = channelData[ch];
      const len = Math.min(src.length - srcStart, dst.length - offsetFrames);
      if (len > 0) dst.set(src.subarray(srcStart, srcStart + len), offsetFrames);
    }
    sample.close();
  }

  if (Math.abs(speed - 1) < 0.001) return raw;

  if (preservesPitch) {
    return processOffline({ input: raw, processorUrl: soundtouchProcessorUrl, playbackRate: speed });
  }

  const outFrames = Math.max(1, Math.ceil(totalFrames / speed));
  const ctx = new OfflineAudioContext(numberOfChannels, outFrames, sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = raw;
  source.playbackRate.value = speed;
  source.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}
