import {
  Points as BasePoints,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  Color,
  UniformsLib
} from 'three';
import { each } from "./math.js";
import shader from './shaders/points.js';
import { TextureAtlas } from './texture-atlas.js';

const color = new Color();

class Points extends BasePoints {

  constructor({ atlas, geometry }, uniforms) {

    const material = new ShaderMaterial({
      uniforms: { ...UniformsLib['fog'], ...{
        is2D: uniforms.is2D,
        sizeAttenuation: uniforms.sizeAttenuation,
        frustumSize: uniforms.frustumSize,
        nodeRadius: uniforms.nodeRadius,
        nodeScale: uniforms.nodeScale,
        imageDimensions: { value: atlas.dimensions},
        texturePositions: { value: null },
        textureAtlas: { value: atlas },
        size: uniforms.size,
        opacity: uniforms.opacity,
        uColor: uniforms.pointColor,
        inheritColors: uniforms.pointsInheritColor
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

  static parse(size, data) {

    const atlas = new TextureAtlas();
    const vertices = [];
    const colors = [];
    const imageKeys = [];

    return each(data.nodes, (_, i) => {

      const node = data.nodes[i];
      const x = (i % size) / size;
      const y = Math.floor(i / size) / size;
      const z = i + 1; // Index used to calculate hit color identifier

      vertices.push(x, y, z);

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

    }).then(() => {

      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position', new Float32BufferAttribute(vertices, 3));
      geometry.setAttribute(
        'color', new Float32BufferAttribute(colors, 3));
      geometry.setAttribute(
        'imageKey', new Float32BufferAttribute(imageKeys, 1));

      return { atlas, geometry };

    });

  }

}

export { Points };
