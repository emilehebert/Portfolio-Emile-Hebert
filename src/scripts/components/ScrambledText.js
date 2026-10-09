import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(SplitText, ScrambleTextPlugin);

/*
 * ScrambledText — les lettres proches du curseur se brouillent, puis se reforment.
 * (Adapté de React Bits « ScrambledText », inspiré de Tom Miller / GSAP.)
 *
 * Utilisation :
 *   <a href="..." data-component="ScrambledText">À propos</a>
 *
 * Depuis un autre composant (ex. IconLabel), on peut choisir l'élément qui réagit au survol :
 *   new ScrambledText(label, link);   → le label se brouille quand on survole le lien
 *
 * Les options ci-dessous s'appliquent à TOUS les textes.
 * Pour changer UN seul texte, ajoute un data-attribut (voir setOptions) :
 *   data-radius="40"   data-duration="0.8"   data-speed="0.5"   data-chars="01"   data-interval="2"   data-once="false"   data-intro="true"
 */
export default class ScrambledText {
  constructor(element, trigger) {
    this.element = element;
    this.trigger = trigger || element; // élément qui réagit au survol (par défaut, le texte lui-même)
    this.options = {
      radius: 100, // distance autour du curseur où les lettres se brouillent, en px
      duration: 1.2, // durée du brouillage d'une lettre, en secondes
      speed: 0.5, // vitesse à laquelle les caractères changent
      chars: 'XxÉéHh.:;,.^', // caractères utilisés pour brouiller
      interval: 1, // temps minimum entre deux brouillages, en secondes
      once: false, // true = un seul brouillage par survol (à l'entrée du curseur)
      intro: false, // true = le texte se brouille la 1re fois qu'il apparaît à l'écran
    };
    this.letters = [];
    this.lastScramble = 0; // moment du dernier brouillage, en ms

    this.init();
  }

  init() {
    this.setOptions();

    // Coupe le texte en une <span class="scrambled-text__char"> par lettre
    const split = SplitText.create(this.element, {
      type: 'chars',
      charsClass: 'scrambled-text__char',
      tag: 'span',
    });
    this.letters = split.chars;

    // Chaque lettre retient son texte d'origine, pour se reformer après le brouillage
    for (let i = 0; i < this.letters.length; i++) {
      const letter = this.letters[i];
      letter.dataset.content = letter.textContent;
    }

    if (this.options.once) {
      this.trigger.addEventListener(
        'pointerenter',
        this.scrambleAll.bind(this),
      );
    } else {
      this.trigger.addEventListener('pointermove', this.onMove.bind(this));
    }

    if (this.options.intro) this.playIntro();
  }

  // Intro : attend que le texte soit à l'écran (sinon le brouillage se joue sans qu'on le voie)
  playIntro() {
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect(); // une seule fois
      this.scrambleAll();
    });
    observer.observe(this.element);
  }

  // Brouille toutes les lettres d'un coup
  scrambleAll() {
    for (let i = 0; i < this.letters.length; i++) {
      this.scramble(this.letters[i], 0);
    }
  }

  onMove(event) {
    const now = performance.now();
    if (now - this.lastScramble < this.options.interval * 100) return;
    this.lastScramble = now;

    for (let i = 0; i < this.letters.length; i++) {
      const letter = this.letters[i];

      // Distance entre le curseur et le centre de la lettre
      const rect = letter.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);

      if (distance < this.options.radius) {
        this.scramble(letter, distance);
      }
    }
  }

  // Brouille la lettre : plus elle est proche du curseur, plus le brouillage dure
  scramble(letter, distance) {
    gsap.to(letter, {
      overwrite: true,
      duration: this.options.duration * (1 - distance / this.options.radius),
      scrambleText: {
        text: letter.dataset.content,
        chars: this.options.chars,
        speed: this.options.speed,
      },
      ease: 'none',
    });
  }

  setOptions() {
    if (this.element.dataset.radius) {
      this.options.radius = Number(this.element.dataset.radius);
    }

    if (this.element.dataset.duration) {
      this.options.duration = Number(this.element.dataset.duration);
    }

    if (this.element.dataset.speed) {
      this.options.speed = Number(this.element.dataset.speed);
    }

    if (this.element.dataset.chars) {
      this.options.chars = this.element.dataset.chars;
    }

    if (this.element.dataset.interval) {
      this.options.interval = Number(this.element.dataset.interval);
    }

    if ('once' in this.element.dataset) {
      this.options.once = this.element.dataset.once !== 'false';
    }

    if ('intro' in this.element.dataset) {
      this.options.intro = this.element.dataset.intro !== 'false';
    }
  }
}
