import {
  BufferAttribute,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  ShaderMaterial,
  UniformsLib,
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
const BASE_ATLAS_FONT_SIZE = 120;
const BASE_ATLAS_PADDING = 4;
const ATLAS_RASTER_SCALE = 2;
const DEFAULT_FONT_FAMILY = 'Arial, sans-serif';
const LABEL_GRAPH_DISTANCE_HOPS = 6;
const LABEL_NODE_COLOR = new Color();
const LabelAlignmentMap = {
  center: 0,
  left: 1,
  right: -1,
};
const LabelBaselineMap = {
  top: 1,
  middle: 0,
  bottom: -1,
};

function getLabelAlignmentName(value) {
  if (value > 0.5) {
    return 'left';
  }
  if (value < -0.5) {
    return 'right';
  }
  return 'center';
}

function getLabelBaselineName(value) {
  if (value > 0.5) {
    return 'top';
  }
  if (value < -0.5) {
    return 'bottom';
  }
  return 'middle';
}

function sanitizeLabelFontSize(fontSize) {
  if (!Number.isFinite(fontSize)) {
    return 1;
  }
  return Math.max(0.01, fontSize);
}

function sanitizeLabelNearDistance(nearDistance) {
  if (!Number.isFinite(nearDistance)) {
    return 0;
  }
  return Math.max(0, nearDistance);
}

function getNodeColorComponents(node) {
  if (node?.color) {
    LABEL_NODE_COLOR.set(node.color);
    return [LABEL_NODE_COLOR.r, LABEL_NODE_COLOR.g, LABEL_NODE_COLOR.b];
  }
  return [1, 1, 1];
}

function compareSelectionCandidates(a, b) {
  if (b.hasManualPriority !== a.hasManualPriority) {
    return Number(b.hasManualPriority) - Number(a.hasManualPriority);
  }
  if (b.manualPriority !== a.manualPriority) {
    return b.manualPriority - a.manualPriority;
  }
  if (b.degree !== a.degree) {
    return b.degree - a.degree;
  }
  return a.entry.stableId - b.entry.stableId;
}

function relaxGraphDistances(sourceIndex, adjacency, distances, maxHops) {
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
    return;
  }

  const visited = new Int16Array(adjacency.length || distances.length);
  visited.fill(-1);
  const queue = [sourceIndex];
  const depths = [0];
  visited[sourceIndex] = 0;
  distances[sourceIndex] = 0;

  for (let i = 0; i < queue.length; i++) {
    const nodeIndex = queue[i];
    const depth = depths[i];

    if (depth >= maxHops) {
      continue;
    }

    const neighbors = adjacency[nodeIndex] || [];
    for (let j = 0; j < neighbors.length; j++) {
      const neighbor = neighbors[j];
      if (!Number.isInteger(neighbor) || neighbor < 0 || neighbor >= visited.length) {
        continue;
      }
      if (visited[neighbor] >= 0) {
        continue;
      }

      const nextDepth = depth + 1;
      visited[neighbor] = nextDepth;
      if (nextDepth < distances[neighbor]) {
        distances[neighbor] = nextDepth;
      }
      queue.push(neighbor);
      depths.push(nextDepth);
    }
  }
}

function buildLabelSelectionOrder(
  entries,
  adjacency = [],
  nodes = [],
  degrees = [],
  maxHops = LABEL_GRAPH_DISTANCE_HOPS,
) {
  if (!entries || entries.length === 0) {
    return [];
  }

  const candidates = entries
    .map((entry) => {
      const node = nodes[entry.nodeIndex] || {};
      const manualPriority =
        typeof node.labelPriority === 'number' && Number.isFinite(node.labelPriority)
          ? node.labelPriority
          : -Infinity;
      return {
        entry,
        degree:
          typeof degrees[entry.nodeIndex] === 'number' &&
          Number.isFinite(degrees[entry.nodeIndex])
            ? degrees[entry.nodeIndex]
            : 0,
        hasManualPriority: Number.isFinite(manualPriority),
        manualPriority,
        selected: false,
      };
    })
    .sort(compareSelectionCandidates);

  const distances = new Int16Array(
    Math.max(
      1,
      nodes.length,
      adjacency.length,
      ...entries.map((entry) => entry.nodeIndex + 1),
    ),
  );
  distances.fill(maxHops + 1);

  const order = [];
  let hasSelection = false;

  for (let threshold = maxHops + 1; threshold >= 0; threshold--) {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate.selected) {
        continue;
      }

      const distance = distances[candidate.entry.nodeIndex];
      if (hasSelection && distance < threshold) {
        continue;
      }

      candidate.selected = true;
      order.push(candidate.entry);
      relaxGraphDistances(
        candidate.entry.nodeIndex,
        adjacency,
        distances,
        maxHops,
      );
      hasSelection = true;
    }
  }

  return order;
}

