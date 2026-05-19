import {
  BufferAttribute,
  CanvasTexture,
  ClampToEdgeWrapping,
  DataTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import shader from './shaders/labels.js';

const MODEL_VIEW_MATRIX = new Matrix4();
const CAMERA_RIGHT = new Vector3();
const CAMERA_UP = new Vector3();
const LOCAL_NODE = new Vector3();
const WORLD_CENTER = new Vector3();
const WORLD_CORNER = new Vector3();
const PROJECTED_CORNER = new Vector3();
const MV_CENTER = new Vector4();
const DRAWING_BUFFER_SIZE = new Vector2();

/**
 * Build a canvas-based texture atlas containing one text entry per labeled node.
 * Returns null when no nodes have a `label` property.
 *
 * @param {Array} nodes - Array of node data objects
 * @param {number[]} [degrees=[]] - Per-node degree values used for label priority
 * @returns {{ canvas: HTMLCanvasElement, entries: Array } | null}
 */
function buildTextAtlas(nodes, degrees = []) {
  const padding = 4;
  const fontSize = 120;
  const fontFamily = 'Arial, sans-serif';
  const textColor = '#000';

  const temp = document.createElement('canvas');
  const tempCtx = temp.getContext('2d');
  tempCtx.font = `${fontSize}px ${fontFamily}`;

  const items = [];
  let maxTileWidth = 0;
  const tileH = fontSize + padding * 2;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.label === null || node.label === undefined) {
      continue;
    }

    const text = String(node.label);
    const labelWidth = Math.ceil(tempCtx.measureText(text).width) + padding * 2;

    if (labelWidth > maxTileWidth) {
      maxTileWidth = labelWidth;
    }

    items.push({
      text,
      nodeIndex: i,
      labelWidth,
      labelHeight: tileH,
      aspectRatio: labelWidth / tileH,
      basePriority: getLabelBasePriority(node, degrees[i] || 0),
    });
  }

  if (items.length === 0) {
    return null;
  }

  const tileW = maxTileWidth || 128;
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

  const entries = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const px = col * tileW;
    const py = row * tileH;
    const cropOffsetX = (tileW - item.labelWidth) * 0.5;

    ctx.fillText(item.text, px + tileW / 2, py + tileH / 2);

    entries.push({
      ...item,
      labelId: i,
      stableId: item.nodeIndex,
      persistence: 0,
      atlasUV: {
        u: (px + cropOffsetX) / canvas.width,
        v: 1.0 - (py + tileH) / canvas.height,
        uw: item.labelWidth / canvas.width,
        uh: tileH / canvas.height,
      },
    });
  }

  return { canvas, entries };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getVisibleQuota(obscurity, labelCount) {
  const quota = Math.round((1 - clamp01(obscurity)) * labelCount);
  return Math.max(0, Math.min(labelCount, quota));
}

function getLabelBasePriority(node, degree = 0) {
  if (typeof node.labelPriority === 'number' && Number.isFinite(node.labelPriority)) {
    return node.labelPriority;
  }
  if (typeof node.size === 'number' && Number.isFinite(node.size)) {
    return node.size;
  }
  if (Number.isFinite(degree)) {
    return degree;
  }
  return 0;
}

function compareLabelEntries(a, b) {
  if (b.basePriority !== a.basePriority) {
    return b.basePriority - a.basePriority;
  }
  return a.stableId - b.stableId;
}

function compareProjectedEntries(a, b) {
  if (b.entry.basePriority !== a.entry.basePriority) {
    return b.entry.basePriority - a.entry.basePriority;
  }

  const aPersistence = a.entry.persistence || 0;
  const bPersistence = b.entry.persistence || 0;
  if (bPersistence !== aPersistence) {
    return bPersistence - aPersistence;
  }

  if (b.depthPriority !== a.depthPriority) {
    return b.depthPriority - a.depthPriority;
  }

  return a.entry.stableId - b.entry.stableId;
}

function packCollisionCellKey(cellX, cellY, gridWidth) {
  return cellY * gridWidth + cellX;
}

function buildSortTuple(cellId, entry) {
  return {
    cellId,
    priorityKey: -entry.basePriority,
    stableId: entry.stableId,
    labelId: entry.labelId,
  };
}

