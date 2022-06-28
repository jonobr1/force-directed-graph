import {
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial
} from 'three';
import { links as shader } from './shaders.js';

class Links extends LineSegments {

  constructor(points, { data, uniforms }) {

    const geometry = new BufferGeometry();
    const vertices = [];

    for (let i = 0; i < data.links.length; i++) {

      const l = data.links[i];

      const a = 3 * l.sourceIndex;
      const b = 3 * l.targetIndex;

      let x = points.userData.vertices[a + 0];
      let y = points.userData.vertices[a + 1];
      let z = points.userData.vertices[a + 2];

      vertices.push(x, y, z);

      x = points.userData.vertices[b + 0];
      y = points.userData.vertices[b + 1];
      z = points.userData.vertices[b + 2];

      vertices.push(x, y, z);

    }
    geometry.setAttribute('position',
      new Float32BufferAttribute(vertices, 3));

    const material = new ShaderMaterial({
      uniforms: {
        is2D: uniforms.is2D,
        texturePositions: { value: null },
        color: uniforms.linkColor
      },
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true,
      depthWrite: false
    });

    super(geometry, material);
    this.frustumCulled = false;

  }

}

export { Links };