function layoutAtlasRows(items, maxTextureSize) {
  if (!Number.isFinite(maxTextureSize) || maxTextureSize <= 0) {
    return { fits: false, width: 0, height: 0, placements: [] };
  }

  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let maxWidth = 0;
  const placements = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const width = Math.max(1, Math.ceil(item.labelWidth));
    const height = Math.max(1, Math.ceil(item.labelHeight));

    if (width > maxTextureSize || height > maxTextureSize) {
      return { fits: false, width: 0, height: 0, placements: [] };
    }

    if (x > 0 && x + width > maxTextureSize) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }

    placements.push({
      x,
      y,
      width,
      height,
    });

    x += width;
    rowHeight = Math.max(rowHeight, height);
    maxWidth = Math.max(maxWidth, x);

    if (y + rowHeight > maxTextureSize) {
      return { fits: false, width: 0, height: 0, placements: [] };
    }
  }

  return {
    fits: true,
    width: Math.max(1, maxWidth),
    height: Math.max(1, y + rowHeight),
    placements,
  };
}

function measureAtlasCandidate(
  tempCtx,
  rawItems,
  { requestedFontSize, requestedPadding, fontFamily, scale, maxTextureSize },
) {
  const padding = Math.max(1, Math.round(requestedPadding * scale));
  const fontSize = Math.max(1, Math.round(requestedFontSize * scale));
  const tileH = fontSize + padding * 2;

  if (tileH > maxTextureSize) {
    return { fits: false };
  }

  tempCtx.font = `${fontSize}px ${fontFamily}`;

  const items = rawItems.map((item) => {
    const labelWidth =
      Math.ceil(tempCtx.measureText(item.text).width) + padding * 2;
    return {
      ...item,
      labelWidth,
      labelHeight: tileH,
      aspectRatio: labelWidth / tileH,
    };
  });

  const layout = layoutAtlasRows(items, maxTextureSize);
  return {
    fits: layout.fits,
    padding,
    fontSize,
    tileH,
    items,
    layout,
  };
}

function fitAtlasLayout(
  tempCtx,
  rawItems,
  { requestedFontSize, requestedPadding, fontFamily, maxTextureSize },
) {
  let lo = 0;
  let hi = 1;
  let best = null;

  for (let i = 0; i < 12; i++) {
    const scale = (lo + hi) * 0.5;
    const candidate = measureAtlasCandidate(tempCtx, rawItems, {
      requestedFontSize,
      requestedPadding,
      fontFamily,
      scale,
      maxTextureSize,
    });

    if (candidate.fits) {
      best = {
        ...candidate,
        scale,
      };
      lo = scale;
    } else {
      hi = scale;
    }
  }

  if (best) {
    return best;
  }

  return measureAtlasCandidate(tempCtx, rawItems, {
    requestedFontSize,
    requestedPadding,
    fontFamily,
    scale: 0.01,
    maxTextureSize,
  });
}

/**
 * Build a canvas-based texture atlas containing one text entry per labeled node.
 * Returns null when no nodes have a `label` property.
 *
 * @param {Array} nodes - Array of node data objects
 * @param {number[]} [degrees=[]] - Per-node degree values used for label priority
 * @param {Object} [options={}] - font options
 * @returns {{ canvas: HTMLCanvasElement, entries: Array } | null}
 */
