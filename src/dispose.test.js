import { Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ForceDirectedGraph } from './index.js';

describe('graph resource disposal', () => {
  it('releases all owned resources once and stops updates', () => {
    const graph = new ForceDirectedGraph({});
    const resource = () => ({ dispose: vi.fn() });
    const points = new Group();
    points.geometry = resource();
    const atlas = resource();
    points.material = { ...resource(), uniforms: { textureAtlas: { value: atlas } } };
    const links = new Group();
    links.geometry = resource();
    links.material = resource();
    const labels = new Group();
    labels.dispose = vi.fn();
    graph.add(points, links, labels);
    const variable = { material: resource() };
    const compute = { variables: [variable], dispose: vi.fn() };
    const textures = { links: resource(), linkRanges: resource(), targetPositions: resource() };
    graph.userData.gpgpu = compute;
    graph.userData.textures = textures;
    const hit = graph.userData.hit;
    const hitTarget = vi.spyOn(hit.renderTarget, 'dispose');
    const hitMaterial = vi.spyOn(hit.material, 'dispose');
    const worker = vi.spyOn(graph.userData.workerManager, 'dispose');
    graph.ready = true;
    graph.dispose();
    graph.dispose();
    expect(graph.ready).toBe(false);
    expect(graph.children).toHaveLength(0);
    expect(() => graph.update(1000)).not.toThrow();
    for (const item of [points.geometry, points.material, atlas, links.geometry,
      links.material, labels, variable.material, compute, ...Object.values(textures)]) {
      expect(item.dispose).toHaveBeenCalledOnce();
    }
    expect(hitTarget).toHaveBeenCalledOnce();
    expect(hitMaterial).toHaveBeenCalledOnce();
    expect(worker).toHaveBeenCalledOnce();
  });
});
