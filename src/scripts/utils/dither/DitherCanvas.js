import { Renderer, Program, Mesh, Triangle, Texture, RenderTarget } from 'ogl';
import { VERTEX, MASK_FRAGMENT, VIEW_FRAGMENT } from './shaders.js';
import { PATTERNS, KERNELS, hexToRgb, fitScale, diffuse } from './algorithms.js';

const MASK_SCALE = 0.5; // le masque du curseur est dessiné à demi-résolution (plus rapide)
const HOLD = 1.6; // garde la zone révélée bien pleine avant qu'elle commence à s'effacer
const INTRO_DURATION = 1100; // durée de l'apparition au chargement, en ms

/*
 * DitherCanvas — le <canvas> WebGL qui affiche UNE image en dither.
 * Il est créé et retiré par le composant DitherVeil.
 *
 *   init()     crée le canvas, les textures et les shaders, puis charge la photo
 *   render()   boucle d'animation : bouge le pinceau, dessine le masque, puis l'image
 *   destroy()  retire le canvas et libère la carte graphique
 *
 * Le « masque » est une image invisible qui retient où le curseur est passé.
 * Là où il est allumé, on montre la photo en couleur au lieu du dither.
 */
export default class DitherCanvas {
  constructor(container, src, options, hoverTarget) {
    this.container = container; // le .window__media
    this.src = src; // l'adresse de la photo
    this.options = options;
    this.hoverTarget = hoverTarget; // l'élément qui réagit au survol

    this.isSupported = false; // reste false si le navigateur n'a pas WebGL2
    this.isDestroyed = false;
    this.image = null; // la photo, une fois chargée
    this.width = 1; // taille du canvas, en px CSS
    this.height = 1;

    // Animation
    this.raf = 0; // id du requestAnimationFrame en cours (0 = boucle arrêtée)
    this.lastTime = 0;
    this.introStart = 0;
    this.trailEnd = 0; // moment où la traînée aura fini de s'effacer
    this.diffusedSize = ''; // taille pour laquelle Floyd / Atkinson a déjà été calculé

    // Curseur et pinceau (le pinceau suit le curseur avec un petit retard)
    this.pointer = { x: 0, y: 0, isInside: false };
    this.brush = { x: 0, y: 0, prevX: 0, prevY: 0 };
    this.presence = 0; // 0 → 1 : à quel point le curseur est « dedans »

    // Liées à this une seule fois, pour pouvoir retirer les écouteurs dans destroy()
    this.onMove = this.onMove.bind(this);
    this.onLeave = this.onLeave.bind(this);
    this.render = this.render.bind(this);
    this.destroy = this.destroy.bind(this);

    this.init();
  }

  init() {
    if (!this.createRenderer()) return;
    this.isSupported = true;

    this.createTextures();
    this.createShaders();
    this.loadImage();

    this.hoverTarget.addEventListener('pointerenter', this.onMove);
    this.hoverTarget.addEventListener('pointermove', this.onMove);
    this.hoverTarget.addEventListener('pointerdown', this.onMove);
    this.hoverTarget.addEventListener('pointerleave', this.onLeave);
    this.hoverTarget.addEventListener('pointercancel', this.onLeave);

    // Si le navigateur retire le contexte WebGL (trop d'images), on rend la place à l'<img>
    this.canvas.addEventListener('webglcontextlost', this.destroy);

    // Recalcule la taille du canvas quand la fenêtre change de taille
    this.resizeObserver = new ResizeObserver(this.onResize.bind(this));
    this.resizeObserver.observe(this.container);
    this.onResize();
  }

  /*
   Création
   ========================================================================== */

