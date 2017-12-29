import videojs from 'video.js';
import window from 'global/window';
import document from 'global/document';
import {version as VERSION} from '../package.json';

// Default options for the plugin.
const defaults = {};

// Cross-compatibility for Video.js 5 and 6.
const registerPlugin = videojs.registerPlugin || videojs.plugin;

/**
 * VTT Thumbnails class.
 *
 * This class performs all functions related to displaying the vtt
 * thumbnails.
 */
class VttThumbnailsPlugin {

  /**
   * Plugin class constructor, called by videojs on
   * ready event.
   *
   * @function  constructor
   * @param    {Player} player
   *           A Video.js player object.
   *
   * @param    {Object} [options={}]
   *           A plain object containing options for the plugin.
   */
  constructor(player, options) {
    this.player = player;
    this.options = options;
    this.initializeThumbnails();
    return this;
  }

  src(source) {
    this.resetPlugin();
    this.options.src = source;
    this.initializeThumbnails();
  }

  detach() {
    this.resetPlugin();
  }

  resetPlugin() {
    this.progressBar.removeEventListener('mouseenter', () => {
      return this.onBarMouseEnter();
    });
    this.progressBar.removeEventListener('mouseleave', () => {
      return this.onBarMouseLeave();
    });
    this.progressBar.removeEventListener('mousemove', this.onBarMouseMove);
    delete this.progressBar;
    delete this.vttData;
    delete this.thumbnailHolder;
    delete this.lastStyle;
  }

  /**
   * Bootstrap the plugin.
   */
  initializeThumbnails() {
    if (!this.options.src) {
      return;
    }
    const baseUrl = this.getBaseUrl();
    const url = this.getFullyQualifiedUrl(this.options.src, baseUrl);

    this.getVttFile(url)
      .then((data) => {
        this.vttData = this.processVtt(data);
        this.setupThumbnailElement();
      });
  }

  /**
   * Builds a base URL should we require one.
   *
   * @return {string}
   *         The current browser base url
   */
  getBaseUrl() {
    return [
      window.location.protocol,
      '//',
      window.location.hostname,
      (window.location.port ? ':' + window.location.port : ''),
      window.location.pathname
    ].join('').split(/([^\/]*)$/gi).shift();
  }

  /**
   * Grabs the contents of the VTT file.
   *
   * @param {string} url
   *        The url of vtt file to load.
   * @return {Promise}
   *         Resolve with the vtt file content
   */
  getVttFile(url) {
    return new Promise((resolve, reject) => {
      videojs.xhr(url, (err, resp, body) => {
        if (err) {
          resolve(null);
        } else {
          resolve(body);
        }
      });
    });
  }

  setupThumbnailElement(data) {
    const mouseDisplay = this.player.$('.vjs-mouse-display');
    const thumbHolder = document.createElement('div');

    thumbHolder.setAttribute('class', 'vjs-vtt-thumbnail-display');

    this.progressBar = this.player.$('.vjs-progress-control');
    this.progressBar.appendChild(thumbHolder);
    this.thumbnailHolder = thumbHolder;
    mouseDisplay.classList.add('vjs-hidden');

    this.progressBar.addEventListener('mouseenter', () => {
      return this.onBarMouseEnter();
    });
    this.progressBar.addEventListener('mouseleave', () => {
      return this.onBarMouseLeave();
    });
  }

  onBarMouseEnter() {
    this.mouseMoveCallback = (e) => {
      this.onBarMouseMove(e);
    };
    this.progressBar.addEventListener('mousemove', this.mouseMoveCallback);
    this.showThumbnailHolder();
  }

  onBarMouseLeave() {
    this.progressBar.removeEventListener('mousemove', this.mouseMoveCallback);
    this.hideThumbnailHolder();
  }

  onBarMouseMove(event) {
    this.updateThumbnailStyle(
      videojs.dom.getPointerPosition(this.progressBar, event).x,
      this.progressBar.offsetWidth
    );
  }

