import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

// Smooth scroll de toute la page (sur #smooth-wrapper)
export default class Scroller {
  constructor(element) {
    this.element = element;
    this.options = {
      smooth: 1, // durée du rattrapage, en secondes
      effects: true, // active les data-speed et data-lag
      smoothTouch: 0.1, // au doigt : léger lissage, synchronisé avec les data-lag (pas de jitter)
      ease: 'expo.out',
    };
    this.arrivalDuration = 1.2; // descente à l'arrivée depuis une autre page, en secondes
    this.smoother = null;

    this.init();
  }

  init() {
    this.moveFixedElements();
    this.smoother = ScrollSmoother.create(this.options);
    this.initAnchors();
    this.initLoadGuard();
  }

  // Au chargement (Précédent, rechargement), la page doit être directement à sa place.
  // Si la page est lente à ce moment-là, ScrollSmoother pouvait repartir de 0 et glisser
  // jusqu'à la bonne position : c'était le « saut ». Tant que le visiteur n'a pas encore
  // touché au scroll (et au plus 3 s après le chargement), on le garde recalé.
  initLoadGuard() {
    this.keepInPlace = this.keepInPlace.bind(this);
    this.stopLoadGuard = this.stopLoadGuard.bind(this);
    gsap.ticker.add(this.keepInPlace);

    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    for (let i = 0; i < events.length; i++) {
      window.addEventListener(events[i], this.stopLoadGuard, {
        once: true,
        passive: true,
      });
    }
    window.addEventListener('load', () => setTimeout(this.stopLoadGuard, 3000));
  }

  keepInPlace() {
    if (Math.abs(this.smoother.scrollTop() - window.scrollY) > 1) {
      this.smoother.scrollTop(window.scrollY);
    }
  }

  stopLoadGuard() {
    gsap.ticker.remove(this.keepInPlace);
  }

  // Les éléments fixed doivent être hors du wrapper pour rester fixes
  moveFixedElements() {
    const fixedElements = document.querySelectorAll('.js-fixed');

    for (let i = 0; i < fixedElements.length; i++) {
      this.element.before(fixedElements[i]);
    }
  }

  // Les ancres passent par ScrollSmoother au lieu du saut du navigateur
  initAnchors() {
    const links = document.querySelectorAll('a[href*="#"]');

    for (let i = 0; i < links.length; i++) {
      links[i].addEventListener('click', this.onAnchorClick.bind(this));
    }

    // Arrivée depuis une autre page (ex. index.html#projets)
    window.addEventListener('load', this.onLoad.bind(this));

    // Précédent / Suivant entre les sections
    window.addEventListener('hashchange', this.onHashChange.bind(this));
  }

  onAnchorClick(e) {
    const link = e.currentTarget;
    const target = this.getTarget(link.hash);

    if (!target || !this.isSamePage(link)) return;

    e.preventDefault();

    // Met à jour l'URL (#about) sans le saut du navigateur
    if (window.location.hash !== link.hash) {
      history.pushState(null, '', link.hash);
    }

    this.scrollToTarget(target);
  }

  // Défilement animé jusqu'à une cible (un élément ou 0 pour le haut). Au doigt,
  // ScrollSmoother ne lisse pas le scroll : on demande au navigateur de le faire.
  scrollToTarget(target) {
    // ScrollTrigger.isTouch === 1 : appareil seulement tactile (même test que ScrollSmoother)
    if (ScrollTrigger.isTouch !== 1 || this.options.smoothTouch) {
      this.smoother.scrollTo(target, true, 'top top');
      return;
    }

    const top = target ? this.smoother.offset(target, 'top top') : 0;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }

  onLoad() {
    const target = this.getTarget(window.location.hash);

    if (!target) return;

    // Arrivée par un lien d'une autre page (ex. contact → Projets) :
    // on part du haut, puis on descend en douceur jusqu'à la section
    if (this.isLinkArrival()) {
      this.stopLoadGuard(); // le garde bloquerait l'animation
      this.element.scrollTop = 0; // annule le saut du navigateur
      this.smoother.scrollTop(0);

      // Vraie animation (départ et arrivée en douceur) : le rattrapage de
      // ScrollSmoother seul part trop vite sur une longue distance
      gsap.to(this.smoother, {
        scrollTop: this.smoother.offset(target, 'top top'),
        duration: this.arrivalDuration,
        ease: 'power2.inOut',
      });
      return;
    }

    // Rechargement ou Précédent / Suivant : directement à la section
    this.smoother.scrollTo(target, false, 'top top');
  }

  // true si on arrive par un lien (pas un rechargement, ni Précédent / Suivant)
  isLinkArrival() {
    const navigation = performance.getEntriesByType('navigation')[0];

    return navigation && navigation.type === 'navigate';
  }

  // Arrive après le saut du navigateur : on le remplace par le nôtre
  onHashChange() {
    const target = this.getTarget(window.location.hash);

    if (this.element.scrollTop !== 0) {
      this.element.scrollTop = 0;
    }

    this.scrollToTarget(target || 0);
  }

  // L'élément visé par un hash (#about), ou null
  getTarget(hash) {
    return hash ? document.getElementById(hash.slice(1)) : null;
  }

  // "/" et "/index.html" sont la même page
  isSamePage(link) {
    const clean = (path) => path.replace(/index\.html$/, '');

    return clean(link.pathname) === clean(window.location.pathname);
  }
}
