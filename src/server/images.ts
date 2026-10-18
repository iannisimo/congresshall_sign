import sharp from 'sharp';
import { ApiError } from './http.ts';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 512;
const ACCEPTED = new Set(['png', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'tiff']);

export interface NormalizedLogo {
  mime: 'image/png';
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * Turns any accepted image into a PNG of at most 512 px per side, with uniform borders trimmed so logos
 * fill their box on the sign. PNG works on every browser a smart TV may have; rasterizing SVG also
 * removes any script it may contain.
 */
export async function normalizeLogo(input: Uint8Array): Promise<NormalizedLogo> {
  let format: string | undefined;
  let width = 0;
  let height = 0;
  try {
    ({ format, width, height } = await sharp(input).metadata());
  } catch {
    throw new ApiError(400, 'Il file non è un’immagine valida');
  }
  if (!format || !ACCEPTED.has(format)) throw new ApiError(400, 'Formato non supportato: usa PNG, JPEG, WebP, GIF o SVG');

  // Rasterize vectors big enough to downscale cleanly.
  const density = format === 'svg' ? Math.min(2400, Math.max(72, (72 * MAX_SIDE * 2) / Math.max(width, height, 1))) : undefined;
  const pipeline = (trim: boolean) => {
    let image = sharp(input, { density, limitInputPixels: 50_000_000 }).rotate();
    if (trim) image = image.trim({ threshold: 10 });
    return image
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer({ resolveWithObject: true });
  };

  try {
    // Trimming fails on images that are a single colour; keep those as they are.
    const { data, info } = await pipeline(true).catch(() => pipeline(false));
    return { mime: 'image/png', data, width: info.width, height: info.height };
  } catch {
    throw new ApiError(400, 'Impossibile elaborare l’immagine');
  }
}

/** Downloads an image for the admin, instead of going through a third-party proxy. */
export async function fetchImage(url: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'image/*', 'User-Agent': 'congresshall-sign' },
    });
  } catch {
    throw new ApiError(400, 'Immagine non raggiungibile');
  }
  if (!response.ok || !response.body) throw new ApiError(400, `Immagine non raggiungibile (HTTP ${response.status})`);
  if (Number(response.headers.get('content-length') ?? 0) > MAX_UPLOAD_BYTES) throw new ApiError(413, 'Immagine troppo grande (max 10 MB)');

  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'Immagine troppo grande (max 10 MB)');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
