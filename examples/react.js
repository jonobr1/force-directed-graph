import { createElement as h, StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ForceDirectedGraph } from '../src/react/index.js';

function makeData(amount) {
  return {
    nodes: Array.from({ length: amount }, (_, id) => ({
      id, color: id % 2 ? '#38bdf8' : '#fb7185',
    })),
    links: Array.from({ length: amount - 1 }, (_, i) => ({
      source: i + 1, target: Math.floor(i / 2),
    })),
  };
}

const options = { nodeScale: 5, linewidth: 1.5, linksInheritColor: true };
const cameraPosition = [0, 0, 100];

function App() {
  const graph = useRef(null);
  const [data, setData] = useState(() => makeData(64));
  const [paused, setPaused] = useState(false);
  const [is2D, setIs2D] = useState(false);
  const [status, setStatus] = useState('Loading graph…');
  return h('main', null,
    h('header', null,
      h('h1', null, 'Standalone React'),
      h('p', null, 'Drag to orbit • Scroll to zoom'),
      h('button', { onClick: () => setPaused(!paused) }, paused ? 'Resume' : 'Pause'),
      h('button', { onClick: () => setIs2D(!is2D) }, is2D ? 'Use 3D' : 'Use 2D'),
      h('button', { onClick: () => setData(makeData(data.nodes.length === 64 ? 128 : 64)) }, 'Replace data'),
      h('button', { onClick: () => { if (graph.current) graph.current.alpha = 1; } }, 'Reheat'),
      h('output', { role: 'status' }, status),
    ),
    h(ForceDirectedGraph, {
      ref: graph, data, options: { ...options, is2D }, paused, cameraPosition,
      style: { height: 'calc(100vh - 170px)' },
      onReady: (instance) => setStatus(`Ready: ${instance.nodeCount} nodes`),
      onError: (error) => setStatus(`Error: ${String(error)}`),
    }),
  );
}

createRoot(document.getElementById('root')).render(h(StrictMode, null, h(App)));