  getStyleForTime(time) {
    for (let i = 0; i < this.vttData.length; ++i) {
      const item = this.vttData[i];

      if (time >= item.start && time < item.end) {
        return item.css;
      }
    }
  }

  showThumbnailHolder() {
    this.thumbnailHolder.style.opacity = '1';
  }

  hideThumbnailHolder() {
    this.thumbnailHolder.style.opacity = '0';
  }

  updateThumbnailStyle(percent, width) {
    const duration = this.player.duration();
    const time = percent * duration;
    const currentStyle = this.getStyleForTime(time);

    if (!currentStyle) {
      return this.hideThumbnailHolder();
    }
    const xPos = percent * width;

    this.thumbnailHolder.style.transform = 'translateX(' + xPos + 'px)';
    this.thumbnailHolder.style.marginLeft =
      '-' + (parseInt(currentStyle.width, 10) / 2) + 'px';

    if (this.lastStyle && this.lastStyle === currentStyle) {
      return;
    }
    this.lastStyle = currentStyle;

    for (const style in currentStyle) {
      if (currentStyle.hasOwnProperty(style)) {
        this.thumbnailHolder.style[style] = currentStyle[style];
      }
    }
  }

  processVtt(data) {
    const processedVtts = [];
    const vttDefinitions = data.split(/[\r\n][\r\n]/i);

    vttDefinitions.forEach((vttDef) => {
      if (vttDef.match(new RegExp('([0-9]{2}:)?([0-9]{2}:)?' +
          '[0-9]{2}(.[0-9]{3})?( ?--> ?)' +
          '([0-9]{2}:)?([0-9]{2}:)?' +
          '[0-9]{2}(.[0-9]{3})?[\r\n]{1}.*', 'gi'))) {
        const vttDefSplit = vttDef.split(/[\r\n]/i);
        const vttTiming = vttDefSplit[0];
        const vttTimingSplit = vttTiming.split(/ ?--> ?/i);
        const vttTimeStart = vttTimingSplit[0];
        const vttTimeEnd = vttTimingSplit[1];
        const vttImageDef = vttDefSplit[1];
        const vttCssDef = this.getVttCss(vttImageDef);

        processedVtts.push({
          start: this.getSecondsFromTimestamp(vttTimeStart),
          end: this.getSecondsFromTimestamp(vttTimeEnd),
          css: vttCssDef
        });

      }
    });
    return processedVtts;
  }

  getFullyQualifiedUrl(path, base) {
    if (path.indexOf('//') >= 0) {
      // We have a fully qualified path.
      return path;
    }
    if (base.indexOf('//') === 0) {
      // We don't have a fully qualified path, but need to
      // be careful with trimming.
      return [
        base.replace(/\/$/gi, ''),
        this.trim(path, '/')
      ].join('/');
    }
    if (base.indexOf('//') > 0) {
      // We don't have a fully qualified path, and should
      // trim both sides of base and path.
      return [
        this.trim(base, '/'),
        this.trim(path, '/')
      ].join('/');
    }

    // If all else fails.
    return path;
  }

