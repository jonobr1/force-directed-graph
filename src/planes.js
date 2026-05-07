import {
  Mesh,
  InstancedBufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  ShaderMaterial,
  Color,
  UniformsLib,
  Vector2,
} from 'three';
import { each } from './math.js';
import shader from './shaders/planes.js';
import hitShader from './shaders/hit-planes.js';
import { TextureAtlas } from './texture-atlas.js';

const color = new Color();
const viewport = new Vector2(1, 1);
const quadPositions = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
const quadUvs = [0, 0, 1, 0, 1, 1, 0, 1];
const quadIndices = [0, 1, 2, 0, 2, 3];

class Planes extends Mesh {
  constructor({ atlas, geometry }, uniforms) {
    const material = new ShaderMaterial({
      uniforms: {
        ...UniformsLib.fog,
        ...{
          is2D: uniforms.is2D,
          sizeAttenuation: uniforms.sizeAttenuation,
          frustumSize: uniforms.frustumSize,
          nodeRadius: uniforms.nodeRadius,
          nodeScale: uniforms.nodeScale,
          imageDimensions: { value: atlas.dimensions },
          texturePositions: { value: null },
          textureTargetPositions: { value: null },
          textureAtlas: { value: atlas },
          size: uniforms.size,
          opacity: uniforms.opacity,
          uColor: uniforms.pointColor,
          inheritColors: uniforms.pointsInheritColor,
          uBeginning: uniforms.uBeginning,
          uEnding: uniforms.uEnding,
          uNodeAmount: uniforms.uNodeAmount,
          viewport: { value: viewport.clone() },
        },
      },
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true,
      vertexColors: true,
      fog: true,
    });

    super(geometry, material);

    this.frustumCulled = false;
    this.userData.atlas = atlas;
    this.userData.hitShader = hitShader;
  }

  static parse(size, data) {
    const atlas = new TextureAtlas();
    const lookup = [];
    const colors = [];
    const imageKeys = [];
    const sizes = [];
    const nodeIndices = [];

    return each(data.nodes, (_, i) => {
      const node = data.nodes[i];
      const x = (i % size) / size;
      const y = Math.floor(i / size) / size;

      lookup.push(x, y);
      nodeIndices.push(i + 1);

      if (node.color) {
        color.set(node.color);
        colors.push(color.r, color.g, color.b);
      } else {
        colors.push(1, 1, 1);
      }

      if (node.image) {
        imageKeys.push(atlas.add(node.image));
      } else {
        imageKeys.push(-1);
      }

      sizes.push(node.size != null ? node.size : 1.0);
    }).then(() => {
      const geometry = new InstancedBufferGeometry();
      geometry.instanceCount = data.nodes.length;

      geometry.setIndex(quadIndices);
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(quadPositions, 3),
      );
      geometry.setAttribute('uv', new Float32BufferAttribute(quadUvs, 2));
      geometry.setAttribute(
        'lookup',
        new InstancedBufferAttribute(new Float32Array(lookup), 2),
      );
      geometry.setAttribute(
        'nodeIndex',
        new InstancedBufferAttribute(new Float32Array(nodeIndices), 1),
      );
      geometry.setAttribute(
        'color',
        new InstancedBufferAttribute(new Float32Array(colors), 3),
      );
      geometry.setAttribute(
        'imageKey',
        new InstancedBufferAttribute(new Float32Array(imageKeys), 1),
      );
      geometry.setAttribute(
        'pointSize',
        new InstancedBufferAttribute(new Float32Array(sizes), 1),
      );

      return { atlas, geometry };
    });
  }

  dispose() {
    if (this.geometry) {
      this.geometry.dispose();
    }

    if (this.material) {
      this.material.dispose();
      if (this.material.uniforms && this.material.uniforms.textureAtlas) {
        this.material.uniforms.textureAtlas.value.dispose();
      }
    }
  }
}

export { Planes };
