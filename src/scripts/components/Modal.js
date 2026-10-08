import { ScrollSmoother } from 'gsap/ScrollSmoother';

// Modale : s'ouvre avec les liens data-modal="id-de-la-modale"
export default class Modal {
  constructor(element) {
    this.element = element;
    this.videoId = this.element.dataset.videoId;

    this.links = document.querySelectorAll(`[data-modal="${this.element.id}"]`);
    this.closeLink = this.element.querySelector('.js-close');
    this.video = this.element.querySelector('.js-video');

    this.init();
  }

  init() {
    for (let i = 0; i < this.links.length; i++) {
      this.links[i].addEventListener('click', this.open.bind(this));
    }

    this.closeLink.addEventListener('click', this.close.bind(this));
    this.element.addEventListener('click', this.onClickOutside.bind(this));
  }

  open(event) {
    event.preventDefault();
    this.element.classList.add('is-open');
    ScrollSmoother.get().paused(true);

    // La vidéo YouTube démarre à l'ouverture
    if (this.videoId) {
      const src = `https://www.youtube.com/embed/${this.videoId}?autoplay=1&rel=0`;
      this.video.innerHTML = `<iframe src="${src}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
    }
  }

  close(event) {
    event.preventDefault();
    this.element.classList.remove('is-open');
    ScrollSmoother.get().paused(false);

    // Retirer la vidéo l'arrête
    if (this.videoId) {
      this.video.innerHTML = '';
    }
  }

  // Ferme si on clique à côté de la fenêtre
  onClickOutside(event) {
    if (event.target === this.element) {
      this.close(event);
    }
  }
}
