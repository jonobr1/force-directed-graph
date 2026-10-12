import { createElement as h, createRef } from 'react';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../index.js', async () => {
  const { Group } = await import('three');
  return { ForceDirectedGraph: class extends Group {
    static Properties = ['linewidth'];
    ready = false;
    set = vi.fn(async () => { this.ready = true; });
    update = vi.fn();
    dispose = vi.fn();
    constructor(renderer) { super(); this.renderer = renderer; }
  } };
});
import { ForceDirectedGraph } from './index.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('R3F component', () => {
  it('composes with a Canvas, uses milliseconds, pauses, and preserves its renderer', async () => {
    const ref = createRef();
    const data = { nodes: [{ id: 'a' }], links: [] };
    const onReady = vi.fn();
    const render = (props = {}) => h(ForceDirectedGraph, {
      ref, data, onReady, position: [1, 2, 3], ...props,
    }, h('mesh', { name: 'child' }, h('boxGeometry'), h('meshBasicMaterial')));
    const renderer = await ReactThreeTestRenderer.create(render());
    const graph = ref.current;
    const child = graph.parent.children.find((value) => value.name === 'child');
    const childDispose = vi.spyOn(child.geometry, 'dispose');
    const canvasDispose = vi.spyOn(graph.renderer, 'dispose');
    expect(graph.parent.position.toArray()).toEqual([1, 2, 3]);
    expect(graph.parent.children).toHaveLength(2);
    expect(onReady).toHaveBeenCalledWith(graph);
    await renderer.advanceFrames(1, 0.5);
    // Test renderer doesn't advance Clock, so set it directly via its store.
    const frameState = graph.parent.__r3f.root.getState();
    frameState.clock.elapsedTime = 2;
    await renderer.advanceFrames(1, 0.5);
    expect(graph.update).toHaveBeenLastCalledWith(2000);
    const calls = graph.update.mock.calls.length;
    await renderer.update(render({ paused: true, options: { linewidth: 3 } }));
    await renderer.advanceFrames(1, 0.5);
    expect(graph.update).toHaveBeenCalledTimes(calls);
    expect(graph.linewidth).toBe(3);
    expect(graph.set).toHaveBeenCalledTimes(1);
    await renderer.update(render({ data: { nodes: [{ id: 'b' }], links: [] } }));
    expect(graph.set).toHaveBeenCalledTimes(2);
    await renderer.unmount();
    expect(graph.parent).toBeNull();
    expect(graph.dispose).toHaveBeenCalledOnce();
    expect(canvasDispose).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
    // Fiber schedules disposal of ordinary declarative children independently.
    await vi.waitFor(() => expect(childDispose).toHaveBeenCalledOnce());
  });
});
