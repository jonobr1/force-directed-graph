import {
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  UniformsLib
} from 'three';
import { links as shader } from './shaders.js';

class Links extends LineSegments {

  constructor(points, { data, uniforms }) {

    const geometry = new BufferGeometry();
    const vertices = [];
    const colors = [];

    for (let i = 0; i < data.links.length; i++) {

      const l = data.links[i];

      const si = 3 * l.sourceIndex;
      const ti = 3 * l.targetIndex;

      let x = points.userData.vertices[si + 0];
      let y = points.userData.vertices[si + 1];
      let z = points.userData.vertices[si + 2];

      let r = points.userData.colors[si + 0];
      let g = points.userData.colors[si + 1];
      let b = points.userData.colors[si + 2];

      vertices.push(x, y, z);
      colors.push(r, g, b);

      x = points.userData.vertices[ti + 0];
      y = points.userData.vertices[ti + 1];
      z = points.userData.vertices[ti + 2];

      r = points.userData.colors[ti + 0];
      g = points.userData.colors[ti + 1];
      b = points.userData.colors[ti + 2];

      vertices.push(x, y, z);
      colors.push(r, g, b);

    }
    geometry.setAttribute('position',
      new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color',
      new Float32BufferAttribute(colors, 3));

    const material = new ShaderMaterial({
      uniforms: { ...UniformsLib['fog'], ...{
        is2D: uniforms.is2D,
        inheritColors: uniforms.linksInheritColor,
        opacity: uniforms.opacity,
        texturePositions: { value: null },
        color: uniforms.linkColor
      } },
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      fog: true
    });

    super(geometry, material);
    this.frustumCulled = false;

  }

}

export { Links };
