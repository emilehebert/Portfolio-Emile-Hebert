import { gsap } from 'gsap';

/*
 * TargetCursor — remplace le curseur par un point qui s'accroche aux coins
 * des éléments .cursor-target au survol, avec une légère rotation au repos.
 * (Adapté de React Bits « TargetCursor ».)
 *
 * Utilisation :
 *   <body data-component="TargetCursor">
 *
 *   <button class="cursor-target">...</button>
 *
 * Désactivé automatiquement sur mobile/tactile (petit écran + appareil tactile).
 *
 * Les options ci-dessous s'appliquent au curseur en entier (il n'y en a qu'un).
 * Elles se changent avec un data-attribut sur l'élément data-component (voir setOptions) :
 *   data-target-selector=".button"        data-spin-duration="2"
 *   data-hide-default-cursor="false"      data-hover-duration="0.2"
 *   data-parallax="0.05"                  data-cursor-color="--color-primary"
 *   data-cursor-color-on-target="#fff"
 */
export default class TargetCursor {
  constructor(element) {
    this.element = element;
    this.options = {
      targetSelector: '.cursor-target',
      spinDuration: 2, // durée d'un tour complet au repos, en secondes
      hideDefaultCursor: true,
      hoverDuration: 0.2, // durée de l'accroche sur une cible, en secondes

      // Durée (en secondes) du petit retard des coins quand ils suivent la
      // cible une fois accrochés. 0 = aucun effet, coins rivés à la cible.
      // Plus haut = effet plus prononcé (ex. 0.2 = assez marqué, 0.05 = subtil).
      parallax: 0.1,

      // Couleurs : une variable de colors.scss ('--color-...') ou un hex ('#ffffff')
      cursorColor: '--color-white',
      cursorColorOnTarget: '--color-primary', // vide = pas de changement de couleur pendant l'accroche
    };
    this.constants = { borderWidth: 3, cornerSize: 12 };

    this.cursor = null;
    this.dot = null;
    this.corners = null;
    this.spinTl = null;
    this.containingBlock = null;

    this.activeTarget = null;
    this.resumeTimeout = null;
    this.targetCornerPositions = null;
    this.activeStrength = { current: 0 };
    this.tickerFn = this.onTick.bind(this);
    this.onTargetLeaveBound = this.onTargetLeave.bind(this);

    this.init();
  }

  init() {
    if (this.isMobile()) return;

    this.setOptions();
    this.setColors();
    this.build();
    this.bindEvents();
  }

  isMobile() {
    const hasTouchScreen =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const mobileRegex =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;

    return (
      (hasTouchScreen && isSmallScreen) ||
      mobileRegex.test(userAgent.toLowerCase())
    );
  }

  // Options changeables par data-attribut. Un data-attribut absent est ignoré.
  setOptions() {
    if (this.element.dataset.targetSelector) {
      this.options.targetSelector = this.element.dataset.targetSelector;
    }

    if (this.element.dataset.spinDuration) {
      this.options.spinDuration = Number(this.element.dataset.spinDuration);
    }

    if (this.element.dataset.hideDefaultCursor === 'false') {
      this.options.hideDefaultCursor = false;
    }

    if (this.element.dataset.hoverDuration) {
      this.options.hoverDuration = Number(this.element.dataset.hoverDuration);
    }

    if (this.element.dataset.parallax) {
      this.options.parallax = Number(this.element.dataset.parallax);
    }

    if (this.element.dataset.cursorColor) {
      this.options.cursorColor = this.element.dataset.cursorColor;
    }

    if (this.element.dataset.cursorColorOnTarget) {
      this.options.cursorColorOnTarget =
        this.element.dataset.cursorColorOnTarget;
    }
  }

  setColors() {
    this.options.cursorColor = this.getColor(this.options.cursorColor);

    if (this.options.cursorColorOnTarget) {
      this.options.cursorColorOnTarget = this.getColor(
        this.options.cursorColorOnTarget,
      );
    }
  }

  // '--color-primary' → la couleur de cette variable CSS | un hex reste tel quel
  getColor(color) {
    if (!color.startsWith('--')) return color;
    return getComputedStyle(document.documentElement)
      .getPropertyValue(color)
      .trim();
  }

  build() {
    this.cursor = document.createElement('div');
    this.cursor.className = 'target-cursor';

    this.dot = document.createElement('div');
    this.dot.className = 'target-cursor__dot';
    this.dot.style.backgroundColor = this.options.cursorColor;
    this.cursor.appendChild(this.dot);

    ['tl', 'tr', 'br', 'bl'].forEach((corner) => {
      const cornerEl = document.createElement('div');
      cornerEl.className = `target-cursor__corner target-cursor__corner--${corner}`;
      cornerEl.style.borderColor = this.options.cursorColor;
      this.cursor.appendChild(cornerEl);
    });

    // document.body plutôt que this.element : TargetCursor s'utilise sur <body>,
    // mais un autre élément data-component pourrait aussi le porter.
    document.body.appendChild(this.cursor);
    this.corners = this.cursor.querySelectorAll('.target-cursor__corner');

    if (this.options.hideDefaultCursor) {
      document.body.style.cursor = 'none';
    }

    this.containingBlock = this.getContainingBlock(this.cursor);
    const offset = this.getContainingBlockOffset();

    gsap.set(this.cursor, {
      xPercent: -50,
      yPercent: -50,
      x: window.innerWidth / 2 - offset.x,
      y: window.innerHeight / 2 - offset.y,
    });

    this.createSpinTimeline();
  }

