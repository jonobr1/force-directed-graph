# Force Directed Graph

GPU supercharged attraction-graph visualizations for the web built on top of [Three.js](http://threejs.org). Importable as an ES6 module.

1. 🧮 Simulation computed on GPU via render targets
2. 🕸️ Accepts thousands of nodes and links
3. 🎨 Configurable point and link colors
4. 📦 Single library dependent (Three.js)
5. 🧩 Three.js scene compatible object
6. 📝 Simple data schema to populate compatible with d3.js JSON samples
7. 🧊 2d & 3d simulation modes

Visit the hosted [project page](https://jonobr1.com/force-directed-graph/) for a running demo.

## Usage

```
npm install --save three @jonobr1/force-directed-graph
```

### Import in ES6 environment

```javascript
import { ForceDirectedGraph } from '@jonobr1/force-directed-graph';
```

### Load Script in HTML file:

This example creates 512 nodes and links them randomly like big snakes.

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
  </head>
  <body>
    <script async src="https://unpkg.com/es-module-shims@1.3.6/dist/es-module-shims.js"></script>
    <script type="importmap">
      {
        "imports": {
          "three": "https://cdn.jsdelivr.net/npm/three/build/three.module.js",
          "three/examples/jsm/misc/GPUComputationRenderer.js": "https://cdn.jsdelivr.net/npm/three/examples/jsm/misc/GPUComputationRenderer.js",
          "@jonobr1/force-directed-graph": "https://cdn.jsdelivr.net/npm/@jonobr1/force-directed-graph/build/fdg.module.js"
        }
      }
    </script>
    <script>

      import * as THREE from 'three';
      import { ForceDirectedGraph } from '@jonobr1/force-directed-graph';

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();

      camera.position.z = 250;

      // Generate some fake data
      const amount = 512;
      const data = {
      nodes: [],  // Required, each element should be an object
      links: []   // Required, each element should be an object
                  // with source and target properties that are
                  // indices of their connecting nodes
      };

      for (let i = 0; i < amount; i++) {

        data.nodes.push({ id: i });
        if (i > 0) {
          data.links.push({ target: Math.floor(Math.random() * i), source: i });
        }

      }

      const fdg = new ForceDirectedGraph(renderer, data);
      scene.add(fdg);

      setup();

      function setup() {
        renderer.setClearColor('#fff');
        document.body.appendChild(renderer.domElement);
        window.addEventListener('resize', resize, false);
        resize();
        renderer.setAnimationLoop(render);
      }

      function resize() {

        const width = window.innerWidth;
        const height = window.innerHeight;

        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

      }

      function render(elapsed) {
        fdg.update(elapsed);
        renderer.render(scene, camera);
      }

    </script>
  </body>
</html>
```

:warning: Due to the reliance on the GPU compute rendering, this project is not built for node.js use.

A free and open source tool by [Jono Brandel](http://jono.fyi/)
