import { describe, expect, it, vi } from 'vitest';
import { Group } from 'three';

vi.mock('../index.js', () => ({
  ForceDirectedGraph: class extends Group {
    static Properties = ['alpha', 'linewidth', 'pointColor'];
    ready = false;
    loads = [];
    set = vi.fn((data) => new Promise((resolve, reject) => {
      data.links.forEach((link) => { link.sourceIndex = 0; });
      this.loads.push({
        resolve: () => { this.ready = true; resolve(); }, reject,
      });
    }));
    dispose = vi.fn();
  },
}));

import { createGraphController } from './graph-controller.js';

const data = (id) => ({ nodes: [{ id }], links: [{ source: id, target: id }] });
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('React graph lifecycle', () => {
  it('serializes and coalesces loads without mutating caller data', async () => {
    const onReady = vi.fn();
    const controller = createGraphController({}, { onReady });
    const first = data(1);
    Object.freeze(first.links[0]);
    controller.setData(first);
    controller.setData(data(2));
    controller.setData(data(3));
    expect(controller.graph.set).toHaveBeenCalledTimes(1);
    controller.graph.loads[0].resolve();
    await flush();
    expect(onReady).not.toHaveBeenCalled();
    expect(controller.graph.set).toHaveBeenCalledTimes(2);
    expect(controller.graph.set.mock.calls[1][0].nodes[0].id).toBe(3);
    expect(first.links[0]).not.toHaveProperty('sourceIndex');
    controller.configure({ linewidth: 4, pointColor: '#ff0000' });
    controller.graph.loads[1].resolve();
    await flush();
    expect(onReady).toHaveBeenCalledWith(controller.graph);
    expect(controller.graph.linewidth).toBe(4);
    expect(controller.graph.pointColor.getHex()).toBe(0xff0000);
    await controller.dispose();
  });

  it('detaches immediately and disposes once after an in-flight load', async () => {
    const onReady = vi.fn();
    const controller = createGraphController({}, { onReady });
    const parent = new Group();
    parent.add(controller.graph);
    controller.setData(data(1));
    controller.setData(data(2));
    const disposal = controller.dispose();
    expect(controller.dispose()).toBe(disposal);
    expect(parent.children).toHaveLength(0);
    expect(controller.graph.dispose).not.toHaveBeenCalled();
    controller.graph.loads[0].resolve();
    await disposal;
    expect(controller.graph.dispose).toHaveBeenCalledTimes(1);
    expect(controller.graph.set).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('reports load errors and recovers with new data', async () => {
    const onError = vi.fn();
    const onReady = vi.fn();
    const controller = createGraphController({}, { onReady, onError });
    controller.setData(data(1));
    const error = new Error('GPU unavailable');
    controller.graph.loads[0].reject(error);
    await flush();
    expect(onError).toHaveBeenCalledWith(error);
    controller.setData(data(2));
    controller.graph.loads[1].resolve();
    await flush();
    expect(onReady).toHaveBeenCalledOnce();
    await controller.dispose();
  });
});
