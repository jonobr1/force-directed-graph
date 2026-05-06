import { Color, Group, RepeatWrapping, Vector2, Vector3 } from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { clamp, each, getPotSize, rgbToIndex } from './math.js';
import simulation from './shaders/simulation.js';

import { Points } from './points.js';
import { Links } from './links.js';
import { Registry } from './registry.js';
import { Hit } from './hit.js';
import { TextureWorkerManager } from './texture-worker-manager.js';

const color = new Color();
const position = new Vector3();
const size = new Vector2();

const DT_MIN = 1 / 240; // ~4.17ms — prevents absurdly fast frames from destabilizing physics
const DT_MAX = 1 / 30;  // ~33.33ms — clamps the spike on tab resume
const SMOOTH_TAU = 0.5; // seconds — exponential spring time constant for dt smoothing
const buffers = {
  int: new Uint8ClampedArray(4),
  float: new Float32Array(4),
};

function buildLinkTextureData(preparedLinks, nodeAmount, size) {
  const totalElements = size * size;
  const linksData = new Float32Array(totalElements * 4);
  const linkRangesData = new Float32Array(totalElements * 4);
  const linksByNode = Array.from({ length: nodeAmount }, () => []);
  const packedLinks = [];

  for (let i = 0; i < preparedLinks.length; i++) {
    const link = preparedLinks[i];
    const sourceIndex = link.sourceIndex;
    const targetIndex = link.targetIndex;

    const isValid =
      Number.isInteger(sourceIndex) &&
      Number.isInteger(targetIndex) &&
      sourceIndex >= 0 &&
      targetIndex >= 0 &&
      sourceIndex < nodeAmount &&
      targetIndex < nodeAmount;

    if (!isValid) {
      continue;
    }

    linksByNode[sourceIndex].push(link);
    if (targetIndex !== sourceIndex) {
      linksByNode[targetIndex].push(link);
    }
  }

  for (let i = 0; i < nodeAmount; i++) {
    const rangeOffset = i * 4;
    const incident = linksByNode[i];

    linkRangesData[rangeOffset + 0] = packedLinks.length;
    linkRangesData[rangeOffset + 1] = incident.length;

    for (let j = 0; j < incident.length; j++) {
      packedLinks.push(incident[j]);
    }
  }

  if (packedLinks.length > totalElements) {
    throw new Error(
      `Packed links (${packedLinks.length}) exceed texture capacity (${totalElements}).`
    );
  }

  for (let i = 0; i < packedLinks.length; i++) {
    const link = packedLinks[i];
    const sourceIndex = link.sourceIndex;
    const targetIndex = link.targetIndex;
    const linkOffset = i * 4;

    linksData[linkOffset + 0] = (sourceIndex % size) / size;
    linksData[linkOffset + 1] = Math.floor(sourceIndex / size) / size;
    linksData[linkOffset + 2] = (targetIndex % size) / size;
    linksData[linkOffset + 3] = Math.floor(targetIndex / size) / size;
  }

  return {
    linksData,
    linkRangesData,
    packedLinkAmount: packedLinks.length,
  };
}

