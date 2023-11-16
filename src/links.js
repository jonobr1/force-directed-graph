import {
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  UniformsLib
} from 'three';
import { each } from "./math.js";
import shader from './shaders/links.js';

class Links extends LineSegments {

  constructor(geometry, uniforms) {

    const material = new ShaderMaterial({
      uniforms: { ...UniformsLib['fog'], ...{
        is2D: uniforms.is2D,
        inheritColors: uniforms.linksInheritColor,
        opacity: uniforms.opacity,
        texturePositions: { value: null },
        uColor: uniforms.linkColor
      } },
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true,
      vertexColors: true,
      fog: true
    });

    super(geometry, material);
    this.frustumCulled = false;

  }

  static parse(points, data) {

    const geometry = new BufferGeometry();
    const vertices = [];
    const colors = [];

    const v = points.geometry.attributes.position.array;
    const c = points.geometry.attributes.color.array;

    return each(data.links, (_, i) => {

      const l = data.links[i];

      const si = 3 * l.sourceIndex;
      const ti = 3 * l.targetIndex;

      let x = v[si + 0];
      let y = v[si + 1];
      let z = v[si + 2];

      let r = c[si + 0];
      let g = c[si + 1];
      let b = c[si + 2];

      vertices.push(x, y, z);
      colors.push(r, g, b);

      x = v[ti + 0];
      y = v[ti + 1];
      z = v[ti + 2];

      r = c[ti + 0];
      g = c[ti + 1];
      b = c[ti + 2];

      vertices.push(x, y, z);
      colors.push(r, g, b);

    }).then(() => {

      geometry.setAttribute('position',
        new Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('color',
        new Float32BufferAttribute(colors, 3));

      return geometry;

    });

  }

}

export { Links };
