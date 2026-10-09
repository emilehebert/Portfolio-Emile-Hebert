import DitherCanvas from '../utils/dither/DitherCanvas.js';

/*
 * DitherVeil — affiche l'image d'une fenêtre en dither,
 * et révèle la photo en couleur au survol. (Adapté de React Bits « DitherVeil ».)
 *
 * Utilisation :
 *   <div class="window__media" data-component="DitherVeil">
 *       <img src="..." alt="..." />
 *   </div>
 *
 * Les options ci-dessous s'appliquent à TOUTES les images.
 * Certaines peuvent être changées pour UNE image avec un data-attribut (voir setOptions) :
 *   data-levels="2"   data-pattern="bayer4"   data-reveal="full"   data-trigger=".card"
 */
export default class DitherVeil {
  constructor(element) {
    this.element = element;
    this.image = this.element.querySelector('img');
    this.options = {
      // Cadrage
      fit: 'cover', // 'cover' remplit la fenêtre | 'contain' montre l'image au complet

      // Dither
      pattern: 'bayer4', // 'floyd' | 'atkinson' | 'bayer' (8×8) | 'bayer4' (4×4) | 'lines'
      palette: 'duotone', // 'duotone' (2 couleurs) | 'rgb' (couleurs rétro)
      pixelSize: 2, // taille d'un point, en px
      levels: 7, // nombre de tons (2 = noir et blanc pur)
      contrast: 1.15,
      brightness: 0, // négatif = plus sombre | positif = plus clair

      // Couleurs : une variable de colors.scss ('--color-...') ou un hex ('#ffffff')
      inkColor: '--color-background', // tons sombres
      paperColor: '--color-white', // tons clairs
      rimColor: '--color-primary', // bordure de la zone révélée (voir rim)

      // Survol
      trigger: '', // parent qui déclenche le survol, ex. '.card' | '' = l'image elle-même
      reveal: 'cursor', // 'cursor' = cercle autour du curseur | 'full' = toute la photo
      revealRadius: 300, // rayon du cercle, en px (seulement avec reveal 'cursor')
      softness: 0.4, // 0 = bord net | 1 = bord qui se dissout dans le dither
      linger: 1, // secondes avant que la traînée redevienne du dither
      rim: 0, // épaisseur de la bordure colorée (0 = aucune)
      reverse: false, // true = photo en couleur, c'est le survol qui la passe en dither
    };
    this.dither = null; // le canvas en dither, quand l'image est près de l'écran
    this.isNear = false; // l'image est-elle près de l'écran (rootMargin) ?
    this.hasPlayedIntro = false; // l'apparition n'est jouée qu'une fois par image
    this.isVisible = false; // l'image est-elle vraiment à l'écran (sans marge) ?

    this.init();
  }

  init() {
    if (!this.image) return;

    this.setOptions();
    this.setColors();

    // Mouvement réduit (réglage du système) : pas d'apparition ni de traînée
    if (DitherVeil.reducedMotion) {
      this.hasPlayedIntro = true;
      this.options.linger = 0;
    }

    // Le dither est préparé en avance : rootMargin de 50 % de la hauteur d'écran au-dessus et
    // au-dessous. Le travail lourd (WebGL, shaders, texture) est donc fait AVANT que l'image
    // soit visible, et pas au moment où elle arrive pendant le scroll.
    // Au doigt, on prend encore plus d'avance (100 %) : le scroll natif va plus vite.
    const margin = DitherVeil.isTouch ? '100%' : '50%';
    const observer = new IntersectionObserver(this.watch.bind(this), {
      rootMargin: `${margin} 0px ${margin} 0px`,
    });
    observer.observe(this.element);

    // 2e observateur, sans marge : l'apparition commence quand l'image est vraiment à l'écran
    const visibleObserver = new IntersectionObserver(this.onVisible.bind(this));
    visibleObserver.observe(this.element);
  }

  onVisible(entries) {
    this.isVisible = entries[0].isIntersecting;
    if (this.isVisible && this.dither) this.dither.playIntro();
  }

  watch(entries) {
    this.isNear = entries[0].isIntersecting;

    if (this.isNear) {
      DitherVeil.queue(this);
    } else if (this.dither) {
      // Loin de l'écran : on met seulement l'animation en pause (pas de destruction)
      this.dither.pause();
    }
  }

  createDither() {
    // Déjà prêt : on relance simplement l'animation
    if (this.dither && !this.dither.isDestroyed) {
      this.dither.resume();
      return;
    }

    // Contexte perdu entre-temps (le navigateur l'a retiré) : on repart de zéro
    this.removeDither();

    // Élément qui déclenche le survol : le parent demandé (trigger), sinon l'image
    let hoverTarget = this.element;
    if (this.options.trigger) {
      hoverTarget = this.element.closest(this.options.trigger) || this.element;
    }

    // Trop de contextes WebGL : on libère ceux des images les plus loin de l'écran
    DitherVeil.freeContexts(this);

    // Au doigt (pas de survol), le dither est calculé une fois puis figé (voir DitherCanvas.freeze)
    this.options.frozen = DitherVeil.isTouch;
    this.options.intro = !this.hasPlayedIntro;
    this.dither = new DitherCanvas(
      this.element,
      this.image,
      this.options,
      hoverTarget,
    );

    // Pas de WebGL2 dans ce navigateur : on garde l'<img> normale
    if (!this.dither.isSupported) {
      this.dither = null;
      return;
    }

    // Une fois figé, il n'utilise plus de contexte WebGL : on libère sa place
    this.dither.onFrozen = this.onFrozen.bind(this);
    DitherVeil.instances.push(this);
    if (this.isVisible) this.dither.playIntro();

    // Si ce dither est détruit puis recréé (trop de contextes), pas de 2e apparition
    this.hasPlayedIntro = true;
  }

