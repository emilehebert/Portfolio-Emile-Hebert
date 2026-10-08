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
      effects: true, // active les data-speed
      smoothTouch: 0.1,
      ease: 'expo.out',
    };
    this.smoother = null;

    this.init();
  }

  init() {
    this.moveFixedElements();
    this.smoother = ScrollSmoother.create(this.options);
    this.initAnchors();
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

    this.smoother.scrollTo(target, true, 'top top');
  }

  onLoad() {
    const target = this.getTarget(window.location.hash);

    if (target) {
      this.smoother.scrollTo(target, false, 'top top');
    }
  }

  // Arrive après le saut du navigateur : on le remplace par le nôtre
  onHashChange() {
    const target = this.getTarget(window.location.hash);

    if (this.element.scrollTop !== 0) {
      this.element.scrollTop = 0;
    }

    this.smoother.scrollTo(target || 0, true, 'top top');
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
