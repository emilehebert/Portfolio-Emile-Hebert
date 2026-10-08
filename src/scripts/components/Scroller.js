import { gsap } from 'gsap';

import { ScrollSmoother } from 'gsap/ScrollSmoother.js';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export default class Scroller {
  constructor(element) {
    gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

    console.log('Scroller component initialized');
    this.element = element;
    this.init();
  }
  init() {
    const scroller = new ScrollSmoother.create({
      smooth: 1,
      effects: true,
      smoothTouch: 0.1,
      ease: 'expo.out',
    });
  }
}