  onFrozen() {
    const index = DitherVeil.instances.indexOf(this);
    if (index !== -1) DitherVeil.instances.splice(index, 1);

    // Si l'image change beaucoup de taille (ex. téléphone tourné), on refait la copie figée
    this.frozenWidth = this.element.clientWidth;
    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(this.onResize.bind(this));
      this.resizeObserver.observe(this.element);
    }
  }

  onResize() {
    if (!this.dither || !this.dither.isFrozen) return;

    const change =
      Math.abs(this.element.clientWidth - this.frozenWidth) / this.frozenWidth;
    if (change > 0.1) {
      this.removeDither();
      if (this.isNear) DitherVeil.queue(this);
    }
  }

  removeDither() {
    if (!this.dither) return;
    this.dither.destroy();
    this.dither = null;

    const index = DitherVeil.instances.indexOf(this);
    if (index !== -1) DitherVeil.instances.splice(index, 1);
  }

  // Distance entre le centre de l'image et le centre de l'écran, en px
  getDistance() {
    const rect = this.element.getBoundingClientRect();
    return Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
  }

  // Une seule création par image (frame) : plusieurs images qui arrivent en même
  // temps ne bloquent pas le scroll toutes dans la même frame.
  static queue(instance) {
    if (!DitherVeil.waiting.includes(instance))
      DitherVeil.waiting.push(instance);
    if (!DitherVeil.raf)
      DitherVeil.raf = requestAnimationFrame(DitherVeil.processQueue);
  }

  static processQueue() {
    DitherVeil.raf = 0;

    const instance = DitherVeil.waiting.shift();

    // Encore près de l'écran ? (on a pu scroller ailleurs entre-temps)
    if (instance && instance.isNear) instance.createDither();

    if (DitherVeil.waiting.length) {
      DitherVeil.raf = requestAnimationFrame(DitherVeil.processQueue);
    }
  }

  // Les navigateurs limitent le nombre de contextes WebGL (~16, moins sur iPhone).
  // Au-delà de MAX_CONTEXTS, on détruit ceux des images les plus éloignées.
  static freeContexts(current) {
    const others = DitherVeil.instances.filter(
      (instance) => instance !== current,
    );
    others.sort((a, b) => b.getDistance() - a.getDistance());

    while (others.length >= DitherVeil.MAX_CONTEXTS) {
      others.shift().removeDither();
    }
  }

  setColors() {
    this.options.inkColor = this.getColor(this.options.inkColor);
    this.options.paperColor = this.getColor(this.options.paperColor);
    this.options.rimColor = this.getColor(this.options.rimColor);
  }

  // '--color-primary' → la couleur de cette variable CSS | un hex reste tel quel
  getColor(color) {
    if (!color.startsWith('--')) return color;
    return getComputedStyle(document.documentElement)
      .getPropertyValue(color)
      .trim();
  }

  // Options changeables pour une seule image. Un data-attribut vide est ignoré.
  setOptions() {
    if (this.element.dataset.fit) {
      this.options.fit = this.element.dataset.fit;
    }

    if (this.element.dataset.pattern) {
      this.options.pattern = this.element.dataset.pattern;
    }

    if (this.element.dataset.palette) {
      this.options.palette = this.element.dataset.palette;
    }

    if (this.element.dataset.pixelSize) {
      this.options.pixelSize = Number(this.element.dataset.pixelSize);
    }

    if (this.element.dataset.levels) {
      this.options.levels = Number(this.element.dataset.levels);
    }

    if (this.element.dataset.contrast) {
      this.options.contrast = Number(this.element.dataset.contrast);
    }

    if (this.element.dataset.brightness) {
      this.options.brightness = Number(this.element.dataset.brightness);
    }

    if (this.element.dataset.trigger) {
      this.options.trigger = this.element.dataset.trigger;
    }

    if (this.element.dataset.reveal) {
      this.options.reveal = this.element.dataset.reveal;
    }

    if (this.element.dataset.revealRadius) {
      this.options.revealRadius = Number(this.element.dataset.revealRadius);
    }

    if ('reverse' in this.element.dataset) {
      this.options.reverse = true;
    }
  }
}

DitherVeil.MAX_CONTEXTS = 10; // contextes WebGL actifs au maximum
// Écran tactile sans survol (téléphone, tablette) : détecté par le CSS, pas par le user agent
DitherVeil.isTouch = window.matchMedia(
  '(hover: none) and (pointer: coarse)',
).matches;
DitherVeil.reducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;
DitherVeil.instances = []; // images qui ont un dither (contexte WebGL) actif
DitherVeil.waiting = []; // images en attente de création
DitherVeil.raf = 0;
