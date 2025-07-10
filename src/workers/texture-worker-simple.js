/**
 * Web Worker for texture processing (Non-module version)
 * Handles heavy texture data processing off the main thread
 */

let wasmModule = null;
let wasmReady = false;

/**
 * Initialize WASM module using simple fetch + instantiate
 */
async function initWasm() {
  if (wasmReady) return;
  
  try {
    // Load WASM module using simpler approach
    const wasmResponse = await fetch('./build/texture-processor.wasm');
    const wasmBytes = await wasmResponse.arrayBuffer();
    const wasmInstance = await WebAssembly.instantiate(wasmBytes);
    
    wasmModule = wasmInstance.instance;
    wasmReady = true;
    
    self.postMessage({
      type: 'wasm-ready',
      success: true
    });
  } catch (error) {
    console.warn('WASM loading failed:', error);
    self.postMessage({
      type: 'wasm-ready',
      success: false,
      error: error.message
    });
  }
}

/**
 * Process texture data using WASM
 * @param {Object} data - Processing parameters
 */
async function processTextures(data) {
  const {
    nodes,
    links,
    textureSize,
    frustumSize,
    requestId
  } = data;
  
  if (!wasmReady) {
    await initWasm();
  }
  
  if (!wasmReady) {
    throw new Error('WASM module failed to initialize');
  }
  
  const startTime = performance.now();
  
  try {
    // Calculate memory requirements
    const totalElements = textureSize * textureSize;
    const nodesDataSize = nodes.length * 4 * 4; // 4 floats per node, 4 bytes per float
    const linksDataSize = links.length * 2 * 4; // 2 ints per link, 4 bytes per int
    const positionsSize = totalElements * 4 * 4; // 4 floats per element, 4 bytes per float
    const linksTextureSize = totalElements * 4 * 4; // 4 floats per element, 4 bytes per float
    
    // Use simple memory allocation (grow memory as needed)
    const memory = wasmModule.exports.memory;
    const memoryNeeded = nodesDataSize + linksDataSize + positionsSize + linksTextureSize;
    const currentSize = memory.buffer.byteLength;
    
    if (currentSize < memoryNeeded) {
      const pagesNeeded = Math.ceil((memoryNeeded - currentSize) / 65536);
      memory.grow(pagesNeeded);
    }
    
    // Simple memory layout - allocate sequentially
    let memoryOffset = 0;
    const nodesDataPtr = memoryOffset;
    memoryOffset += nodesDataSize;
    const linksDataPtr = memoryOffset;
    memoryOffset += linksDataSize;
    const positionsPtr = memoryOffset;
    memoryOffset += positionsSize;
    const linksTexturePtr = memoryOffset;
    
    // Prepare and copy node data
    const wasmMemory = new Uint8Array(memory.buffer);
    const nodesFloat32 = new Float32Array(nodes.length * 4);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const offset = i * 4;
      nodesFloat32[offset + 0] = typeof node.x !== 'undefined' ? node.x : NaN;
      nodesFloat32[offset + 1] = typeof node.y !== 'undefined' ? node.y : NaN;
      nodesFloat32[offset + 2] = typeof node.z !== 'undefined' ? node.z : NaN;
      nodesFloat32[offset + 3] = node.isStatic ? 1.0 : 0.0;
    }
    wasmMemory.set(new Uint8Array(nodesFloat32.buffer), nodesDataPtr);
    
    // Prepare and copy links data
    const linksInt32 = new Int32Array(links.length * 2);
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const offset = i * 2;
      linksInt32[offset + 0] = link.sourceIndex;
      linksInt32[offset + 1] = link.targetIndex;
    }
    wasmMemory.set(new Uint8Array(linksInt32.buffer), linksDataPtr);
    
    // Process textures in WASM (if function exists)
    if (wasmModule.exports.processTextures) {
      wasmModule.exports.processTextures(
        nodesDataPtr,
        nodes.length,
        linksDataPtr,
        links.length,
        textureSize,
        positionsPtr,
        linksTexturePtr,
        frustumSize
      );
    } else {
      throw new Error('WASM processTextures function not found');
    }
    
    // Extract results
    const positionsData = new Float32Array(memory.buffer, positionsPtr, totalElements * 4);
    const linksTextureData = new Float32Array(memory.buffer, linksTexturePtr, totalElements * 4);
    
    // Copy results to transferable buffers
    const positionsResult = new Float32Array(positionsData);
    const linksResult = new Float32Array(linksTextureData);
    
    const processingTime = performance.now() - startTime;
    
    // Send results back to main thread
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: true,
      data: {
        positions: positionsResult,
        links: linksResult,
        processingTime,
        memoryUsage: memory.buffer.byteLength
      }
    }, [positionsResult.buffer, linksResult.buffer]);
    
  } catch (error) {
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: false,
      error: error.message
    });
  }
}

