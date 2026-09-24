export default class Accordion {
  constructor(element) {
    this.element = element;
    this.options = {
      singleOpen: false,
      forceOpen: false,
    };

    this.init();
  }

  init() {
    this.setOptions();
    const items = this.element.querySelectorAll('.accordion-item');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const title = item.querySelector('.accordion-title');
      if (!title) continue; // ignore cet item et passe au suivant

      title.addEventListener('click', () => this.click(title));
    }
  }

  click(title) {
    const isOpen = title.classList.contains('is-open');

    if (this.options.singleOpen && this.options.forceOpen && isOpen) return;

    if (this.options.singleOpen) this.closeAll();
    title.classList.toggle('is-open');
  }

  closeAll() {
    const titles = this.element.querySelectorAll('.accordion-title');
    for (let i = 0; i < titles.length; i++) {
      const title = titles[i];
      title.classList.remove('is-open');
    }
  }

  setOptions() {
    if ('singleOpen' in this.element.dataset) {
      this.options.singleOpen = true;
    }

    if ('forceOpen' in this.element.dataset) {
      this.options.forceOpen = true;
    }
  }
}
