/**
 * Cobertura verde por foto (spec sec. 5 + corrección 15.5).
 * ExG = 2g − r − b sobre coordenadas cromáticas (r = R/(R+G+B), …), umbral de Otsu.
 * Esto estima COBERTURA VERDE, no NDVI: una cámara RGB no tiene banda infrarroja.
 * Todo se calcula en el teléfono; al servidor solo sube la fracción y una miniatura.
 */

/** Supuesto editable: si Otsu cae por debajo, la foto casi no tiene verde y se usa este piso. */
export const MIN_EXG_THRESHOLD = 0.05;
const MAX_SIDE = 640;

export type ExgResult = {
  fraction: number;
  otsuThreshold: number;
  /** Miniatura JPEG de la foto original (data URL). */
  thumbnail: string;
  /** Vista previa con los píxeles verdes resaltados (data URL). */
  maskPreview: string;
};

async function loadScaled(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
}

/** Umbral de Otsu sobre valores en [lo, hi] con 256 cubetas. */
export function otsu(values: Float32Array, lo = -1, hi = 2): number {
  const bins = 256;
  const hist = new Float64Array(bins);
  const w = (hi - lo) / bins;
  for (const v of values) hist[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)))]!++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < bins; i++) sumAll += i * hist[i]!;
  let sumB = 0, wB = 0, best = 0, bestVar = -1;
  for (let i = 0; i < bins; i++) {
    wB += hist[i]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i]!;
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > bestVar) {
      bestVar = between;
      best = i;
    }
  }
  return lo + (best + 1) * w;
}

export async function analyzeGreenCover(file: File): Promise<ExgResult> {
  const canvas = await loadScaled(file);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  const n = canvas.width * canvas.height;
  const exg = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const R = px[i * 4]!, G = px[i * 4 + 1]!, B = px[i * 4 + 2]!;
    const s = R + G + B || 1;
    exg[i] = (2 * G - R - B) / s;
  }
  const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

  const threshold = Math.max(otsu(exg), MIN_EXG_THRESHOLD);
  let green = 0;
  for (let i = 0; i < n; i++) {
    if (exg[i]! > threshold) {
      green++;
      px[i * 4] = 40; px[i * 4 + 1] = 230; px[i * 4 + 2] = 60;
    } else {
      // atenuar lo que no es verde
      px[i * 4] = px[i * 4]! * 0.35; px[i * 4 + 1] = px[i * 4 + 1]! * 0.35; px[i * 4 + 2] = px[i * 4 + 2]! * 0.35;
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    fraction: green / n,
    otsuThreshold: Math.round(threshold * 1000) / 1000,
    thumbnail,
    maskPreview: canvas.toDataURL('image/jpeg', 0.7),
  };
}

/** Miniatura JPEG para fotos de evidencia (helada, erosión, etc.). */
export async function thumbnailOf(file: File): Promise<string> {
  return (await loadScaled(file)).toDataURL('image/jpeg', 0.7);
}
