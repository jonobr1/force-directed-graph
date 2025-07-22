import { Color, Group, RepeatWrapping, Vector2, Vector3 } from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { clamp, each, getPotSize, rgbToIndex } from './math.js';
import { createShaderConfig } from './shaders/simulation.js';

import { Points } from './points.js';
import { Links } from './links.js';
import { Registry } from './registry.js';
import { Hit } from './hit.js';
import { TextureWorkerManager } from './texture-worker-manager.js';

const color = new Color();
const position = new Vector3();
const size = new Vector2();
const buffers = {
  int: new Uint8ClampedArray(4),
  float: new Float32Array(4),
};

class ForceDirectedGraph extends Group {
  ready = false;

  /**
   * @param {THREE.WebGLRenderer} renderer - the three.js renderer referenced to create the render targets
   * @param {Object} [options] - configuration options
   * @param {Object} [options.data] - optional data to automatically set the data of the graph
   * @param {string} [options.shaderType='simplex'] - shader algorithm type: 'simplex', 'nested', or 'optimized'
   * @param {number} [options.nearestNeighborCount=16] - number of nearest neighbors to consider (optimized only)
   * @param {number} [options.maxSearchRadius=50] - maximum search radius for neighbors (optimized only)
   */
  constructor(renderer, options = {}) {
    super();

    // Parse and validate options
    const {
      data = null,
      shaderType = 'simplex',
      nearestNeighborCount = 16,
      maxSearchRadius = 50,
    } = options;

    // Validate shader type
    const validTypes = ['simplex', 'nested', 'optimized'];
    if (!validTypes.includes(shaderType)) {
      throw new Error(
        `Invalid shaderType: ${shaderType}. Must be one of: ${validTypes.join(
          ', '
        )}`
      );
    }

    // Store configuration
    this.userData.shaderType = shaderType;
    this.userData.shaderOptions = { nearestNeighborCount, maxSearchRadius };

    this.userData.registry = new Registry();
    this.userData.renderer = renderer;
    // Base uniforms for all shader types
    this.userData.uniforms = {
      decay: { value: 1 },
      alpha: { value: 1 },
      is2D: { value: false },
      time: { value: 0 },
      size: { value: 64 },
      maxSpeed: { value: 10 },
      timeStep: { value: 1 },
      damping: { value: 0.7 },
      repulsion: { value: -0.3 },
      springLength: { value: 2 },
      stiffness: { value: 0.1 },
      gravity: { value: 0.1 },
      nodeRadius: { value: 1 },
      nodeScale: { value: 8 },
      sizeAttenuation: { value: true },
      frustumSize: { value: 100 },
      linksInheritColor: { value: false },
      pointsInheritColor: { value: true },
      pointColor: { value: new Color(1, 1, 1) },
      linkColor: { value: new Color(1, 1, 1) },
      opacity: { value: 1 },
    };

    // Add shader-specific uniforms
    if (shaderType === 'optimized') {
      this.userData.uniforms.nearestNeighborCount = {
        value: nearestNeighborCount,
      };
      this.userData.uniforms.spatialHashSize = { value: 10.0 };
      this.userData.uniforms.maxSearchRadius = { value: maxSearchRadius };
    }
    this.userData.hit = new Hit(this);
    this.userData.workerManager = new TextureWorkerManager();

    if (data) {
      this.set(data);
    }
  }

  static getPotSize = getPotSize;
  static Properties = [
    'decay',
    'alpha',
    'is2D',
    'time',
    'size',
    'maxSpeed',
    'timeStep',
    'damping',
    'repulsion',
    'springLength',
    'stiffness',
    'gravity',
    'nodeRadius',
    'nodeScale',
    'sizeAttenuation',
    'frustumSize',
    'linksInheritColor',
    'pointsInheritColor',
    'pointColor',
    'linkColor',
    'opacity',
    'blending',
    'nearestNeighborCount',
    'spatialHashSize',
    'maxSearchRadius',
  ];

