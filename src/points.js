import {
  Points as BasePoints,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial
} from 'three';
import { points as shader } from './shaders.js';

class Points extends BasePoints {

  constructor(size, { data, uniforms }) {

    const vertices = [];
    for (let i = 0; i < data.nodes.length; i++) {

      const x = (i % size) / size;
      const y = Math.floor(i / size) / size;
      const z = 0;

      vertices.push(x, y, z);

    }

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position', new Float32BufferAttribute(vertices, 3));

    const material = new ShaderMaterial({
      uniforms: {
        is2D: uniforms.is2D,
        sizeAttenuation: uniforms.sizeAttenuation,
        frustumSize: uniforms.frustumSize,
        nodeRadius: uniforms.nodeRadius,
        nodeScale: uniforms.nodeScale,
        texturePositions: { value: null },
        size: { value: size },
        color: uniforms.pointColor
      },
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });

    super(geometry, material);

    this.frustumCulled = false;
    this.userData.vertices = vertices;

  }

}

export { Points };
