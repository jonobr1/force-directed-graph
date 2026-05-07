import { LinearFilter, Texture } from 'three';

let anchor;

class TextureAtlas extends Texture {
  map = [];
  dimensions = 1;
  isTextureAtlas = true;

  constructor() {
    if (!anchor) {
      anchor = document.createElement('a');
    }

    super(document.createElement('canvas'));
    this.flipY = false;
    this.generateMipmaps = false;
    this.minFilter = LinearFilter;
    this.magFilter = LinearFilter;
  }

  static Resolution = 1024;
  static Padding = 2;

  static getAbsoluteURL(path) {
    anchor.href = path;
    return anchor.href;
  }

  add(src) {
    const scope = this;
    let img, index;

    if (typeof src === 'string') {
      index = this.indexOf(src);

      if (index >= 0) {
        img = this.map[index];

        if (img.complete) {
          onLoad();
        } else {
          img.addEventListener('load', onLoad, false);
        }
      } else {
        img = document.createElement('img');
        img.addEventListener('load', onLoad, false);
        img.src = src;

        index = this.map.length;
        this.map.push(img);
      }
    } else if (typeof src === 'object' && 'src' in src) {
      img = src;
      src = img.src;
      index = this.indexOf(src);

      if (index >= 0) {
        img = this.map[index];
      } else {
        index = this.map.length;
        this.map.push(img);
      }

      if (img.complete) {
        onLoad();
      } else {
        img.addEventListener('load', onLoad, false);
      }
    }

    this.dimensions = Math.ceil(Math.sqrt(this.map.length));

    return index;

    function onLoad() {
      img.removeEventListener('load', onLoad, false);
      scope.update();
    }
  }

  update() {
    const { image } = this;
    const ctx = image.getContext('2d');

    image.width = TextureAtlas.Resolution;
    image.height = TextureAtlas.Resolution;

    const dims = (this.dimensions = Math.ceil(Math.sqrt(this.map.length)));
    const width = image.width / dims;
    const height = image.height / dims;
    const padding = Math.min(
      TextureAtlas.Padding,
      Math.max(0, Math.floor(Math.min(width, height) / 4))
    );
    const innerWidth = Math.max(1, width - padding * 2);
    const innerHeight = Math.max(1, height - padding * 2);

    ctx.clearRect(0, 0, image.width, image.height);
    ctx.imageSmoothingEnabled = true;

    for (let i = 0; i < this.map.length; i++) {
      const col = i % dims;
      const row = Math.floor(i / dims);
      const img = this.map[i];

      const x = (col / dims) * image.width;
      const y = (row / dims) * image.height;
      const innerX = x + padding;
      const innerY = y + padding;

      ctx.drawImage(img, innerX, innerY, innerWidth, innerHeight);

      if (padding > 0) {
        const sw = img.naturalWidth || img.width;
        const sh = img.naturalHeight || img.height;
        const sx = Math.max(sw - 1, 0);
        const sy = Math.max(sh - 1, 0);

        ctx.drawImage(img, 0, 0, sw, 1, innerX, y, innerWidth, padding);
        ctx.drawImage(img, 0, sy, sw, 1, innerX, innerY + innerHeight, innerWidth, padding);
        ctx.drawImage(img, 0, 0, 1, sh, x, innerY, padding, innerHeight);
        ctx.drawImage(img, sx, 0, 1, sh, innerX + innerWidth, innerY, padding, innerHeight);

        ctx.drawImage(img, 0, 0, 1, 1, x, y, padding, padding);
        ctx.drawImage(img, sx, 0, 1, 1, innerX + innerWidth, y, padding, padding);
        ctx.drawImage(img, 0, sy, 1, 1, x, innerY + innerHeight, padding, padding);
        ctx.drawImage(img, sx, sy, 1, 1, innerX + innerWidth, innerY + innerHeight, padding, padding);
      }
    }

    this.needsUpdate = true;
  }

  indexOf(src) {
    const uri = TextureAtlas.getAbsoluteURL(src);

    for (let i = 0; i < this.map.length; i++) {
      const img = this.map[i];
      if (uri === img.src) {
        return i;
      }
    }

    return -1;
  }
}

export { TextureAtlas };