  /**
   * @param {Object} data - Object with nodes and links properties based on https://observablehq.com/@d3/force-directed-graph-component
   * @param {Function} callback
   * @description Set the data to an instance of force directed graph. Because of the potential large amount of data this function runs on a request animation frame and returns a promise (or a passed callback) to give indication when the graph is ready to be rendered.
   * @returns {Promise}
   */
  set(data, callback) {
    const scope = this;
    let { gpgpu, registry, renderer, uniforms } = this.userData;

    this.ready = false;
    this.userData.data = data;

    // Reset all properties
    registry.clear();

    // Dispose of all previous gpgpu data
    if (gpgpu) {
      for (let i = 0; i < gpgpu.variables.length; i++) {
        const variable = gpgpu.variables[i];

        for (let j = 0; j < variable.renderTargets.length; j++) {
          const renderTarget = variable.renderTargets[j];
          renderTarget.dispose();
        }

        variable.initialValueTexture.dispose();
        variable.material.dispose();
      }
    }

    // Reset points and links
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      this.remove(child);
      if ('dispose' in child) {
        child.dispose();
      }
    }

    // Initialize new properties
    const size = getPotSize(Math.max(data.nodes.length, data.links.length));
    uniforms.size.value = size;
    gpgpu = new GPUComputationRenderer(size, size, renderer);

    // Get shader configuration for this instance
    const { shaderType } = this.userData;
    const shaderConfig = createShaderConfig(shaderType);

    // Create base textures
    const textures = {
      positions: gpgpu.createTexture(),
      velocities: gpgpu.createTexture(),
      links: gpgpu.createTexture(),
      linksLookUp: gpgpu.createTexture(),
    };

    // Create shader-specific textures
    if (shaderConfig.requiresNearestNeighbors) {
      textures.nearestNeighbors = gpgpu.createTexture();
    }

    // Create base variables
    const variables = {
      positions: gpgpu.addVariable(
        'texturePositions',
        shaderConfig.positions,
        textures.positions
      ),
      velocities: gpgpu.addVariable(
        'textureVelocities',
        shaderConfig.velocities,
        textures.velocities
      ),
    };

    // Create shader-specific variables
    if (shaderConfig.requiresNearestNeighbors) {
      variables.nearestNeighbors = gpgpu.addVariable(
        'textureNearestNeighbors',
        shaderConfig.nearestNeighbors,
        textures.nearestNeighbors
      );
    }

    this.userData.gpgpu = gpgpu;
    this.userData.variables = variables;

    return register()
      .then(fill)
      .then(fillLinksLookup)
      .then(setup)
      .then(generate)
      .then(complete)
      .catch((error) => {
        console.warn('Force Directed Graph:', error);
      });

    function register() {
      return each(data.nodes, (node, i) => {
        registry.set(i, node);
      });
    }

    async function fill() {
      const { workerManager } = scope.userData;

      // Initialize worker if not already done
      if (!workerManager.isReady()) {
        await workerManager.init();
      }

      // Try worker-based processing first
      if (workerManager.isReady()) {
        try {
          // Prepare links data with registry lookups
          const preparedLinks = data.links.map((link) => {
            const sourceIndex = registry.get(link.source);
            const targetIndex = registry.get(link.target);

            // Store indices back on the link for later use
            link.sourceIndex = sourceIndex;
            link.targetIndex = targetIndex;

            return {
              ...link,
              sourceIndex,
              targetIndex,
            };
          });

          const result = await workerManager.processTextures({
            nodes: data.nodes,
            links: preparedLinks,
            textureSize: size,
            frustumSize: uniforms.frustumSize.value,
          });

          // Copy results to texture data
          textures.positions.image.data.set(result.positions);
          textures.links.image.data.set(result.links);
          if (result.linksLookUp) {
            textures.linksLookUp.image.data.set(result.linksLookUp);
          }

          console.log(
            `Texture processing completed in ${result.processingTime.toFixed(
              2
            )}ms using ${
              workerManager.isWasmAvailable() ? 'WASM' : 'JavaScript'
            }`
          );

          return Promise.resolve();
        } catch (error) {
          console.warn(
            'Worker processing failed, falling back to main thread:',
            error
          );
          // Fall through to main thread processing
        }
      }

      // Fallback to main thread processing
      return fillMainThread();
    }

