type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
};

function waitForEvent(target: EventTarget, type: string, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      target.removeEventListener(type, onEvent);
      signal?.removeEventListener("abort", onAbort);
    };
    target.addEventListener(type, onEvent, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForDecodedFrame(video: HTMLVideoElement, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const withFrame = video as VideoWithFrameCallback;
    if (withFrame.requestVideoFrameCallback) {
      withFrame.requestVideoFrameCallback(() => finish());
    }
    requestAnimationFrame(() => requestAnimationFrame(finish));
    window.setTimeout(finish, 80);
  });
}

async function seekTo(video: HTMLVideoElement, time: number, signal?: AbortSignal) {
  const duration = Number.isFinite(video.duration) ? video.duration : time;
  const target = Math.min(Math.max(time, 0), Math.max(duration - 0.001, 0));
  if (
    Math.abs(video.currentTime - target) < 0.0005
    && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    await waitForDecodedFrame(video, signal);
    return;
  }
  const seeked = waitForEvent(video, "seeked", signal);
  video.currentTime = target;
  await seeked;
  await waitForDecodedFrame(video, signal);
}

export async function generateThumbnails(
  url: string,
  rangeStart: number,
  rangeEnd: number,
  count: number,
  signal?: AbortSignal,
): Promise<ImageBitmap[]> {
  if (!isFinite(rangeStart) || !isFinite(rangeEnd) || rangeEnd <= rangeStart || count < 1) {
    return [];
  }

  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.disableRemotePlayback = true;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const thumbs: ImageBitmap[] = [];

  try {
    await Promise.race([
      waitForEvent(video, "loadedmetadata", signal),
      waitForEvent(video, "error", signal).then(() => {
        throw new Error("thumbnail video failed");
      }),
    ]);

    const aspect = video.videoWidth / video.videoHeight || 16 / 9;
    canvas.width = 320;
    canvas.height = Math.max(1, Math.round(320 / aspect));

    const span = rangeEnd - rangeStart;
    const lastTime = Number.isFinite(video.duration) ? video.duration : rangeEnd;

    for (let i = 0; i < count; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const t = Math.min(rangeStart + (span * (i + 0.5)) / count, Math.max(lastTime - 0.05, 0));
      await seekTo(video, t, signal);
      if (!ctx) continue;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      thumbs.push(await createImageBitmap(canvas));
    }

    return thumbs;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      for (const thumb of thumbs) thumb.close();
      return [];
    }
    return thumbs;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  image: ImageBitmap,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
  destX: number,
  destY: number,
  destWidth: number,
  destHeight: number,
) {
  const sourceAspect = sourceWidth / sourceHeight;
  const destAspect = destWidth / destHeight;
  let sx = sourceX;
  let sy = sourceY;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceAspect > destAspect) {
    sw = sourceHeight * destAspect;
    sx = sourceX + (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / destAspect;
    sy = sourceY + (sourceHeight - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, Math.max(1, sw), Math.max(1, sh), destX, destY, destWidth, destHeight);
}
