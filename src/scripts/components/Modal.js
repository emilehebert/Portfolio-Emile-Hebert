import { ScrollSmoother } from 'gsap/ScrollSmoother';

// Modale : s'ouvre avec les éléments qui ont data-modal="id-de-la-modale"
export default class Modal {
  constructor(element) {
    this.element = element;

    this.buttons = document.querySelectorAll(
      `[data-modal="${this.element.id}"]`,
    );
    this.closeButton = this.element.querySelector('.js-close');

    this.init();
  }

  init() {
    for (let i = 0; i < this.buttons.length; i++) {
      this.buttons[i].addEventListener('click', this.open.bind(this));
    }

    this.closeButton.addEventListener('click', this.close.bind(this));
    this.element.addEventListener('click', this.onClickOutside.bind(this));
  }

  open(event) {
    event.preventDefault();
    this.element.classList.add('is-open');
    this.pauseScroll(true);
  }

  close() {
    this.element.classList.remove('is-open');
    this.pauseScroll(false);
  }

  // Ferme si on clique à côté de la fenêtre
  onClickOutside(event) {
    if (event.target === this.element) {
      this.close();
    }
  }

  // Bloque le défilement de la page derrière la modale
  pauseScroll(paused) {
    const smoother = ScrollSmoother.get();

    if (smoother) {
      smoother.paused(paused);
    }
  }
}