  // Un position: fixed se positionne par rapport au viewport, SAUF si un
  // ancêtre crée un « containing block » (transform, perspective, filter,
  // will-change de ceux-ci, ou contain). Le déplacement du curseur ne
  // correspondrait alors plus aux coordonnées du viewport : on compense.
  getContainingBlock(element) {
    let node = element.parentElement;
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if (
        style.transform !== 'none' ||
        style.perspective !== 'none' ||
        style.filter !== 'none' ||
        style.willChange.includes('transform') ||
        style.willChange.includes('perspective') ||
        style.willChange.includes('filter') ||
        /paint|layout|strict|content/.test(style.contain)
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  getContainingBlockOffset() {
    if (!this.containingBlock) return { x: 0, y: 0 };
    const rect = this.containingBlock.getBoundingClientRect();
    return {
      x: rect.left + this.containingBlock.clientLeft,
      y: rect.top + this.containingBlock.clientTop,
    };
  }

  // Coordonnées des 4 coins autour de la cible active, par rapport au curseur
  // (qui vit dans le containing block). Appelée au survol, puis à chaque image
  // (onTick) pour que les coins suivent la cible pendant qu'on scrolle.
  updateTargetCornerPositions(target) {
    const rect = target.getBoundingClientRect();
    const { borderWidth, cornerSize } = this.constants;
    const offset = this.getContainingBlockOffset();

    this.targetCornerPositions = [
      {
        x: rect.left - borderWidth - offset.x,
        y: rect.top - borderWidth - offset.y,
      },
      {
        x: rect.right + borderWidth - cornerSize - offset.x,
        y: rect.top - borderWidth - offset.y,
      },
      {
        x: rect.right + borderWidth - cornerSize - offset.x,
        y: rect.bottom + borderWidth - cornerSize - offset.y,
      },
      {
        x: rect.left - borderWidth - offset.x,
        y: rect.bottom + borderWidth - cornerSize - offset.y,
      },
    ];
  }

  createSpinTimeline() {
    if (this.spinTl) this.spinTl.kill();
    this.spinTl = gsap.timeline({ repeat: -1 }).to(this.cursor, {
      rotation: '+=360',
      duration: this.options.spinDuration,
      ease: 'none',
    });
  }

  bindEvents() {
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('mouseover', this.onMouseOver.bind(this), {
      passive: true,
    });
    window.addEventListener('scroll', this.onScroll.bind(this), {
      passive: true,
    });
    window.addEventListener('resize', this.onResize.bind(this));
    window.addEventListener('mousedown', this.onMouseDown.bind(this));
    window.addEventListener('mouseup', this.onMouseUp.bind(this));
  }

  onMouseMove(e) {
    const offset = this.getContainingBlockOffset();
    gsap.to(this.cursor, {
      x: e.clientX - offset.x,
      y: e.clientY - offset.y,
      duration: 0.1,
      ease: 'power3.out',
    });
  }

  onResize() {
    this.containingBlock = this.getContainingBlock(this.cursor);
  }

  onScroll() {
    if (!this.activeTarget) return;

    const offset = this.getContainingBlockOffset();
    const mouseX = gsap.getProperty(this.cursor, 'x') + offset.x;
    const mouseY = gsap.getProperty(this.cursor, 'y') + offset.y;
    const elementUnderMouse = document.elementFromPoint(mouseX, mouseY);
    const isStillOverTarget =
      elementUnderMouse &&
      (elementUnderMouse === this.activeTarget ||
        elementUnderMouse.closest(this.options.targetSelector) ===
          this.activeTarget);

    if (!isStillOverTarget) {
      this.onTargetLeave();
    }
  }

  onMouseDown() {
    gsap.to(this.dot, { scale: 0.7, duration: 0.3 });
    gsap.to(this.cursor, { scale: 0.9, duration: 0.2 });
  }

  onMouseUp() {
    gsap.to(this.dot, { scale: 1, duration: 0.3 });
    gsap.to(this.cursor, { scale: 1, duration: 0.2 });
  }

  // Tourné par gsap.ticker pendant qu'une cible est accrochée : déplace les
  // coins progressivement vers elle (activeStrength monte de 0 à 1).
  onTick() {
    if (!this.targetCornerPositions) return;

    // Avec ScrollSmoother, la cible bouge encore après l'événement scroll :
    // on relit sa position à chaque image pour que les coins la suivent.
    this.updateTargetCornerPositions(this.activeTarget);

    const strength = this.activeStrength.current;
    if (strength === 0) return;

    const cursorX = gsap.getProperty(this.cursor, 'x');
    const cursorY = gsap.getProperty(this.cursor, 'y');

    Array.from(this.corners).forEach((corner, i) => {
      const currentX = gsap.getProperty(corner, 'x');
      const currentY = gsap.getProperty(corner, 'y');

      const targetX = this.targetCornerPositions[i].x - cursorX;
      const targetY = this.targetCornerPositions[i].y - cursorY;

      const finalX = currentX + (targetX - currentX) * strength;
      const finalY = currentY + (targetY - currentY) * strength;

      // Une fois complètement accroché (strength ~1), les coins continuent
      // de suivre la cible avec ce léger retard (this.options.parallax).
      const duration = strength >= 0.99 ? this.options.parallax : 0.05;

      gsap.to(corner, {
        x: finalX,
        y: finalY,
        duration: duration,
        ease: duration === 0 ? 'none' : 'power1.out',
        overwrite: 'auto',
      });
    });
  }

  onMouseOver(e) {
    let target = null;
    let current = e.target;
    while (current && current !== document.body) {
      if (current.matches(this.options.targetSelector)) {
        target = current;
        break;
      }
      current = current.parentElement;
    }

    if (!target || this.activeTarget === target) return;

    if (this.activeTarget) {
      this.cleanupTarget(this.activeTarget);
    }

    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout);
      this.resumeTimeout = null;
    }

    this.activeTarget = target;

    const corners = Array.from(this.corners);
    corners.forEach((corner) => gsap.killTweensOf(corner, 'x,y'));

    gsap.killTweensOf(this.cursor, 'rotation');
    this.spinTl.pause();
    gsap.set(this.cursor, { rotation: 0 });

    if (this.options.cursorColorOnTarget) {
      gsap.to(corners, {
        borderColor: this.options.cursorColorOnTarget,
        duration: 0.15,
        ease: 'power2.out',
      });
      gsap.to(this.dot, {
        backgroundColor: this.options.cursorColorOnTarget,
        duration: 0.15,
        ease: 'power2.out',
      });
    }

    this.updateTargetCornerPositions(target);

    const cursorX = gsap.getProperty(this.cursor, 'x');
    const cursorY = gsap.getProperty(this.cursor, 'y');

    gsap.ticker.add(this.tickerFn);

    gsap.to(this.activeStrength, {
      current: 1,
      duration: this.options.hoverDuration,
      ease: 'power2.out',
    });

    corners.forEach((corner, i) => {
      gsap.to(corner, {
        x: this.targetCornerPositions[i].x - cursorX,
        y: this.targetCornerPositions[i].y - cursorY,
        duration: 0.2,
        ease: 'power2.out',
      });
    });

    target.addEventListener('mouseleave', this.onTargetLeaveBound);
  }

