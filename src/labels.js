import {
  BufferAttribute,
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  UniformsLib,
} from 'three';
import shader from './shaders/labels.js';

/**
 * Build a canvas-based texture atlas containing one text entry per labeled node.
 * Returns null when no nodes have a `label` property.
 *
 * @param {Array} nodes - Array of node data objects
 * @returns {{ canvas: HTMLCanvasElement, tileW: number, tileH: number, uvMap: Map } | null}
 */
function buildTextAtlas(nodes) {
  const padding = 4;
  const fontSize = 120;
  const fontFamily = 'Arial, sans-serif';
  const textColor = '#000';

  // Measure text widths using a temporary canvas
  const temp = document.createElement('canvas');
  const tempCtx = temp.getContext('2d');
  tempCtx.font = `${fontSize}px ${fontFamily}`;

  const items = [];
  let maxW = 0;
  const tileH = fontSize + padding * 2;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.label === null || node.label === undefined) {
      continue;
    }
    const text = String(node.label);
    const w = Math.ceil(tempCtx.measureText(text).width) + padding * 2;
    if (w > maxW) {
      maxW = w;
    }
    items.push({ text, nodeIndex: i });
  }

  if (items.length === 0) {
    return null;
  }

  const tileW = maxW || 128;
  const cols = Math.ceil(Math.sqrt(items.length));
  const rows = Math.ceil(items.length / cols);

  const canvas = document.createElement('canvas');
  canvas.width = cols * tileW;
  canvas.height = rows * tileH;

  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // uvMap: nodeIndex → { u, v, uw, uh } in Three.js UV space (flipY = true)
  const uvMap = new Map();

  for (let i = 0; i < items.length; i++) {
    const { text, nodeIndex } = items[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const px = col * tileW;
    const py = row * tileH;

    ctx.fillText(text, px + tileW / 2, py + tileH / 2);

    // With Three.js default flipY=true the canvas is flipped vertically at
    // upload, so canvas y=0 (top) maps to WebGL v=1 (top of UV space).
    const u = px / canvas.width;
    const v = 1.0 - (py + tileH) / canvas.height;
    const uw = tileW / canvas.width;
    const uh = tileH / canvas.height;

    uvMap.set(nodeIndex, { u, v, uw, uh });
  }

  return { canvas, tileW, tileH, uvMap };
}

class Labels extends Mesh {
  constructor(geometry, texture, uniforms) {
    const material = new ShaderMaterial({
      uniforms: {
        texturePositions: { value: null },
        textureAtlas: { value: texture },
        uObscurity: uniforms.obscurity,
        opacity: uniforms.opacity,
        frustumSize: uniforms.frustumSize,
        is2D: uniforms.is2D,
        sizeAttenuation: uniforms.sizeAttenuation,
        nodeRadius: uniforms.nodeRadius,
        nodeScale: uniforms.nodeScale,
        uBeginning: uniforms.uBeginning,
        uEnding: uniforms.uEnding,
        uNodeAmount: uniforms.uNodeAmount,
      },
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });

    super(geometry, material);
    this.frustumCulled = false;
  }

  static parse(size, data) {
    const atlas = buildTextAtlas(data.nodes);

    if (!atlas) {
      return Promise.resolve(null);
    }

    const { canvas, tileW, tileH, uvMap } = atlas;

    // Unit billboard quad: two triangles covering [-1,1] x [-1,1]
    const quadVerts = new Float32Array([
      -1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0,
    ]);
    const quadUVs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    const quadIdx = [0, 1, 2, 2, 1, 3];

    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(quadVerts, 3));
    geometry.setAttribute('uv', new BufferAttribute(quadUVs, 2));
    geometry.setIndex(quadIdx);

    const sources = [];
    const labelUVs = [];
    const aspectRatios = [];

    for (const [nodeIndex, uv] of uvMap) {
      const x = (nodeIndex % size) / size;
      const y = Math.floor(nodeIndex / size) / size;
      const z = nodeIndex + 1;

      sources.push(x, y, z);
      labelUVs.push(uv.u, uv.v, uv.uw, uv.uh);
      aspectRatios.push(tileW / tileH);
    }

    geometry.setAttribute(
      'source',
      new InstancedBufferAttribute(new Float32Array(sources), 3),
    );
    geometry.setAttribute(
      'labelUV',
      new InstancedBufferAttribute(new Float32Array(labelUVs), 4),
    );
    geometry.setAttribute(
      'aspectRatio',
      new InstancedBufferAttribute(new Float32Array(aspectRatios), 1),
    );
    geometry.instanceCount = uvMap.size;

    const texture = new CanvasTexture(canvas);

    return Promise.resolve({ geometry, texture });
  }
}

export { Labels };
