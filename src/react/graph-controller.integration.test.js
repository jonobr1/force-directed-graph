// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForceDirectedGraph } from '../index.js';
import { createGraphController } from './graph-controller.js';

const data = { nodes: [{ id: 'a' }], links: [] };
const renderer = () => ({
  capabilities: { isWebGL2: true, maxVertexTextures: 16 },
  xr: { enabled: false },
  shadowMap: { autoUpdate: false },
  getRenderTarget: () => null,
  setRenderTarget: vi.fn(),
  render: vi.fn(),
});

beforeEach(() => {
  vi.stubGlobal('Worker', undefined);
  // These nodes have no labels or images, so no canvas drawing is needed.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('data-loading errors with the real graph core', () => {
  it('rejects set() with the original error and recovers on the next load', async () => {
    const graph = new ForceDirectedGraph(renderer());
    const error = new Error('Texture initialization failed', {
      cause: new Error('Worker unavailable'),
    });
    vi.spyOn(graph.userData.workerManager, 'init')
      .mockRejectedValueOnce(error).mockResolvedValue(false);
    const onReady = vi.fn();
    try {
      await expect(graph.set(data, onReady)).rejects.toBe(error);
      expect(graph.ready).toBe(false);
      expect(onReady).not.toHaveBeenCalled();
      await graph.set(data, onReady);
      expect(graph.ready).toBe(true);
      expect(onReady).toHaveBeenCalledOnce();
    } finally {
      graph.dispose();
    }
  });

  it('forwards the original core error to onError and then loads successfully', async () => {
    const onError = vi.fn();
    const onReady = vi.fn();
    const controller = createGraphController(renderer(), { onError, onReady });
    const error = new Error('Texture initialization failed', {
      cause: new Error('Worker unavailable'),
    });
    vi.spyOn(controller.graph.userData.workerManager, 'init')
      .mockRejectedValueOnce(error).mockResolvedValue(false);
    try {
      controller.setData(data);
      await vi.waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith(error));
      expect(onReady).not.toHaveBeenCalled();
      controller.setData(data);
      await vi.waitFor(() => expect(onReady).toHaveBeenCalledExactlyOnceWith(controller.graph));
      expect(onError).toHaveBeenCalledOnce();
    } finally {
      await controller.dispose();
    }
  });

  it('preserves GPU initialization diagnostics for constructor loading', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const gl = renderer();
    gl.capabilities.maxVertexTextures = 0;
    const graph = new ForceDirectedGraph(gl, data);
    try {
      await vi.waitFor(() => expect(warn).toHaveBeenCalledExactlyOnceWith(
        'Force Directed Graph:', 'No support for vertex shader textures.',
      ));
      expect(graph.ready).toBe(false);
    } finally {
      graph.dispose();
    }
  });
});
