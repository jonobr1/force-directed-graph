import {
  Texture
} from 'three';

const anchor = document.createElement('a');

class TextureAtlas extends Texture {

  map = [];
  dimensions = 1;
  isTextureAtlas = true;

  constructor() {

    super(document.createElement('canvas'));
    this.flipY = false;

  }

  static Resolution = 1024;

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

    this.dimensions = Math.ceil(Math.sqrt(this.map.length))

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

    const dims = this.dimensions = Math.ceil(Math.sqrt(this.map.length));
    const width = image.width / dims;
    const height = image.height / dims;

    ctx.clearRect(0, 0, image.width, image.height);

    for (let i = 0; i < this.map.length; i++) {

      const col = i % dims;
      const row = Math.floor(i / dims);
      const img = this.map[i];

      const x = (col / dims) * image.width;
      const y = (row / dims) * image.height;

      ctx.drawImage(img, x, y, width, height);

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

    return - 1;

  }

}

export { TextureAtlas };
