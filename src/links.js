import {
  BufferAttribute,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  UniformsLib,
} from 'three';
import { each } from './math.js';
import { assertValidLink } from './link-validation.js';
import shader from './shaders/links.js';

const vertices = new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]);

const indices = [0, 1, 2, 2, 1, 3];

class Links extends Mesh {
  constructor(geometry, uniforms) {
    const material = new ShaderMaterial({
      uniforms: {
        ...UniformsLib['fog'],
        ...{
          frustumSize: uniforms.frustumSize,
          is2D: uniforms.is2D,
          inheritColors: uniforms.linksInheritColor,
          linecap: uniforms.linecap,
          linewidth: uniforms.linewidth,
          opacity: uniforms.opacity,
          pixelRatio: uniforms.pixelRatio,
          resolution: uniforms.resolution,
          sizeAttenuation: uniforms.sizeAttenuation,
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
      side: DoubleSide,
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
    const nodeCount = points.geometry.attributes.position.count;

    geometry.setAttribute('position', new BufferAttribute(vertices, 3));
    geometry.setIndex(indices);

    return each(data.links, (_, i) => {
      const link = data.links[i];
      assertValidLink(link, i, nodeCount);
      const { sourceIndex, targetIndex } = link;

      const sourceOffset = 3 * sourceIndex;
      const targetOffset = 3 * targetIndex;

      sources.push(
        v[sourceOffset + 0],
        v[sourceOffset + 1],
        v[sourceOffset + 2],
      );
      targets.push(
        v[targetOffset + 0],
        v[targetOffset + 1],
        v[targetOffset + 2],
      );
      sourceColors.push(
        c[sourceOffset + 0],
        c[sourceOffset + 1],
        c[sourceOffset + 2],
      );
      targetColors.push(
        c[targetOffset + 0],
        c[targetOffset + 1],
        c[targetOffset + 2],
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