    function fillMainThread() {
      let k = 0;
      return each(
        textures.positions.image.data,
        (_, i) => {
          const x = Math.random() * 2 - 1;
          const y = Math.random() * 2 - 1;
          const z = Math.random() * 2 - 1;

          if (k < data.nodes.length) {
            const node = data.nodes[k];

            textures.positions.image.data[i + 0] =
              typeof node.x !== 'undefined' ? node.x : x;
            textures.positions.image.data[i + 1] =
              typeof node.y !== 'undefined' ? node.y : y;
            textures.positions.image.data[i + 2] =
              typeof node.z !== 'undefined' ? node.z : z;
            textures.positions.image.data[i + 3] = node.isStatic ? 1 : 0;
          } else {
            // Throw all outside "extraneous" nodes generated by texture far far away.
            textures.positions.image.data[i + 0] =
              uniforms.frustumSize.value * 10;
            textures.positions.image.data[i + 1] =
              uniforms.frustumSize.value * 10;
            textures.positions.image.data[i + 2] =
              uniforms.frustumSize.value * 10;
            textures.positions.image.data[i + 3] =
              uniforms.frustumSize.value * 10;
          }

          // Store sourceIndex and targetIndex for later use in fillLinksLookup
          if (k < data.links.length) {
            const i1 = registry.get(data.links[k].source);
            const i2 = registry.get(data.links[k].target);

            data.links[k].sourceIndex = i1;
            data.links[k].targetIndex = i2;
          }

          k++;
        },
        4
      );
    }

    function fillLinksLookup() {
      // Ensure sourceIndex and targetIndex are set for all links
      data.links.forEach((link, i) => {
        if (link.sourceIndex === undefined) {
          link.sourceIndex = registry.get(link.source);
        }
        if (link.targetIndex === undefined) {
          link.targetIndex = registry.get(link.target);
        }
      });

      // Create sorted links array (source -> target only, to avoid double counting)
      const sortedLinks = [];

      // Group ORIGINAL links by source node - preserve original relationships
      for (let nodeIndex = 0; nodeIndex < data.nodes.length; nodeIndex++) {
        data.links.forEach((link, linkIndex) => {
          if (link.sourceIndex === nodeIndex) {
            // Validate that target exists
            if (link.targetIndex >= data.nodes.length) {
              console.warn(
                `Invalid link: source=${link.sourceIndex} -> target=${link.targetIndex} (target node doesn't exist, only ${data.nodes.length} nodes)`
              );
              return; // Skip invalid links
            }

            sortedLinks.push({
              originalIndex: linkIndex,
              sourceIndex: link.sourceIndex,
              targetIndex: link.targetIndex,
              link: link,
            });
          }
        });
      }

      // Update textureLinks with sorted link data
      const totalElements = size * size;
      const linksData = textures.links.image.data;

      // Clear existing links data
      for (let i = 0; i < totalElements * 4; i++) {
        linksData[i] = 0;
      }

      // Fill with sorted links
      sortedLinks.forEach((sortedLink, sortedIndex) => {
        const baseIndex = sortedIndex * 4;

        if (sortedIndex < totalElements) {
          const sourceIndex = sortedLink.sourceIndex;
          const targetIndex = sortedLink.targetIndex;

          // Calculate UV coordinates for source and target
          const sourceU = (sourceIndex % size) / size;
          const sourceV = Math.floor(sourceIndex / size) / size;
          const targetU = (targetIndex % size) / size;
          const targetV = Math.floor(targetIndex / size) / size;

          linksData[baseIndex + 0] = sourceU;
          linksData[baseIndex + 1] = sourceV;
          linksData[baseIndex + 2] = targetU;
          linksData[baseIndex + 3] = targetV;
        }
      });

      // Fill linksLookUp texture
      // Format: [startLinkIndex, endLinkIndex, linkCount, unused]
      const linksLookUpData = textures.linksLookUp.image.data;

      // Track where each node's links start in the sorted array
      let currentLinkIndex = 0;

      for (let i = 0; i < totalElements; i++) {
        const baseIndex = i * 4;

        if (i < data.nodes.length) {
          // Find how many links this node has in the sorted array
          let linkCount = 0;
          let startIndex = -1;

          // Find the actual start position and count for this node
          // Include links where this node is either source OR target
          for (let j = 0; j < sortedLinks.length; j++) {
            if (
              sortedLinks[j].sourceIndex === i ||
              sortedLinks[j].targetIndex === i
            ) {
              if (startIndex === -1) {
                startIndex = j; // First occurrence
              }
              linkCount++;
            }
          }

          // If node has no links, set safe values
          if (startIndex === -1) {
            startIndex = 0;
            linkCount = 0;
          }

          const endIndex = startIndex + linkCount;

          linksLookUpData[baseIndex + 0] = startIndex; // start index
          linksLookUpData[baseIndex + 1] = endIndex; // end index
          linksLookUpData[baseIndex + 2] = linkCount; // link count
          linksLookUpData[baseIndex + 3] = 0; // unused
        } else {
          linksLookUpData[baseIndex + 0] = 0;
          linksLookUpData[baseIndex + 1] = 0;
          linksLookUpData[baseIndex + 2] = 0;
          linksLookUpData[baseIndex + 3] = 0;
        }
      }

      return Promise.resolve();
    }