  onTargetLeave() {
    gsap.ticker.remove(this.tickerFn);

    const target = this.activeTarget;
    this.targetCornerPositions = null;
    gsap.set(this.activeStrength, { current: 0, overwrite: true });
    this.activeTarget = null;

    if (this.options.cursorColorOnTarget) {
      gsap.to(Array.from(this.corners), {
        borderColor: this.options.cursorColor,
        duration: 0.15,
        ease: 'power2.out',
      });
      gsap.to(this.dot, {
        backgroundColor: this.options.cursorColor,
        duration: 0.15,
        ease: 'power2.out',
      });
    }

    const corners = Array.from(this.corners);
    gsap.killTweensOf(corners, 'x,y');

    const { cornerSize } = this.constants;
    const positions = [
      { x: -cornerSize * 1.5, y: -cornerSize * 1.5 },
      { x: cornerSize * 0.5, y: -cornerSize * 1.5 },
      { x: cornerSize * 0.5, y: cornerSize * 0.5 },
      { x: -cornerSize * 1.5, y: cornerSize * 0.5 },
    ];
    const tl = gsap.timeline();
    corners.forEach((corner, index) => {
      tl.to(
        corner,
        {
          x: positions[index].x,
          y: positions[index].y,
          duration: 0.3,
          ease: 'power3.out',
        },
        0,
      );
    });

    this.resumeTimeout = setTimeout(() => {
      if (!this.activeTarget) {
        const currentRotation = gsap.getProperty(this.cursor, 'rotation');
        const normalizedRotation = currentRotation % 360;
        this.spinTl.kill();
        this.spinTl = gsap.timeline({ repeat: -1 }).to(this.cursor, {
          rotation: '+=360',
          duration: this.options.spinDuration,
          ease: 'none',
        });
        gsap.to(this.cursor, {
          rotation: normalizedRotation + 360,
          duration: this.options.spinDuration * (1 - normalizedRotation / 360),
          ease: 'none',
          onComplete: () => this.spinTl.restart(),
        });
      }
      this.resumeTimeout = null;
    }, 50);

    if (target) {
      this.cleanupTarget(target);
    }
  }

  cleanupTarget(target) {
    target.removeEventListener('mouseleave', this.onTargetLeaveBound);
  }
}
