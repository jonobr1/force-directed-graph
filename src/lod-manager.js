import { DataTexture, RGBAFormat, FloatType, Vector3 } from 'three';

/**
 * Level-of-Detail Manager for Force Directed Graph
 * Reduces computation for distant nodes by assigning fewer neighbors
 * based on camera distance and node importance
 */
export class LODManager {
  constructor(maxNeighbors = 32) {
    this.maxNeighbors = maxNeighbors;
    this.camera = null;
    this.lastCameraPosition = new Vector3();
    this.lastCameraUpdateFrame = 0;
    this.cameraMovementThreshold = 5.0;
    
    // LOD levels and thresholds
    this.lodLevels = [
      { distance: 100, neighborRatio: 1.0 },    // Close: full neighbors
      { distance: 500, neighborRatio: 0.5 },    // Medium: half neighbors  
      { distance: 1000, neighborRatio: 0.25 },  // Far: quarter neighbors
      { distance: Infinity, neighborRatio: 0.125 } // Very far: minimum neighbors
    ];
    
    // GPU texture for LOD data
    this.lodTexture = null;
    this.textureSize = 0;
    this.nodeCount = 0;
    
    // Cache for performance
    this.nodeDistances = null;
    this.nodeLodLevels = null;
    
    // Performance tracking
    this.lastUpdateTime = 0;
    this.updateInterval = 30; // Update every N frames
    this.frameCount = 0;
  }

  /**
   * Set the camera for distance calculations
   * @param {THREE.Camera} camera - Three.js camera
   */
  setCamera(camera) {
    this.camera = camera;
    this.lastCameraPosition.copy(camera.position);
  }

  /**
   * Update LOD system based on camera position and node positions
   * @param {WebGLRenderer} renderer - Three.js renderer
   * @param {DataTexture} positionsTexture - GPU texture containing node positions
   * @param {number} nodeCount - Number of active nodes
   * @param {number} frameCount - Current frame number
   * @returns {boolean} True if LOD data was updated
   */
  update(renderer, positionsTexture, nodeCount, frameCount) {
    if (!this.camera) {
      return false;
    }
    
    this.frameCount = frameCount;
    
    // Check if camera has moved significantly
    const cameraMovement = this.camera.position.distanceTo(this.lastCameraPosition);
    const shouldUpdate = cameraMovement > this.cameraMovementThreshold || 
                        (this.frameCount % this.updateInterval === 0);
    
    if (!shouldUpdate) {
      return false;
    }
    
    const startTime = performance.now();
    
    this.nodeCount = nodeCount;
    this.textureSize = Math.ceil(Math.sqrt(nodeCount));
    
    // Read node positions from GPU
    const positions = this.readPositions(renderer, positionsTexture, nodeCount);
    
    // Calculate distances and LOD levels
    this.calculateNodeDistances(positions);
    this.assignLodLevels();
    
    // Update GPU texture with LOD data
    this.updateLodTexture();
    
    // Update camera position cache
    this.lastCameraPosition.copy(this.camera.position);
    this.lastCameraUpdateFrame = frameCount;
    
    this.lastUpdateTime = performance.now() - startTime;
    return true;
  }

