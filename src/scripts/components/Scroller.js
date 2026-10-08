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
  }

  // Les éléments fixed doivent être hors du wrapper pour rester fixes
  moveFixedElements() {
    const fixedElements = document.querySelectorAll('.js-fixed');

    for (let i = 0; i < fixedElements.length; i++) {
      this.element.before(fixedElements[i]);
    }
  }
}