/**
 * Fallback processing without WASM
 * @param {Object} data - Processing parameters
 */
function processFallback(data) {
  const {
    nodes,
    links,
    textureSize,
    frustumSize,
    requestId
  } = data;
  
  const startTime = performance.now();
  
  try {
    const totalElements = textureSize * textureSize;
    const positionsData = new Float32Array(totalElements * 4);
    const linksData = new Float32Array(totalElements * 4);
    
    // Process positions
    for (let i = 0; i < totalElements; i++) {
      const baseIndex = i * 4;
      
      if (i < nodes.length) {
        const node = nodes[i];
        const x = typeof node.x !== 'undefined' ? node.x : (Math.random() * 2 - 1);
        const y = typeof node.y !== 'undefined' ? node.y : (Math.random() * 2 - 1);
        const z = typeof node.z !== 'undefined' ? node.z : (Math.random() * 2 - 1);
        
        positionsData[baseIndex + 0] = x;
        positionsData[baseIndex + 1] = y;
        positionsData[baseIndex + 2] = z;
        positionsData[baseIndex + 3] = node.isStatic ? 1 : 0;
      } else {
        const farAway = frustumSize * 10;
        positionsData[baseIndex + 0] = farAway;
        positionsData[baseIndex + 1] = farAway;
        positionsData[baseIndex + 2] = farAway;
        positionsData[baseIndex + 3] = 0;
      }
    }
    
    // Process links
    for (let i = 0; i < totalElements; i++) {
      const baseIndex = i * 4;
      
      if (i < links.length) {
        const link = links[i];
        const sourceIndex = link.sourceIndex;
        const targetIndex = link.targetIndex;
        
        const sourceU = (sourceIndex % textureSize) / textureSize;
        const sourceV = Math.floor(sourceIndex / textureSize) / textureSize;
        const targetU = (targetIndex % textureSize) / textureSize;
        const targetV = Math.floor(targetIndex / textureSize) / textureSize;
        
        linksData[baseIndex + 0] = sourceU;
        linksData[baseIndex + 1] = sourceV;
        linksData[baseIndex + 2] = targetU;
        linksData[baseIndex + 3] = targetV;
      } else {
        linksData[baseIndex + 0] = 0;
        linksData[baseIndex + 1] = 0;
        linksData[baseIndex + 2] = 0;
        linksData[baseIndex + 3] = 0;
      }
    }
    
    const processingTime = performance.now() - startTime;
    
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: true,
      data: {
        positions: positionsData,
        links: linksData,
        processingTime,
        memoryUsage: 0
      }
    }, [positionsData.buffer, linksData.buffer]);
    
  } catch (error) {
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: false,
      error: error.message
    });
  }
}

// Message handler
self.onmessage = function(event) {
  const { type, data } = event.data;
  
  switch (type) {
    case 'init':
      initWasm();
      break;
      
    case 'process-textures':
      if (data.useWasm && wasmReady) {
        processTextures(data);
      } else {
        processFallback(data);
      }
      break;
      
    case 'check-wasm':
      self.postMessage({
        type: 'wasm-status',
        ready: wasmReady
      });
      break;
      
    default:
      self.postMessage({
        type: 'error',
        error: `Unknown message type: ${type}`
      });
  }
};

// Initialize WASM on worker start
initWasm();