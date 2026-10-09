import { createElement as h, StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ForceDirectedGraph } from '../src/r3f/index.js';

const data = {
  nodes: Array.from({ length: 64 }, (_, id) => ({ id, color: '#38bdf8' })),
  links: Array.from({ length: 63 }, (_, i) => ({ source: i + 1, target: Math.floor(i / 2) })),
};
const camera = { position: [0, 0, 100], far: 10000 };

// Controls are composed inside the Canvas. The graph doesn't own its camera.
function Controls() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const controls = useRef(null);
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.addEventListener('change', invalidate);
    controls.current = orbit;
    return () => { controls.current = null; orbit.dispose(); };
  }, [camera, gl, invalidate]);
  useFrame(() => controls.current?.update());
  return null;
}

function App() {
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('Loading graph…');
  return h('main', null,
    h('header', null,
      h('h1', null, 'React Three Fiber'),
      h('p', null, 'Graph and wireframe share one Canvas • Drag to orbit'),
      h('button', { onClick: () => setPaused(!paused) }, paused ? 'Resume' : 'Pause'),
      h('output', { role: 'status' }, status),
    ),
    h('div', { style: { height: 'calc(100vh - 170px)' } },
      h(Canvas, { camera, frameloop: 'demand' },
        h('color', { attach: 'background', args: ['#111827'] }),
        h(ForceDirectedGraph, {
          data, paused, position: [0, 0, 0],
          options: { nodeScale: 5, linewidth: 1.5, linkColor: '#94a3b8' },
          onReady: (graph) => setStatus(`Ready: ${graph.nodeCount} nodes`),
          onError: (error) => setStatus(`Error: ${String(error)}`),
        }),
        h('mesh', { position: [35, 0, 0] },
          h('boxGeometry', { args: [15, 15, 15] }),
          h('meshBasicMaterial', { color: '#fb7185', wireframe: true }),
        ),
        h(Controls),
      ),
    ),
  );
}

createRoot(document.getElementById('root')).render(h(StrictMode, null, h(App)));
