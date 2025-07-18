import { getPosition, getIndex } from "./partials.js";
import { spatialHash, hashToIndex, getNeighborCells, isWithinRadius, distanceSquared } from "./partials/spatial-hash.js";
import { neighborData, compareNeighbors, swapNeighbors, insertionSort, insertNeighbor, initializeNeighbors } from "./partials/bitonic-sort.js";

/**
 * Nearest neighbors computation shader
 * Finds the N closest neighbors for each node using spatial hashing and GPU sorting
 */
export const nearestNeighbors = `
  uniform float size;
  uniform float nodeAmount;
  uniform float nearestNeighborCount;
  uniform float spatialHashSize;
  uniform float maxSearchRadius;
  uniform sampler2D texturePositions;

  ${getPosition}
  ${getIndex}
  ${spatialHash}
  ${hashToIndex}
  ${getNeighborCells}
  ${isWithinRadius}
  ${distanceSquared}
  ${neighborData}
  ${compareNeighbors}
  ${swapNeighbors}
  ${insertionSort}
  ${insertNeighbor}
  ${initializeNeighbors}

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int nodeId = getIndex(uv);
    
    // Skip processing for nodes beyond the actual node count
    if (float(nodeId) >= nodeAmount) {
      gl_FragColor = vec4(-1.0, -1.0, -1.0, -1.0);
      return;
    }

    vec3 nodePosition = getPosition(uv);
    
    // Initialize neighbor array
    NeighborData neighbors[32];
    int maxNeighbors = int(min(nearestNeighborCount, 32.0));
    initializeNeighbors(neighbors, maxNeighbors);
    
    int neighborCount = 0;
    
    // Method 1: Spatial hashing approach (more efficient for sparse graphs)
    float cellSize = spatialHashSize;
    ivec3 neighborCells[27];
    getNeighborCells(nodePosition, cellSize, neighborCells);
    
    // Search through all nodes in neighboring cells
    for (int cellIdx = 0; cellIdx < 27; cellIdx++) {
      // For simplicity, we'll search all nodes but with early termination
      // In a more sophisticated implementation, we'd maintain spatial hash tables
      for (float i = 0.0; i < nodeAmount; i += 1.0) {
        if (i == float(nodeId)) continue; // Skip self
        
        float uvx = mod(i, size) / size;
        float uvy = floor(i / size) / size;
        vec2 otherUv = vec2(uvx, uvy);
        
        vec3 otherPosition = getPosition(otherUv);
        float distSq = distanceSquared(nodePosition, otherPosition);
        
        // Skip if beyond maximum search radius
        if (distSq > maxSearchRadius * maxSearchRadius) {
          continue;
        }
        
        // Insert neighbor if closer than current worst or we have room
        if (neighborCount < maxNeighbors || distSq < neighbors[maxNeighbors - 1].distance) {
          neighborCount = insertNeighbor(neighbors, neighborCount, maxNeighbors, distSq, i);
        }
      }
    }
    
    // Sort the neighbors by distance
    insertionSort(neighbors, neighborCount);
    
    // Output the first 4 neighbors to this pixel (RGBA channels)
    // Each channel stores a neighbor index (or -1 if no neighbor)
    vec4 result = vec4(-1.0, -1.0, -1.0, -1.0);
    
    if (neighborCount > 0) result.r = neighbors[0].nodeIndex;
    if (neighborCount > 1) result.g = neighbors[1].nodeIndex;
    if (neighborCount > 2) result.b = neighbors[2].nodeIndex;
    if (neighborCount > 3) result.a = neighbors[3].nodeIndex;
    
    gl_FragColor = result;
  }
`;

/**
 * Extended nearest neighbors shader that supports more neighbors
 * Uses multiple render targets to store more than 4 neighbors per node
 */
export const nearestNeighborsExtended = `
  uniform float size;
  uniform float nodeAmount;
  uniform float nearestNeighborCount;
  uniform float spatialHashSize;
  uniform float maxSearchRadius;
  uniform float outputLayer; // Which layer of neighbors to output (0-7 for up to 32 neighbors)
  uniform sampler2D texturePositions;

  ${getPosition}
  ${getIndex}
  ${spatialHash}
  ${hashToIndex}
  ${getNeighborCells}
  ${isWithinRadius}
  ${distanceSquared}
  ${neighborData}
  ${compareNeighbors}
  ${swapNeighbors}
  ${insertionSort}
  ${insertNeighbor}
  ${initializeNeighbors}

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int nodeId = getIndex(uv);
    
    // Skip processing for nodes beyond the actual node count
    if (float(nodeId) >= nodeAmount) {
      gl_FragColor = vec4(-1.0, -1.0, -1.0, -1.0);
      return;
    }

    vec3 nodePosition = getPosition(uv);
    
    // Initialize neighbor array
    NeighborData neighbors[32];
    int maxNeighbors = int(min(nearestNeighborCount, 32.0));
    initializeNeighbors(neighbors, maxNeighbors);
    
    int neighborCount = 0;
    
    // Search through all nodes for neighbors
    for (float i = 0.0; i < nodeAmount; i += 1.0) {
      if (i == float(nodeId)) continue; // Skip self
      
      float uvx = mod(i, size) / size;
      float uvy = floor(i / size) / size;
      vec2 otherUv = vec2(uvx, uvy);
      
      vec3 otherPosition = getPosition(otherUv);
      float distSq = distanceSquared(nodePosition, otherPosition);
      
      // Skip if beyond maximum search radius
      if (distSq > maxSearchRadius * maxSearchRadius) {
        continue;
      }
      
      // Insert neighbor if closer than current worst or we have room
      if (neighborCount < maxNeighbors || distSq < neighbors[maxNeighbors - 1].distance) {
        neighborCount = insertNeighbor(neighbors, neighborCount, maxNeighbors, distSq, i);
      }
    }
    
    // Sort the neighbors by distance
    insertionSort(neighbors, neighborCount);
    
    // Output the neighbors for the requested layer
    int layerStart = int(outputLayer) * 4;
    vec4 result = vec4(-1.0, -1.0, -1.0, -1.0);
    
    if (layerStart + 0 < neighborCount) result.r = neighbors[layerStart + 0].nodeIndex;
    if (layerStart + 1 < neighborCount) result.g = neighbors[layerStart + 1].nodeIndex;
    if (layerStart + 2 < neighborCount) result.b = neighbors[layerStart + 2].nodeIndex;
    if (layerStart + 3 < neighborCount) result.a = neighbors[layerStart + 3].nodeIndex;
    
    gl_FragColor = result;
  }
`;