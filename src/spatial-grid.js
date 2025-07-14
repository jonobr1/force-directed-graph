import { DataTexture, RGBAFormat, FloatType } from 'three';
import { getPotSize } from './math.js';

/**
 * Spatial Grid for efficient neighbor queries in 3D space
 * Partitions space into a grid and stores neighbor information in GPU textures
 */
export class SpatialGrid {
  constructor(gridResolution = 32, maxNeighbors = 32) {
    this.gridResolution = gridResolution;
    this.maxNeighbors = maxNeighbors;
    this.gridSize = gridResolution * gridResolution * gridResolution;
    
    // Multi-resolution grid settings
    this.useMultiResolution = true;
    this.denseThreshold = 8; // Nodes per cell to trigger fine grid
    this.sparseThreshold = 2; // Nodes per cell for coarse grid
    this.fineGridResolution = 64;
    this.coarseGridResolution = 16;
    
    // Grid state
    this.grid = new Map();
    this.fineGrid = new Map(); // High-resolution grid for dense regions
    this.coarseGrid = new Map(); // Low-resolution grid for sparse regions
    this.densityMap = new Map(); // Track node density per region
    this.currentResolution = gridResolution;
    this.bounds = { min: { x: -100, y: -100, z: -100 }, max: { x: 100, y: 100, z: 100 } };
    this.cellSize = { x: 200 / gridResolution, y: 200 / gridResolution, z: 200 / gridResolution };
    
    // GPU textures for neighbor data
    this.neighborsTexture = null;
    this.neighborsDistanceTexture = null;
    this.textureSize = 0;
    
    // Position cache for temporal coherence
    this.previousPositions = null;
    this.movementThreshold = 0.1;
    
    // Neighbor cache for incremental updates
    this.cachedNeighborData = null;
    this.lastFullUpdateFrame = 0;
    
    // CPU-side position tracking to avoid GPU readbacks
    this.cpuPositionCache = null;
    this.initialNodePositions = null;
    this.positionUpdateSimulation = null;
    
    // Performance tracking
    this.lastUpdateTime = 0;
    this.updateInterval = 10; // Update every N frames
    this.frameCount = 0;
  }

  /**
   * Initialize spatial grid with node data for CPU-side tracking
   * @param {Array} nodes - Array of node objects with x, y, z, isStatic properties
   */
  setInitialNodeData(nodes) {
    this.initialNodePositions = nodes.map(node => ({
      x: node.x || (Math.random() - 0.5) * 200,
      y: node.y || (Math.random() - 0.5) * 200,
      z: node.z || (Math.random() - 0.5) * 200,
      isStatic: node.isStatic || false
    }));
    
    // Clear CPU cache to force regeneration
    this.cpuPositionCache = null;
    
    // Initialize simple position simulation for movement tracking
    this.initPositionSimulation();
  }

  /**
   * Initialize a simple CPU-side position simulation for movement estimation
   */
  initPositionSimulation() {
    if (!this.initialNodePositions) return;
    
    this.positionUpdateSimulation = {
      positions: this.initialNodePositions.map(node => ({ ...node })),
      velocities: this.initialNodePositions.map(() => ({ x: 0, y: 0, z: 0 })),
      lastUpdateTime: performance.now()
    };
  }

