import { Color, Group, RepeatWrapping, Vector2, Vector3 } from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { clamp, each, getPotSize, rgbToIndex } from './math.js';
import simulation from './shaders/simulation.js';

import { Points } from './points.js';
import { Links } from './links.js';
import { Registry } from './registry.js';
import { Hit } from './hit.js';
import { TextureWorkerManager } from './texture-worker-manager.js';
import { SpatialGrid } from './spatial-grid.js';
import { PerformanceMonitor } from './performance-monitor.js';

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
   * @param {Object} [data] - optional data to automatically set the data of the graph
   */
  constructor(renderer, data) {
    super();

    this.userData.registry = new Registry();
    this.userData.renderer = renderer;
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
      maxNeighbors: { value: 32 },
      useSpatialGrid: { value: true },
    };
    this.userData.hit = new Hit(this);
    this.userData.workerManager = new TextureWorkerManager();
    this.userData.spatialGrid = null;
    this.userData.frameCount = 0;
    this.userData.performanceMonitor = new PerformanceMonitor();
    this.userData.fallbackState = {
      spatialGridFailed: false,
      currentShader: null,
      fallbackReason: null,
      retryAttempts: 0,
      maxRetries: 3
    };

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
    'maxNeighbors',
    'useSpatialGrid',
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

    const textures = {
      positions: gpgpu.createTexture(),
      velocities: gpgpu.createTexture(),
      links: gpgpu.createTexture(),
    };

    // Choose velocity shader with fallback support
    const { velocityShader, fallbackReason } = this.selectOptimalShader(data.nodes.length);
    
    if (fallbackReason) {
      console.warn(`Force Directed Graph fallback: ${fallbackReason}`);
      this.userData.fallbackState.fallbackReason = fallbackReason;
    }

    const variables = {
      positions: gpgpu.addVariable(
        'texturePositions',
        simulation.positions,
        textures.positions
      ),
      velocities: gpgpu.addVariable(
        'textureVelocities',
        velocityShader,
        textures.velocities
      ),
    };

    this.userData.gpgpu = gpgpu;
    this.userData.variables = variables;

    return (
      register()
        .then(fill)
        // TODO: Add a sort here for future simulation methods
        .then(setup)
        .then(generate)
        .then(complete)
        .catch((error) => {
          console.warn('Force Directed Graph:', error);
        })
    );

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
          const preparedLinks = data.links.map(link => {
            const sourceIndex = registry.get(link.source);
            const targetIndex = registry.get(link.target);
            
            // Store indices back on the link for later use
            link.sourceIndex = sourceIndex;
            link.targetIndex = targetIndex;
            
            return {
              ...link,
              sourceIndex,
              targetIndex
            };
          });
          
          const result = await workerManager.processTextures({
            nodes: data.nodes,
            links: preparedLinks,
            textureSize: size,
            frustumSize: uniforms.frustumSize.value
          });
          
          // Copy results to texture data
          textures.positions.image.data.set(result.positions);
          textures.links.image.data.set(result.links);
          
          console.log(`Texture processing completed in ${result.processingTime.toFixed(2)}ms using ${workerManager.isWasmAvailable() ? 'WASM' : 'JavaScript'}`);
          
          return Promise.resolve();
        } catch (error) {
          console.warn('Worker processing failed, falling back to main thread:', error);
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

          let i1, i2, uvx, uvy;

          if (k < data.links.length) {
            // Calculate uv look up for edge calculations
            i1 = registry.get(data.links[k].source);
            i2 = registry.get(data.links[k].target);

            data.links[k].sourceIndex = i1;
            data.links[k].targetIndex = i2;

            uvx = (i1 % size) / size;
            uvy = Math.floor(i1 / size) / size;

            textures.links.image.data[i + 0] = uvx;
            textures.links.image.data[i + 1] = uvy;

            uvx = (i2 % size) / size;
            uvy = Math.floor(i2 / size) / size;

            textures.links.image.data[i + 2] = uvx;
            textures.links.image.data[i + 3] = uvy;
          }

          k++;
        },
        4
      );
    }

    function setup() {
      return new Promise((resolve, reject) => {
        gpgpu.setVariableDependencies(variables.positions, [
          variables.positions,
          variables.velocities,
        ]);
        gpgpu.setVariableDependencies(variables.velocities, [
          variables.velocities,
          variables.positions,
        ]);

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
        variables.velocities.material.uniforms.springLength =
          uniforms.springLength;
        variables.velocities.material.uniforms.stiffness = uniforms.stiffness;
        variables.velocities.material.uniforms.gravity = uniforms.gravity;
        variables.velocities.material.uniforms.maxNeighbors = uniforms.maxNeighbors;
        
        // Add spatial grid textures if using spatial optimization
        if (scope.userData.spatialGrid) {
          variables.velocities.material.uniforms.textureNeighbors = { value: null };
          variables.velocities.material.uniforms.textureNeighborsDistance = { value: null };
        }

        variables.positions.wrapS = variables.positions.wrapT = RepeatWrapping;
        variables.velocities.wrapS = variables.velocities.wrapT =
          RepeatWrapping;

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
   * Select optimal velocity shader with fallback support
   * @param {number} nodeCount - Number of nodes in the graph
   * @returns {Object} Object with velocityShader and fallbackReason
   */
  selectOptimalShader(nodeCount) {
    const { uniforms, fallbackState } = this.userData;
    let result = { velocityShader: simulation.velocities, fallbackReason: null };
    
    try {
      // Check if spatial grid optimization should be used
      // Increase threshold to 2000 nodes to avoid issues with medium-sized graphs
      const shouldUseSpatialGrid = uniforms.useSpatialGrid.value && 
                                   nodeCount > 2000 && 
                                   !fallbackState.spatialGridFailed;
      
      if (shouldUseSpatialGrid) {
        // Verify WebGL capabilities
        if (!this.checkWebGLCapabilities()) {
          result.fallbackReason = 'WebGL 2.0 or required extensions not available';
          return result;
        }
        
        // Verify texture size limits
        const textureSize = getPotSize(nodeCount);
        if (!this.checkTextureSizeSupport(textureSize)) {
          result.fallbackReason = `Texture size ${textureSize}x${textureSize} exceeds GPU limits`;
          return result;
        }
        
        // Try to create spatial grid
        try {
          if (this.userData.spatialGrid) {
            this.userData.spatialGrid.dispose();
          }
          
          this.userData.spatialGrid = new SpatialGrid(32, uniforms.maxNeighbors.value);
          
          // Initialize spatial grid with node data to avoid GPU readbacks
          this.userData.spatialGrid.setInitialNodeData(this.userData.data.nodes);
          
          result.velocityShader = simulation.spatial;
          fallbackState.currentShader = 'spatial';
          fallbackState.retryAttempts = 0;
          
          console.log(`Using spatial grid optimization for ${nodeCount} nodes`);
          
        } catch (error) {
          console.warn('Failed to create spatial grid:', error);
          result.fallbackReason = `Spatial grid creation failed: ${error.message}`;
          fallbackState.spatialGridFailed = true;
          fallbackState.retryAttempts++;
        }
        
      } else {
        // Use simplified spatial shader for medium node counts
        if (nodeCount > 1000 && nodeCount <= 2000) {
          result.velocityShader = simulation.spatialSimplified;
          fallbackState.currentShader = 'spatialSimplified';
          console.log(`Using simplified spatial optimization for ${nodeCount} nodes`);
        } else {
          // Standard shader for small node counts
          fallbackState.currentShader = 'standard';
          if (nodeCount <= 1000) {
            console.log(`Using standard shader for ${nodeCount} nodes (under optimization threshold)`);
          }
        }
        
        // Clean up spatial grid if not needed
        if (this.userData.spatialGrid) {
          this.userData.spatialGrid.dispose();
          this.userData.spatialGrid = null;
        }
      }
      
    } catch (error) {
      console.error('Error in shader selection:', error);
      result.fallbackReason = `Shader selection failed: ${error.message}`;
      fallbackState.currentShader = 'standard';
    }
    
    return result;
  }

  /**
   * Check WebGL capabilities for spatial grid support
   * @returns {boolean} True if capabilities are sufficient
   */
  checkWebGLCapabilities() {
    try {
      const gl = this.userData.renderer.getContext();
      
      // Check for WebGL 2.0 or required extensions
      if (!gl.getParameter) return false;
      
      // Check for floating point texture support
      const floatTextureExt = gl.getExtension('OES_texture_float') || 
                             gl.getExtension('EXT_color_buffer_float');
      
      if (!floatTextureExt && !gl.getParameter(gl.VERSION).includes('WebGL 2.0')) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if texture size is supported by the GPU
   * @param {number} size - Texture size to check
   * @returns {boolean} True if size is supported
   */
  checkTextureSizeSupport(size) {
    try {
      const gl = this.userData.renderer.getContext();
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      return size <= maxTextureSize;
    } catch (error) {
      return false;
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

    const { gpgpu, variables, uniforms, spatialGrid, renderer, performanceMonitor, fallbackState } = this.userData;
    const startTime = performance.now();

    uniforms.alpha.value *= uniforms.decay.value;

    let spatialGridUpdateTime = 0;
    let hasErrors = false;

    // Update spatial grid periodically if enabled
    if (spatialGrid) {
      this.userData.frameCount++;
      
      const positionsTexture = this.getTexture('positions');
      const nodeCount = variables.velocities.material.uniforms.nodeAmount.value;
      
      try {
        const spatialStartTime = performance.now();
        
        const gridUpdated = spatialGrid.update(
          renderer, 
          positionsTexture, 
          nodeCount, 
          uniforms.maxNeighbors.value
        );
        
        spatialGridUpdateTime = performance.now() - spatialStartTime;
        
        if (gridUpdated) {
          // Update neighbor textures in velocity shader
          const neighborsTexture = spatialGrid.getNeighborsTexture();
          const neighborsDistanceTexture = spatialGrid.getNeighborsDistanceTexture();
          
          if (neighborsTexture && neighborsDistanceTexture) {
            variables.velocities.material.uniforms.textureNeighbors.value = neighborsTexture;
            variables.velocities.material.uniforms.textureNeighborsDistance.value = neighborsDistanceTexture;
          }
        }
        
        // Reset error state on successful update
        fallbackState.spatialGridFailed = false;
        
      } catch (error) {
        console.warn('SpatialGrid update failed:', error);
        hasErrors = true;
        spatialGridUpdateTime = 0;
        
        // Mark spatial grid as failed and potentially retry
        fallbackState.spatialGridFailed = true;
        fallbackState.retryAttempts++;
        
        if (fallbackState.retryAttempts >= fallbackState.maxRetries) {
          console.warn('Maximum spatial grid retry attempts reached, disabling optimization');
          fallbackState.fallbackReason = `Spatial grid permanently disabled after ${fallbackState.maxRetries} failures`;
          
          // Dispose of failed spatial grid
          spatialGrid.dispose();
          this.userData.spatialGrid = null;
        }
      }
    }

    try {
      variables.velocities.material.uniforms.time.value = time / 1000;
      
      // Apply performance monitor tuning parameters
      const tuningParams = performanceMonitor.getTuningParameters();
      if (tuningParams.maxNeighbors !== uniforms.maxNeighbors.value) {
        uniforms.maxNeighbors.value = tuningParams.maxNeighbors;
        if (spatialGrid) {
          spatialGrid.maxNeighbors = tuningParams.maxNeighbors;
        }
      }
      
      if (spatialGrid && tuningParams.updateInterval !== spatialGrid.updateInterval) {
        spatialGrid.setUpdateInterval(tuningParams.updateInterval);
      }
      
      if (spatialGrid && tuningParams.movementThreshold !== spatialGrid.movementThreshold) {
        spatialGrid.setMovementThreshold(tuningParams.movementThreshold);
      }
      
      const gpuStartTime = performance.now();
      gpgpu.compute();
      const gpuComputeTime = performance.now() - gpuStartTime;
      
      const texture = this.getTexture('positions');

      for (let i = 0; i < this.children.length; i++) {
        const child = this.children[i];
        child.material.uniforms.texturePositions.value = texture;
      }
      
      // Update performance monitor
      const totalFrameTime = performance.now() - startTime;
      performanceMonitor.update(time, {
        spatialGridUpdateTime,
        gpuComputeTime,
        nodeCount: variables.velocities.material.uniforms.nodeAmount.value,
        edgeCount: variables.velocities.material.uniforms.edgeAmount.value
      });
      
    } catch (error) {
      console.error('Critical error in update loop:', error);
      hasErrors = true;
      
      // Attempt recovery by disabling optimizations
      if (this.userData.spatialGrid) {
        console.warn('Disabling spatial grid due to critical error');
        this.userData.spatialGrid.dispose();
        this.userData.spatialGrid = null;
        fallbackState.spatialGridFailed = true;
        fallbackState.fallbackReason = `Critical error: ${error.message}`;
      }
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
    const { gpgpu, workerManager, spatialGrid, performanceMonitor } = this.userData;
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
    if (spatialGrid) {
      spatialGrid.dispose();
    }
    if (performanceMonitor) {
      performanceMonitor.reset();
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

  get maxNeighbors() {
    return this.userData.uniforms.maxNeighbors.value;
  }
  set maxNeighbors(v) {
    this.userData.uniforms.maxNeighbors.value = Math.max(1, Math.min(256, v));
    // Update spatial grid if it exists
    if (this.userData.spatialGrid) {
      this.userData.spatialGrid.maxNeighbors = this.userData.uniforms.maxNeighbors.value;
    }
  }
  get useSpatialGrid() {
    return this.userData.uniforms.useSpatialGrid.value;
  }
  set useSpatialGrid(v) {
    this.userData.uniforms.useSpatialGrid.value = v;
    // Note: Changes to this require recreating the graph with set() to take effect
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
   * Get comprehensive performance information
   * @returns {Object} Performance statistics and system state
   */
  getPerformanceInfo() {
    const { workerManager, spatialGrid, performanceMonitor, fallbackState } = this.userData;
    
    const workerInfo = workerManager ? workerManager.getPerformanceInfo() : {
      workerSupported: false,
      workerReady: false,
      wasmReady: false,
      pendingRequests: 0
    };
    
    const spatialInfo = spatialGrid ? spatialGrid.getPerformanceInfo() : {
      lastUpdateTime: 0,
      gridCells: 0,
      maxNeighbors: 0,
      updateInterval: 0,
      frameCount: 0
    };
    
    const performanceReport = performanceMonitor ? performanceMonitor.getPerformanceReport() : {
      frameRate: { current: 0, average: 0, target: 30 },
      performance: { level: 'unknown' },
      memory: { usage: 0 },
      tuning: { enabled: false, parameters: {} },
      recommendations: []
    };
    
    return {
      ...workerInfo,
      spatialGrid: spatialInfo,
      performance: performanceReport,
      fallback: {
        currentShader: fallbackState.currentShader,
        spatialGridFailed: fallbackState.spatialGridFailed,
        fallbackReason: fallbackState.fallbackReason,
        retryAttempts: fallbackState.retryAttempts,
        maxRetries: fallbackState.maxRetries
      },
      optimizations: {
        usingSpatialGrid: !!spatialGrid,
        usingWorkers: workerInfo.workerReady,
        usingWasm: workerInfo.wasmReady,
        autoTuning: performanceReport.tuning.enabled
      }
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
}

export { ForceDirectedGraph };