class ForceDirectedGraph extends Group {
  ready = false;
  _lastTime = null;
  _smoothedDt = 1 / 60;

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
      pinStrength: { value: 0.0 },
      nodeRadius: { value: 1 },
      nodeScale: { value: 8 },
      sizeAttenuation: { value: true },
      frustumSize: { value: 100 },
      softBoundary: { value: true },
      linksInheritColor: { value: false },
      pointsInheritColor: { value: true },
      pointColor: { value: new Color(1, 1, 1) },
      linkColor: { value: new Color(1, 1, 1) },
      opacity: { value: 1 },
      uBeginning: { value: 0 },
      uEnding: { value: 1 },
      uNodeAmount: { value: 0 },
    };
    this.userData._shaderTimeStep = { value: this.userData.uniforms.timeStep.value };
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
    'pinStrength',
    'nodeRadius',
    'nodeScale',
    'sizeAttenuation',
    'frustumSize',
    'softBoundary',
    'linksInheritColor',
    'pointsInheritColor',
    'pointColor',
    'linkColor',
    'opacity',
    'blending',
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
    let packedLinkAmount = 0;

    // Reset adaptive timestep state so a fresh simulation doesn't carry stale delta
    this._lastTime = null;
    this._smoothedDt = 1 / 60;

    // Dedicated uniform object for shader — keeps public timeStep getter as user speed scale
    const shaderTimeStep = { value: uniforms.timeStep.value };
    this.userData._shaderTimeStep = shaderTimeStep;

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
    const size = getPotSize(Math.max(data.nodes.length, data.links.length * 2));
    uniforms.size.value = size;
    gpgpu = new GPUComputationRenderer(size, size, renderer);

    const textures = {
      positions: gpgpu.createTexture(),
      velocities: gpgpu.createTexture(),
      links: gpgpu.createTexture(),
      linkRanges: gpgpu.createTexture(),
      targetPositions: gpgpu.createTexture(),
    };

    const variables = {
      positions: gpgpu.addVariable(
        'texturePositions',
        simulation.positions,
        textures.positions
      ),
      velocities: gpgpu.addVariable(
        'textureVelocities',
        simulation.velocities,
        textures.velocities
      ),
    };

    this.userData.gpgpu = gpgpu;
    this.userData.variables = variables;
    this.userData.textures = textures;

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
      const preparedLinks = data.links.map((link) => {
        const sourceIndex = registry.get(link.source);
        const targetIndex = registry.get(link.target);

        link.sourceIndex = sourceIndex;
        link.targetIndex = targetIndex;

        return {
          ...link,
          sourceIndex,
          targetIndex,
        };
      });
      
      // Initialize worker if not already done
      if (!workerManager.isReady()) {
        await workerManager.init();
      }
      
      // Try worker-based processing first
      if (workerManager.isReady()) {
        try {
          const result = await workerManager.processTextures({
            nodes: data.nodes,
            links: preparedLinks,
            textureSize: size,
            frustumSize: uniforms.frustumSize.value,
          });
          
          // Copy results to texture data
          textures.positions.image.data.set(result.positions);
          textures.links.image.data.set(result.links);
          textures.linkRanges.image.data.set(result.linkRanges);
          packedLinkAmount = result.packedLinkAmount;
          fillTargetPositions();

          console.log(`Texture processing completed in ${result.processingTime.toFixed(2)}ms using ${workerManager.isWasmAvailable() ? 'WASM' : 'JavaScript'}`);

          return Promise.resolve();
        } catch (error) {
          console.warn('Worker processing failed, falling back to main thread:', error);
          // Fall through to main thread processing
        }
      }
      
      // Fallback to main thread processing
      return fillMainThread(preparedLinks);
    }
    
    function fillMainThread(preparedLinks) {
      const linkTextureData = buildLinkTextureData(
        preparedLinks,
        data.nodes.length,
        size
      );
      textures.links.image.data.set(linkTextureData.linksData);
      textures.linkRanges.image.data.set(linkTextureData.linkRangesData);
      packedLinkAmount = linkTextureData.packedLinkAmount;

      return each(textures.positions.image.data, (_, i) => {
        const k = i / 4;
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
          textures.positions.image.data[i + 0] = uniforms.frustumSize.value * 10;
          textures.positions.image.data[i + 1] = uniforms.frustumSize.value * 10;
          textures.positions.image.data[i + 2] = uniforms.frustumSize.value * 10;
          textures.positions.image.data[i + 3] = uniforms.frustumSize.value * 10;
        }
      }, 4).then(fillTargetPositions);
    }

    function fillTargetPositions() {
      for (let k = 0; k < data.nodes.length; k++) {
        const node = data.nodes[k];
        const i = k * 4;
        const hasX = typeof node.x !== 'undefined';
        const hasY = typeof node.y !== 'undefined';
        const hasZ = typeof node.z !== 'undefined';
        const definedCount = (hasX ? 1 : 0) + (hasY ? 1 : 0) + (hasZ ? 1 : 0);
        const hasTarget = definedCount >= 2 ? 1.0 : 0.0;
        textures.targetPositions.image.data[i + 0] = hasTarget ? (node.x ?? 0) : 0;
        textures.targetPositions.image.data[i + 1] = hasTarget ? (node.y ?? 0) : 0;
        textures.targetPositions.image.data[i + 2] = hasTarget ? (node.z ?? 0) : 0;
        textures.targetPositions.image.data[i + 3] = hasTarget;
      }
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
        variables.positions.material.uniforms.timeStep = shaderTimeStep;

        variables.velocities.material.uniforms.alpha = uniforms.alpha;
        variables.velocities.material.uniforms.is2D = uniforms.is2D;
        variables.velocities.material.uniforms.size = uniforms.size;
        variables.velocities.material.uniforms.time = uniforms.time;
        variables.velocities.material.uniforms.nodeRadius = uniforms.nodeRadius;
        variables.velocities.material.uniforms.nodeAmount = {
          value: data.nodes.length,
        };
        variables.velocities.material.uniforms.uBeginning = uniforms.uBeginning;
        variables.velocities.material.uniforms.uEnding = uniforms.uEnding;
        uniforms.uNodeAmount.value = data.nodes.length;
        variables.velocities.material.uniforms.edgeAmount = {
          value: packedLinkAmount,
        };
        variables.velocities.material.uniforms.maxSpeed = uniforms.maxSpeed;
        variables.velocities.material.uniforms.timeStep = shaderTimeStep;
        variables.velocities.material.uniforms.damping = uniforms.damping;
        variables.velocities.material.uniforms.repulsion = uniforms.repulsion;
        variables.velocities.material.uniforms.textureLinks = {
          value: textures.links,
        };
        variables.velocities.material.uniforms.textureLinkRanges = {
          value: textures.linkRanges,
        };
        variables.velocities.material.uniforms.springLength =
          uniforms.springLength;
        variables.velocities.material.uniforms.stiffness = uniforms.stiffness;
        variables.velocities.material.uniforms.gravity = uniforms.gravity;
        variables.velocities.material.uniforms.pinStrength = uniforms.pinStrength;
        variables.velocities.material.uniforms.textureTargetPositions = {
          value: textures.targetPositions,
        };
        variables.velocities.material.uniforms.frustumSize = uniforms.frustumSize;
        variables.velocities.material.uniforms.softBoundary = uniforms.softBoundary;

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
   * @param {Number} time
   * @description Function to update the instance meant to be run before three.js's renderer.render method.
   * @returns {Void}
   */
  update(time) {
    if (!this.ready) {
      return this;
    }

    const { gpgpu, textures, variables, uniforms, _shaderTimeStep } = this.userData;

    uniforms.alpha.value *= uniforms.decay.value;

    if (this._lastTime === null) {
      this._lastTime = time;
    } else {
      const rawDt = Math.min(Math.max((time - this._lastTime) / 1000, DT_MIN), DT_MAX);
      this._lastTime = time;
      const springAlpha = 1 - Math.exp(-rawDt / SMOOTH_TAU);
      this._smoothedDt += springAlpha * (rawDt - this._smoothedDt);
      _shaderTimeStep.value = this._smoothedDt * uniforms.timeStep.value;
    }

    variables.velocities.material.uniforms.time.value = time / 1000;
    gpgpu.compute();

    const texture = this.getTexture('positions');

    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      child.material.uniforms.texturePositions.value = texture;
      if (child.material.uniforms.textureTargetPositions) {
        child.material.uniforms.textureTargetPositions.value =
          textures.targetPositions;
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
  get pinStrength() {
    return this.userData.uniforms.pinStrength.value;
  }
  set pinStrength(v) {
    this.userData.uniforms.pinStrength.value = v;
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
  get softBoundary() {
    return this.userData.uniforms.softBoundary.value;
  }
  set softBoundary(v) {
    this.userData.uniforms.softBoundary.value = v;
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
  get beginning() {
    return this.userData.uniforms.uBeginning.value;
  }
  set beginning(v) {
    this.userData.uniforms.uBeginning.value = v;
  }
  get ending() {
    return this.userData.uniforms.uEnding.value;
  }
  set ending(v) {
    this.userData.uniforms.uEnding.value = v;
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
  getPerformanceInfo() {
    const { workerManager } = this.userData;
    return workerManager ? workerManager.getPerformanceInfo() : {
      workerSupported: false,
      workerReady: false,
      wasmReady: false,
      pendingRequests: 0
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