    function setup() {
      return new Promise((resolve, reject) => {
        // Base dependencies
        gpgpu.setVariableDependencies(variables.positions, [
          variables.positions,
          variables.velocities,
        ]);

        // Velocity shader dependencies
        const velocityDeps = [variables.velocities, variables.positions];
        if (shaderConfig.requiresNearestNeighbors) {
          velocityDeps.push(variables.nearestNeighbors);
        }
        gpgpu.setVariableDependencies(variables.velocities, velocityDeps);

        // Nearest neighbors dependencies (if needed)
        if (shaderConfig.requiresNearestNeighbors) {
          gpgpu.setVariableDependencies(variables.nearestNeighbors, [
            variables.positions,
          ]);
        }

        variables.positions.material.uniforms.is2D = uniforms.is2D;
        variables.positions.material.uniforms.timeStep = uniforms.timeStep;

        variables.velocities.material.uniforms.alpha = uniforms.alpha;
        variables.velocities.material.uniforms.is2D = uniforms.is2D;
        variables.velocities.material.uniforms.size = uniforms.size;
        variables.velocities.material.uniforms.time = uniforms.time;
        variables.velocities.material.uniforms.nodeRadius = uniforms.nodeRadius;
        variables.velocities.material.uniforms.nodeAmount = {
          value: data.nodes.length,
        };
        variables.velocities.material.uniforms.edgeAmount = {
          value: data.links.length,
        };
        variables.velocities.material.uniforms.maxSpeed = uniforms.maxSpeed;
        variables.velocities.material.uniforms.timeStep = uniforms.timeStep;
        variables.velocities.material.uniforms.damping = uniforms.damping;
        variables.velocities.material.uniforms.repulsion = uniforms.repulsion;
        variables.velocities.material.uniforms.textureLinks = {
          value: textures.links,
        };
        variables.velocities.material.uniforms.textureLinksLookUp = {
          value: textures.linksLookUp,
        };
        variables.velocities.material.uniforms.springLength =
          uniforms.springLength;
        variables.velocities.material.uniforms.stiffness = uniforms.stiffness;
        variables.velocities.material.uniforms.gravity = uniforms.gravity;

        // Conditional uniforms for nearest neighbors
        if (shaderConfig.requiresNearestNeighbors) {

          variables.nearestNeighbors.material.uniforms.size = uniforms.size;
          variables.nearestNeighbors.material.uniforms.nodeAmount = {
            value: data.nodes.length,
          };
          variables.nearestNeighbors.material.uniforms.nearestNeighborCount =
            uniforms.nearestNeighborCount;
          variables.nearestNeighbors.material.uniforms.spatialHashSize =
            uniforms.spatialHashSize;
          variables.nearestNeighbors.material.uniforms.maxSearchRadius =
            uniforms.maxSearchRadius;
        }

        variables.positions.wrapS = variables.positions.wrapT = RepeatWrapping;
        variables.velocities.wrapS = variables.velocities.wrapT =
          RepeatWrapping;

        // Conditional texture wrapping for nearest neighbors
        if (shaderConfig.requiresNearestNeighbors) {
          variables.nearestNeighbors.wrapS = variables.nearestNeighbors.wrapT =
            RepeatWrapping;
        }

        const error = gpgpu.init();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    }

    function generate() {
      let points;

      return Points.parse(size, data)
        .then((geometry) => {
          points = new Points(geometry, uniforms);
        })
        .then(() => Links.parse(points, data))
        .then((geometry) => {
          const links = new Links(geometry, uniforms);
          scope.add(points, links);
          points.renderOrder = links.renderOrder + 1;
          scope.userData.hit.inherit(points);
        });
    }

    function complete() {
      scope.ready = true;
      if (callback) {
        callback();
      }
    }
  }

  /**
   * @param {Number} time
   * @description Function to update the instance meant to be run before three.js's renderer.render method.
   * @returns {Void}
   */
  update(time) {
    if (!this.ready) {
      return this;
    }

    const { gpgpu, variables, uniforms } = this.userData;

    uniforms.alpha.value *= uniforms.decay.value;

    variables.velocities.material.uniforms.time.value = time / 1000;
    gpgpu.compute();

    const texture = this.getTexture('positions');

    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      child.material.uniforms.texturePositions.value = texture;
    }

    return this;
  }