function getPlacementTextureDimensions(itemCount) {
  const width = Math.max(1, Math.ceil(Math.sqrt(itemCount)));
  const height = Math.max(1, Math.ceil(itemCount / width));
  return { width, height };
}

function intersectsBounds(a, b, margin = 0) {
  return !(
    a.maxX + margin <= b.minX ||
    a.minX >= b.maxX + margin ||
    a.maxY + margin <= b.minY ||
    a.minY >= b.maxY + margin
  );
}

function getCollisionCellBounds(bounds, cellSize, gridWidth, gridHeight) {
  const minCellX = Math.max(0, Math.floor(bounds.minX / cellSize));
  const maxCellX = Math.min(gridWidth - 1, Math.floor(bounds.maxX / cellSize));
  const minCellY = Math.max(0, Math.floor(bounds.minY / cellSize));
  const maxCellY = Math.min(gridHeight - 1, Math.floor(bounds.maxY / cellSize));

  if (maxCellX < 0 || maxCellY < 0 || minCellX >= gridWidth || minCellY >= gridHeight) {
    return null;
  }

  return {
    minCellX,
    maxCellX,
    minCellY,
    maxCellY,
  };
}

function projectLabelBounds({
  nodePosition,
  objectMatrixWorld,
  camera,
  viewportWidth,
  viewportHeight,
  frustumSize,
  is2D,
  sizeAttenuation,
  nodeRadius,
  nodeScale,
  aspectRatio,
}) {
  LOCAL_NODE.copy(nodePosition);
  LOCAL_NODE.z *= 1.0 - Number(Boolean(is2D));

  MODEL_VIEW_MATRIX.multiplyMatrices(camera.matrixWorldInverse, objectMatrixWorld);
  MV_CENTER.set(LOCAL_NODE.x, LOCAL_NODE.y, LOCAL_NODE.z, 1.0);
  MV_CENTER.applyMatrix4(MODEL_VIEW_MATRIX);

  if (!Number.isFinite(MV_CENTER.z) || MV_CENTER.z >= 0) {
    return null;
  }

  const sizeScale = sizeAttenuation
    ? frustumSize / Math.max(-MV_CENTER.z, 0.001)
    : 1.0;
  const labelHeight = 0.1 * nodeRadius * nodeScale * sizeScale;
  const labelWidth = labelHeight * aspectRatio;

  WORLD_CENTER.copy(LOCAL_NODE).applyMatrix4(objectMatrixWorld);
  CAMERA_RIGHT.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  CAMERA_UP.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

  const anchor = WORLD_CORNER.copy(WORLD_CENTER).addScaledVector(CAMERA_UP, labelHeight);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let ix = -1; ix <= 1; ix += 2) {
    for (let iy = -1; iy <= 1; iy += 2) {
      PROJECTED_CORNER
        .copy(anchor)
        .addScaledVector(CAMERA_RIGHT, ix * labelWidth * 0.5)
        .addScaledVector(CAMERA_UP, iy * labelHeight * 0.5)
        .project(camera);

      if (!Number.isFinite(PROJECTED_CORNER.x) || !Number.isFinite(PROJECTED_CORNER.y)) {
        return null;
      }

      const x = (PROJECTED_CORNER.x * 0.5 + 0.5) * viewportWidth;
      const y = (1.0 - (PROJECTED_CORNER.y * 0.5 + 0.5)) * viewportHeight;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX <= 0 || maxY <= 0 || minX >= viewportWidth || minY >= viewportHeight) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) * 0.5,
    centerY: (minY + maxY) * 0.5,
    viewDistance: -MV_CENTER.z,
    depthPriority: 1.0 / Math.max(-MV_CENTER.z, 0.001),
    clipped:
      minX < 0 ||
      minY < 0 ||
      maxX > viewportWidth ||
      maxY > viewportHeight,
  };
}

function createVisibilityTexture(labelCount) {
  const { width, height } = getPlacementTextureDimensions(labelCount);
  const data = new Uint8Array(width * height * 4);
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);

  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;

  return { data, texture, width, height };
}