  // Crée le canvas WebGL2 et l'ajoute dans le .window__media. Retourne false si impossible.
  createRenderer() {
    try {
      this.renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        alpha: false,
        antialias: false,
      });
    } catch {
      return false;
    }

    this.gl = this.renderer.gl;
    if (!this.gl || !this.renderer.isWebgl2) {
      this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return false;
    }

    this.canvas = this.gl.canvas;
    this.canvas.classList.add('dither-veil__canvas');
    this.container.appendChild(this.canvas);

    // Masque en haute précision si possible (traînée plus douce)
    this.hasFloatMask = !!this.renderer.getExtension('EXT_color_buffer_float');
    // Taille d'un point de dither, en pixels réels de l'écran
    this.cell = Math.max(1, Math.round(this.options.pixelSize * this.renderer.dpr));

    return true;
  }

  createTextures() {
    const gl = this.gl;

    // La photo
    this.imageTexture = new Texture(gl, {
      minFilter: gl.LINEAR_MIPMAP_LINEAR,
      magFilter: gl.LINEAR,
    });

    // Le résultat de Floyd / Atkinson (rempli dans updateDiffusion)
    this.diffusedTexture = new Texture(gl, {
      image: new Uint8Array(4),
      width: 1,
      height: 1,
      generateMipmaps: false,
      flipY: false,
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
    });

    // Deux masques : on lit le précédent et on dessine le nouveau, puis on les échange
    this.masks = [this.createMask(2, 2), this.createMask(2, 2)];

    // Petit canvas 2D pour lire les pixels de la photo (Floyd / Atkinson)
    this.sampler = document.createElement('canvas');
    this.samplerContext = this.sampler.getContext('2d', { willReadFrequently: true });
  }

  createMask(width, height) {
    const gl = this.gl;

    return new RenderTarget(gl, {
      width: width,
      height: height,
      depth: false,
      type: this.hasFloatMask ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
      internalFormat: this.hasFloatMask ? gl.RGBA16F : gl.RGBA,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
    });
  }

  deleteMask(mask) {
    this.gl.deleteFramebuffer(mask.buffer);
    this.gl.deleteTexture(mask.texture.texture);
  }

  // Les « uniforms » sont les valeurs envoyées aux shaders (voir shaders.js)
  createShaders() {
    const gl = this.gl;
    const options = this.options;
    const geometry = new Triangle(gl);

    this.maskUniforms = {
      tPrev: { value: this.masks[0].texture },
      uSize: { value: [1, 1] },
      uFrom: { value: [0, 0] },
      uTo: { value: [0, 0] },
      uRadius: { value: 1 },
      uSoftness: { value: options.softness },
      uStrength: { value: 0 },
      uFade: { value: 1 },
      uHold: { value: HOLD },
    };

    this.viewUniforms = {
      tImage: { value: this.imageTexture },
      tMask: { value: this.masks[0].texture },
      tDiffused: { value: this.diffusedTexture },
      uResolution: { value: [1, 1] },
      uCover: { value: [1, 1] },
      uLod: { value: 0 },
      uCell: { value: this.cell },
      uPattern: { value: PATTERNS[options.pattern] ?? PATTERNS.bayer },
      uPalette: { value: options.palette === 'rgb' ? 1 : 0 },
      uLevels: { value: Math.max(2, Math.round(options.levels)) },
      uInk: { value: hexToRgb(options.inkColor) },
      uPaper: { value: hexToRgb(options.paperColor) },
      uRimColor: { value: hexToRgb(options.rimColor) },
      uRim: { value: Math.min(Math.max(options.rim, 0), 0.95) },
      uContrast: { value: options.contrast },
      uBrightness: { value: options.brightness },
      uReverse: { value: options.reverse ? 1 : 0 },
      uIntro: { value: 0 },
      uHold: { value: HOLD },
    };

    const maskProgram = new Program(gl, {
      vertex: VERTEX,
      fragment: MASK_FRAGMENT,
      uniforms: this.maskUniforms,
      depthTest: false,
      depthWrite: false,
    });

    const viewProgram = new Program(gl, {
      vertex: VERTEX,
      fragment: VIEW_FRAGMENT,
      uniforms: this.viewUniforms,
      depthTest: false,
      depthWrite: false,
    });

    this.maskMesh = new Mesh(gl, { geometry, program: maskProgram });
    this.viewMesh = new Mesh(gl, { geometry, program: viewProgram });
  }

  loadImage() {
    this.loader = new Image();
    this.loader.crossOrigin = 'anonymous';
    this.loader.onload = this.onImageLoad.bind(this);
    this.loader.src = this.src;
  }

  /*
   Événements
   ========================================================================== */

  onImageLoad() {
    this.image = this.loader;
    this.imageTexture.image = this.image;
    this.introStart = performance.now();
    this.start();
  }

  onMove(event) {
    // Position du curseur dans le canvas, en px
    const rect = this.canvas.getBoundingClientRect();
    let x = ((event.clientX - rect.left) / rect.width) * this.width;
    let y = ((event.clientY - rect.top) / rect.height) * this.height;

    // reveal 'full' : le curseur peut être hors de l'image (ex. sur le texte d'une card).
    // On ramène le point sur l'image pour que le masque la recouvre en entier.
    if (this.options.reveal === 'full') {
      x = Math.min(Math.max(x, 0), this.width);
      y = Math.min(Math.max(y, 0), this.height);
    }

    this.pointer.x = x;
    this.pointer.y = y;

    // Le curseur vient d'entrer : le pinceau saute directement à sa position
    if (!this.pointer.isInside) {
      this.pointer.isInside = true;
      this.brush.x = this.brush.prevX = x;
      this.brush.y = this.brush.prevY = y;
    }

    this.start();
  }

  onLeave() {
    this.pointer.isInside = false;
    this.start();
  }

  onResize() {
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(this.width, this.height);

    this.viewUniforms.uResolution.value = [this.canvas.width, this.canvas.height];
    this.maskUniforms.uSize.value = [this.width, this.height];

    // Les masques (à demi-résolution) suivent la nouvelle taille
    const maskWidth = Math.max(2, Math.round(this.width * MASK_SCALE));
    const maskHeight = Math.max(2, Math.round(this.height * MASK_SCALE));

    if (maskWidth !== this.masks[0].width || maskHeight !== this.masks[0].height) {
      this.deleteMask(this.masks[0]);
      this.deleteMask(this.masks[1]);
      this.masks = [this.createMask(maskWidth, maskHeight), this.createMask(maskWidth, maskHeight)];
    }

    this.start();
  }

  /*
   Animation
   ========================================================================== */

  // Lance la boucle d'animation, si elle n'est pas déjà en cours
  start() {
    if (this.raf || this.isDestroyed) return;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.render);
  }

  render(now) {
    this.raf = 0;

    // Temps écoulé depuis l'image précédente, en secondes (max 0.05 pour éviter les sauts)
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    this.updateBrush(dt);
    this.drawMask(dt, now);
    this.drawDither(now);

    // La boucle continue tant qu'il se passe quelque chose, sinon elle s'arrête d'elle-même
    const isIntroPlaying = this.image && now - this.introStart < INTRO_DURATION;
    const isBusy =
      this.pointer.isInside || this.presence > 0.002 || now < this.trailEnd || isIntroPlaying;

    if (isBusy) this.raf = requestAnimationFrame(this.render);
  }

  updateBrush(dt) {
    // presence glisse doucement vers 1 quand le curseur est dedans, vers 0 quand il sort
    const target = this.pointer.isInside ? 1 : 0;
    this.presence += (target - this.presence) * (1 - Math.exp(-dt / 0.16));

    // Le pinceau rattrape le curseur avec un petit retard (mouvement plus doux)
    const follow = 1 - Math.exp(-dt / 0.035);
    this.brush.x += (this.pointer.x - this.brush.x) * follow;
    this.brush.y += (this.pointer.y - this.brush.y) * follow;
  }

  drawMask(dt, now) {
    const options = this.options;

    // Tant que le curseur est là, on repousse la fin de la traînée
    if (this.presence > 0.002) this.trailEnd = now + options.linger * 1000 + 150;

    // Rayon de la zone révélée. reveal 'full' : assez grand pour couvrir toute l'image.
    let radius = options.revealRadius;
    if (options.reveal === 'full') {
      radius = Math.hypot(this.width, this.height) / Math.max(0.05, 1 - options.softness) + 2;
    }

    // Vitesse d'effacement de la traînée (selon linger)
    const fade = options.linger > 0 ? dt / options.linger : 1;
    const minFade = this.hasFloatMask ? 0 : 1.5 / 255;

    this.maskUniforms.tPrev.value = this.masks[0].texture;
    this.maskUniforms.uFrom.value = [this.brush.prevX, this.brush.prevY];
    this.maskUniforms.uTo.value = [this.brush.x, this.brush.y];
    this.maskUniforms.uRadius.value = radius * (0.45 + 0.55 * this.presence);
    this.maskUniforms.uStrength.value = this.presence;
    this.maskUniforms.uFade.value = Math.max(fade, minFade);

    // On dessine le nouveau masque, puis il devient « le précédent » pour la prochaine image
    this.renderer.render({ scene: this.maskMesh, target: this.masks[1] });
    this.masks.reverse();

    this.brush.prevX = this.brush.x;
    this.brush.prevY = this.brush.y;
  }

  drawDither(now) {
    if (this.image) {
      // Cadrage de la photo dans le canvas ('cover' ou 'contain')
      this.viewUniforms.uCover.value = fitScale(
        this.canvas.width,
        this.canvas.height,
        this.image.naturalWidth,
        this.image.naturalHeight,
        this.options.fit === 'contain',
      );

      // Légère réduction de la photo selon la taille des points (évite le scintillement)
      const texelsPerPixel =
        (this.viewUniforms.uCover.value[0] * this.image.naturalWidth) / this.canvas.width;
      this.viewUniforms.uLod.value = Math.log2(Math.max(this.cell * texelsPerPixel, 1));

      // Floyd / Atkinson : calculé en JS. Si la photo est illisible, on passe en bayer.
      if (KERNELS[this.options.pattern]) {
        try {
          this.updateDiffusion();
        } catch {
          this.viewUniforms.uPattern.value = PATTERNS.bayer;
        }
      }
    }

    // Apparition : 0 → 1 pendant INTRO_DURATION, en ralentissant à la fin
    const intro = this.image ? Math.min(1, (now - this.introStart) / INTRO_DURATION) : 0;
    this.viewUniforms.uIntro.value = 1 - Math.pow(1 - intro, 2);

    this.viewUniforms.tMask.value = this.masks[0].texture;
    this.renderer.render({ scene: this.viewMesh });
  }

  // Floyd / Atkinson : on réduit la photo à 1 pixel par point, puis on la dither en JS
  updateDiffusion() {
    const options = this.options;
    const cols = Math.ceil(this.canvas.width / this.cell);
    const rows = Math.ceil(this.canvas.height / this.cell);

    // Déjà calculé pour cette taille : rien à refaire
    const size = this.canvas.width + 'x' + this.canvas.height;
    if (size === this.diffusedSize) return;
    this.diffusedSize = size;

    // Partie de la photo visible dans le canvas (selon le cadrage)
    const [coverX, coverY] = this.viewUniforms.uCover.value;
    const imageWidth = this.image.naturalWidth;
    const imageHeight = this.image.naturalHeight;
    const sx = (0.5 - 0.5 * coverX) * imageWidth;
    const sy = (0.5 - 0.5 * coverY) * imageHeight;
    const sw = ((cols * this.cell) / this.canvas.width) * coverX * imageWidth;
    const sh = ((rows * this.cell) / this.canvas.height) * coverY * imageHeight;
    const x0 = Math.max(sx, 0);
    const y0 = Math.max(sy, 0);
    const x1 = Math.min(sx + sw, imageWidth);
    const y1 = Math.min(sy + sh, imageHeight);

    // On dessine cette partie, réduite, dans le petit canvas 2D
    const context = this.samplerContext;
    this.sampler.width = cols;
    this.sampler.height = rows;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#000';
    context.fillRect(0, 0, cols, rows);

    if (x1 > x0 && y1 > y0) {
      context.drawImage(
        this.image,
        x0,
        y0,
        x1 - x0,
        y1 - y0,
        ((x0 - sx) / sw) * cols,
        ((y0 - sy) / sh) * rows,
        ((x1 - x0) / sw) * cols,
        ((y1 - y0) / sh) * rows,
      );
    }

    // Contraste et luminosité, comme dans le shader
    const grade = (value) => {
      const graded = (value - 0.5) * options.contrast + 0.5 + options.brightness;
      return Math.pow(Math.min(1, Math.max(0, graded)), 1.6);
    };

    const pixels = context.getImageData(0, 0, cols, rows).data;
    this.diffusedTexture.image = diffuse(
      pixels,
      cols,
      rows,
      KERNELS[options.pattern],
      this.viewUniforms.uLevels.value,
      options.palette === 'rgb',
      grade,
    );
    this.diffusedTexture.width = cols;
    this.diffusedTexture.height = rows;
    this.diffusedTexture.needsUpdate = true;
  }

  /*
   Nettoyage
   ========================================================================== */

  destroy() {
    if (!this.isSupported || this.isDestroyed) return;
    this.isDestroyed = true;

    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.loader.onload = null;

    this.hoverTarget.removeEventListener('pointerenter', this.onMove);
    this.hoverTarget.removeEventListener('pointermove', this.onMove);
    this.hoverTarget.removeEventListener('pointerdown', this.onMove);
    this.hoverTarget.removeEventListener('pointerleave', this.onLeave);
    this.hoverTarget.removeEventListener('pointercancel', this.onLeave);
    this.canvas.removeEventListener('webglcontextlost', this.destroy);

    // Libère la carte graphique et retire le canvas : l'<img> redevient visible
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.remove();
  }
}
