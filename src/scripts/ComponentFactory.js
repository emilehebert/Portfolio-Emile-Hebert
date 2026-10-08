import Accordion from './components/Accordion.js';
import Comparison from './components/Comparison.js';
import DitherVeil from './components/DitherVeil.js';
import Header from './components/Header.js';
import IconLabel from './components/IconLabel.js';
import ScrambledText from './components/ScrambledText.js';
import Scroller from './components/Scroller.js';
import TargetCursor from './components/TargetCursor.js';
import YouTube from './components/YouTube.js';
import Modal from './components/Modal.js';

export default class ComponentFactory {
  constructor() {
    this.componentInstances = [];
    this.componentList = {
      Accordion,
      Comparison,
      DitherVeil,
      Header,
      IconLabel,
      ScrambledText,
      Scroller,
      TargetCursor,
      YouTube,
      Modal,
    };
    this.init();
  }
  init() {
    const components = document.querySelectorAll('[data-component]');

    for (let i = 0; i < components.length; i++) {
      const element = components[i];
      const componentName = element.dataset.component;

      if (this.componentList[componentName]) {
        const instance = new this.componentList[componentName](element);
        this.componentInstances.push(instance);
      } else {
        console.log(`La composante ${componentName} n'existe pas`);
      }
    }
  }
}