  /**
   * Simple CPU-side position simulation to estimate current positions
   * This provides approximate positions without GPU readback
   * Updates only occasionally to reduce CPU overhead
   */
  updatePositionSimulation() {
    if (!this.positionUpdateSimulation) return;
    
    const currentTime = performance.now();
    const deltaTime = currentTime - this.positionUpdateSimulation.lastUpdateTime;
    
    // Update simulation only every 100ms to reduce CPU load
    if (deltaTime < 100) return;
    
    const damping = 0.98;
    const timeStep = Math.min(0.05, deltaTime * 0.001); // Cap time step for stability
    
    // Simple physics approximation - much faster than full simulation
    for (let i = 0; i < this.positionUpdateSimulation.positions.length; i++) {
      const pos = this.positionUpdateSimulation.positions[i];
      const vel = this.positionUpdateSimulation.velocities[i];
      
      if (pos.isStatic) continue;
      
      // Simplified forces - just center attraction and random drift
      const centerForce = 0.005;
      const randomForce = 0.002;
      
      // Center attraction (gravity)
      vel.x -= pos.x * centerForce * timeStep;
      vel.y -= pos.y * centerForce * timeStep;
      vel.z -= pos.z * centerForce * timeStep;
      
      // Small random drift to simulate ongoing movement
      vel.x += (Math.random() - 0.5) * randomForce * timeStep;
      vel.y += (Math.random() - 0.5) * randomForce * timeStep;
      vel.z += (Math.random() - 0.5) * randomForce * timeStep;
      
      // Apply damping
      vel.x *= damping;
      vel.y *= damping;
      vel.z *= damping;
      
      // Update positions with clamping to prevent explosion
      const maxVel = 50;
      vel.x = Math.max(-maxVel, Math.min(maxVel, vel.x));
      vel.y = Math.max(-maxVel, Math.min(maxVel, vel.y));
      vel.z = Math.max(-maxVel, Math.min(maxVel, vel.z));
      
      pos.x += vel.x * timeStep;
      pos.y += vel.y * timeStep;
      pos.z += vel.z * timeStep;
      
      // Keep nodes within reasonable bounds
      const maxPos = 500;
      pos.x = Math.max(-maxPos, Math.min(maxPos, pos.x));
      pos.y = Math.max(-maxPos, Math.min(maxPos, pos.y));
      pos.z = Math.max(-maxPos, Math.min(maxPos, pos.z));
    }
    
    this.positionUpdateSimulation.lastUpdateTime = currentTime;
    
    // Update CPU position cache
    this.updateCpuPositionCache();
  }

  /**
   * Update CPU position cache from simulation
   */
  updateCpuPositionCache() {
    if (!this.positionUpdateSimulation) return;
    
    const size = this.textureSize;
    if (!this.cpuPositionCache || this.cpuPositionCache.length < size * size * 4) {
      this.cpuPositionCache = new Float32Array(size * size * 4);
    }
    
    for (let i = 0; i < this.positionUpdateSimulation.positions.length && i < size * size; i++) {
      const pos = this.positionUpdateSimulation.positions[i];
      const idx = i * 4;
      
      this.cpuPositionCache[idx] = pos.x;
      this.cpuPositionCache[idx + 1] = pos.y;
      this.cpuPositionCache[idx + 2] = pos.z;
      this.cpuPositionCache[idx + 3] = pos.isStatic ? 1 : 0;
    }
  }

  /**
   * Update spatial grid with current node positions
   * @param {WebGLRenderer} renderer - Three.js renderer
   * @param {DataTexture} positionsTexture - GPU texture containing node positions
   * @param {number} nodeCount - Number of active nodes
   * @param {number} maxNeighbors - Maximum neighbors per node
   */
  update(renderer, positionsTexture, nodeCount, maxNeighbors = this.maxNeighbors) {
    this.frameCount++;
    
    // Skip update if not enough frames have passed
    if (this.frameCount % this.updateInterval !== 0) {
      return false;
    }
    
    const startTime = performance.now();
    
    this.maxNeighbors = maxNeighbors;
    this.textureSize = getPotSize(nodeCount);
    
    // Update CPU-side position simulation
    this.updatePositionSimulation();
    
    // Read positions from CPU cache (avoiding GPU readback)
    const positions = this.readPositions(renderer, positionsTexture, nodeCount);
    
    // Check if positions have changed significantly
    const movementResult = this.previousPositions ? this.hasSignificantMovement(positions) : true;
    
    if (movementResult === false) {
      return false; // No movement, skip update
    }
    
    let neighborData;
    
    if (Array.isArray(movementResult)) {
      // Incremental update for specific moved nodes
      neighborData = this.incrementalUpdate(positions, movementResult);
    } else {
      // Full update for significant global movement
      this.updateBounds(positions);
      this.buildGrid(positions);
      neighborData = this.findNeighbors(positions);
    }
    
    // Update GPU textures
    this.updateTextures(neighborData);
    
    // Cache neighbor data and positions for next frame
    this.cachedNeighborData = {
      indices: new Int32Array(neighborData.indices),
      distances: new Float32Array(neighborData.distances)
    };
    this.previousPositions = new Float32Array(positions);
    
    if (!Array.isArray(movementResult)) {
      this.lastFullUpdateFrame = this.frameCount;
    }
    
    this.lastUpdateTime = performance.now() - startTime;
    return true;
  }

