/*
 * Calculs du dither (adaptés de React Bits « DitherVeil »).
 * Fonctions simples, sans WebGL.
 */

// Numéro de chaque patron dans le shader (uPattern)
export const PATTERNS = {
  bayer: 0, // Bayer 8×8
  bayer4: 1, // Bayer 4×4
  lines: 2, // lignes diagonales
  floyd: 3, // Floyd-Steinberg (calculé en JS avec diffuse())
  atkinson: 3, // Atkinson (calculé en JS avec diffuse())
};

// Diffusion d'erreur : où va l'erreur d'un pixel → [décalage x, décalage y, part de l'erreur]
export const KERNELS = {
  floyd: [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16],
  ],
  atkinson: [
    [1, 0, 1 / 8],
    [2, 0, 1 / 8],
    [-1, 1, 1 / 8],
    [0, 1, 1 / 8],
    [1, 1, 1 / 8],
    [0, 2, 1 / 8],
  ],
};

// '#fb3640' ou '#fff' → [r, g, b] entre 0 et 1 (le format des shaders)
export function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Échelle pour cadrer l'image dans le canvas, en 'cover' ou en 'contain'
export function fitScale(width, height, imageWidth, imageHeight, contain) {
  const ratio = width / height / (imageWidth / imageHeight);
  if (contain) return ratio > 1 ? [ratio, 1] : [1, 1 / ratio];
  return ratio > 1 ? [1, 1 / ratio] : [ratio, 1];
}

/*
 * Diffusion d'erreur (Floyd-Steinberg ou Atkinson).
 * Pour chaque pixel : on l'arrondit au ton le plus proche, puis on donne
 * l'erreur d'arrondi à ses voisins. Ça crée le grain typique du dither.
 *
 * pixels : pixels RGBA de l'image réduite (1 pixel = 1 point de dither)
 * grade  : fonction de contraste / luminosité à appliquer avant
 * Retourne les pixels en dither (RGBA), à envoyer au shader.
 */
export function diffuse(pixels, cols, rows, kernel, levels, rgb, grade) {
  const channels = rgb ? 3 : 1;
  const steps = levels - 1;

  // 1. Ton de départ de chaque pixel (3 couleurs en rgb, sinon la luminosité)
  const values = new Float32Array(cols * rows * channels);
  for (let i = 0; i < cols * rows; i++) {
    const r = pixels[i * 4] / 255;
    const g = pixels[i * 4 + 1] / 255;
    const b = pixels[i * 4 + 2] / 255;

    if (rgb) {
      values[i * 3] = grade(r);
      values[i * 3 + 1] = grade(g);
      values[i * 3 + 2] = grade(b);
    } else {
      values[i] = grade(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  }

  // 2. On parcourt les lignes en zigzag (gauche → droite, puis droite → gauche)
  const out = new Uint8Array(cols * rows * 4);
  for (let y = 0; y < rows; y++) {
    const dir = y % 2 === 0 ? 1 : -1;

    for (let i = 0; i < cols; i++) {
      const x = dir === 1 ? i : cols - 1 - i;
      const p = y * cols + x;

      for (let c = 0; c < channels; c++) {
        // Arrondi au ton le plus proche
        const oldValue = values[p * channels + c];
        const newValue = Math.min(steps, Math.max(0, Math.round(oldValue * steps))) / steps;
        const error = oldValue - newValue;

        const byte = Math.round(newValue * 255);
        if (rgb) {
          out[p * 4 + c] = byte;
        } else {
          out[p * 4] = byte;
          out[p * 4 + 1] = byte;
          out[p * 4 + 2] = byte;
        }

        // L'erreur est partagée entre les voisins
        for (let k = 0; k < kernel.length; k++) {
          const nx = x + kernel[k][0] * dir;
          const ny = y + kernel[k][1];
          if (nx < 0 || nx >= cols || ny >= rows) continue;
          values[(ny * cols + nx) * channels + c] += error * kernel[k][2];
        }
      }

      out[p * 4 + 3] = 255;
    }
  }

  return out;
}
