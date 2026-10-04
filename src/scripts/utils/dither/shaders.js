/*
 * Shaders WebGL2 du dither (adaptés de React Bits « DitherVeil »).
 * Un shader est un petit programme exécuté par la carte graphique pour CHAQUE pixel.
 *
 * - VERTEX        : dessine un triangle qui couvre tout le canvas
 * - MASK_FRAGMENT : dessine où le curseur est passé (la zone à révéler en couleur)
 * - VIEW_FRAGMENT : dessine l'image en dither, puis la photo en couleur sous le masque
 */

export const VERTEX = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const MASK_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D tPrev;   // le masque de l'image précédente
uniform vec2 uSize;        // taille du canvas, en px
uniform vec2 uFrom;        // position précédente du pinceau
uniform vec2 uTo;          // position actuelle du pinceau
uniform float uRadius;     // rayon de la zone révélée
uniform float uSoftness;   // largeur du bord adouci
uniform float uStrength;   // 0 → 1 : présence du curseur
uniform float uFade;       // vitesse d'effacement de la traînée
uniform float uHold;

in vec2 vUv;
out vec4 fragColor;

// Distance entre le point p et le segment [a, b] (le trait du pinceau)
float strokeDistance(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
  return length(p - a - ab * h);
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uSize;

  // L'ancien masque s'efface un peu à chaque image (= la traînée)
  float trail = max(texture(tPrev, vUv).r - uFade, 0.0);

  // On ajoute le nouveau trait du pinceau
  float band = max(uRadius * uSoftness, 1.0) * uHold;
  float d = strokeDistance(p, uFrom, uTo);
  trail = max(trail, clamp((uRadius - d) / band, 0.0, 1.0) * uStrength);

  fragColor = vec4(trail, 0.0, 0.0, 1.0);
}
`;

export const VIEW_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D tImage;     // la photo
uniform sampler2D tMask;      // la zone révélée (dessinée par MASK_FRAGMENT)
uniform sampler2D tDiffused;  // le dither Floyd / Atkinson, calculé en JS
uniform vec2 uResolution;     // taille du canvas, en pixels réels
uniform vec2 uCover;          // cadrage de l'image ('cover' ou 'contain')
uniform float uLod;           // niveau de flou de la photo, selon la taille des points
uniform float uCell;          // taille d'un point de dither, en pixels réels
uniform int uPattern;         // 0 = bayer 8×8, 1 = bayer 4×4, 2 = lignes, 3 = Floyd / Atkinson
uniform int uPalette;         // 0 = duotone, 1 = rgb
uniform float uLevels;        // nombre de tons
uniform vec3 uInk;            // couleur des tons sombres
uniform vec3 uPaper;          // couleur des tons clairs
uniform vec3 uRimColor;       // couleur de la bordure de la zone révélée
uniform float uRim;           // épaisseur de cette bordure
uniform float uContrast;
uniform float uBrightness;
uniform float uReverse;       // 1 = inverse : la photo est en couleur, le curseur la dither
uniform float uIntro;         // 0 → 1 : animation d'apparition
uniform float uHold;

in vec2 vUv;
out vec4 fragColor;

// Seuil de la matrice de Bayer 8×8 (valeur entre 0 et 1 selon la position de la case)
float bayer(vec2 cell) {
  ivec2 p = ivec2(mod(cell, 8.0));
  int v = p.x ^ p.y;
  int m = ((v & 1) << 5) | ((p.y & 1) << 4) | ((v & 2) << 2) | ((p.y & 2) << 1) | ((v & 4) >> 1) | ((p.y & 4) >> 2);
  return (float(m) + 0.5) / 64.0;
}

// Seuil de la matrice de Bayer 4×4 : 0 8 2 10 / 12 4 14 6 / 3 11 1 9 / 15 7 13 5
float bayer4(vec2 cell) {
  ivec2 p = ivec2(mod(cell, 4.0));
  int v = p.x ^ p.y;
  int m = ((v & 1) << 3) | ((p.y & 1) << 2) | (v & 2) | ((p.y & 2) >> 1);
  return (float(m) + 0.5) / 16.0;
}

// Seuil en lignes diagonales (effet gravure)
float engraving(vec2 cell) {
  float period = 6.0;
  float f = (mod(cell.x + cell.y, period) + 0.5) / period;
  return clamp(abs(f * 2.0 - 1.0) + (bayer(cell) - 0.5) * (2.0 / period), 0.0, 1.0);
}

// Position dans le canvas → position dans la photo (selon le cadrage)
vec2 imageUv(vec2 uv) {
  return (uv - 0.5) * uCover + 0.5;
}

// 1 si la position est dans la photo, 0 si elle est en dehors
float within(vec2 p) {
  vec2 s = step(vec2(0.0), p) * step(p, vec2(1.0));
  return s.x * s.y;
}

// Contraste et luminosité, avant le dither
vec3 grade(vec3 c) {
  return pow(clamp((c - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0), vec3(1.6));
}

// Duotone : on garde seulement la luminosité. RGB : on garde les 3 couleurs.
vec3 toned(vec3 c) {
  return uPalette == 1 ? grade(c) : grade(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))));
}

// Arrondit le ton au niveau inférieur ou supérieur selon le seuil t
vec3 quantize(vec3 v, float t) {
  float steps = max(uLevels - 1.0, 1.0);
  vec3 s = v * steps;
  vec3 base = floor(s);
  return min(base + step(vec3(t), s - base), vec3(steps)) / steps;
}

void main() {
  // 1. Trouver la case de dither (un carré de uCell pixels) de ce pixel
  vec2 px = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 cell = floor(px / uCell);
  vec2 center = (cell + 0.5) * uCell;
  vec2 cellUv = vec2(center.x / uResolution.x, 1.0 - center.y / uResolution.y);

  // 2. Calculer le ton de la case (0 = encre, 1 = papier)
  vec2 sampleUv = imageUv(cellUv);
  vec3 level;
  if (uPattern == 3) {
    level = texelFetch(tDiffused, ivec2(cell), 0).rgb;
  } else {
    vec3 c = textureLod(tImage, sampleUv, uLod).rgb;
    float t = uPattern == 1 ? bayer4(cell) : (uPattern == 2 ? engraving(cell) : bayer(cell));
    level = quantize(toned(c), t);
  }
  vec3 color = mix(uInk, mix(uInk, uPaper, level), within(sampleUv));

  // 3. La photo en couleur, telle quelle
  vec2 photoUv = imageUv(vUv);
  vec3 photo = mix(uInk, texture(tImage, photoUv).rgb, within(photoUv));

  // 4. Là où le masque est allumé, on remplace le dither par la photo.
  //    Le seuil de Bayer fait apparaître la photo case par case (effet de dissolution).
  float mask = clamp(texture(tMask, cellUv).r * uHold, 0.0, 1.0);
  float shown = mix(mask, 1.0 - mask, uReverse);
  float low = bayer(cell.yx) * (1.0 - uRim);
  color = mix(color, uRimColor, step(low, shown) * step(0.001, uRim));
  color = mix(color, photo, step(low + uRim, shown));

  // 5. Animation d'apparition : les cases apparaissent du centre vers les bords
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  float spread = length((cellUv - 0.5) * aspect) / length(aspect * 0.5);
  float appear = step(spread * 0.72 + bayer(cell + vec2(3.0, 5.0)) * 0.28, uIntro * 1.001);

  fragColor = vec4(mix(uInk, color, appear), 1.0);
}
`;
