# React and React Three Fiber

The package provides two optional components, both named `ForceDirectedGraph`.
The core Three.js import remains available separately. React is only needed for
the `/react` and `/r3f` entry points; Fiber is only needed for `/r3f`.

## Standalone React

```sh
npm install three react react-dom @jonobr1/force-directed-graph
```

```jsx
import { useRef } from 'react';
import { ForceDirectedGraph } from '@jonobr1/force-directed-graph/react';

const data = {
  nodes: [{ id: 'a', color: '#38bdf8' }, { id: 'b', color: '#fb7185' }],
  links: [{ source: 'a', target: 'b' }],
};
const options = { nodeScale: 5, linewidth: 2, linksInheritColor: true };

export default function App() {
  const graph = useRef(null);
  return (
    <ForceDirectedGraph
      ref={graph}
      data={data}
      options={options}
      style={{ height: 500 }}
      onReady={(instance) => { instance.alpha = 1; }}
      onError={console.error}
    />
  );
}
```

This component creates a renderer, scene, perspective camera and OrbitControls.
Drag to orbit and scroll to zoom. It observes the container's size and stops its
animation loop when unmounted. It renders a `div`; HTML attributes such as `id`,
`aria-label`, `className` and `style` are forwarded to that container.

| Prop | Default | Description |
| --- | --- | --- |
| `data` | required | The core graph's `{ nodes, links }` data format. |
| `options` | `{}` | Graph settings such as `is2D`, `linewidth`, `repulsion` and `nodeScale`. Color settings accept Three.js color representations, including CSS strings. |
| `paused` | `false` | Stops simulation updates while allowing rendering and camera interaction. |
| `controls` | `true` | Enables OrbitControls. |
| `cameraPosition` | `[0, 0, 250]` | Camera position, looking toward the origin. |
| `background` | `'#111827'` | Clear color; use `null` for a transparent canvas. |
| `pixelRatio` | device ratio capped at 2 | Renderer pixel ratio. |
| `onReady` | optional | Receives the graph after the latest data has loaded and options have been applied. |
| `onError` | optional | Receives the original initialization or data-loading error. |
| `ref` | optional | The core graph instance, or `null` while mounting/unmounted. |

The container defaults to 100% width and height, with a 300px minimum height.
Give its parent an explicit height, or set `style.height` on the component.

## React Three Fiber

```sh
npm install three react react-dom @react-three/fiber @jonobr1/force-directed-graph
```

Use Fiber 8 with React 18, or Fiber 9 with React 19. These are the pairings
specified in the [Fiber documentation](https://r3f.docs.pmnd.rs/getting-started/introduction).
The executable examples and automated component tests use React 18 and Fiber 8.

```jsx
import { Canvas } from '@react-three/fiber';
import { ForceDirectedGraph } from '@jonobr1/force-directed-graph/r3f';

const data = {
  nodes: [{ id: 'a', color: '#38bdf8' }, { id: 'b', color: '#fb7185' }],
  links: [{ source: 'a', target: 'b' }],
};
const options = { nodeScale: 5, linewidth: 2 };

export default function App() {
  return (
    <div style={{ height: 500 }}>
      <Canvas camera={{ position: [0, 0, 250], far: 10000 }}>
        <ForceDirectedGraph data={data} options={options} position={[0, 0, 0]} />
        <mesh position={[35, 0, 0]}>
          <boxGeometry args={[15, 15, 15]} />
          <meshBasicMaterial color="hotpink" wireframe />
        </mesh>
      </Canvas>
    </div>
  );
}
```

Place this component inside an existing `<Canvas>`. It uses that Canvas's WebGL
renderer, camera and frame loop. The shared `data`, `options`, `paused`,
`onReady`, `onError` and `ref` props work as above. Group props such as `position`,
`rotation`, `scale` and `visible`, plus scene children, are supported. The Canvas
owns camera, background, sizing and controls; compose your own controls, as the
complete R3F example demonstrates.

The component advances the simulation before normal rendering, converting
Fiber's elapsed seconds to the core graph's milliseconds. With
`frameloop="demand"`, it requests another frame while the simulation is running.
Set `paused` to stop those requests. `frameloop="never"` requires the host to
advance frames itself. Standard mesh raycasting doesn't reflect the
GPU-displaced graph points; use the core `graph.intersect(pointer, camera)` API
through the ref when implementing node picking.

## Data updates, refs and cleanup

Keep `data` stable between renders (for example, in state or with `useMemo`).
Replace it with a new object to reload the graph; mutating it in place doesn't
trigger a React update. The wrapper copies node and link records so core link
annotations don't modify React-owned data. Loads are serialized; if data changes
several times during a load, the next load uses the most recent data. `onReady`
only reports the latest result.

Replacing `options` updates settings without reloading data. Omitted settings
retain their current values. The ref exposes the full core instance; wait for
`onReady` before accessing generated points, links, labels or GPU textures. Use
`onReady` for setup that needs to run again after each data replacement.

Unmounting detaches the graph immediately and disposes its resources after any
in-flight data load settles. The standalone component also releases its renderer
and controls. The R3F component leaves the shared Canvas renderer to its owner.
Both handle React's StrictMode effect replay. Mount these browser components on
the client; WebGL rendering is not performed during server rendering.

## CodePen-ready snippets

Each component has a complete standalone HTML snippet:

- [Standalone React](../examples/codepen/react.html): orbit controls, pause/resume,
  2D/3D mode, data replacement and imperative ref access.
- [React Three Fiber](../examples/codepen/r3f.html): composition with a mesh and
  controls in a shared demand-rendered Canvas, plus pause/resume.

Create a Pen and paste the entire HTML file into the **HTML panel**. Leave the
CSS and JavaScript panels empty, with no preprocessors or extra libraries. The
snippet contains its styles, an import map with pinned React/Three/Fiber CDN
dependencies, and one native module script. It needs internet access to load
those dependencies. The component and core implementation are embedded, so the
snippets run without publishing this feature branch or a new npm release.

The small editable sources are [examples/react.js](../examples/react.js) and
[examples/r3f.js](../examples/r3f.js). After edits, run `npm run build` to regenerate
the HTML snippets and package bundles. To preview locally, run `npm run dev`,
then open `http://localhost:8080/examples/codepen/react.html` or
`http://localhost:8080/examples/codepen/r3f.html`.

Package import examples require a release containing these new entry points;
they are available in this checkout's build and npm package contents now.
