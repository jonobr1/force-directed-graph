// @vitest-environment jsdom
import { act, createElement as h, createRef, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ renderers: [], graphs: [], controls: [] }));
vi.mock('three', async (original) => {
  const three = await original();
  return { ...three, WebGLRenderer: class {
    domElement = document.createElement('canvas');
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    setClearColor = vi.fn();
    setAnimationLoop = vi.fn((callback) => { this.loop = callback; });
    render = vi.fn();
    dispose = vi.fn();
    constructor() { mocks.renderers.push(this); }
  } };
});
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    enabled = true;
    update = vi.fn();
    dispose = vi.fn();
    constructor() { mocks.controls.push(this); }
  },
}));
vi.mock('../index.js', async () => {
  const { Group } = await import('three');
  return { ForceDirectedGraph: class extends Group {
    static Properties = ['linewidth'];
    ready = false;
    set = vi.fn(async () => { this.ready = true; });
    update = vi.fn();
    dispose = vi.fn();
    constructor() { super(); mocks.graphs.push(this); }
  } };
});
import { ForceDirectedGraph } from './index.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const data = { nodes: [{ id: 'a' }], links: [] };
let root;
let host;
afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  host?.remove();
  root = null;
  mocks.renderers.length = mocks.graphs.length = mocks.controls.length = 0;
  vi.unstubAllGlobals();
});

describe('standalone React component', () => {
  it('survives StrictMode, updates props, pauses, resizes, and cleans up', async () => {
    const observers = [];
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(callback) { this.callback = callback; observers.push(this); }
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const ref = createRef();
    const onReady = vi.fn();
    const render = (props) => h(StrictMode, null, h(ForceDirectedGraph, { data, ref, onReady, ...props }));
    await act(async () => root.render(render({ options: { linewidth: 2 } })));
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    expect(mocks.renderers[0].dispose).toHaveBeenCalledOnce();
    const renderer = mocks.renderers.at(-1);
    const graph = mocks.graphs.at(-1);
    expect(ref.current).toBe(graph);
    expect(onReady).toHaveBeenCalledOnce();
    renderer.loop(1234);
    expect(graph.update).toHaveBeenCalledWith(1234);
    await act(async () => root.render(render({ paused: true, controls: false, options: { linewidth: 4 } })));
    renderer.loop(2000);
    expect(graph.update).toHaveBeenCalledTimes(1);
    expect(graph.linewidth).toBe(4);
    expect(graph.set).toHaveBeenCalledTimes(1);
    expect(mocks.controls.at(-1).enabled).toBe(false);
    const container = host.firstChild;
    Object.defineProperties(container, { clientWidth: { value: 640 }, clientHeight: { value: 320 } });
    observers.at(-1).callback();
    expect(renderer.setSize).toHaveBeenLastCalledWith(640, 320);
    await act(async () => root.render(render({ data: { nodes: [{ id: 'b' }], links: [] } })));
    expect(graph.set).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
    root = null;
    expect(ref.current).toBeNull();
    expect(renderer.loop).toBeNull();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(graph.dispose).toHaveBeenCalledOnce();
    expect(mocks.controls.at(-1).dispose).toHaveBeenCalledOnce();
    expect(observers.at(-1).disconnect).toHaveBeenCalledOnce();
    expect(host.querySelectorAll('canvas')).toHaveLength(0);
  });
});