  getPropsFromDef(def) {
    const imageDefSplit = def.split(/#xywh=/i);
    const imageUrl = imageDefSplit[0];
    const imageCoords = imageDefSplit[1];
    const splitCoords = imageCoords.match(/[0-9]+/gi);

    return {
      x: splitCoords[0],
      y: splitCoords[1],
      w: splitCoords[2],
      h: splitCoords[3],
      image: imageUrl
    };
  }

  getVttCss(vttImageDef) {

    const cssObj = {};

    // If there isn't a protocol, use the VTT source URL.
    let baseSplit;

    if (this.options.src.indexOf('//') >= 0) {
      baseSplit = this.options.src.split(/([^\/]*)$/gi).shift();
    } else {
      baseSplit = this.getBaseUrl() + this.options.src.split(/([^\/]*)$/gi).shift();
    }

    vttImageDef = this.getFullyQualifiedUrl(vttImageDef, baseSplit);

    if (!vttImageDef.match(/#xywh=/i)) {
      cssObj.background = 'url("' + vttImageDef + '")';
      return cssObj;
    }

    const imageProps = this.getPropsFromDef(vttImageDef);

    cssObj.background = 'url("' + imageProps.image +
      '") no-repeat -' + imageProps.x + 'px -' + imageProps.y + 'px';
    cssObj.width = imageProps.w + 'px';
    cssObj.height = imageProps.h + 'px';

    return cssObj;
  }

  doconstructTimestamp(timestamp) {
    const splitStampMilliseconds = timestamp.split('.');
    const timeParts = splitStampMilliseconds[0];
    const timePartsSplit = timeParts.split(':');

    return {
      milliseconds: parseInt(splitStampMilliseconds[1], 10) || 0,
      seconds: parseInt(timePartsSplit.pop(), 10) || 0,
      minutes: parseInt(timePartsSplit.pop(), 10) || 0,
      hours: parseInt(timePartsSplit.pop(), 10) || 0
    };

  }

  getSecondsFromTimestamp(timestamp) {
    const timestampParts = this.doconstructTimestamp(timestamp);

    return parseInt((timestampParts.hours * (60 * 60)) +
      (timestampParts.minutes * 60) +
      timestampParts.seconds +
      (timestampParts.milliseconds * 1000), 10);
  }

  trim(str, charlist) {
    let whitespace = [
      ' ',
      '\n',
      '\r',
      '\t',
      '\f',
      '\x0b',
      '\xa0',
      '\u2000',
      '\u2001',
      '\u2002',
      '\u2003',
      '\u2004',
      '\u2005',
      '\u2006',
      '\u2007',
      '\u2008',
      '\u2009',
      '\u200a',
      '\u200b',
      '\u2028',
      '\u2029',
      '\u3000'
    ].join('');

    let l = 0;
    let i = 0;

    str += '';
    if (charlist) {
      whitespace = (charlist + '').replace(/([[\]().?/*{}+$^:])/g, '$1');
    }

    for (i = 0, l = str.length; i < l; i++) {
      if (whitespace.indexOf(str.charAt(i)) === -1) {
        str = str.substring(i);
        break;
      }
    }
    l = str.length;
    for (i = l - 1; i >= 0; i--) {
      if (whitespace.indexOf(str.charAt(i)) === -1) {
        str = str.substring(0, i + 1);
        break;
      }
    }
    return whitespace.indexOf(str.charAt(0)) === -1 ? str : '';
  }

}

/**
 * Function to invoke when the player is ready.
 *
 * This is a great place for your plugin to initialize itself. When this
 * function is called, the player will have its DOM and child components
 * in place.
 *
 * @function onPlayerReady
 * @param    {Player} player
 *           A Video.js player object.
 *
 * @param    {Object} [options={}]
 *           A plain object containing options for the plugin.
 */
const onPlayerReady = (player, options) => {
  player.addClass('vjs-vtt-thumbnails');
  player.vttThumbnails = new VttThumbnailsPlugin(player, options);
};

/**
 * A video.js plugin.
 *
 * In the plugin function, the value of `this` is a video.js `Player`
 * instance. You cannot rely on the player being in a "ready" state here,
 * depending on how the plugin is invoked. This may or may not be important
 * to you; if not, remove the wait for "ready"!
 *
 * @function vttThumbnails
 * @param    {Object} [options={}]
 *           An object of options left to the plugin author to define.
 */
const vttThumbnails = function(options) {
  this.ready(() => {
    onPlayerReady(this, videojs.mergeOptions(defaults, options));
  });
};

// Register the plugin with video.js.
registerPlugin('vttThumbnails', vttThumbnails);

// Include the version number.
vttThumbnails.VERSION = VERSION;

export default vttThumbnails;
