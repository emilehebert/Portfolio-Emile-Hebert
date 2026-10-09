import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl';
import { hexToRgb } from '../utils/dither/algorithms.js';

// Mouvement réduit demandé dans les réglages de l'appareil : le texte reste immobile
const reducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;

// SHADERS
// Triangle qui couvre tout le canvas
const VERTEX = /* glsl */ `#version 300 es
in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// Trame halftone : une grille de points, chaque point grossit selon l'encre sous lui
const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D tText;
uniform vec2 uResolution; // taille du canvas, en px réels
uniform float uTileRatio; // largeur ÷ hauteur de la tuile
uniform float uCell; // taille d'une case de la grille, en px réels
uniform mat2 uRotation; // rotation de la grille (calculée une seule fois en JS)
uniform float uTint; // encre minimum partout (petits points sur le rouge)
uniform float uScroll; // défilement du texte, en tuiles (0 → 1)
uniform vec3 uInk;
uniform vec3 uPaper;

out vec4 fragColor;

// Pixel du canvas → position dans le texte (la tuile prend toute la hauteur et se répète)
vec2 textUv(vec2 pixel) {
  return vec2(pixel.x / (uResolution.y * uTileRatio), pixel.y / uResolution.y);
}

void main() {
  // Grille tournée : chaque case contient un point
  vec2 grid = uRotation * gl_FragCoord.xy / uCell;
  vec2 local = fract(grid) - 0.5; // position dans la case (-0.5 → 0.5)

  // Encre au CENTRE de la case (noir = 1, blanc = 0) : tout le point a la même taille
  // (vecteur * matrice = rotation inverse, pour revenir dans le canvas)
  vec2 center = ((floor(grid) + 0.5) * uCell) * uRotation;
  // Seul le texte bouge (uScroll) : la grille de points reste fixe
  float ink = 1.0 - texture(tText, textUv(center) + vec2(uScroll, 0.0)).r;
  ink = max(ink, uTint);

  // Rayon du point (racine = la surface d'encre suit la valeur). 0.72 = cases pleines à 100 %
  float radius = sqrt(ink) * 0.72;
  float aa = length(fwidth(grid)) * 0.6; // bord adouci d'environ 1 px
  float coverage = smoothstep(radius + aa, radius - aa, length(local));

  fragColor = vec4(mix(uPaper, uInk, coverage), 1.0);
}`;

/*
 * HalftoneMarquee — bandeau de texte qui défile sous une trame halftone.
 *
 * Utilisation :
 *   <div class="halftone-marquee" data-component="HalftoneMarquee" data-text="À propos \" aria-hidden="true">
 *       <canvas class="halftone-marquee__canvas"></canvas>
 *   </div>
 *
 * L'animation tourne seulement quand le bandeau est à l'écran.
 */
export default class HalftoneMarquee {
  constructor(element) {
    this.element = element;
    this.canvas = this.element.querySelector('.halftone-marquee__canvas');
    this.options = {
      text: 'A propos \\', // en JS, \\ = un seul \
      font: 'Archivo Black',
      fontSize: 200, // taille dans la texture (pas à l'écran), en px
      gap: 0.4, // espace entre deux répétitions (× fontSize)
      blur: 5, // flou du texte = points dégradés sur les bords, en px
      speed: 1, // vitesse du défilement, en hauteurs de bandeau par seconde

      // Trame
      density: 25, // nombre de cases sur la hauteur du bandeau (même look à toutes les tailles)
      angle: 45, // rotation de la grille, en degrés (45 = trame d'imprimerie classique)
      tint: 0.08, // encre minimum partout (0 = rouge uni)

      // Couleurs : une variable de colors.scss ('--color-...') ou un hex ('#ffffff')
      inkColor: '--color-black',
      paperColor: '--color-primary',
    };
    this.sizes = {
      width: this.element.clientWidth,
      height: this.element.clientHeight,
    };

    this.renderer = null; // null = pas de WebGL (non supporté ou contexte perdu)
    this.isVisible = false;
    this.raf = 0; // id du requestAnimationFrame en cours (0 = animation arrêtée)
    this.startTime = performance.now();

    // bind une seule fois, sinon une nouvelle fonction est créée à chaque image
    this.animate = this.animate.bind(this);

    this.init();
  }

  async init() {
    if (!this.canvas) return;
    this.setOptions();

    window.addEventListener('resize', this.resize.bind(this));
    this.canvas.addEventListener(
      'webglcontextlost',
      this.contextLost.bind(this),
    );
    this.canvas.addEventListener(
      'webglcontextrestored',
      this.contextRestored.bind(this),
    );

    // Le canvas 2D ne passe pas par le CSS : on attend la police avant d'écrire le texte
    await document.fonts.load(
      `${this.options.fontSize}px "${this.options.font}"`,
    );

    this.createText();
    if (!this.createRenderer()) return; // pas de WebGL2 : le bandeau reste rouge
    this.createObjects();
    this.observe();
  }

