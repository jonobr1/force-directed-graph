import { BufferGeometry, Float32BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';

import { ForceDirectedGraph } from '../index.js';
import { Links } from '../links.js';

function createPointsGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [
        0, 0, 1,
        0.5, 0, 2,
      ],
      3,
    ),
  );
  geometry.setAttribute(
    'color',
    new Float32BufferAttribute(
      [
        1, 0, 0,
        0, 1, 0,
      ],
      3,
    ),
  );
  return geometry;
}

describe('Links.parse', () => {
  it('throws when a link resolves to an invalid node index', async () => {
    const points = { geometry: createPointsGeometry() };
    const data = {
      links: [
        { sourceIndex: 0, targetIndex: 1 },
        { source: 'alpha', target: 'missing', sourceIndex: 0, targetIndex: 4 },
      ],
    };

    await expect(Links.parse(points, data)).rejects.toThrow(
      /Invalid link at data\.links\[1\]/,
    );
  });
});

describe('ForceDirectedGraph.updateLinksColors', () => {
  it('updates every instanced link color from the current point colors', async () => {
    const pointsGeometry = createPointsGeometry();
    const linksGeometry = await Links.parse(
      { geometry: pointsGeometry },
      {
        links: [
          { sourceIndex: 0, targetIndex: 1 },
          { sourceIndex: 1, targetIndex: 0 },
        ],
      },
    );
    const sourceColors = linksGeometry.getAttribute('sourceColor');
    const targetColors = linksGeometry.getAttribute('targetColor');
    const initialSourceVersion = sourceColors.version;
    const initialTargetVersion = targetColors.version;

    pointsGeometry.getAttribute('color').array.set([
      0.2, 0.4, 0.6,
      0.6, 0.4, 0.2,
    ]);

    const graph = {
      userData: {
        data: {
          links: [
            { sourceIndex: 0, targetIndex: 1 },
            { sourceIndex: 1, targetIndex: 0 },
          ],
        },
      },
      points: { geometry: pointsGeometry },
      links: { geometry: linksGeometry },
    };

    const result = await ForceDirectedGraph.prototype.updateLinksColors.call(
      graph,
    );

    expect(result).toBe(true);
    expect(Array.from(sourceColors.array)).toEqual(
      expect.arrayContaining([
        expect.closeTo(0.2, 6),
        expect.closeTo(0.4, 6),
        expect.closeTo(0.6, 6),
        expect.closeTo(0.6, 6),
        expect.closeTo(0.4, 6),
        expect.closeTo(0.2, 6),
      ]),
    );
    expect(Array.from(targetColors.array)).toEqual(
      expect.arrayContaining([
        expect.closeTo(0.6, 6),
        expect.closeTo(0.4, 6),
        expect.closeTo(0.2, 6),
        expect.closeTo(0.2, 6),
        expect.closeTo(0.4, 6),
        expect.closeTo(0.6, 6),
      ]),
    );
    expect(sourceColors.version).toBeGreaterThan(initialSourceVersion);
    expect(targetColors.version).toBeGreaterThan(initialTargetVersion);
  });
});
