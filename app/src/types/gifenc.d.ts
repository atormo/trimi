/** gifenc ships no type declarations — this covers only the subset export-engine/gif.ts uses. */
declare module "gifenc" {
  export type RGB = [number, number, number];
  export type RGBA = [number, number, number, number];
  export type GifPalette = (RGB | RGBA)[];

  export interface QuantizeOptions {
    format?: "rgb565" | "rgb444" | "rgba4444";
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }

  export function quantize(
    data: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): GifPalette;

  export function applyPalette(
    data: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: QuantizeOptions["format"],
  ): Uint8Array;

  export interface WriteFrameOptions {
    palette?: GifPalette;
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface GIFEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, options?: WriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: { auto?: boolean }): GIFEncoderInstance;
}