  /**
   * @param {THREE.Vector2} pointer - x, y values normalized to the camera's clipspace
   * @param {THREE.Camera} camera - the camera to reference ray casting matrices
   * @description Check to see if a point in the browser's screenspace intersects with any points in the force directed graph. If none found, then null is returned.
   * @returns {Object|Null}
   */
  intersect(pointer, camera) {
    const { hit, renderer } = this.userData;

    renderer.getSize(size);

    hit.setSize(size.x, size.y);
    hit.compute(renderer, camera);

    const x = hit.ratio * size.x * clamp(pointer.x, 0, 1);
    const y = hit.ratio * size.y * (1 - clamp(pointer.y, 0, 1));

    renderer.readRenderTargetPixels(
      hit.renderTarget,
      x - 0.5,
      y - 0.5,
      1,
      1,
      buffers.int
    );

    const [r, g, b, a] = buffers.int;
    const z = 0;
    const w = 255;
    const isBlack = r === z && g === z && b === z && a === z;
    const isWhite = r === w && g === w && b === w && a === w;

    if (isBlack || isWhite) {
      return null;
    }

    const index = rgbToIndex({ r, g, b }) - 1;
    const point = this.getPositionFromIndex(index);
    return {
      point,
      data: this.userData.data.nodes[index],
    };
  }

  getTexture(name) {
    const { gpgpu, variables } = this.userData;
    return gpgpu.getCurrentRenderTarget(variables[name]).texture;
  }

