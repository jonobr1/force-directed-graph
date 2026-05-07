import {
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  UniformsLib
} from 'three';
import { each } from "./math.js";
import shader from './shaders/links.js';

function getLookupAttribute(geometry) {
  return geometry.getAttribute('lookup') || geometry.getAttribute('position');
}

function getNodeIndexAttribute(geometry) {
  return geometry.getAttribute('nodeIndex');
}

class Links extends LineSegments {

  constructor(geometry, uniforms) {

    const material = new ShaderMaterial({
      uniforms: { ...UniformsLib['fog'], ...{
        is2D: uniforms.is2D,
        inheritColors: uniforms.linksInheritColor,
        opacity: uniforms.opacity,
        texturePositions: { value: null },
        uColor: uniforms.linkColor,
        uBeginning: uniforms.uBeginning,
        uEnding: uniforms.uEnding,
        uNodeAmount: uniforms.uNodeAmount,
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
    const partnerIndices = [];

    const lookup = getLookupAttribute(points.geometry);
    const nodeIndex = getNodeIndexAttribute(points.geometry);
    const c = points.geometry.attributes.color;
    const v = lookup.array;
    const colorsRef = c.array;
    const lookupSize = lookup.itemSize;

    return each(data.links, (_, i) => {

      const l = data.links[i];

      const si = lookupSize * l.sourceIndex;
      const ti = lookupSize * l.targetIndex;

      let x = v[si + 0];
      let y = v[si + 1];
      let z = nodeIndex ? nodeIndex.array[l.sourceIndex] : v[si + 2];

      let r = colorsRef[3 * l.sourceIndex + 0];
      let g = colorsRef[3 * l.sourceIndex + 1];
      let b = colorsRef[3 * l.sourceIndex + 2];

      vertices.push(x, y, z);
      colors.push(r, g, b);
      partnerIndices.push(nodeIndex ? nodeIndex.array[l.targetIndex] : v[ti + 2]); // target's nodeIndex+1

      x = v[ti + 0];
      y = v[ti + 1];
      z = nodeIndex ? nodeIndex.array[l.targetIndex] : v[ti + 2];

      r = colorsRef[3 * l.targetIndex + 0];
      g = colorsRef[3 * l.targetIndex + 1];
      b = colorsRef[3 * l.targetIndex + 2];

      vertices.push(x, y, z);
      colors.push(r, g, b);
      partnerIndices.push(nodeIndex ? nodeIndex.array[l.sourceIndex] : v[si + 2]); // source's nodeIndex+1

    }).then(() => {

      geometry.setAttribute('position',
        new Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('color',
        new Float32BufferAttribute(colors, 3));
      geometry.setAttribute('partnerIndex',
        new Float32BufferAttribute(partnerIndices, 1));

      return geometry;

    });

  }

}

export { Links };
