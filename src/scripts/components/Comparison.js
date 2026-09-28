export default class Comparison {
  constructor(element) {
    this.element = element;
    this.options = {
      position: 25,
    };
    this.isDragging = false;

    this.init();
  }

  init() {
    this.setOptions();
    this.setPosition(this.options.position);

    this.element.addEventListener('pointerdown', this.onDown.bind(this));
    window.addEventListener('pointermove', this.onMove.bind(this));
    window.addEventListener('pointerup', this.onUp.bind(this));
  }

  onDown(event) {
    this.isDragging = true;
    this.move(event);
  }

  onMove(event) {
    if (!this.isDragging) return;
    this.move(event);
  }

  onUp() {
    this.isDragging = false;
  }

  move(event) {
    const rect = this.element.getBoundingClientRect();
    console.log(rect);
    const x = event.clientX - rect.left;
    const percent = (x / rect.width) * 100;

    this.setPosition(Math.min(100, Math.max(0, percent)));
  }

  setPosition(percent) {
    this.element.style.setProperty('--position', percent + '%');
  }

  setOptions() {
    if ('position' in this.element.dataset) {
      this.options.position = Number(this.element.dataset.position);
    }
  }
}