  getPositionFromIndex(i) {
    const { points, size } = this;
    const { gpgpu, renderer, variables } = this.userData;

    if (!points || !renderer || !size) {
      console.warn(
        'Force Directed Graph:',
        'unable to calculate position without points or renderer.'
      );
      return;
    }

    const index = i * 3;
    const uvs = points.geometry.attributes.position.array;
    const uvx = Math.floor(uvs[index + 0] * size);
    const uvy = Math.floor(uvs[index + 1] * size);
    const renderTarget = gpgpu.getCurrentRenderTarget(variables.positions);

    renderer.readRenderTargetPixels(
      renderTarget,
      uvx,
      uvy,
      1,
      1,
      buffers.float
    );

    const [x, y, z] = buffers.float;
    position.set(x, y, z);

    return position;
  }

  setPointColorById(id, css) {
    const index = this.getIndexById(id);
    this.setPointColorFromIndex(index, css);
  }

  setPointColorFromIndex(index, css) {
    const attribute = this.points.geometry.getAttribute('color');
    const colors = attribute.array;

    color.set(css);

    colors[3 * index + 0] = color.r;
    colors[3 * index + 1] = color.g;
    colors[3 * index + 2] = color.b;

    attribute.needsUpdate = true;
  }

  updateLinksColors() {
    const { data } = this.userData;

    const ref = this.points.geometry.attributes.color.array;
    const attribute = this.links.geometry.getAttribute('color');
    const colors = attribute.array;

    return each(data.links, (_, i) => {
      const l = data.links[i];
      const li = i * 6;
      const si = 3 * l.sourceIndex;
      const ti = 3 * l.targetIndex;

      colors[li + 0] = ref[si + 0];
      colors[li + 1] = ref[si + 1];
      colors[li + 2] = ref[si + 2];

      colors[li + 3] = ref[ti + 0];
      colors[li + 4] = ref[ti + 1];
      colors[li + 5] = ref[ti + 2];
    }).then(() => (attribute.needsUpdate = true));
  }

  getIndexById(id) {
    const { registry } = this.userData;
    return registry.get(id);
  }

  getLinksById(id) {
    const { data } = this.userData;
    const index = this.getIndexById(id);
    const result = [];
    const promise = each(data.links, (link) => {
      const { sourceIndex, targetIndex } = link;
      if (sourceIndex === index || targetIndex === index) {
        result.push(link);
      }
    });
    return promise.then(() => result);
  }

  getPointById(id) {
    const { data } = this.userData;
    const index = this.getIndexById(id);
    return data.nodes[index];
  }

  dispose() {
    const { gpgpu, workerManager } = this.userData;
    if (gpgpu) {
      for (let i = 0; i < gpgpu.variables.length; i++) {
        const variable = gpgpu.variables[i];
        variable.material.dispose();
        variable.initialValueTexture.dispose();
        for (let j = 0; j < variable.renderTargets.length; j++) {
          const target = variable.renderTargets[j];
          target.dispose();
        }
      }
    }
    if (workerManager) {
      workerManager.dispose();
    }
    this.userData = {};
    return this;
  }

  // Getters / Setters

