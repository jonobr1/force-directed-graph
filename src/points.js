import {
  Points as BasePoints,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  Color,
  UniformsLib
} from 'three';
import { points as shader } from './shaders.js';

const color = new Color();

class Points extends BasePoints {

  constructor(size, { data, uniforms }) {

    const vertices = [];
    const colors = [];

    for (let i = 0; i < data.nodes.length; i++) {

      const node = data.nodes[i];
      const x = (i % size) / size;
      const y = Math.floor(i / size) / size;
      const z = 0;

      vertices.push(x, y, z);

      if (node.color) {
        color.set(node.color);
        colors.push(color.r, color.g, color.b);
      } else {
        colors.push(1, 1, 1);
      }

    }

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute(
      'color', new Float32BufferAttribute(vertices, 3));

    const material = new ShaderMaterial({
      uniforms: { ...UniformsLib['fog'], ...{
        is2D: uniforms.is2D,
        sizeAttenuation: uniforms.sizeAttenuation,
        frustumSize: uniforms.frustumSize,
        nodeRadius: uniforms.nodeRadius,
        nodeScale: uniforms.nodeScale,
        texturePositions: { value: null },
        size: { value: size },
        opacity: uniforms.opacity,
        color: uniforms.pointColor
      } },
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      vertexColors: true,
      fog: true
    });

    super(geometry, material);

    this.frustumCulled = false;
    this.userData.vertices = vertices;
    this.userData.colors = colors;

  }

}

export { Points };
