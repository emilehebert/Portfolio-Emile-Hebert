import DitherCanvas from '../utils/dither/DitherCanvas.js';

// Écran tactile sans survol (téléphone, tablette)
const isTouch = window.matchMedia(
  '(hover: none) and (pointer: coarse)',
).matches;

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

    this.init();
  }

  init() {
    if (!this.image) return;

    this.setOptions();
    this.setColors();

    // Chaque image utilise un contexte WebGL, et les navigateurs en limitent le nombre (~16).
    // Le dither est donc créé quand l'image approche de l'écran, et retiré quand elle s'éloigne.
    // Au doigt, on le prépare bien avant (100 % d'écran) pour qu'il soit prêt à temps.
    const margin = isTouch ? '100%' : '0px';
    const observer = new IntersectionObserver(this.watch.bind(this), {
      rootMargin: `${margin} 0px ${margin} 0px`,
    });
    observer.observe(this.element);
  }

  watch(entries) {
    if (entries[0].isIntersecting) {
      this.createDither();
    } else if (!isTouch) {
      this.removeDither(); // au doigt, on garde l'image figée (elle ne coûte plus rien)
    }
  }

  createDither() {
    if (this.dither) return;

    // Élément qui déclenche le survol : le parent demandé (trigger), sinon l'image
    let hoverTarget = this.element;
    if (this.options.trigger) {
      hoverTarget = this.element.closest(this.options.trigger) || this.element;
    }

    this.options.frozen = isTouch; // au doigt : dither figé, sans survol
    this.dither = new DitherCanvas(
      this.element,
      this.image,
      this.options,
      hoverTarget,
    );

    // Pas de WebGL2 dans ce navigateur : on garde l'<img> normale
    if (!this.dither.isSupported) this.dither = null;
  }

  removeDither() {
    if (!this.dither) return;
    this.dither.destroy();
    this.dither = null;
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
