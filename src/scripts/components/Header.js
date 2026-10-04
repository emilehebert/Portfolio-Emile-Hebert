export default class Header {
  constructor(element) {
    this.element = element;
    this.options = {
      threshold: 0,
      alwaysShow: false,
    };
    this.scrollPosition = 0;
    this.lastScrollPosition = 0;
    this.html = document.documentElement;

    this.init();
    this.initNavMobile();
  }

  init() {
    this.setOptions();

    window.addEventListener('scroll', this.onScroll.bind(this));
  }

  setOptions() {
    if ('threshold' in this.element.dataset) {
      this.options.threshold = 0.1;
    }

    // data-always-show devient « alwaysShow » dans dataset (camelCase)
    if ('alwaysShow' in this.element.dataset) {
      this.options.alwaysShow = true;
    }
  }

  onScroll() {
    this.lastScrollPosition = this.scrollPosition;
    this.scrollPosition = document.scrollingElement.scrollTop;

    if (!this.options.alwaysShow) {
      this.setHeaderState();
    }
    this.setDirections();
  }

  setHeaderState() {
    if (
      this.scrollPosition >
      document.scrollingElement.scrollHeight * this.options.threshold
    ) {
      this.html.classList.add('header-is-hidden');
    } else {
      this.html.classList.remove('header-is-hidden');
    }
  }

  setDirections() {
    if (this.scrollPosition >= this.lastScrollPosition) {
      this.html.classList.add('is-scrolling-down');
      this.html.classList.remove('is-scrolling-up');
    } else {
      this.html.classList.add('is-scrolling-up');
      this.html.classList.remove('is-scrolling-down');
    }
  }

  initNavMobile() {
    const toggles = this.element.querySelectorAll('.js-toggle');
    for (let i = 0; i < toggles.length; i++) {
      toggles[i].addEventListener('click', this.onToggleNav.bind(this));
    }

    // Ferme le menu quand on clique un lien (ex: ancre sur la même page)
    const links = this.element.querySelectorAll('nav a');
    for (let i = 0; i < links.length; i++) {
      links[i].addEventListener('click', this.closeNav.bind(this));
    }
  }

  onToggleNav() {
    this.html.classList.toggle('nav-is-active');
  }

  closeNav() {
    this.html.classList.remove('nav-is-active');
  }
}
