/**
 * Spatial hashing utilities for GPU-based neighbor finding
 * Used to efficiently partition 3D space for nearest neighbor searches
 */

/**
 * Calculate spatial hash for a 3D position
 * Uses a grid-based approach with configurable cell size
 * Relies on uniforms:
 * - float spatialHashSize: size of each hash cell
 * - float spatialHashRes: resolution of hash grid (power of 2)
 */
export const spatialHash = `
  ivec3 spatialHash(vec3 position, float cellSize) {
    return ivec3(floor(position / cellSize));
  }
`;

/**
 * Convert 3D hash coordinates to 1D hash index
 * Uses bit mixing for better distribution
 */
export const hashToIndex = `
  int hashToIndex(ivec3 hash, int hashRes) {
    // Simple hash function with bit mixing
    int x = hash.x & (hashRes - 1);
    int y = hash.y & (hashRes - 1);
    int z = hash.z & (hashRes - 1);
    
    // Mix bits to reduce clustering
    int index = x * 73856093 + y * 19349663 + z * 83492791;
    return abs(index) & (hashRes * hashRes * hashRes - 1);
  }
`;

/**
 * Get neighboring hash cells for a given position
 * Returns the 27 neighboring cells (3x3x3 cube) including center
 */
export const getNeighborCells = `
  void getNeighborCells(vec3 position, float cellSize, out ivec3 neighbors[27]) {
    ivec3 centerHash = spatialHash(position, cellSize);
    
    int index = 0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          neighbors[index] = centerHash + ivec3(x, y, z);
          index++;
        }
      }
    }
  }
`;

/**
 * Check if a position is within the influence radius of another position
 * Uses squared distance for efficiency
 */
export const isWithinRadius = `
  bool isWithinRadius(vec3 pos1, vec3 pos2, float radius) {
    vec3 diff = pos2 - pos1;
    float distSq = dot(diff, diff);
    return distSq <= radius * radius;
  }
`;

/**
 * Calculate squared distance between two positions
 * More efficient than full distance calculation for sorting
 */
export const distanceSquared = `
  float distanceSquared(vec3 pos1, vec3 pos2) {
    vec3 diff = pos2 - pos1;
    return dot(diff, diff);
  }
`;