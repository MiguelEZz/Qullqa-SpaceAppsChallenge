// Genera la marca desde brand/*.png:
//  - Ícono de la app (vistas pequeñas: pantalla de inicio, pestaña, acceso directo) = dos hongos.
//  - Dentro de la app, siempre el logotipo «Qullqa» (café en fondos claros, blanco sobre la banda ladrillo).
//   pnpm -F @qullqa/web icons
import sharp from 'sharp';
import { unlink } from 'node:fs/promises';

const src = (n) => new URL(`../brand/${n}`, import.meta.url).pathname;
const out = (n) => new URL(`../public/${n}`, import.meta.url).pathname;

/** Dos hongos centrados sobre blanco (esquinas redondeadas, o lleno para «maskable»/iOS). */
async function icon(size, { fill = 0.68, radius = 0.22, full = false } = {}) {
  const inner = await sharp(src('dos-hongos.png')).resize(Math.round(size * fill), Math.round(size * fill), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const r = full ? 0 : Math.round(size * radius);
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#ffffff"/></svg>`);
  return sharp(bg).composite([{ input: inner, gravity: 'center' }]).png();
}

await (await icon(192)).toFile(out('icon-192.png'));
await (await icon(512)).toFile(out('icon-512.png'));
await (await icon(512, { full: true, fill: 0.56 })).toFile(out('icon-512-maskable.png'));
await (await icon(180, { full: true, fill: 0.66 })).toFile(out('apple-touch-icon.png'));
await (await icon(64, { fill: 0.82, radius: 0.18 })).toFile(out('favicon.png'));

// Logotipo «Qullqa»: café (fondos claros) y blanco (sobre la banda ladrillo), a 2× de la altura mostrada
for (const [h, suffix] of [[96, ''], [240, '-lg']]) {
  const brown = await sharp(src('wordmark.png')).resize({ height: h }).png({ compressionLevel: 9 }).toBuffer();
  await sharp(brown).toFile(out(`logo-qullqa${suffix}.png`));
  const { width, height } = await sharp(brown).metadata();
  await sharp({ create: { width, height, channels: 4, background: '#ffffff' } })
    .composite([{ input: brown, blend: 'dest-in' }]).png({ compressionLevel: 9 }).toFile(out(`logo-qullqa-white${suffix}.png`));
}
await unlink(out('hongo.png')).catch(() => {});
console.log('marca ok');
