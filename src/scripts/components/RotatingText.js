import { gsap } from 'gsap';

// Texte qui change de mot en boucle, lettre par lettre
// <span class="rotating-text" data-component="RotatingText" data-words="3D|interactif|vidéo">3D</span>
export default class RotatingText {
  constructor(element) {
    this.element = element;
    this.options = {
      words: [],
      separator: '|', // sépare les mots dans data-words
      interval: 2, // temps où chaque mot reste affiché, en secondes
      loop: true, // false = s'arrête au dernier mot
      split: 'words', // ce qui s'anime un par un : 'letters' ou 'words'
      stagger: 0.02,

      exitDuration: 0.2,
      exitEase: 'expo.in', // accélère et claque
      exitY: -120,

      enterDuration: 0.35,
      enterEase: 'back.out(2.5)', // dépasse puis revient
      enterY: 100,

      resizeDuration: 0.25,
      resizeEase: 'expo.out', // arrêt sec
    };
    this.index = 0;
    this.srText = null;
    this.visual = null;

    this.init();
  }

  init() {
    this.setOptions();
    if (this.options.words.length === 0) return;

    this.build();
    this.render(this.options.words[0]);
    this.wait();
  }

  setOptions() {
    if (this.element.dataset.separator) {
      this.options.separator = this.element.dataset.separator;
    }

    if (this.element.dataset.words) {
      this.options.words = this.element.dataset.words.split(
        this.options.separator,
      );
    }

    if (this.element.dataset.interval) {
      this.options.interval = Number(this.element.dataset.interval);
    }

    if (this.element.dataset.loop === 'false') {
      this.options.loop = false;
    }

    if (this.element.dataset.split) {
      this.options.split = this.element.dataset.split;
    }

    if (this.element.dataset.stagger) {
      this.options.stagger = Number(this.element.dataset.stagger);
    }

    if (this.element.dataset.staggerFrom) {
      this.options.staggerFrom = this.element.dataset.staggerFrom;
    }

    if (this.element.dataset.exitDuration) {
      this.options.exitDuration = Number(this.element.dataset.exitDuration);
    }

    if (this.element.dataset.exitEase) {
      this.options.exitEase = this.element.dataset.exitEase;
    }

    if (this.element.dataset.exitY) {
      this.options.exitY = Number(this.element.dataset.exitY);
    }

    if (this.element.dataset.enterDuration) {
      this.options.enterDuration = Number(this.element.dataset.enterDuration);
    }

    if (this.element.dataset.enterEase) {
      this.options.enterEase = this.element.dataset.enterEase;
    }

    if (this.element.dataset.enterY) {
      this.options.enterY = Number(this.element.dataset.enterY);
    }

    if (this.element.dataset.resizeDuration) {
      this.options.resizeDuration = Number(this.element.dataset.resizeDuration);
    }

    if (this.element.dataset.resizeEase) {
      this.options.resizeEase = this.element.dataset.resizeEase;
    }
  }

  // Un texte pour les lecteurs d'écran + un texte animé caché pour eux
  build() {
    this.element.textContent = '';

    this.srText = document.createElement('span');
    this.srText.className = 'rotating-text__sr';

    this.visual = document.createElement('span');
    this.visual.className = 'rotating-text__visual';
    this.visual.setAttribute('aria-hidden', 'true');

    this.element.append(this.srText, this.visual);
  }

  // Découpe le mot en <span> : une par lettre (ou par mot)
  render(word) {
    this.srText.textContent = word;
    this.visual.innerHTML = '';

    const pieces =
      this.options.split === 'words' ? word.split(/( )/) : Array.from(word);

    for (let i = 0; i < pieces.length; i++) {
      const span = document.createElement('span');
      span.className = 'rotating-text__piece';
      span.textContent = pieces[i] === ' ' ? ' ' : pieces[i];
      this.visual.append(span);
    }

    return this.visual.children;
  }

  // Attend avant le prochain mot (sauf au dernier mot sans boucle)
  wait() {
    const isLast = this.index === this.options.words.length - 1;

    if (this.options.words.length > 1 && (this.options.loop || !isLast)) {
      gsap.delayedCall(this.options.interval, this.next.bind(this));
    }
  }

  // Les lettres du mot actuel sortent
  next() {
    this.index = (this.index + 1) % this.options.words.length;

    gsap.to(this.visual.children, {
      yPercent: this.options.exitY,
      duration: this.options.exitDuration,
      ease: this.options.exitEase,
      stagger: { each: this.options.stagger, from: this.options.staggerFrom },
      onComplete: this.enter.bind(this),
    });
  }

  // Le nouveau mot entre et la boîte prend sa largeur
  enter() {
    const startWidth = this.element.offsetWidth;
    const pieces = this.render(this.options.words[this.index]);
    const endWidth = this.element.offsetWidth;

    gsap.fromTo(
      this.element,
      { width: startWidth },
      {
        width: endWidth,
        duration: this.options.resizeDuration,
        ease: this.options.resizeEase,
        clearProps: 'width',
      },
    );

    gsap.from(pieces, {
      yPercent: this.options.enterY,
      duration: this.options.enterDuration,
      ease: this.options.enterEase,
      stagger: { each: this.options.stagger, from: this.options.staggerFrom },
      onComplete: this.wait.bind(this),
    });
  }
}
