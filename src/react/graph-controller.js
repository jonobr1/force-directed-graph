import { ForceDirectedGraph } from '../index.js';
import { Color } from 'three';

// set() changes GPU resources asynchronously. Serialize replacements and keep
// resources alive until the last in-flight load settles, including on unmount.
export function createGraphController(renderer, callbacks = {}) {
  const graph = new ForceDirectedGraph(renderer);
  let options = {};
  let pending = null;
  let loading = null;
  let closed = false;
  let disposal = null;

  function applyOptions() {
    for (const key of ForceDirectedGraph.Properties) {
      if (options[key] !== undefined) {
        graph[key] = ['pointColor', 'linkColor', 'labelColor'].includes(key)
          ? new Color(options[key]) : options[key];
      }
    }
  }

  async function drain() {
    while (pending && !closed) {
      const data = pending;
      pending = null;
      try {
        // The core annotates links with indices; preserve React-owned data.
        await graph.set({
          nodes: data.nodes.map((node) => ({ ...node })),
          links: data.links.map((link) => ({ ...link })),
        });
        if (closed || pending) continue;
        if (!graph.ready) throw new Error('Force Directed Graph failed to initialize.');
        applyOptions();
        callbacks.onReady?.(graph);
      } catch (error) {
        if (!closed && !pending) callbacks.onError?.(error);
      }
    }
  }

  return {
    graph,
    configure(nextOptions = {}) {
      options = nextOptions;
      if (!closed) applyOptions();
    },
    setData(data) {
      if (closed) return;
      pending = data;
      if (!loading) {
        loading = drain().finally(() => { loading = null; });
      }
    },
    dispose() {
      if (closed) return disposal;
      closed = true;
      pending = null;
      graph.removeFromParent();
      disposal = Promise.resolve(loading).then(() => graph.dispose());
      return disposal;
    },
  };
}
