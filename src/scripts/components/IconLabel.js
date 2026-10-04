import ScrambledText from './ScrambledText.js';

/*
 * IconLabel — affiche le nom de chaque icône au survol, avec l'effet ScrambledText.
 * Le nom vient du aria-label du lien, pas besoin de l'écrire dans le HTML.
 *
 * Utilisation :
 *   <div class="list-icons" data-component="IconLabel">
 *       <a href="..." class="logo--link" aria-label="GitHub">...</a>
 *   </div>
 */
export default class IconLabel {
  constructor(element) {
    this.element = element;

    this.init();
  }

  init() {
    const links = this.element.querySelectorAll('.logo--link');

    for (let i = 0; i < links.length; i++) {
      this.createLabel(links[i]);
    }
  }

  // Ajoute <span class="logo--label">GitHub</span> dans le lien, puis l'anime
  createLabel(link) {
    const label = document.createElement('span');
    label.classList.add('logo--label');
    label.textContent = link.getAttribute('aria-label');
    label.setAttribute('aria-hidden', 'true'); // le nom est déjà lu grâce au aria-label du lien
    link.appendChild(label);

    // Le label se brouille quand on survole l'icône
    new ScrambledText(label, link);
  }
}
