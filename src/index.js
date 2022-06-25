import {
  Group,
  Color,
  RepeatWrapping
} from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { getPotSize } from './math.js';
import { positionsFragment, velocitiesFragment } from './shaders.js';

import { Points } from './points.js';
import { Links } from './links.js';

const frustumSize = 100;

class ForceDirectedGraph extends Group {

  constructor(renderer, data) {

    super();

    const size = getPotSize(Math.max(data.nodes.length, data.edges.length));
    const gpgpu = new GPUComputationRenderer(size, size, renderer);

    const uniforms = {
      is2D: { value: false },
      time: { value: 0 },
      size: { value: size },
      maxSpeed: { value: 10 },
      timeStep: { value: 1 },
      damping: { value: 0.7 },
      repulsion: { value: - 0.3 },
      springLength: { value: 2 },
      stiffness: { value: 0.1 },
      gravity: { value: 0.1 },
      nodeRadius: { value: 1 },
      pointColor: { value: new Color(0.3, 0.3, 0.3) },
      linkColor: { value: new Color(0.9, 0.9, 0.9) }
    };

    const textures = {
      positions: gpgpu.createTexture(),
      velocities: gpgpu.createTexture(),
      edges: gpgpu.createTexture()
    };

    let k = 0;
    for (let i = 0; i < textures.positions.image.data.length; i+=4) {

      const v = 0;
      const radius = frustumSize * 0.01 * Math.sqrt(0.5 + k);
      const theta = (k / 100) * Math.PI * 2;

      const x = radius * Math.cos(theta);
      const y = radius * Math.sin(theta);
      const z = 0;

      if (k < data.nodes.length) {

        textures.positions.image.data[i + 0] = x;
        textures.positions.image.data[i + 1] = y;
        textures.positions.image.data[i + 2] = z;
        textures.positions.image.data[i + 3] = 0; // Not used

      } else {

        textures.positions.image.data[i + 0] = frustumSize * 2;
        textures.positions.image.data[i + 1] = frustumSize * 2;
        textures.positions.image.data[i + 2] = frustumSize * 2;
        textures.positions.image.data[i + 3] = frustumSize * 2;

      }

      textures.velocities.image.data[i + 0] = v;
      textures.velocities.image.data[i + 1] = v;
      textures.velocities.image.data[i + 2] = 0;
      textures.velocities.image.data[i + 3] = 0;

      let i1, i2, uvx, uvy;

      if (k < data.edges.length) {

        // Calculate uv look up for edge calculations
        i1 = +data.edges[k].source;
        i2 = +data.edges[k].target;

        uvx = (i1 % size) / size;
        uvy = Math.floor(i1 / size) / size;

        textures.edges.image.data[i + 0] = uvx;
        textures.edges.image.data[i + 1] = uvy;

        uvx = (i2 % size) / size;
        uvy = Math.floor(i2 / size) / size;

        textures.edges.image.data[i + 2] = uvx;
        textures.edges.image.data[i + 3] = uvy;

      }

      k++;

    }

    const variables = {
      positions: gpgpu.addVariable('texturePositions', positionsFragment, textures.positions),
      velocities: gpgpu.addVariable('textureVelocities', velocitiesFragment, textures.velocities)
    };

    gpgpu.setVariableDependencies(variables.positions, [variables.positions, variables.velocities]);
    gpgpu.setVariableDependencies(variables.velocities, [variables.velocities, variables.positions]);

    variables.positions.material.uniforms.is2D = uniforms.is2D;
    variables.positions.material.uniforms.timeStep = uniforms.timeStep;

    variables.velocities.material.uniforms.is2D = uniforms.is2D;
    variables.velocities.material.uniforms.size = uniforms.size;
    variables.velocities.material.uniforms.time = uniforms.time;
    variables.velocities.material.uniforms.nodeRadius = uniforms.nodeRadius;
    variables.velocities.material.uniforms.nodeAmount = { value: data.nodes.length };
    variables.velocities.material.uniforms.edgeAmount = { value: data.edges.length };
    variables.velocities.material.uniforms.maxSpeed = uniforms.maxSpeed;
    variables.velocities.material.uniforms.timeStep = uniforms.timeStep;
    variables.velocities.material.uniforms.damping = uniforms.damping;
    variables.velocities.material.uniforms.repulsion = uniforms.repulsion;
    variables.velocities.material.uniforms.textureEdges = { value: textures.edges };
    variables.velocities.material.uniforms.springLength = uniforms.springLength;
    variables.velocities.material.uniforms.stiffness = uniforms.stiffness;
    variables.velocities.material.uniforms.gravity = uniforms.gravity;

    variables.positions.wrapS = variables.positions.wrapT = RepeatWrapping;
    variables.velocities.wrapS = variables.velocities.wrapT = RepeatWrapping;

    const error = gpgpu.init();
    if (error) {
      console.error('ForceDirectedGraph', error);
    }

    const points = new Points(size, { uniforms, data });
    const links = new Links(points, { uniforms, data });

    this.add(points);
    this.add(links);

    points.renderOrder = links.renderOrder + 1;

    this.userData.gpgpu = gpgpu;
    this.userData.uniforms = uniforms;
    this.userData.textures = textures;
    this.userData.variables = variables;

  }

  static getPotSize = getPotSize;

  update(time) {

    const { gpgpu, variables } = this.userData;

    variables.velocities.material.uniforms.time.value = time / 1000;
    gpgpu.compute();

    const texture = this.getTexture('positions');

    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      child.material.uniforms.texturePositions.value = texture;
    }

    return this;

  }

  // Getters / Setters

  getUniforms() {
    return this.userData.uniforms;
  }

  getTexture(name) {
    const { gpgpu, variables } = this.userData;
    return gpgpu.getCurrentRenderTarget(variables[name]).texture;
  }

  getSize() {
    return this.userData.size;
  }

  setFrustumSize(size) {
    this.userData.frustumSize = size;
  }

  getNodeCount() {
    const { variables } = this.userData;
    return variables.velocities.material.uniforms.nodeAmount.value;
  }

  getEdgeCount() {
    const { variables } = this.userData;
    return variables.velocities.material.uniforms.edgeAmount.value;
  }

}

export { ForceDirectedGraph };