  // TEXTE
  // Dessine UNE copie du texte, noir sur blanc (noir = là où il y aura de l'encre)
  createText() {
    const { fontSize, gap, blur } = this.options;
    const text = this.options.text.toUpperCase();
    const font = `${fontSize}px "${this.options.font}"`;
    const padX = (fontSize * gap) / 2; // moitié de l'espace de chaque côté
    const padY = fontSize * 0.1; // marge en haut et en bas (garde le flou entier)

    this.tile = document.createElement('canvas');
    const context = this.tile.getContext('2d');

    // Mesure du texte, pour que la tuile ait la taille exacte
    context.font = font;
    const size = context.measureText(text);
    const ascent = size.actualBoundingBoxAscent;
    const descent = size.actualBoundingBoxDescent;

    this.tile.width = Math.ceil(size.width + padX * 2);
    this.tile.height = Math.ceil(ascent + descent + padY * 2);

    context.fillStyle = '#fff';
    context.fillRect(0, 0, this.tile.width, this.tile.height);

    // Flou avec une ombre, car context.filter ne marche pas sur Safari (iPhone).
    // Le texte est dessiné à gauche, HORS de la tuile : seule son ombre floue tombe dedans.
    context.font = font; // changer la taille du canvas efface le font
    context.fillStyle = '#000';
    context.shadowColor = '#000';
    context.shadowBlur = blur * 2; // shadowBlur 6 = même flou qu'un blur(3px) en CSS
    context.shadowOffsetX = this.tile.width;
    context.fillText(text, padX - this.tile.width, padY + ascent);
  }

  // RENDERER
  createRenderer() {
    let renderer;
    try {
      renderer = new Renderer({
        canvas: this.canvas,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        alpha: false,
        depth: false, // un seul triangle à plat : pas besoin de profondeur
      });
    } catch {
      return false;
    }
    if (!renderer.isWebgl2) return false;

    this.renderer = renderer;
    this.gl = renderer.gl;

    // UPDATE SIZES (le bandeau a pu changer pendant le chargement de la police)
    this.sizes.width = this.element.clientWidth;
    this.sizes.height = this.element.clientHeight;
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    return true;
  }

  // BANDEAU (texture + shader + mesh)
  createObjects() {
    const gl = this.gl;
    const options = this.options;

    const texture = new Texture(gl, {
      image: this.tile,
      generateMipmaps: false,
      wrapS: gl.REPEAT, // la tuile se répète à l'infini en largeur
    });

    // Rotation calculée une fois ici, au lieu de pour chaque pixel dans le shader
    const angle = (options.angle * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const tileRatio = this.tile.width / this.tile.height;
    this.tilesPerSecond = options.speed / tileRatio;

    this.uniforms = {
      tText: { value: texture },
      uResolution: { value: [gl.canvas.width, gl.canvas.height] },
      uTileRatio: { value: tileRatio },
      uCell: { value: gl.canvas.height / options.density },
      uRotation: { value: [cos, -sin, sin, cos] },
      uTint: { value: options.tint },
      uScroll: { value: 0 },
      uInk: { value: hexToRgb(this.getColor(options.inkColor)) },
      uPaper: { value: hexToRgb(this.getColor(options.paperColor)) },
    };

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(gl, { geometry, program });
  }

  // VISIBILITÉ
  // Démarre l'animation un peu avant que le bandeau arrive à l'écran (100px), l'arrête quand il sort
  observe() {
    const observer = new IntersectionObserver(this.watch.bind(this), {
      rootMargin: '100px 0px',
    });
    observer.observe(this.element);
  }

  watch(entries) {
    this.isVisible = entries[0].isIntersecting;

    if (this.isVisible) this.play();
    else this.pause();
  }

  play() {
    if (!this.renderer) return;

    if (reducedMotion)
      this.render(); // une seule image, sans mouvement
    else if (!this.raf) this.raf = window.requestAnimationFrame(this.animate);
  }

  pause() {
    window.cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // ANIMATION
  animate(now) {
    const elapsedTime = (now - this.startTime) / 1000;

    // Le texte avance avec le temps. % 1 : après une tuile, on repart à 0 (boucle invisible)
    this.uniforms.uScroll.value = (elapsedTime * this.tilesPerSecond) % 1;

    this.render();
    this.raf = window.requestAnimationFrame(this.animate);
  }

  render() {
    this.renderer.render({ scene: this.mesh });
  }

  resize() {
    if (!this.renderer) return;

    const width = this.element.clientWidth;
    const height = this.element.clientHeight;

    // Sur iPhone, la barre d'adresse déclenche « resize » pendant le scroll : on ignore si rien n'a changé
    if (width === this.sizes.width && height === this.sizes.height) return;

    // UPDATE SIZES
    this.sizes.width = width;
    this.sizes.height = height;

    // UPDATE RENDERER
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.uniforms.uResolution.value = [
      this.gl.canvas.width,
      this.gl.canvas.height,
    ];
    this.uniforms.uCell.value = this.gl.canvas.height / this.options.density;

    // Changer la taille vide le canvas : on redessine si l'animation ne le fait pas
    if (!this.raf) this.render();
  }

  // CONTEXTE PERDU
  // Le navigateur peut retirer le WebGL (app en arrière-plan, trop de canvas sur la page)
  contextLost(event) {
    event.preventDefault(); // demande au navigateur de le rendre plus tard
    this.pause();
    this.renderer = null;
  }

  // Le WebGL est revenu : on recrée tout sur le même canvas
  contextRestored() {
    if (!this.createRenderer()) return;
    this.createObjects();
    if (this.isVisible) this.play();
  }

  // OPTIONS
  // '--color-primary' → la couleur de cette variable CSS | un hex reste tel quel
  getColor(color) {
    if (!color.startsWith('--')) return color;
    return getComputedStyle(document.documentElement)
      .getPropertyValue(color)
      .trim();
  }

  setOptions() {
    if (this.element.dataset.text) {
      this.options.text = this.element.dataset.text;
    }
  }
}