function buildTextAtlas(nodes, degrees = [], options = {}) {
  const fontScale = sanitizeLabelFontSize(options.fontSize);
  const atlasScale = ATLAS_RASTER_SCALE;
  const requestedPadding = Math.max(
    1,
    Math.round(BASE_ATLAS_PADDING * fontScale * atlasScale),
  );
  const requestedFontSize = Math.max(
    1,
    Math.round(BASE_ATLAS_FONT_SIZE * fontScale * atlasScale),
  );
  const fontFamily = options.fontFamily || DEFAULT_FONT_FAMILY;
  const maxTextureSize = Math.max(1, options.maxTextureSize || 16384);
  const textColor = '#fff';

  const temp = document.createElement('canvas');
  const tempCtx = temp.getContext('2d');
  tempCtx.font = `${requestedFontSize}px ${fontFamily}`;

  const rawItems = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.label === null || node.label === undefined) {
      continue;
    }

    const text = String(node.label);
    rawItems.push({
      text,
      nodeIndex: i,
      pointSize:
        typeof node.size === 'number' && Number.isFinite(node.size)
          ? node.size
          : 1,
      basePriority: getLabelBasePriority(node, degrees[i] || 0),
    });
  }

  if (rawItems.length === 0) {
    return null;
  }

  const fittedAtlas = fitAtlasLayout(tempCtx, rawItems, {
    requestedFontSize,
    requestedPadding,
    fontFamily,
    maxTextureSize,
  });

  if (!fittedAtlas.fits) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = fittedAtlas.layout.width;
  canvas.height = fittedAtlas.layout.height;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.font = `${fittedAtlas.fontSize}px ${fontFamily}`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const entries = [];

  for (let i = 0; i < fittedAtlas.items.length; i++) {
    const item = fittedAtlas.items[i];
    const placement = fittedAtlas.layout.placements[i];
    const px = placement.x;
    const py = placement.y;

    ctx.fillText(
      item.text,
      px + placement.width / 2,
      py + placement.height / 2,
    );

    entries.push({
      ...item,
      labelId: i,
      stableId: item.nodeIndex,
      persistence: 0,
      atlasUV: {
        u: px / canvas.width,
        v: 1.0 - (py + placement.height) / canvas.height,
        uw: placement.width / canvas.width,
        uh: placement.height / canvas.height,
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
  if (
    typeof node.labelPriority === 'number' &&
    Number.isFinite(node.labelPriority)
  ) {
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

function buildSelectionRanks(entries, selectionOrder) {
  const ranksByLabelId = new Float32Array(entries.length);
  const orderedEntries =
    selectionOrder && selectionOrder.length > 0
      ? selectionOrder
      : entries.slice().sort(compareLabelEntries);

  for (let i = 0; i < orderedEntries.length; i++) {
    ranksByLabelId[orderedEntries[i].labelId] = i;
  }

  return ranksByLabelId;
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

function getLabelAlignmentOffset(alignment) {
  if (alignment > 0.5) {
    return 1;
  }
  if (alignment < -0.5) {
    return -1;
  }
  return 0;
}

function getLabelBaselineOffset(baseline) {
  if (baseline > 0.5) {
    return 1;
  }
  if (baseline < -0.5) {
    return -1;
  }
  return 0;
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

  if (
    maxCellX < 0 ||
    maxCellY < 0 ||
    minCellX >= gridWidth ||
    minCellY >= gridHeight
  ) {
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
  labelAlignment = 0,
  labelBaseline = 1,
  labelFontSize = 1,
  labelNear = 0,
  labelOffset = { x: 0, y: 0 },
  pointSize = 1,
}) {
  LOCAL_NODE.copy(nodePosition);
  LOCAL_NODE.z *= 1.0 - Number(Boolean(is2D));

  MODEL_VIEW_MATRIX.multiplyMatrices(
    camera.matrixWorldInverse,
    objectMatrixWorld,
  );
  MV_CENTER.set(LOCAL_NODE.x, LOCAL_NODE.y, LOCAL_NODE.z, 1.0);
  MV_CENTER.applyMatrix4(MODEL_VIEW_MATRIX);

  if (!Number.isFinite(MV_CENTER.z) || MV_CENTER.z >= 0) {
    return null;
  }

  const viewDistance = -MV_CENTER.z;
  const nearDistance = sanitizeLabelNearDistance(labelNear);

  if (viewDistance <= nearDistance) {
    return null;
  }

  const sizeScale = sizeAttenuation
    ? frustumSize / Math.max(viewDistance, 0.001)
    : 1.0;
  const labelPixelHeight =
    0.1 *
    nodeRadius *
    pointSize *
    nodeScale *
    sizeScale *
    sanitizeLabelFontSize(labelFontSize);
  const projectionScaleY = Math.max(
    Math.abs(camera.projectionMatrix.elements[5]),
    0.0001,
  );
  const depthScale = camera.isPerspectiveCamera ? viewDistance : 1.0;
  const worldUnitsPerPixel =
    (2.0 * depthScale) /
    Math.max(projectionScaleY * Math.max(viewportHeight, 1), 0.001);
  const labelHeight = labelPixelHeight * worldUnitsPerPixel;
  const labelWidth = labelHeight * aspectRatio;
  const offsetX = (labelOffset?.x || 0) * labelHeight;
  const offsetY = (labelOffset?.y || 0) * labelHeight;

  WORLD_CENTER.copy(LOCAL_NODE).applyMatrix4(objectMatrixWorld);
  CAMERA_RIGHT.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  CAMERA_UP.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

  const anchor = WORLD_CORNER.copy(WORLD_CENTER)
    .addScaledVector(
      CAMERA_RIGHT,
      labelWidth * 0.5 * getLabelAlignmentOffset(labelAlignment) + offsetX,
    )
    .addScaledVector(
      CAMERA_UP,
      labelHeight * getLabelBaselineOffset(labelBaseline) + offsetY,
    );
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let ix = -1; ix <= 1; ix += 2) {
    for (let iy = -1; iy <= 1; iy += 2) {
      PROJECTED_CORNER.copy(anchor)
        .addScaledVector(CAMERA_RIGHT, ix * labelWidth * 0.5)
        .addScaledVector(CAMERA_UP, iy * labelHeight * 0.5)
        .project(camera);

      if (
        !Number.isFinite(PROJECTED_CORNER.x) ||
        !Number.isFinite(PROJECTED_CORNER.y)
      ) {
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

  if (
    maxX <= 0 ||
    maxY <= 0 ||
    minX >= viewportWidth ||
    minY >= viewportHeight
  ) {
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
    viewDistance,
    depthPriority: 1.0 / Math.max(viewDistance, 0.001),
    clipped:
      minX < 0 || minY < 0 || maxX > viewportWidth || maxY > viewportHeight,
  };
}

function configureAtlasTexture(texture, options = {}) {
  const useMipmaps = Boolean(options.useMipmaps);
  texture.minFilter = useMipmaps ? LinearMipmapLinearFilter : LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = useMipmaps;
  texture.needsUpdate = true;
  return texture;
}

class Labels extends Mesh {
  constructor({ geometry, texture, entries, fontFamily }, uniforms) {
    const material = new ShaderMaterial({
      uniforms: {
        ...UniformsLib.fog,
        ...{
          texturePositions: { value: null },
          textureAtlas: { value: texture },
          opacity: uniforms.opacity,
          obscurity: uniforms.obscurity,
          frustumSize: uniforms.frustumSize,
          inheritColors: uniforms.labelsInheritColor,
          is2D: uniforms.is2D,
          sizeAttenuation: uniforms.sizeAttenuation,
          resolution: uniforms.resolution,
          nodeRadius: uniforms.nodeRadius,
          nodeScale: uniforms.nodeScale,
          uLabelCount: { value: entries.length },
          uColor: uniforms.labelColor,
          labelAlignment: uniforms.labelAlignment,
          labelBaseline: uniforms.labelBaseline,
          labelFontSize: uniforms.labelFontSize,
          labelNear: uniforms.labelNear,
          labelOffset: uniforms.labelOffset,
          uBeginning: uniforms.uBeginning,
          uEnding: uniforms.uEnding,
          uNodeAmount: uniforms.uNodeAmount,
        },
      },
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      depthTest: false,
      fog: true,
    });

    super(geometry, material);

    this.frustumCulled = false;
    this.entries = entries;
    this.userData.fontFamily = fontFamily || DEFAULT_FONT_FAMILY;
    this.userData.fontSize = uniforms.labelFontSize.value;
    this.userData.near = sanitizeLabelNearDistance(uniforms.labelNear.value);
  }

  dispose() {
    this.material.uniforms.textureAtlas.value?.dispose?.();
    this.material.dispose();
    this.geometry.dispose();
  }

  replaceData({
    geometry,
    texture,
    entries,
    fontFamily,
    fontSize,
  }) {
    this.geometry.dispose();
    this.material.uniforms.textureAtlas.value?.dispose?.();

    this.geometry = geometry;
    this.entries = entries;
    this.material.uniforms.textureAtlas.value = texture;
    this.material.uniforms.uLabelCount.value = entries.length;
    this.userData.fontFamily = fontFamily || DEFAULT_FONT_FAMILY;
    this.userData.fontSize = sanitizeLabelFontSize(fontSize);
    this.userData.near = sanitizeLabelNearDistance(
      this.material.uniforms.labelNear.value,
    );
  }

  get fontSize() {
    if (this.parent?.userData?.uniforms?.labelFontSize) {
      return this.parent.userData.uniforms.labelFontSize.value;
    }
    return this.userData.fontSize;
  }

  set fontSize(v) {
    const nextValue = sanitizeLabelFontSize(v);
    this.userData.fontSize = nextValue;

    if (!this.material?.uniforms?.labelFontSize) {
      return;
    }

    if (this.material.uniforms.labelFontSize.value === nextValue) {
      return;
    }

    this.material.uniforms.labelFontSize.value = nextValue;
  }

  get fontFamily() {
    if (this.parent?.userData?.labelFontFamily) {
      return this.parent.userData.labelFontFamily;
    }
    return this.userData.fontFamily;
  }

  set fontFamily(v) {
    const nextValue =
      typeof v === 'string' && v.trim().length > 0
        ? v.trim()
        : DEFAULT_FONT_FAMILY;
    this.userData.fontFamily = nextValue;

    if (!this.parent?.userData) {
      return;
    }

    if (this.parent.userData.labelFontFamily === nextValue) {
      return;
    }

    this.parent.userData.labelFontFamily = nextValue;
    this.parent.refreshLabels();
  }

  get alignment() {
    return getLabelAlignmentName(this.material.uniforms.labelAlignment.value);
  }

  set alignment(v) {
    this.material.uniforms.labelAlignment.value =
      LabelAlignmentMap[v] ?? LabelAlignmentMap.center;
  }

  get baseline() {
    return getLabelBaselineName(this.material.uniforms.labelBaseline.value);
  }

  set baseline(v) {
    this.material.uniforms.labelBaseline.value =
      LabelBaselineMap[v] ?? LabelBaselineMap.top;
  }

  get offset() {
    return this.material.uniforms.labelOffset.value;
  }

  set offset(v) {
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
      return;
    }
    this.material.uniforms.labelOffset.value.set(v.x, v.y);
  }

  get near() {
    if (this.parent?.userData?.uniforms?.labelNear) {
      return this.parent.userData.uniforms.labelNear.value;
    }
    return this.userData.near;
  }

  set near(v) {
    const nextValue = sanitizeLabelNearDistance(v);
    this.userData.near = nextValue;

    if (!this.material?.uniforms?.labelNear) {
      return;
    }

    if (this.material.uniforms.labelNear.value === nextValue) {
      return;
    }

    this.material.uniforms.labelNear.value = nextValue;
  }

  static parse(size, data, options = {}) {
    const atlas = buildTextAtlas(data.nodes, options.degrees || [], options);

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
    const colors = [];
    const labelUVs = [];
    const aspectRatios = [];
    const pointSizes = [];
    const selectionOrder = buildLabelSelectionOrder(
      entries,
      options.adjacency || [],
      data.nodes,
      options.degrees || [],
    );
    const selectionRanksByLabelId = buildSelectionRanks(entries, selectionOrder);
    const selectionRanks = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const x = (entry.nodeIndex % size) / size;
      const y = Math.floor(entry.nodeIndex / size) / size;
      const z = entry.nodeIndex + 1;

      sources.push(x, y, z);
      colors.push(...getNodeColorComponents(data.nodes[entry.nodeIndex]));
      labelUVs.push(
        entry.atlasUV.u,
        entry.atlasUV.v,
        entry.atlasUV.uw,
        entry.atlasUV.uh,
      );
      aspectRatios.push(entry.aspectRatio);
      pointSizes.push(entry.pointSize);
      selectionRanks.push(selectionRanksByLabelId[entry.labelId]);
    }

    geometry.setAttribute(
      'source',
      new InstancedBufferAttribute(new Float32Array(sources), 3),
    );
    geometry.setAttribute(
      'color',
      new InstancedBufferAttribute(new Float32Array(colors), 3),
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
      'pointSize',
      new InstancedBufferAttribute(new Float32Array(pointSizes), 1),
    );
    geometry.setAttribute(
      'selectionRank',
      new InstancedBufferAttribute(new Float32Array(selectionRanks), 1),
    );
    geometry.instanceCount = entries.length;

    const texture = configureAtlasTexture(new CanvasTexture(canvas), options);

    return Promise.resolve({
      geometry,
      texture,
      entries,
      fontFamily: options.fontFamily || DEFAULT_FONT_FAMILY,
      fontSize: sanitizeLabelFontSize(options.fontSize),
    });
  }
}

const __TEST__ = {
  buildLabelSelectionOrder,
  buildSelectionRanks,
  buildSortTuple,
  clamp01,
  compareLabelEntries,
  compareProjectedEntries,
  getCollisionCellBounds,
  getLabelBasePriority,
  getLabelAlignmentOffset,
  getLabelBaselineOffset,
  getVisibleQuota,
  getPlacementTextureDimensions,
  getNodeColorComponents,
  sanitizeLabelFontSize,
  sanitizeLabelNearDistance,
  intersectsBounds,
  packCollisionCellKey,
  projectLabelBounds,
  configureAtlasTexture,
};

export { Labels, __TEST__ };
