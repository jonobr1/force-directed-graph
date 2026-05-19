import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera } from 'three';
import { __TEST__ } from './labels.js';

describe('label placement helpers', () => {
  it('maps obscurity to a visible label quota', () => {
    expect(__TEST__.getVisibleQuota(0, 100)).toBe(100);
    expect(__TEST__.getVisibleQuota(0.75, 100)).toBe(25);
    expect(__TEST__.getVisibleQuota(1, 100)).toBe(0);
    expect(__TEST__.getVisibleQuota(-1, 8)).toBe(8);
    expect(__TEST__.getVisibleQuota(2, 8)).toBe(0);
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
});