  get decay() {
    return this.userData.uniforms.decay.value;
  }
  set decay(v) {
    this.userData.uniforms.decay.value = v;
  }
  get alpha() {
    return this.userData.uniforms.alpha.value;
  }
  set alpha(v) {
    this.userData.uniforms.alpha.value = v;
  }
  get is2D() {
    return this.userData.uniforms.is2D.value;
  }
  set is2D(v) {
    this.userData.uniforms.is2D.value = v;
  }
  get time() {
    return this.userData.uniforms.time.value;
  }
  set time(v) {
    this.userData.uniforms.time.value = v;
  }
  get size() {
    return this.userData.uniforms.size.value;
  }
  set size(v) {
    this.userData.uniforms.size.value = v;
  }
  get maxSpeed() {
    return this.userData.uniforms.maxSpeed.value;
  }
  set maxSpeed(v) {
    this.userData.uniforms.maxSpeed.value = v;
  }
  get timeStep() {
    return this.userData.uniforms.timeStep.value;
  }
  set timeStep(v) {
    this.userData.uniforms.timeStep.value = v;
  }
  get damping() {
    return this.userData.uniforms.damping.value;
  }
  set damping(v) {
    this.userData.uniforms.damping.value = v;
  }
  get repulsion() {
    return this.userData.uniforms.repulsion.value;
  }
  set repulsion(v) {
    this.userData.uniforms.repulsion.value = v;
  }
  get springLength() {
    return this.userData.uniforms.springLength.value;
  }
  set springLength(v) {
    this.userData.uniforms.springLength.value = v;
  }
  get stiffness() {
    return this.userData.uniforms.stiffness.value;
  }
  set stiffness(v) {
    this.userData.uniforms.stiffness.value = v;
  }
  get gravity() {
    return this.userData.uniforms.gravity.value;
  }
  set gravity(v) {
    this.userData.uniforms.gravity.value = v;
  }
  get nodeRadius() {
    return this.userData.uniforms.nodeRadius.value;
  }
  set nodeRadius(v) {
    this.userData.uniforms.nodeRadius.value = v;
  }
  get nodeScale() {
    return this.userData.uniforms.nodeScale.value;
  }
  set nodeScale(v) {
    this.userData.uniforms.nodeScale.value = v;
  }
  get sizeAttenuation() {
    return this.userData.uniforms.sizeAttenuation.value;
  }
  set sizeAttenuation(v) {
    this.userData.uniforms.sizeAttenuation.value = v;
  }
  get frustumSize() {
    return this.userData.uniforms.frustumSize.value;
  }
  set frustumSize(v) {
    this.userData.uniforms.frustumSize.value = v;
  }
  get linksInheritColor() {
    return this.userData.uniforms.linksInheritColor.value;
  }
  set linksInheritColor(v) {
    this.userData.uniforms.linksInheritColor.value = v;
  }
  get pointsInheritColor() {
    return this.userData.uniforms.pointsInheritColor.value;
  }
  set pointsInheritColor(v) {
    this.userData.uniforms.pointsInheritColor.value = v;
  }
  get pointColor() {
    return this.userData.uniforms.pointColor.value;
  }
  set pointColor(v) {
    this.userData.uniforms.pointColor.value = v;
  }
  get linksColor() {
    return this.linkColor;
  }
  set linksColor(v) {
    this.linkColor = v;
  }
  get linkColor() {
    return this.userData.uniforms.linkColor.value;
  }
  set linkColor(v) {
    this.userData.uniforms.linkColor.value = v;
  }
  get opacity() {
    return this.userData.uniforms.opacity.value;
  }
  set opacity(v) {
    this.userData.uniforms.opacity.value = v;
  }
  get blending() {
    return this.children[0].material.blending;
  }
  set blending(v) {
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      child.material.blending = v;
    }
  }

  get points() {
    return this.children[0];
  }
  get links() {
    return this.children[1];
  }
  get uniforms() {
    return this.userData.uniforms;
  }
  get nodeCount() {
    const { variables } = this.userData;
    return variables.velocities.material.uniforms.nodeAmount.value;
  }
  get edgeCount() {
    const { variables } = this.userData;
    return variables.velocities.material.uniforms.edgeAmount.value;
  }

  /**
   * Get performance information about texture processing
   * @returns {Object} Performance statistics
   */
  getWorkerPerformanceInfo() {
    const { workerManager } = this.userData;
    return workerManager
      ? workerManager.getPerformanceInfo()
      : {
          workerSupported: false,
          workerReady: false,
          wasmReady: false,
          pendingRequests: 0,
        };
  }

  /**
   * Check if worker-based processing is available
   * @returns {boolean} True if worker processing is available
   */
  isWorkerProcessingAvailable() {
    const { workerManager } = this.userData;
    return workerManager && workerManager.isReady();
  }

  /**
   * Check if WASM acceleration is available
   * @returns {boolean} True if WASM is available
   */
  isWasmAccelerationAvailable() {
    const { workerManager } = this.userData;
    return workerManager && workerManager.isWasmAvailable();
  }

  /**
   * Check if nearest neighbors optimization is available and enabled
   * @returns {boolean} True if nearest neighbors optimization is active
   */
  isNearestNeighborsAvailable() {
    const { shaderType, variables } = this.userData;
    return (
      shaderType === 'optimized' && variables && variables.nearestNeighbors
    );
  }

  /**
   * Get performance information about the current graph
   * @returns {Object} Performance metrics and status
   */
  getPerformanceInfo() {
    const { data, variables, gpgpu, shaderType, shaderOptions } = this.userData;
    const nodeCount = data ? data.nodes.length : 0;
    const linkCount = data ? data.links.length : 0;
    const workerInfo = this.getWorkerPerformanceInfo();

    // Get shader configuration info
    const shaderConfig = createShaderConfig(shaderType);
    const nearestNeighborsActive = shaderType === 'optimized';

    return {
      nodeCount,
      linkCount,
      textureSize: this.size,
      algorithmic: {
        shaderType: shaderType,
        complexity: shaderConfig.complexity,
        description: shaderConfig.description,
        nearestNeighborsActive,
        nearestNeighborCount: nearestNeighborsActive
          ? shaderOptions.nearestNeighborCount
          : null,
        estimatedSpeedup: nearestNeighborsActive
          ? `${Math.max(
              1,
              Math.floor(nodeCount / shaderOptions.nearestNeighborCount)
            )}x`
          : '1x',
        recommendation: this.getShaderRecommendation(nodeCount),
      },
      gpu: {
        gpuComputeAvailable: !!gpgpu,
        texturesCreated: variables ? Object.keys(variables).length : 0,
        spatialHashSize: nearestNeighborsActive
          ? shaderOptions.spatialHashSize || 10.0
          : null,
        maxSearchRadius: nearestNeighborsActive
          ? shaderOptions.maxSearchRadius || 50.0
          : null,
      },
      worker: {
        workerAvailable: this.isWorkerProcessingAvailable(),
        wasmAvailable: this.isWasmAccelerationAvailable(),
        ...workerInfo,
      },
    };
  }

  /**
   * Get shader recommendation based on node count
   * @param {number} nodeCount - Number of nodes in the graph
   * @returns {string} Recommendation for optimal shader type
   */
  getShaderRecommendation(nodeCount) {
    if (nodeCount < 100) {
      return 'Consider simplex shader for fastest setup';
    } else if (nodeCount < 1000) {
      return 'nested shader provides good balance';
    } else {
      return 'optimized shader recommended for large datasets';
    }
  }

  /**
   * Get current shader type
   * @returns {string} The current shader type
   */
  getShaderType() {
    return this.userData.shaderType;
  }

  /**
   * Dynamically adjust neighbor count based on performance (optimized shader only)
   * @param {number} targetFPS - Target frames per second
   */
  adaptNeighborCount(targetFPS = 60) {
    const { shaderType, shaderOptions } = this.userData;

    if (shaderType !== 'optimized') {
      console.warn(
        'adaptNeighborCount() is only available for nearest-neighbors shader type'
      );
      return;
    }

    const startTime = performance.now();

    // Measure current performance after next frame
    requestAnimationFrame(() => {
      const frameTime = performance.now() - startTime;
      const currentFPS = 1000 / frameTime;

      if (currentFPS < targetFPS * 0.8) {
        // Too slow, reduce neighbor count
        const newCount = Math.max(
          4,
          Math.floor(shaderOptions.nearestNeighborCount * 0.8)
        );
        this.nearestNeighborCount = newCount;
        console.log(
          `Performance below target, reducing neighbors to ${newCount}`
        );
      } else if (currentFPS > targetFPS * 1.2) {
        // Too fast, we can increase neighbor count
        const newCount = Math.min(
          32,
          Math.floor(shaderOptions.nearestNeighborCount * 1.2)
        );
        this.nearestNeighborCount = newCount;
        console.log(
          `Performance above target, increasing neighbors to ${newCount}`
        );
      }
    });
  }
}

export { ForceDirectedGraph };
