import { describe, expect, it } from 'vitest';
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  PerspectiveCamera,
} from 'three';
import { __TEST__ } from './labels.js';

describe('label placement helpers', () => {
  it('maps obscurity to a visible label quota', () => {
    expect(__TEST__.getVisibleQuota(0, 100)).toBe(100);
    expect(__TEST__.getVisibleQuota(0.75, 100)).toBe(25);
    expect(__TEST__.getVisibleQuota(1, 100)).toBe(0);
    expect(__TEST__.getVisibleQuota(-1, 8)).toBe(8);
    expect(__TEST__.getVisibleQuota(2, 8)).toBe(0);
    expect(__TEST__.sanitizeLabelFontSize(0)).toBe(0.01);
    expect(__TEST__.sanitizeLabelFontSize(Number.NaN)).toBe(1);
    expect(__TEST__.sanitizeLabelNearDistance(-1)).toBe(0);
    expect(__TEST__.sanitizeLabelNearDistance(Number.NaN)).toBe(0);
    expect(__TEST__.getLabelAlignmentOffset(0)).toBe(0);
    expect(__TEST__.getLabelAlignmentOffset(1)).toBe(1);
    expect(__TEST__.getLabelAlignmentOffset(-1)).toBe(-1);
    expect(__TEST__.getLabelBaselineOffset(1)).toBe(1);
    expect(__TEST__.getLabelBaselineOffset(0)).toBe(0);
    expect(__TEST__.getLabelBaselineOffset(-1)).toBe(-1);
    expect(__TEST__.getNodeColorComponents({ color: '#ff0000' })).toEqual([1, 0, 0]);
    expect(__TEST__.getNodeColorComponents({})).toEqual([1, 1, 1]);
  });

  it('derives label priority deterministically', () => {
    expect(__TEST__.getLabelBasePriority({
      labelPriority: 9,
      size: 4,
    }, 2)).toBe(9);
    expect(__TEST__.getLabelBasePriority({
      size: 4,
    }, 7)).toBe(4);
    expect(__TEST__.getLabelBasePriority({}, 7)).toBe(7);

    const entries = [
      { basePriority: 3, stableId: 9 },
      { basePriority: 5, stableId: 4 },
      { basePriority: 5, stableId: 2 },
    ];

    entries.sort(__TEST__.compareLabelEntries);

    expect(entries).toEqual([
      { basePriority: 5, stableId: 2 },
      { basePriority: 5, stableId: 4 },
      { basePriority: 3, stableId: 9 },
    ]);

    const projectedEntries = [
      {
        entry: { basePriority: 5, stableId: 1, persistence: 0 },
        depthPriority: 4,
      },
      {
        entry: { basePriority: 5, stableId: 2, persistence: 3 },
        depthPriority: 2,
      },
      {
        entry: { basePriority: 5, stableId: 3, persistence: 3 },
        depthPriority: 6,
      },
    ];

    projectedEntries.sort(__TEST__.compareProjectedEntries);

    expect(projectedEntries.map((projected) => projected.entry.stableId)).toEqual([
      3,
      2,
      1,
    ]);
  });

  it('projects label bounds using the render-time size math', () => {
    const camera = new PerspectiveCamera(50, 2, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const bounds = __TEST__.projectLabelBounds({
      nodePosition: { x: 0, y: 0, z: 0 },
      objectMatrixWorld: new Matrix4(),
      camera,
      viewportWidth: 400,
      viewportHeight: 200,
      frustumSize: 100,
      is2D: false,
      sizeAttenuation: false,
      nodeRadius: 1,
      nodeScale: 10,
      aspectRatio: 4,
    });

    expect(bounds).not.toBeNull();
    expect(bounds.width).toBeGreaterThan(bounds.height * 3.5);
    expect(bounds.centerY).toBeLessThan(100);
    expect(bounds.clipped).toBe(false);
    expect(bounds.depthPriority).toBeGreaterThan(0);

    const leftBottomBounds = __TEST__.projectLabelBounds({
      nodePosition: { x: 0, y: 0, z: 0 },
      objectMatrixWorld: new Matrix4(),
      camera,
      viewportWidth: 400,
      viewportHeight: 200,
      frustumSize: 100,
      is2D: false,
      sizeAttenuation: false,
      nodeRadius: 1,
      nodeScale: 10,
      aspectRatio: 4,
      labelAlignment: 1,
      labelBaseline: -1,
      labelFontSize: 2,
    });

    expect(leftBottomBounds.centerX).toBeGreaterThan(bounds.centerX);
    expect(leftBottomBounds.centerY).toBeGreaterThan(bounds.centerY);
    expect(leftBottomBounds.height).toBeGreaterThan(bounds.height);

    const offsetBounds = __TEST__.projectLabelBounds({
      nodePosition: { x: 0, y: 0, z: 0 },
      objectMatrixWorld: new Matrix4(),
      camera,
      viewportWidth: 400,
      viewportHeight: 200,
      frustumSize: 100,
      is2D: false,
      sizeAttenuation: false,
      nodeRadius: 1,
      nodeScale: 10,
      aspectRatio: 4,
      labelOffset: { x: 1, y: -0.5 },
    });

    expect(offsetBounds.centerX).toBeGreaterThan(bounds.centerX);
    expect(offsetBounds.centerY).toBeGreaterThan(bounds.centerY);

    const largePointBounds = __TEST__.projectLabelBounds({
      nodePosition: { x: 0, y: 0, z: 0 },
      objectMatrixWorld: new Matrix4(),
      camera,
      viewportWidth: 400,
      viewportHeight: 200,
      frustumSize: 100,
      is2D: false,
      sizeAttenuation: false,
      nodeRadius: 1,
      nodeScale: 10,
      aspectRatio: 4,
      pointSize: 2,
    });

    expect(largePointBounds.height).toBeGreaterThan(bounds.height);

    const culledBounds = __TEST__.projectLabelBounds({
      nodePosition: { x: 0, y: 0, z: 0 },
      objectMatrixWorld: new Matrix4(),
      camera,
      viewportWidth: 400,
      viewportHeight: 200,
      frustumSize: 100,
      is2D: false,
      sizeAttenuation: false,
      nodeRadius: 1,
      nodeScale: 10,
      aspectRatio: 4,
      labelNear: 10,
    });

    expect(culledBounds).toBeNull();

    const nearFixedBounds = __TEST__.projectLabelBounds({
      nodePosition: { x: 0, y: 0, z: 0 },
      objectMatrixWorld: new Matrix4(),
      camera,
      viewportWidth: 400,
      viewportHeight: 200,
      frustumSize: 100,
      is2D: false,
      sizeAttenuation: false,
      nodeRadius: 1,
      nodeScale: 10,
      aspectRatio: 4,
    });

    const farFixedBounds = __TEST__.projectLabelBounds({
      nodePosition: { x: 0, y: 0, z: -10 },
      objectMatrixWorld: new Matrix4(),
      camera,
      viewportWidth: 400,
      viewportHeight: 200,
      frustumSize: 100,
      is2D: false,
      sizeAttenuation: false,
      nodeRadius: 1,
      nodeScale: 10,
      aspectRatio: 4,
    });

    expect(nearFixedBounds.height).toBeCloseTo(farFixedBounds.height, 6);

    const nearAttenuatedBounds = __TEST__.projectLabelBounds({
      nodePosition: { x: 0, y: 0, z: 0 },
      objectMatrixWorld: new Matrix4(),
      camera,
      viewportWidth: 400,
      viewportHeight: 200,
      frustumSize: 100,
      is2D: false,
      sizeAttenuation: true,
      nodeRadius: 1,
      nodeScale: 10,
      aspectRatio: 4,
    });

    const farAttenuatedBounds = __TEST__.projectLabelBounds({
      nodePosition: { x: 0, y: 0, z: -10 },
      objectMatrixWorld: new Matrix4(),
      camera,
      viewportWidth: 400,
      viewportHeight: 200,
      frustumSize: 100,
      is2D: false,
      sizeAttenuation: true,
      nodeRadius: 1,
      nodeScale: 10,
      aspectRatio: 4,
    });

    expect(nearAttenuatedBounds.height).toBeGreaterThan(farAttenuatedBounds.height);
  });

  it('packs collision cells and sort tuples consistently', () => {
    expect(__TEST__.packCollisionCellKey(2, 3, 10)).toBe(32);
    expect(__TEST__.getCollisionCellBounds({
      minX: 15,
      minY: 15,
      maxX: 47,
      maxY: 63,
    }, 16, 8, 8)).toEqual({
      minCellX: 0,
      maxCellX: 2,
      minCellY: 0,
      maxCellY: 3,
    });
    expect(__TEST__.buildSortTuple(12, {
      basePriority: 8,
      stableId: 4,
      labelId: 1,
    })).toEqual({
      cellId: 12,
      priorityKey: -8,
      stableId: 4,
      labelId: 1,
    });
  });

  it('builds a stable graph-topology label order', () => {
    const entries = [
      { labelId: 0, nodeIndex: 0, stableId: 0 },
      { labelId: 1, nodeIndex: 1, stableId: 1 },
      { labelId: 2, nodeIndex: 2, stableId: 2 },
      { labelId: 3, nodeIndex: 3, stableId: 3 },
      { labelId: 4, nodeIndex: 4, stableId: 4 },
    ];
    const nodes = entries.map((entry) => ({ id: entry.nodeIndex }));
    nodes[4].labelPriority = 10;

    const adjacency = [
      [1],
      [0, 2],
      [1, 3],
      [2, 4],
      [3],
    ];
    const degrees = [1, 2, 2, 2, 1];

    const order = __TEST__.buildLabelSelectionOrder(
      entries,
      adjacency,
      nodes,
      degrees,
      3,
    );

    expect(order.map((entry) => entry.nodeIndex)).toEqual([4, 0, 2, 1, 3]);
    expect(Array.from(__TEST__.buildSelectionRanks(entries, order))).toEqual([
      1, 3, 2, 4, 0,
    ]);
  });

  it('configures atlas textures for smoother sampling', () => {
    const texture = __TEST__.configureAtlasTexture({});

    expect(texture.minFilter).toBe(LinearFilter);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.wrapS).toBe(ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(ClampToEdgeWrapping);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.needsUpdate).toBe(true);
  });

  it('configures atlas textures with mipmaps when requested', () => {
    const texture = __TEST__.configureAtlasTexture({}, { useMipmaps: true });

    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.needsUpdate).toBe(true);
  });
});
