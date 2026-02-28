import {
  Color,
  InstancedMesh,
  Matrix4,
  Quaternion,
  SphereGeometry,
  MeshBasicMaterial,
  Vector3,
} from 'three';

const quaternion = new Quaternion();
const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const instanceColor = new Color();
const fallbackColor = new Color(1, 1, 1);

function getScalarScale(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

class NodesInstancedMesh extends InstancedMesh {
  constructor(parsedNodes, uniforms, data, options = {}) {
    const geometry = options.geometry || new SphereGeometry(0.5, 8, 8);
    const material =
      options.material ||
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        vertexColors: true,
        opacity: uniforms.opacity.value,
      });
    const count = data.nodes.length;

    super(geometry, material, count);

    this.count = count;
    this.frustumCulled =
      typeof options.frustumCulled === 'boolean'
        ? options.frustumCulled
        : false;

    this.userData.fdgNodeRenderMode = 'instancedMesh';
    this.userData.fdgOwnsGeometry = !options.geometry;
    this.userData.fdgOwnsMaterial = !options.material;
    this.userData.fdgScale = options.scale;
    this.userData.fdgData = data;
    this.userData.fdgUniforms = uniforms;
    this.userData.fdgReadback = new Float32Array(0);
    this.userData.fdgReadbackSize = 0;
    this.userData.fdgSyncOpacity = true;

    this._applyColors(parsedNodes.geometry);
  }

  _applyColors(lookupGeometry) {
    const colors = lookupGeometry.getAttribute('color');
    if (!colors) {
      return;
    }

    for (let i = 0; i < this.count; i++) {
      const ci = i * 3;
      instanceColor.setRGB(
        colors.array[ci + 0] ?? fallbackColor.r,
        colors.array[ci + 1] ?? fallbackColor.g,
        colors.array[ci + 2] ?? fallbackColor.b,
      );
      this.setColorAt(i, instanceColor);
    }

    if (this.instanceColor) {
      this.instanceColor.needsUpdate = true;
    }
  }

  _ensureReadbackSize(size) {
    const expected = size * size * 4;
    if (this.userData.fdgReadback.length !== expected) {
      this.userData.fdgReadback = new Float32Array(expected);
      this.userData.fdgReadbackSize = size;
    }
  }

  _resolveScale(index) {
    const { fdgScale, fdgData, fdgUniforms } = this.userData;
    const fallback = getScalarScale(fdgUniforms.nodeRadius.value, 1);
    const node = fdgData.nodes[index];

    if (typeof fdgScale === 'function') {
      const value = fdgScale(node, index);
      if (typeof value === 'number') {
        scale.setScalar(getScalarScale(value, fallback));
        return;
      }
      if (value && typeof value === 'object') {
        scale.set(
          getScalarScale(value.x, fallback),
          getScalarScale(value.y, fallback),
          getScalarScale(value.z, fallback),
        );
        return;
      }
    }

    if (typeof fdgScale === 'number') {
      scale.setScalar(getScalarScale(fdgScale, fallback));
      return;
    }

    if (fdgScale && typeof fdgScale === 'object') {
      scale.set(
        getScalarScale(fdgScale.x, fallback),
        getScalarScale(fdgScale.y, fallback),
        getScalarScale(fdgScale.z, fallback),
      );
      return;
    }

    scale.setScalar(fallback);
  }

  updateFromRenderTarget(renderer, renderTarget) {
    const { fdgUniforms } = this.userData;
    const textureSize = fdgUniforms.size.value;
    const is2D = fdgUniforms.is2D.value;

    this._ensureReadbackSize(textureSize);
    const readback = this.userData.fdgReadback;

    renderer.readRenderTargetPixels(
      renderTarget,
      0,
      0,
      textureSize,
      textureSize,
      readback,
    );

    for (let i = 0; i < this.count; i++) {
      const index = i * 4;

      position.x = readback[index + 0];
      position.y = readback[index + 1];
      position.z = readback[index + 2] * (1 - is2D);

      this._resolveScale(i);
      matrix.compose(position, quaternion, scale);
      this.setMatrixAt(i, matrix);
    }

    this.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    if (this.userData.fdgOwnsGeometry && this.geometry) {
      this.geometry.dispose();
    }
    if (this.userData.fdgOwnsMaterial && this.material) {
      this.material.dispose();
    }
  }
}

export { NodesInstancedMesh };
