import {
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  UniformsLib,
} from 'three';
import { each } from './math.js';
import shader from './shaders/links.js';

const vertices = new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]);

const indices = [0, 1, 2, 2, 1, 3];

class Links extends Mesh {
  constructor(geometry, uniforms) {
    const material = new ShaderMaterial({
      uniforms: {
        ...UniformsLib['fog'],
        ...{
          is2D: uniforms.is2D,
          inheritColors: uniforms.linksInheritColor,
          linewidth: uniforms.linewidth,
          opacity: uniforms.opacity,
          pixelRatio: uniforms.pixelRatio,
          resolution: uniforms.resolution,
          texturePositions: { value: null },
          uColor: uniforms.linkColor,
          uBeginning: uniforms.uBeginning,
          uEnding: uniforms.uEnding,
          uNodeAmount: uniforms.uNodeAmount,
        },
      },
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true,
      fog: true,
    });

    super(geometry, material);
    this.frustumCulled = false;
  }

  static parse(points, data) {
    const geometry = new InstancedBufferGeometry();
    const sources = [];
    const targets = [];
    const sourceColors = [];
    const targetColors = [];

    const v = points.geometry.attributes.position.array;
    const c = points.geometry.attributes.color.array;

    geometry.setAttribute('position', new BufferAttribute(vertices, 3));
    geometry.setIndex(indices);

    return each(data.links, (_, i) => {
      const link = data.links[i];

      const sourceIndex = 3 * link.sourceIndex;
      const targetIndex = 3 * link.targetIndex;

      sources.push(v[sourceIndex + 0], v[sourceIndex + 1], v[sourceIndex + 2]);
      targets.push(v[targetIndex + 0], v[targetIndex + 1], v[targetIndex + 2]);
      sourceColors.push(
        c[sourceIndex + 0],
        c[sourceIndex + 1],
        c[sourceIndex + 2],
      );
      targetColors.push(
        c[targetIndex + 0],
        c[targetIndex + 1],
        c[targetIndex + 2],
      );
    }).then(() => {
      geometry.setAttribute(
        'source',
        new InstancedBufferAttribute(new Float32Array(sources), 3),
      );
      geometry.setAttribute(
        'target',
        new InstancedBufferAttribute(new Float32Array(targets), 3),
      );
      geometry.setAttribute(
        'sourceColor',
        new InstancedBufferAttribute(new Float32Array(sourceColors), 3),
      );
      geometry.setAttribute(
        'targetColor',
        new InstancedBufferAttribute(new Float32Array(targetColors), 3),
      );
      geometry.instanceCount = data.links.length;

      return geometry;
    });
  }
}

export { Links };