class Labels extends Mesh {
  constructor({ geometry, texture, entries }, uniforms) {
    const visibility = createVisibilityTexture(entries.length);
    const material = new ShaderMaterial({
      uniforms: {
        texturePositions: { value: null },
        textureAtlas: { value: texture },
        textureVisibility: { value: visibility.texture },
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
    this.entries = entries;
    this.sortedEntries = entries.slice().sort(compareLabelEntries);
    this.visibility = visibility;
    this.positionsBuffer = new Float32Array(0);
    this.projectedEntries = [];
    this.selectionGrid = new Map();
    this.acceptedEntries = [];
    this.obscurity = uniforms.obscurity;
    this.onBeforeRender = (renderer, scene, camera) => {
      this.updateVisibility(renderer, camera);
    };
  }

  ensurePositionsBuffer(size) {
    const requiredLength = size * size * 4;
    if (this.positionsBuffer.length !== requiredLength) {
      this.positionsBuffer = new Float32Array(requiredLength);
    }
  }

  applyPriorityQuotaOnly() {
    this.visibility.data.fill(0);

    const quota = getVisibleQuota(this.obscurity.value, this.entries.length);
    for (let i = 0; i < quota; i++) {
      const entry = this.sortedEntries[i];
      const offset = entry.labelId * 4;
      this.visibility.data[offset + 0] = 255;
      this.visibility.data[offset + 1] = 255;
      this.visibility.data[offset + 2] = 255;
      this.visibility.data[offset + 3] = 255;
    }

    this.visibility.texture.needsUpdate = true;
  }

  updateVisibility(renderer, camera) {
    const graph = this.parent;
    const { gpgpu, uniforms, variables } = graph?.userData || {};

    if (!graph || !gpgpu || !variables?.positions || !uniforms?.size) {
      return;
    }

    const size = uniforms.size.value;
    if (!Number.isFinite(size) || size <= 0) {
      return;
    }

    const renderTarget = gpgpu.getCurrentRenderTarget(variables.positions);
    if (!renderTarget) {
      return;
    }

    this.ensurePositionsBuffer(size);

    const activeRenderTarget = renderer.getRenderTarget();

    try {
      renderer.readRenderTargetPixels(
        renderTarget,
        0,
        0,
        size,
        size,
        this.positionsBuffer,
      );
    } catch (error) {
      if (!this.userData.didWarnPlacementReadback) {
        console.warn('Force Directed Graph: label placement readback failed.', error);
        this.userData.didWarnPlacementReadback = true;
      }
      renderer.setRenderTarget(activeRenderTarget);
      this.applyPriorityQuotaOnly();
      return;
    }

    renderer.setRenderTarget(activeRenderTarget);
    renderer.getDrawingBufferSize(DRAWING_BUFFER_SIZE);

    const viewportWidth = DRAWING_BUFFER_SIZE.x;
    const viewportHeight = DRAWING_BUFFER_SIZE.y;
    const quota = getVisibleQuota(this.obscurity.value, this.entries.length);

    this.visibility.data.fill(0);
    if (quota <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      this.visibility.texture.needsUpdate = true;
      return;
    }

    this.projectedEntries.length = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      entry.persistence = Math.max(0, (entry.persistence || 0) - 1);
    }
    let averageHeight = 0;

    for (let i = 0; i < this.sortedEntries.length; i++) {
      const entry = this.sortedEntries[i];
      const index = entry.nodeIndex * 4;
      const bounds = projectLabelBounds({
        nodePosition: {
          x: this.positionsBuffer[index + 0],
          y: this.positionsBuffer[index + 1],
          z: this.positionsBuffer[index + 2],
        },
        objectMatrixWorld: this.matrixWorld,
        camera,
        viewportWidth,
        viewportHeight,
        frustumSize: this.material.uniforms.frustumSize.value,
        is2D: this.material.uniforms.is2D.value,
        sizeAttenuation: this.material.uniforms.sizeAttenuation.value,
        nodeRadius: this.material.uniforms.nodeRadius.value,
        nodeScale: this.material.uniforms.nodeScale.value,
        aspectRatio: entry.aspectRatio,
      });

      if (!bounds) {
        continue;
      }

      averageHeight += bounds.height;
      this.projectedEntries.push({
        entry,
        bounds,
        depthPriority: bounds.depthPriority,
      });
    }

    if (this.projectedEntries.length === 0) {
      this.visibility.texture.needsUpdate = true;
      return;
    }

    this.projectedEntries.sort(compareProjectedEntries);

    averageHeight /= this.projectedEntries.length;
    const cellSize = Math.max(12, Math.min(96, averageHeight || 32));
    const gridWidth = Math.max(1, Math.ceil(viewportWidth / cellSize));
    const gridHeight = Math.max(1, Math.ceil(viewportHeight / cellSize));

    this.selectionGrid.clear();
    this.acceptedEntries.length = 0;

    for (let i = 0; i < this.projectedEntries.length; i++) {
      if (this.acceptedEntries.length >= quota) {
        break;
      }

      const projected = this.projectedEntries[i];
      const cellBounds = getCollisionCellBounds(
        projected.bounds,
        cellSize,
        gridWidth,
        gridHeight,
      );

      if (!cellBounds) {
        continue;
      }

      const seen = new Set();
      let collides = false;

      for (let cy = cellBounds.minCellY; cy <= cellBounds.maxCellY && !collides; cy++) {
        for (let cx = cellBounds.minCellX; cx <= cellBounds.maxCellX; cx++) {
          const key = packCollisionCellKey(cx, cy, gridWidth);
          const bucket = this.selectionGrid.get(key);
          if (!bucket) {
            continue;
          }

          for (let j = 0; j < bucket.length; j++) {
            const accepted = bucket[j];
            if (seen.has(accepted.entry.labelId)) {
              continue;
            }
            seen.add(accepted.entry.labelId);

            if (intersectsBounds(projected.bounds, accepted.bounds, 2)) {
              collides = true;
              break;
            }
          }
        }
      }

      if (collides) {
        continue;
      }

      const offset = projected.entry.labelId * 4;
      this.visibility.data[offset + 0] = 255;
      this.visibility.data[offset + 1] = 255;
      this.visibility.data[offset + 2] = 255;
      this.visibility.data[offset + 3] = 255;
      projected.entry.persistence = Math.min(
        (projected.entry.persistence || 0) + 3,
        12,
      );
      this.acceptedEntries.push(projected);

      for (let cy = cellBounds.minCellY; cy <= cellBounds.maxCellY; cy++) {
        for (let cx = cellBounds.minCellX; cx <= cellBounds.maxCellX; cx++) {
          const key = packCollisionCellKey(cx, cy, gridWidth);
          const bucket = this.selectionGrid.get(key);
          if (bucket) {
            bucket.push(projected);
          } else {
            this.selectionGrid.set(key, [projected]);
          }
        }
      }
    }

    this.visibility.texture.needsUpdate = true;
  }

  dispose() {
    this.material.uniforms.textureAtlas.value?.dispose?.();
    this.material.uniforms.textureVisibility.value?.dispose?.();
    this.material.dispose();
    this.geometry.dispose();
  }

  static parse(size, data, options = {}) {
    const atlas = buildTextAtlas(data.nodes, options.degrees || []);

    if (!atlas) {
      return Promise.resolve(null);
    }

    const { canvas, entries } = atlas;

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
    const visibilityUVs = [];
    const { width: visibilityWidth, height: visibilityHeight } =
      getPlacementTextureDimensions(entries.length);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const x = (entry.nodeIndex % size) / size;
      const y = Math.floor(entry.nodeIndex / size) / size;
      const z = entry.nodeIndex + 1;

      sources.push(x, y, z);
      labelUVs.push(
        entry.atlasUV.u,
        entry.atlasUV.v,
        entry.atlasUV.uw,
        entry.atlasUV.uh,
      );
      aspectRatios.push(entry.aspectRatio);
      visibilityUVs.push(
        ((entry.labelId % visibilityWidth) + 0.5) / visibilityWidth,
        (Math.floor(entry.labelId / visibilityWidth) + 0.5) / visibilityHeight,
      );
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
    geometry.setAttribute(
      'visibilityUV',
      new InstancedBufferAttribute(new Float32Array(visibilityUVs), 2),
    );
    geometry.instanceCount = entries.length;

    const texture = new CanvasTexture(canvas);
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;

    return Promise.resolve({ geometry, texture, entries });
  }
}

const __TEST__ = {
  buildSortTuple,
  clamp01,
  compareLabelEntries,
  compareProjectedEntries,
  getCollisionCellBounds,
  getLabelBasePriority,
  getVisibleQuota,
  getPlacementTextureDimensions,
  intersectsBounds,
  packCollisionCellKey,
  projectLabelBounds,
};

export { Labels, __TEST__ };
