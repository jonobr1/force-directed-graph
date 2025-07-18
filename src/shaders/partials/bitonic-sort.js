/**
 * GPU-based bitonic sorting algorithm for neighbor distance sorting
 * Efficient parallel sorting implementation for shader-based computations
 */

/**
 * Neighbor data structure for sorting
 * Stores both the node index and distance for efficient sorting
 */
export const neighborData = `
  struct NeighborData {
    float distance;
    float nodeIndex;
  };
`;

/**
 * Compare two neighbor entries for sorting
 * Returns true if first should come before second (ascending distance)
 */
export const compareNeighbors = `
  bool compareNeighbors(NeighborData a, NeighborData b) {
    return a.distance < b.distance;
  }
`;

/**
 * Swap two neighbor entries
 */
export const swapNeighbors = `
  void swapNeighbors(inout NeighborData a, inout NeighborData b) {
    NeighborData temp = a;
    a = b;
    b = temp;
  }
`;

/**
 * Bitonic sort for small arrays (up to 32 elements)
 * Optimized for GPU with unrolled loops for better performance
 */
export const bitonicSort32 = `
  void bitonicSort32(inout NeighborData neighbors[32], int count) {
    // Bitonic sort network for up to 32 elements
    // Stage 1: Sort pairs
    for (int i = 0; i < count - 1; i += 2) {
      if (i + 1 < count) {
        if (!compareNeighbors(neighbors[i], neighbors[i + 1])) {
          swapNeighbors(neighbors[i], neighbors[i + 1]);
        }
      }
    }
    
    // Stage 2: Sort 4-element groups
    for (int size = 4; size <= count; size *= 2) {
      for (int i = 0; i < count; i += size) {
        // Create bitonic sequence
        for (int j = i; j < i + size / 2 && j + size / 2 < count; j++) {
          if (!compareNeighbors(neighbors[j], neighbors[j + size / 2])) {
            swapNeighbors(neighbors[j], neighbors[j + size / 2]);
          }
        }
        
        // Sort bitonic sequence
        for (int subSize = size / 2; subSize > 1; subSize /= 2) {
          for (int j = i; j < i + size - subSize; j += subSize) {
            for (int k = j; k < j + subSize / 2 && k + subSize / 2 < count; k++) {
              if (!compareNeighbors(neighbors[k], neighbors[k + subSize / 2])) {
                swapNeighbors(neighbors[k], neighbors[k + subSize / 2]);
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Insertion sort for small arrays (fallback for variable-sized arrays)
 * More flexible than bitonic sort but potentially slower
 */
export const insertionSort = `
  void insertionSort(inout NeighborData neighbors[32], int count) {
    for (int i = 1; i < count; i++) {
      NeighborData key = neighbors[i];
      int j = i - 1;
      
      while (j >= 0 && !compareNeighbors(neighbors[j], key)) {
        neighbors[j + 1] = neighbors[j];
        j = j - 1;
      }
      neighbors[j + 1] = key;
    }
  }
`;

/**
 * Find insertion point for a new neighbor in a sorted array
 * Used for maintaining sorted order during neighbor discovery
 */
export const findInsertionPoint = `
  int findInsertionPoint(NeighborData neighbors[32], int count, float distance) {
    int left = 0;
    int right = count;
    
    while (left < right) {
      int mid = (left + right) / 2;
      if (neighbors[mid].distance < distance) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    return left;
  }
`;

/**
 * Insert a new neighbor into a sorted array, maintaining order
 * Returns the new count (limited by maxNeighbors)
 */
export const insertNeighbor = `
  int insertNeighbor(inout NeighborData neighbors[32], int count, int maxNeighbors, float distance, float nodeIndex) {
    // Don't insert if we're at capacity and this distance is larger than the worst
    if (count >= maxNeighbors && distance >= neighbors[maxNeighbors - 1].distance) {
      return count;
    }
    
    // Find insertion point
    int insertPos = findInsertionPoint(neighbors, min(count, maxNeighbors), distance);
    
    // Shift elements to make room
    int newCount = min(count + 1, maxNeighbors);
    for (int i = newCount - 1; i > insertPos; i--) {
      neighbors[i] = neighbors[i - 1];
    }
    
    // Insert new neighbor
    neighbors[insertPos].distance = distance;
    neighbors[insertPos].nodeIndex = nodeIndex;
    
    return newCount;
  }
`;

/**
 * Initialize neighbor array with invalid entries
 */
export const initializeNeighbors = `
  void initializeNeighbors(inout NeighborData neighbors[32], int maxNeighbors) {
    for (int i = 0; i < maxNeighbors; i++) {
      neighbors[i].distance = 99999.0;
      neighbors[i].nodeIndex = -1.0;
    }
  }
`;