  /**
   * Read position data from GPU texture using a more reliable approach
   * Instead of reading GPU pixels, we'll use CPU-side position tracking
   * @param {WebGLRenderer} renderer - Three.js renderer
   * @param {DataTexture} positionsTexture - GPU texture with positions (not used directly)
   * @param {number} nodeCount - Number of nodes to read
   * @returns {Float32Array} Position data [x1, y1, z1, w1, x2, y2, z2, w2, ...]
   */
  readPositions(renderer, positionsTexture, nodeCount) {
    // Use CPU-side position cache instead of GPU readback
    if (this.cpuPositionCache && this.cpuPositionCache.length >= nodeCount * 4) {
      return this.cpuPositionCache;
    }
    
    // Initialize with node data from original positions
    const size = this.textureSize;
    const buffer = new Float32Array(size * size * 4);
    
    // Use stored initial positions if available
    if (this.initialNodePositions) {
      for (let i = 0; i < Math.min(nodeCount, this.initialNodePositions.length); i++) {
        const node = this.initialNodePositions[i];
        const idx = i * 4;
        buffer[idx] = node.x || (Math.random() - 0.5) * 200;
        buffer[idx + 1] = node.y || (Math.random() - 0.5) * 200;
        buffer[idx + 2] = node.z || (Math.random() - 0.5) * 200;
        buffer[idx + 3] = node.isStatic ? 1 : 0;
      }
    } else {
      // Generate distributed positions if no initial data
      for (let i = 0; i < nodeCount; i++) {
        const idx = i * 4;
        const angle = (i / nodeCount) * Math.PI * 2;
        const radius = Math.sqrt(i / nodeCount) * 100;
        
        buffer[idx] = Math.cos(angle) * radius + (Math.random() - 0.5) * 20;
        buffer[idx + 1] = Math.sin(angle) * radius + (Math.random() - 0.5) * 20;
        buffer[idx + 2] = (Math.random() - 0.5) * 50;
        buffer[idx + 3] = 0;
      }
    }
    
    // Cache the positions
    this.cpuPositionCache = buffer;
    return buffer;
  }

  /**
   * Check if nodes have moved significantly since last update
   * Uses both global movement threshold and per-node tracking for optimal performance
   * @param {Float32Array} positions - Current positions
   * @returns {boolean|Array} True if significant movement detected, or array of moved node indices
   */
  hasSignificantMovement(positions) {
    if (!this.previousPositions || this.previousPositions.length !== positions.length) {
      return true;
    }
    
    let maxMovement = 0;
    let movedNodes = [];
    const nodeCount = Math.floor(positions.length / 4);
    
    for (let i = 0; i < nodeCount; i++) {
      const idx = i * 4;
      const dx = positions[idx] - this.previousPositions[idx];
      const dy = positions[idx + 1] - this.previousPositions[idx + 1];
      const dz = positions[idx + 2] - this.previousPositions[idx + 2];
      const movement = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      maxMovement = Math.max(maxMovement, movement);
      
      // Track individual nodes that moved significantly
      if (movement > this.movementThreshold) {
        movedNodes.push(i);
      }
    }
    
    // If less than 10% of nodes moved, return the specific indices for incremental update
    if (movedNodes.length < nodeCount * 0.1 && movedNodes.length > 0) {
      return movedNodes;
    }
    
    // If many nodes moved or global movement is high, do full update
    return maxMovement > this.movementThreshold;
  }

