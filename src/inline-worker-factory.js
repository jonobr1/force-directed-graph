/**
 * Factory for creating inline texture processing workers
 * This solves bundling issues by creating workers from Blob URLs
 */

/**
 * Creates worker code as a string for inline worker creation
 * @param {string} wasmUrl - URL to the WASM file (resolved relative to main module)
 */
function createWorkerCode(wasmUrl) {
  return `
let wasmModule = null;
let wasmReady = false;

/**
 * Initialize WASM module using provided URL
 */
async function initWasm() {
  if (wasmReady) return;
  
  try {
    // Load WASM module using the provided URL
    const wasmResponse = await fetch('${wasmUrl}');
    if (!wasmResponse.ok) {
      throw new Error(\`Failed to fetch WASM: \${wasmResponse.status}\`);
    }
    const wasmBytes = await wasmResponse.arrayBuffer();
    
    // AssemblyScript WASM modules need proper imports based on wasm-objdump output
    const imports = {
      env: {
        // env.seed: () -> f64 (for random number generation)
        seed: () => Math.random(),
        
        // env.abort: (i32, i32, i32, i32) -> nil (for error handling)
        abort: (message, fileName, line, column) => {
          const error = new Error(\`AssemblyScript abort: \${message} at \${fileName}:\${line}:\${column}\`);
          console.error(error);
          throw error;
        }
      },
      'texture-processor': {
        // texture-processor.__heap_base: global i32
        __heap_base: new WebAssembly.Global({ value: 'i32', mutable: false }, 1024)
      }
    };
    
    const wasmInstance = await WebAssembly.instantiate(wasmBytes, imports);
    
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
    const nodesDataSize = nodes.length * 4 * 4;
    const linksDataSize = links.length * 2 * 4;
    const positionsSize = totalElements * 4 * 4;
    const linksTextureSize = totalElements * 4 * 4;
    
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
        error: \`Unknown message type: \${type}\`
      });
  }
};

// Initialize WASM on worker start
initWasm();
`;
}

/**
 * Creates an inline worker using Blob URLs
 * @param {string} wasmUrl - URL to the WASM file
 * @returns {Worker} Created worker instance
 */
export function createInlineWorker(wasmUrl) {
  const workerCode = createWorkerCode(wasmUrl);
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  
  const worker = new Worker(workerUrl);
  
  // Clean up blob URL when worker terminates
  worker.addEventListener('error', () => URL.revokeObjectURL(workerUrl));
  
  return worker;
}