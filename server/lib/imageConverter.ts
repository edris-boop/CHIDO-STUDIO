import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

export interface PngToJpgOptions {
  quality?: number; // 1..100, default 92
  maxSizeKb?: number | null;
  transparentBgHex?: string; // default #FFFFFF
}

export interface PngToJpgResult {
  buffer: Buffer;
  width: number;
  height: number;
  originalBytes: number;
  convertedBytes: number;
  qualityUsed: number;
  targetSizeMet: boolean;
  warning: string | null;
}

export function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [
      Number.parseInt(clean.slice(0, 2), 16),
      Number.parseInt(clean.slice(2, 4), 16),
      Number.parseInt(clean.slice(4, 6), 16),
    ];
  }
  return [255, 255, 255];
}

export function convertPngBufferToJpg(
  pngBuffer: Buffer,
  options: PngToJpgOptions = {}
): PngToJpgResult {
  const initialQuality = Math.min(100, Math.max(10, Math.round(options.quality ?? 92)));
  const [bgR, bgG, bgB] = parseHexRgb(options.transparentBgHex ?? '#FFFFFF');
  const parsed = PNG.sync.read(pngBuffer);
  const { width, height, data } = parsed;

  // Composite RGBA onto background color cleanly for JPEG (no alpha channel)
  const flattened = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    const invAlpha = 1 - alpha;
    flattened[i] = Math.round(data[i] * alpha + bgR * invAlpha);
    flattened[i + 1] = Math.round(data[i + 1] * alpha + bgG * invAlpha);
    flattened[i + 2] = Math.round(data[i + 2] * alpha + bgB * invAlpha);
    flattened[i + 3] = 255;
  }

  let qualityUsed = initialQuality;
  let encoded = jpeg.encode({ data: flattened, width, height }, qualityUsed);
  let targetSizeMet = true;
  let warning: string | null = null;

  if (options.maxSizeKb && options.maxSizeKb > 0) {
    const maxBytes = options.maxSizeKb * 1024;
    while (encoded.data.length > maxBytes && qualityUsed > 35) {
      qualityUsed = Math.max(35, qualityUsed - 8);
      encoded = jpeg.encode({ data: flattened, width, height }, qualityUsed);
    }
    if (encoded.data.length > maxBytes) {
      targetSizeMet = false;
      warning = `فایل با کیفیت ${qualityUsed} به ${(encoded.data.length / 1024).toFixed(1)} کیلوبایت رسید و بدون افت کیفیت نامطلوب به سقف ${options.maxSizeKb} کیلوبایت نمی‌رسد.`;
    }
  }

  const outBuf = Buffer.from(encoded.data);
  return {
    buffer: outBuf,
    width,
    height,
    originalBytes: pngBuffer.length,
    convertedBytes: outBuf.length,
    qualityUsed,
    targetSizeMet,
    warning,
  };
}

export function createSampleTransparentPng(width = 128, height = 128): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const inCircle = (x - width / 2) ** 2 + (y - height / 2) ** 2 < (width * 0.35) ** 2;
      if (inCircle) {
        png.data[idx] = 45;
        png.data[idx + 1] = 108;
        png.data[idx + 2] = 223;
        png.data[idx + 3] = 230;
      } else {
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      }
    }
  }
  return PNG.sync.write(png);
}
