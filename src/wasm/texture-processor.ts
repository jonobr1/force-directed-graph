/**
 * AssemblyScript texture processor for Force Directed Graph
 * Handles high-performance texture data processing for GPU compute shaders
 */

// Memory layout constants
const FLOAT32_BYTES = 4;
const RGBA_COMPONENTS = 4;

// Export memory to be accessible from JavaScript
export declare const __heap_base: usize;

/**
 * Process node positions into texture data
 * @param nodesDataPtr Pointer to serialized node data
 * @param nodesCount Number of nodes
 * @param textureSize Power-of-2 texture size
 * @param positionsPtr Pointer to output positions texture data
 * @param frustumSize Frustum size for out-of-bounds nodes
 */
export function processNodePositions(
  nodesDataPtr: usize,
  nodesCount: i32,
  textureSize: i32,
  positionsPtr: usize,
  frustumSize: f32
): void {
  const totalElements = textureSize * textureSize;
  
  for (let i = 0; i < totalElements; i++) {
    const positionOffset = positionsPtr + i * RGBA_COMPONENTS * FLOAT32_BYTES;
    
    if (i < nodesCount) {
      // Read node data (x, y, z, isStatic) using direct memory access
      const nodeOffset = nodesDataPtr + i * 4 * FLOAT32_BYTES;
      const x = load<f32>(nodeOffset + 0 * FLOAT32_BYTES);
      const y = load<f32>(nodeOffset + 1 * FLOAT32_BYTES);
      const z = load<f32>(nodeOffset + 2 * FLOAT32_BYTES);
      const isStatic = load<f32>(nodeOffset + 3 * FLOAT32_BYTES);
      
      // Use provided position or random fallback
      store<f32>(positionOffset + 0 * FLOAT32_BYTES, !isFinite(x) ? f32(Math.random() * 2.0 - 1.0) : x);
      store<f32>(positionOffset + 1 * FLOAT32_BYTES, !isFinite(y) ? f32(Math.random() * 2.0 - 1.0) : y);
      store<f32>(positionOffset + 2 * FLOAT32_BYTES, !isFinite(z) ? f32(Math.random() * 2.0 - 1.0) : z);
      store<f32>(positionOffset + 3 * FLOAT32_BYTES, isStatic);
    } else {
      // Place extraneous nodes far away
      const farAway = frustumSize * 10.0;
      store<f32>(positionOffset + 0 * FLOAT32_BYTES, farAway);
      store<f32>(positionOffset + 1 * FLOAT32_BYTES, farAway);
      store<f32>(positionOffset + 2 * FLOAT32_BYTES, farAway);
      store<f32>(positionOffset + 3 * FLOAT32_BYTES, 0.0);
    }
  }
}

/**
 * Process links into texture data with UV coordinates
 * @param linksDataPtr Pointer to serialized link data (source, target indices)
 * @param linksCount Number of links
 * @param textureSize Power-of-2 texture size
 * @param linksTexturePtr Pointer to output links texture data
 */
export function processLinks(
  linksDataPtr: usize,
  linksCount: i32,
  textureSize: i32,
  linksTexturePtr: usize
): void {
  const totalElements = textureSize * textureSize;
  const textureSizeF = f32(textureSize);
  
  for (let i = 0; i < totalElements; i++) {
    const linkOffset = linksTexturePtr + i * RGBA_COMPONENTS * FLOAT32_BYTES;
    
    if (i < linksCount) {
      // Read link data (sourceIndex, targetIndex) - using i32 load for integer data
      const linkDataOffset = linksDataPtr + i * 2 * FLOAT32_BYTES;
      const sourceIndex = load<i32>(linkDataOffset + 0 * FLOAT32_BYTES);
      const targetIndex = load<i32>(linkDataOffset + 1 * FLOAT32_BYTES);
      
      // Calculate UV coordinates for source node
      const sourceU = f32(sourceIndex % textureSize) / textureSizeF;
      const sourceV = f32(sourceIndex / textureSize) / textureSizeF;
      
      // Calculate UV coordinates for target node
      const targetU = f32(targetIndex % textureSize) / textureSizeF;
      const targetV = f32(targetIndex / textureSize) / textureSizeF;
      
      // Store UV coordinates in texture using direct memory access
      store<f32>(linkOffset + 0 * FLOAT32_BYTES, sourceU);
      store<f32>(linkOffset + 1 * FLOAT32_BYTES, sourceV);
      store<f32>(linkOffset + 2 * FLOAT32_BYTES, targetU);
      store<f32>(linkOffset + 3 * FLOAT32_BYTES, targetV);
    } else {
      // Clear unused texture elements
      store<f32>(linkOffset + 0 * FLOAT32_BYTES, 0.0);
      store<f32>(linkOffset + 1 * FLOAT32_BYTES, 0.0);
      store<f32>(linkOffset + 2 * FLOAT32_BYTES, 0.0);
      store<f32>(linkOffset + 3 * FLOAT32_BYTES, 0.0);
    }
  }
}

/**
 * Combined processing function for both nodes and links
 * @param nodesDataPtr Pointer to serialized node data
 * @param nodesCount Number of nodes
 * @param linksDataPtr Pointer to serialized link data
 * @param linksCount Number of links
 * @param textureSize Power-of-2 texture size
 * @param positionsPtr Pointer to output positions texture data
 * @param linksTexturePtr Pointer to output links texture data
 * @param frustumSize Frustum size for out-of-bounds nodes
 */
export function processTextures(
  nodesDataPtr: usize,
  nodesCount: i32,
  linksDataPtr: usize,
  linksCount: i32,
  textureSize: i32,
  positionsPtr: usize,
  linksTexturePtr: usize,
  frustumSize: f32
): void {
  processNodePositions(nodesDataPtr, nodesCount, textureSize, positionsPtr, frustumSize);
  processLinks(linksDataPtr, linksCount, textureSize, linksTexturePtr);
}

/**
 * Allocate memory for texture data
 * @param size Size in bytes
 * @returns Pointer to allocated memory
 */
export function allocateMemory(size: i32): usize {
  return heap.alloc(size);
}

/**
 * Free allocated memory
 * @param ptr Pointer to memory to free
 */
export function freeMemory(ptr: usize): void {
  heap.free(ptr);
}

/**
 * Get memory usage statistics
 * @returns Memory usage in bytes
 */
export function getMemoryUsage(): i32 {
  return i32(memory.size() * 65536); // Pages to bytes
}