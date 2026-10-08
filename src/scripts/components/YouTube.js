// Vidéo YouTube : démarre quand elle apparaît (modale ouverte), pause quand elle disparaît
// Options en data-attributs : data-autoplay="false", data-restart="false", data-mute="true",
// data-loop="true", data-controls="false", data-fullscreen="false", data-color="white"
export default class YouTube {
  constructor(element) {
    this.element = element;
    this.options = {
      autoplay: true, // joue dès l'ouverture
      restart: true, // recommence au début à chaque ouverture
      mute: false, // son coupé
      loop: false, // recommence à la fin
      controls: true, // barre de contrôle YouTube
      fullscreen: true, // bouton plein écran
      color: '--color-primary', // barre de progression : 'red' ou 'white'
    };

    this.videoContainer = this.element.querySelector('.js-video');
    this.videoId = this.element.dataset.videoId;
    this.player = null;

    this.setOptions();
    YouTube.instances.push(this);

    if (this.videoId) {
      YouTube.loadScript();
    } else {
      console.error('Vous devez spécifier un id');
    }
  }

  setOptions() {
    if (this.element.dataset.autoplay === 'false') {
      this.options.autoplay = false;
    }

    if (this.element.dataset.restart === 'false') {
      this.options.restart = false;
    }

    if (this.element.dataset.mute === 'true') {
      this.options.mute = true;
    }

    if (this.element.dataset.loop === 'true') {
      this.options.loop = true;
    }

    if (this.element.dataset.controls === 'false') {
      this.options.controls = false;
    }

    if (this.element.dataset.fullscreen === 'false') {
      this.options.fullscreen = false;
    }

    if (this.element.dataset.color) {
      this.options.color = this.element.dataset.color;
    }
  }

  static loadScript() {
    if (!YouTube.scriptIsLoading) {
      YouTube.scriptIsLoading = true;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(script);
    }
  }

  init() {
    this.player = new YT.Player(this.videoContainer, {
      height: '100%',
      width: '100%',
      videoId: this.videoId,
      playerVars: {
        rel: 0,
        controls: this.options.controls ? 1 : 0,
        fs: this.options.fullscreen ? 1 : 0,
        color: this.options.color,
      },
      events: {
        onReady: () => {
          if (this.options.mute) {
            this.player.mute();
          }

          const observer = new IntersectionObserver(this.watch.bind(this));
          observer.observe(this.element);
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.ENDED && this.options.loop) {
            this.player.seekTo(0);
          }
        },
      },
    });
  }

  watch(entries) {
    if (entries[0].isIntersecting) {
      this.show();
    } else {
      this.player.pauseVideo();
    }
  }

  show() {
    if (this.options.restart && this.options.autoplay) {
      this.player.loadVideoById(this.videoId); // au début, et joue
    } else if (this.options.restart) {
      this.player.cueVideoById(this.videoId); // au début, en attente
    } else if (this.options.autoplay) {
      this.player.playVideo(); // reprend où elle était
    }
  }

  static initAll() {
    for (let i = 0; i < YouTube.instances.length; i++) {
      const instance = YouTube.instances[i];
      instance.init();
    }
  }
}

YouTube.instances = [];
window.onYouTubeIframeAPIReady = YouTube.initAll;