  /**
   * Read position data from GPU texture
   * @param {WebGLRenderer} renderer - Three.js renderer
   * @param {DataTexture} positionsTexture - GPU texture with positions
   * @param {number} nodeCount - Number of nodes to read
   * @returns {Float32Array} Position data
   */
  readPositions(renderer, positionsTexture, nodeCount) {
    const size = this.textureSize;
    const buffer = new Float32Array(size * size * 4);
    
    try {
      // Read pixel data from texture
      const gl = renderer.getContext();
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, positionsTexture.image, 0);
      
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
        gl.readPixels(0, 0, size, size, gl.RGBA, gl.FLOAT, buffer);
      }
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
    } catch (error) {
      console.warn('LODManager: Failed to read positions from GPU texture', error);
      // Return empty buffer on failure
    }
    
    return buffer;
  }

  /**
   * Calculate distance from camera to each node
   * @param {Float32Array} positions - Node positions
   */
  calculateNodeDistances(positions) {
    this.nodeDistances = new Float32Array(this.nodeCount);
    const cameraPos = this.camera.position;
    
    for (let i = 0; i < this.nodeCount; i++) {
      const x = positions[i * 4];
      const y = positions[i * 4 + 1];
      const z = positions[i * 4 + 2];
      
      if (isFinite(x) && isFinite(y) && isFinite(z)) {
        const dx = x - cameraPos.x;
        const dy = y - cameraPos.y;
        const dz = z - cameraPos.z;
        this.nodeDistances[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
      } else {
        this.nodeDistances[i] = Infinity;
      }
    }
  }

  /**
   * Assign LOD levels to nodes based on distance thresholds
   */
  assignLodLevels() {
    this.nodeLodLevels = new Uint8Array(this.nodeCount);
    
    for (let i = 0; i < this.nodeCount; i++) {
      const distance = this.nodeDistances[i];
      let lodLevel = 0;
      
      // Find appropriate LOD level for this distance
      for (let j = 0; j < this.lodLevels.length; j++) {
        if (distance <= this.lodLevels[j].distance) {
          lodLevel = j;
          break;
        }
      }
      
      this.nodeLodLevels[i] = lodLevel;
    }
  }

  /**
   * Update GPU texture with LOD data
   */
  updateLodTexture() {
    const size = this.textureSize;
    
    // Create texture if it doesn't exist or size changed
    if (!this.lodTexture || this.lodTexture.image.width !== size) {
      this.createLodTexture(size);
    }
    
    const data = this.lodTexture.image.data;
    
    // Pack LOD data into texture
    for (let i = 0; i < this.nodeCount; i++) {
      const textureIndex = i * 4;
      const lodLevel = this.nodeLodLevels[i];
      const distance = this.nodeDistances[i];
      const neighborRatio = this.lodLevels[lodLevel].neighborRatio;
      const neighborCount = Math.max(1, Math.floor(this.maxNeighbors * neighborRatio));
      
      // Store in RGBA components:
      // R: LOD level
      // G: Neighbor count for this LOD level
      // B: Distance to camera
      // A: Neighbor ratio
      data[textureIndex + 0] = lodLevel;
      data[textureIndex + 1] = neighborCount;
      data[textureIndex + 2] = Math.min(distance, 10000); // Clamp for texture storage
      data[textureIndex + 3] = neighborRatio;
    }
    
    // Fill remaining texture space with default values
    for (let i = this.nodeCount; i < size * size; i++) {
      const textureIndex = i * 4;
      data[textureIndex + 0] = this.lodLevels.length - 1; // Lowest LOD
      data[textureIndex + 1] = 1; // Minimum neighbors
      data[textureIndex + 2] = 10000; // Very far
      data[textureIndex + 3] = 0.125; // Minimum ratio
    }
    
    this.lodTexture.needsUpdate = true;
  }

  /**
   * Create GPU texture for LOD data
   * @param {number} size - Texture size
   */
  createLodTexture(size) {
    this.lodTexture = new DataTexture(
      new Float32Array(size * size * 4),
      size,
      size,
      RGBAFormat,
      FloatType
    );
    this.lodTexture.needsUpdate = true;
  }

  /**
   * Get LOD texture for GPU shaders
   * @returns {DataTexture} Texture containing LOD data
   */
  getLodTexture() {
    return this.lodTexture;
  }

  /**
   * Get neighbor count for a specific node based on its LOD level
   * @param {number} nodeIndex - Index of the node
   * @returns {number} Number of neighbors for this node
   */
  getNodeNeighborCount(nodeIndex) {
    if (!this.nodeLodLevels || nodeIndex >= this.nodeCount) {
      return this.maxNeighbors;
    }
    
    const lodLevel = this.nodeLodLevels[nodeIndex];
    const ratio = this.lodLevels[lodLevel].neighborRatio;
    return Math.max(1, Math.floor(this.maxNeighbors * ratio));
  }

  /**
   * Get LOD statistics for monitoring
   * @returns {Object} LOD statistics
   */
  getLodStatistics() {
    if (!this.nodeLodLevels) {
      return {
        totalNodes: 0,
        lodDistribution: [],
        averageNeighborCount: 0,
        memoryUsage: 0
      };
    }
    
    const lodCounts = new Array(this.lodLevels.length).fill(0);
    let totalNeighbors = 0;
    
    for (let i = 0; i < this.nodeCount; i++) {
      const lodLevel = this.nodeLodLevels[i];
      lodCounts[lodLevel]++;
      totalNeighbors += this.getNodeNeighborCount(i);
    }
    
    return {
      totalNodes: this.nodeCount,
      lodDistribution: lodCounts.map((count, level) => ({
        level,
        nodeCount: count,
        distance: this.lodLevels[level].distance,
        neighborRatio: this.lodLevels[level].neighborRatio
      })),
      averageNeighborCount: totalNeighbors / this.nodeCount,
      memoryUsage: this.lodTexture ? this.lodTexture.image.data.byteLength : 0
    };
  }

  /**
   * Configure LOD levels
   * @param {Array} levels - Array of {distance, neighborRatio} objects
   */
  setLodLevels(levels) {
    this.lodLevels = [...levels];
    // Ensure levels are sorted by distance
    this.lodLevels.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Set camera movement threshold for updates
   * @param {number} threshold - Movement threshold in world units
   */
  setCameraMovementThreshold(threshold) {
    this.cameraMovementThreshold = threshold;
  }

  /**
   * Set update interval for performance tuning
   * @param {number} interval - Number of frames between updates
   */
  setUpdateInterval(interval) {
    this.updateInterval = Math.max(1, interval);
  }

  /**
   * Get performance information
   * @returns {Object} Performance statistics
   */
  getPerformanceInfo() {
    return {
      lastUpdateTime: this.lastUpdateTime,
      updateInterval: this.updateInterval,
      frameCount: this.frameCount,
      cameraMovementThreshold: this.cameraMovementThreshold,
      lodLevels: this.lodLevels.length,
      textureSize: this.textureSize
    };
  }

  /**
   * Check if LOD system is actively reducing neighbors
   * @returns {boolean} True if any nodes are using reduced neighbor counts
   */
  isReducingComplexity() {
    if (!this.nodeLodLevels) return false;
    
    for (let i = 0; i < this.nodeCount; i++) {
      if (this.nodeLodLevels[i] > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Force update on next frame
   */
  forceUpdate() {
    this.lastCameraUpdateFrame = 0;
  }

  /**
   * Dispose of GPU resources
   */
  dispose() {
    if (this.lodTexture) {
      this.lodTexture.dispose();
      this.lodTexture = null;
    }
    
    this.nodeDistances = null;
    this.nodeLodLevels = null;
    this.camera = null;
  }
}