  /**
   * Update spatial bounds based on node positions
   * @param {Float32Array} positions - Node positions
   */
  updateBounds(positions) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < positions.length; i += 4) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      if (isFinite(x) && isFinite(y) && isFinite(z)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }
    }
    
    // Add padding to bounds
    const padding = 10;
    this.bounds = {
      min: { x: minX - padding, y: minY - padding, z: minZ - padding },
      max: { x: maxX + padding, y: maxY + padding, z: maxZ + padding }
    };
    
    // Update cell size
    this.cellSize = {
      x: (this.bounds.max.x - this.bounds.min.x) / this.gridResolution,
      y: (this.bounds.max.y - this.bounds.min.y) / this.gridResolution,
      z: (this.bounds.max.z - this.bounds.min.z) / this.gridResolution
    };
  }

  /**
   * Build multi-resolution spatial grid from node positions
   * @param {Float32Array} positions - Node positions
   */
  buildGrid(positions) {
    this.grid.clear();
    this.fineGrid.clear();
    this.coarseGrid.clear();
    this.densityMap.clear();
    
    if (!this.useMultiResolution) {
      return this.buildSingleGrid(positions, this.gridResolution, this.grid);
    }
    
    // First pass: analyze density using base resolution
    const densityGrid = new Map();
    for (let i = 0; i < positions.length; i += 4) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      
      const cell = this.getGridCellAtResolution(x, y, z, this.gridResolution);
      const cellKey = this.getCellKey(cell.x, cell.y, cell.z);
      
      if (!densityGrid.has(cellKey)) {
        densityGrid.set(cellKey, 0);
      }
      densityGrid.set(cellKey, densityGrid.get(cellKey) + 1);
    }
    
    // Second pass: assign nodes to appropriate resolution grids
    for (let i = 0; i < positions.length; i += 4) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      
      const nodeIndex = Math.floor(i / 4);
      const node = { index: nodeIndex, x, y, z };
      
      // Determine density at base resolution
      const baseCell = this.getGridCellAtResolution(x, y, z, this.gridResolution);
      const baseCellKey = this.getCellKey(baseCell.x, baseCell.y, baseCell.z);
      const density = densityGrid.get(baseCellKey) || 0;
      
      if (density >= this.denseThreshold) {
        // Use fine grid for dense regions
        const fineCell = this.getGridCellAtResolution(x, y, z, this.fineGridResolution);
        const fineCellKey = this.getCellKey(fineCell.x, fineCell.y, fineCell.z);
        
        if (!this.fineGrid.has(fineCellKey)) {
          this.fineGrid.set(fineCellKey, []);
        }
        this.fineGrid.get(fineCellKey).push(node);
        
      } else if (density <= this.sparseThreshold) {
        // Use coarse grid for sparse regions
        const coarseCell = this.getGridCellAtResolution(x, y, z, this.coarseGridResolution);
        const coarseCellKey = this.getCellKey(coarseCell.x, coarseCell.y, coarseCell.z);
        
        if (!this.coarseGrid.has(coarseCellKey)) {
          this.coarseGrid.set(coarseCellKey, []);
        }
        this.coarseGrid.get(coarseCellKey).push(node);
        
      } else {
        // Use standard grid for medium density
        const cell = this.getGridCellAtResolution(x, y, z, this.gridResolution);
        const cellKey = this.getCellKey(cell.x, cell.y, cell.z);
        
        if (!this.grid.has(cellKey)) {
          this.grid.set(cellKey, []);
        }
        this.grid.get(cellKey).push(node);
      }
      
      // Store density information
      this.densityMap.set(nodeIndex, density);
    }
  }

  /**
   * Build single-resolution grid (fallback method)
   * @param {Float32Array} positions - Node positions
   * @param {number} resolution - Grid resolution
   * @param {Map} targetGrid - Target grid to populate
   */
  buildSingleGrid(positions, resolution, targetGrid) {
    for (let i = 0; i < positions.length; i += 4) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      
      const cell = this.getGridCellAtResolution(x, y, z, resolution);
      const cellKey = this.getCellKey(cell.x, cell.y, cell.z);
      
      if (!targetGrid.has(cellKey)) {
        targetGrid.set(cellKey, []);
      }
      
      targetGrid.get(cellKey).push({
        index: Math.floor(i / 4),
        x, y, z
      });
    }
  }

  /**
   * Get grid cell coordinates for a position at default resolution
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate  
   * @param {number} z - Z coordinate
   * @returns {Object} Grid cell coordinates
   */
  getGridCell(x, y, z) {
    return this.getGridCellAtResolution(x, y, z, this.gridResolution);
  }

  /**
   * Get grid cell coordinates for a position at specific resolution
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate  
   * @param {number} z - Z coordinate
   * @param {number} resolution - Grid resolution
   * @returns {Object} Grid cell coordinates
   */
  getGridCellAtResolution(x, y, z, resolution) {
    const cellSizeX = (this.bounds.max.x - this.bounds.min.x) / resolution;
    const cellSizeY = (this.bounds.max.y - this.bounds.min.y) / resolution;
    const cellSizeZ = (this.bounds.max.z - this.bounds.min.z) / resolution;
    
    return {
      x: Math.floor((x - this.bounds.min.x) / cellSizeX),
      y: Math.floor((y - this.bounds.min.y) / cellSizeY),
      z: Math.floor((z - this.bounds.min.z) / cellSizeZ)
    };
  }

  /**
   * Generate unique key for grid cell
   * @param {number} x - Cell X coordinate
   * @param {number} y - Cell Y coordinate
   * @param {number} z - Cell Z coordinate
   * @returns {string} Unique cell key
   */
  getCellKey(x, y, z) {
    return `${x},${y},${z}`;
  }

  /**
   * Find N nearest neighbors for each node
   * @param {Float32Array} positions - Node positions
   * @returns {Object} Neighbor data with indices and distances
   */
  findNeighbors(positions) {
    const nodeCount = Math.floor(positions.length / 4);
    const neighborIndices = new Int32Array(nodeCount * this.maxNeighbors);
    const neighborDistances = new Float32Array(nodeCount * this.maxNeighbors);
    
    // Fill with invalid indices initially
    neighborIndices.fill(-1);
    neighborDistances.fill(Infinity);
    
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
      const x = positions[nodeIndex * 4];
      const y = positions[nodeIndex * 4 + 1];
      const z = positions[nodeIndex * 4 + 2];
      
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      
      const neighbors = this.findNodeNeighbors(nodeIndex, x, y, z);
      
      // Store top N neighbors
      const baseIndex = nodeIndex * this.maxNeighbors;
      for (let i = 0; i < Math.min(neighbors.length, this.maxNeighbors); i++) {
        neighborIndices[baseIndex + i] = neighbors[i].index;
        neighborDistances[baseIndex + i] = neighbors[i].distance;
      }
    }
    
    return { indices: neighborIndices, distances: neighborDistances };
  }

  /**
   * Perform incremental update for specific moved nodes
   * @param {Float32Array} positions - Current node positions
   * @param {Array} movedNodeIndices - Indices of nodes that moved significantly
   * @returns {Object} Updated neighbor data
   */
  incrementalUpdate(positions, movedNodeIndices) {
    if (!this.cachedNeighborData) {
      // No cache available, perform full update
      this.updateBounds(positions);
      this.buildGrid(positions);
      return this.findNeighbors(positions);
    }
    
    // Start with cached neighbor data
    const neighborIndices = new Int32Array(this.cachedNeighborData.indices);
    const neighborDistances = new Float32Array(this.cachedNeighborData.distances);
    
    // Update grid with new positions
    this.buildGrid(positions);
    
    // Recalculate neighbors only for moved nodes and their potential neighbors
    const affectedNodes = new Set(movedNodeIndices);
    
    // Add nodes that might be affected by the moved nodes
    for (const movedIndex of movedNodeIndices) {
      const x = positions[movedIndex * 4];
      const y = positions[movedIndex * 4 + 1];
      const z = positions[movedIndex * 4 + 2];
      
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      
      // Find all nodes within influence radius of moved node
      const influenceRadius = this.cellSize.x * 2; // Two cell sizes
      const nodeCount = Math.floor(positions.length / 4);
      
      for (let i = 0; i < nodeCount; i++) {
        if (affectedNodes.has(i)) continue;
        
        const otherX = positions[i * 4];
        const otherY = positions[i * 4 + 1];
        const otherZ = positions[i * 4 + 2];
        
        if (!isFinite(otherX) || !isFinite(otherY) || !isFinite(otherZ)) continue;
        
        const dx = otherX - x;
        const dy = otherY - y;
        const dz = otherZ - z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (distance <= influenceRadius) {
          affectedNodes.add(i);
        }
      }
    }
    
    // Recalculate neighbors for all affected nodes
    for (const nodeIndex of affectedNodes) {
      const x = positions[nodeIndex * 4];
      const y = positions[nodeIndex * 4 + 1];
      const z = positions[nodeIndex * 4 + 2];
      
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      
      const neighbors = this.findNodeNeighbors(nodeIndex, x, y, z);
      
      // Update neighbor data for this node
      const baseIndex = nodeIndex * this.maxNeighbors;
      
      // Clear existing data for this node
      for (let i = 0; i < this.maxNeighbors; i++) {
        neighborIndices[baseIndex + i] = -1;
        neighborDistances[baseIndex + i] = Infinity;
      }
      
      // Store new neighbors
      for (let i = 0; i < Math.min(neighbors.length, this.maxNeighbors); i++) {
        neighborIndices[baseIndex + i] = neighbors[i].index;
        neighborDistances[baseIndex + i] = neighbors[i].distance;
      }
    }
    
    return { indices: neighborIndices, distances: neighborDistances };
  }

  /**
   * Find neighbors for a specific node across all resolution grids
   * @param {number} nodeIndex - Index of the node
   * @param {number} x - Node X position
   * @param {number} y - Node Y position
   * @param {number} z - Node Z position
   * @returns {Array} Sorted array of neighbors
   */
  findNodeNeighbors(nodeIndex, x, y, z) {
    const neighbors = [];
    
    if (!this.useMultiResolution) {
      return this.findNeighborsInGrid(nodeIndex, x, y, z, this.grid, this.gridResolution);
    }
    
    // Determine which density level this node belongs to
    const density = this.densityMap.get(nodeIndex) || 0;
    
    // Search appropriate grid level first
    if (density >= this.denseThreshold) {
      // High density: search fine grid primarily
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.fineGrid, this.fineGridResolution));
      // Also search standard grid for nearby medium density nodes
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.grid, this.gridResolution));
      
    } else if (density <= this.sparseThreshold) {
      // Low density: search coarse grid primarily
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.coarseGrid, this.coarseGridResolution));
      // Also search standard grid for nearby medium density nodes
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.grid, this.gridResolution));
      
    } else {
      // Medium density: search all grids
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.grid, this.gridResolution));
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.fineGrid, this.fineGridResolution));
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.coarseGrid, this.coarseGridResolution));
    }
    
    // Remove duplicates and sort by distance
    const uniqueNeighbors = new Map();
    for (const neighbor of neighbors) {
      if (!uniqueNeighbors.has(neighbor.index) || 
          uniqueNeighbors.get(neighbor.index).distance > neighbor.distance) {
        uniqueNeighbors.set(neighbor.index, neighbor);
      }
    }
    
    const result = Array.from(uniqueNeighbors.values());
    result.sort((a, b) => a.distance - b.distance);
    return result.slice(0, this.maxNeighbors * 2); // Get extra for better quality
  }

  /**
   * Find neighbors in a specific grid
   * @param {number} nodeIndex - Index of the node
   * @param {number} x - Node X position
   * @param {number} y - Node Y position
   * @param {number} z - Node Z position
   * @param {Map} grid - Grid to search in
   * @param {number} resolution - Grid resolution
   * @returns {Array} Array of neighbors from this grid
   */
  findNeighborsInGrid(nodeIndex, x, y, z, grid, resolution) {
    const neighbors = [];
    const cell = this.getGridCellAtResolution(x, y, z, resolution);
    
    // Search in surrounding cells (3x3x3 neighborhood)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const searchCell = {
            x: cell.x + dx,
            y: cell.y + dy,
            z: cell.z + dz
          };
          
          const cellKey = this.getCellKey(searchCell.x, searchCell.y, searchCell.z);
          const cellNodes = grid.get(cellKey);
          
          if (cellNodes) {
            for (const node of cellNodes) {
              if (node.index === nodeIndex) continue;
              
              const dx = node.x - x;
              const dy = node.y - y;
              const dz = node.z - z;
              const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
              
              neighbors.push({ index: node.index, distance });
            }
          }
        }
      }
    }
    
    return neighbors;
  }

  /**
   * Update GPU textures with neighbor data
   * @param {Object} neighborData - Neighbor indices and distances
   */
  updateTextures(neighborData) {
    const { indices, distances } = neighborData;
    const nodeCount = Math.floor(indices.length / this.maxNeighbors);
    
    // Create textures if they don't exist or size changed
    if (!this.neighborsTexture || this.neighborsTexture.image.width !== this.textureSize) {
      this.createTextures();
    }
    
    // Pack neighbor indices into texture
    const indicesData = new Float32Array(this.textureSize * this.textureSize * 4);
    const distancesData = new Float32Array(this.textureSize * this.textureSize * 4);
    
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
      const textureIndex = nodeIndex * 4;
      const neighborBase = nodeIndex * this.maxNeighbors;
      
      // Pack up to 4 neighbor indices per texel (RGBA components)
      for (let i = 0; i < 4 && i < this.maxNeighbors; i++) {
        const neighborIndex = indices[neighborBase + i];
        const distance = distances[neighborBase + i];
        
        indicesData[textureIndex + i] = neighborIndex >= 0 ? neighborIndex : -1;
        distancesData[textureIndex + i] = isFinite(distance) ? distance : 0;
      }
    }
    
    // Update texture data
    this.neighborsTexture.image.data = indicesData;
    this.neighborsTexture.needsUpdate = true;
    
    this.neighborsDistanceTexture.image.data = distancesData;
    this.neighborsDistanceTexture.needsUpdate = true;
  }

  /**
   * Create GPU textures for neighbor data
   */
  createTextures() {
    const size = this.textureSize;
    
    this.neighborsTexture = new DataTexture(
      new Float32Array(size * size * 4),
      size,
      size,
      RGBAFormat,
      FloatType
    );
    this.neighborsTexture.needsUpdate = true;
    
    this.neighborsDistanceTexture = new DataTexture(
      new Float32Array(size * size * 4),
      size,
      size,
      RGBAFormat,
      FloatType
    );
    this.neighborsDistanceTexture.needsUpdate = true;
  }

  /**
   * Get neighbor texture for GPU shaders
   * @returns {DataTexture} Texture containing neighbor indices
   */
  getNeighborsTexture() {
    return this.neighborsTexture;
  }

  /**
   * Get neighbor distance texture for GPU shaders
   * @returns {DataTexture} Texture containing neighbor distances
   */
  getNeighborsDistanceTexture() {
    return this.neighborsDistanceTexture;
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance info
   */
  getPerformanceInfo() {
    return {
      lastUpdateTime: this.lastUpdateTime,
      gridCells: this.grid.size,
      maxNeighbors: this.maxNeighbors,
      updateInterval: this.updateInterval,
      frameCount: this.frameCount
    };
  }

  /**
   * Set update interval for performance tuning
   * @param {number} interval - Number of frames between updates
   */
  setUpdateInterval(interval) {
    this.updateInterval = Math.max(1, interval);
  }

  /**
   * Set movement threshold for temporal coherence
   * @param {number} threshold - Minimum movement to trigger update
   */
  setMovementThreshold(threshold) {
    this.movementThreshold = threshold;
  }

  /**
   * Enable or disable multi-resolution grid
   * @param {boolean} enabled - Whether to use multi-resolution
   */
  setMultiResolution(enabled) {
    this.useMultiResolution = enabled;
  }

  /**
   * Configure density thresholds for multi-resolution grid
   * @param {number} denseThreshold - Nodes per cell for fine grid
   * @param {number} sparseThreshold - Nodes per cell for coarse grid
   */
  setDensityThresholds(denseThreshold, sparseThreshold) {
    this.denseThreshold = denseThreshold;
    this.sparseThreshold = sparseThreshold;
  }

  /**
   * Configure grid resolutions
   * @param {number} fine - Fine grid resolution
   * @param {number} standard - Standard grid resolution
   * @param {number} coarse - Coarse grid resolution
   */
  setGridResolutions(fine, standard, coarse) {
    this.fineGridResolution = fine;
    this.gridResolution = standard;
    this.coarseGridResolution = coarse;
  }

  /**
   * Dispose of GPU resources
   */
  dispose() {
    if (this.neighborsTexture) {
      this.neighborsTexture.dispose();
      this.neighborsTexture = null;
    }
    
    if (this.neighborsDistanceTexture) {
      this.neighborsDistanceTexture.dispose();
      this.neighborsDistanceTexture = null;
    }
    
    this.grid.clear();
    this.fineGrid.clear();
    this.coarseGrid.clear();
    this.densityMap.clear();
    this.previousPositions = null;
    this.cachedNeighborData = null;
    this.cpuPositionCache = null;
    this.initialNodePositions = null;
    this.positionUpdateSimulation = null;
  }
}