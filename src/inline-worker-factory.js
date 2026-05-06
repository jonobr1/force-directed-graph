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
const MAX_TEXTURE_SIZE = 4096;
const MAX_BUFFER_BYTES = 512 * 1024 * 1024;

class InputValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputValidationError';
  }
}

class WasmMemoryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WasmMemoryError';
  }
}

function buildLinkTextureData(linksBuffer, linksLength, nodeAmount, textureSize) {
  const totalElements = textureSize * textureSize;
  const linksData = new Float32Array(totalElements * 4);
  const linkRangesData = new Float32Array(totalElements * 4);
  const linksByNode = Array.from({ length: nodeAmount }, () => []);
  const packedLinks = [];

  for (let i = 0; i < linksLength; i++) {
    const sourceIndex = linksBuffer[i * 2];
    const targetIndex = linksBuffer[i * 2 + 1];
    const isValid =
      Number.isInteger(sourceIndex) &&
      Number.isInteger(targetIndex) &&
      sourceIndex >= 0 &&
      targetIndex >= 0 &&
      sourceIndex < nodeAmount &&
      targetIndex < nodeAmount;

    if (!isValid) {
      continue;
    }

    const entry = { sourceIndex, targetIndex };
    linksByNode[sourceIndex].push(entry);
    if (targetIndex !== sourceIndex) {
      linksByNode[targetIndex].push(entry);
    }
  }

  for (let i = 0; i < nodeAmount; i++) {
    const incident = linksByNode[i];
    const rangeOffset = i * 4;
    linkRangesData[rangeOffset + 0] = packedLinks.length;
    linkRangesData[rangeOffset + 1] = incident.length;

    for (let j = 0; j < incident.length; j++) {
      packedLinks.push(incident[j]);
    }
  }

  if (packedLinks.length > totalElements) {
    throw new Error(
      \`Packed links (\${packedLinks.length}) exceed texture capacity (\${totalElements}).\`
    );
  }

  for (let i = 0; i < packedLinks.length; i++) {
    const { sourceIndex, targetIndex } = packedLinks[i];
    const linkOffset = i * 4;

    linksData[linkOffset + 0] = (sourceIndex % textureSize) / textureSize;
    linksData[linkOffset + 1] = Math.floor(sourceIndex / textureSize) / textureSize;
    linksData[linkOffset + 2] = (targetIndex % textureSize) / textureSize;
    linksData[linkOffset + 3] = Math.floor(targetIndex / textureSize) / textureSize;
  }

  return {
    linksData,
    linkRangesData,
    packedLinkAmount: packedLinks.length,
  };
}

function getPackedLinkRequirement(linksBuffer, linksLength, nodeAmount) {
  let packed = 0;
  for (let i = 0; i < linksLength; i++) {
    const sourceIndex = linksBuffer[i * 2];
    const targetIndex = linksBuffer[i * 2 + 1];
    const isValid =
      Number.isInteger(sourceIndex) &&
      Number.isInteger(targetIndex) &&
      sourceIndex >= 0 &&
      targetIndex >= 0 &&
      sourceIndex < nodeAmount &&
      targetIndex < nodeAmount;

    if (!isValid) {
      continue;
    }

    packed += sourceIndex === targetIndex ? 1 : 2;
  }
  return packed;
}

function validateInput(data) {
  const { nodesBuffer, nodesLength, linksBuffer, linksLength, textureSize, frustumSize } = data;

  if (!(nodesBuffer instanceof Float32Array)) {
    throw new InputValidationError('Invalid input: nodesBuffer must be a Float32Array');
  }
  if (!(linksBuffer instanceof Int32Array)) {
    throw new InputValidationError('Invalid input: linksBuffer must be an Int32Array');
  }
  if (!Number.isInteger(nodesLength) || nodesLength < 0) {
    throw new InputValidationError('Invalid input: nodesLength must be a non-negative integer');
  }
  if (!Number.isInteger(linksLength) || linksLength < 0) {
    throw new InputValidationError('Invalid input: linksLength must be a non-negative integer');
  }
  if (!Number.isInteger(textureSize) || textureSize <= 0) {
    throw new InputValidationError('Invalid input: textureSize must be a positive integer');
  }
  if (textureSize > MAX_TEXTURE_SIZE) {
    throw new InputValidationError(
      'Invalid input: textureSize ' + textureSize + ' exceeds max ' + MAX_TEXTURE_SIZE
    );
  }
  if ((textureSize & (textureSize - 1)) !== 0) {
    throw new InputValidationError('Invalid input: textureSize must be a power of 2');
  }
  if (!Number.isFinite(frustumSize) || frustumSize <= 0) {
    throw new InputValidationError('Invalid input: frustumSize must be a finite positive number');
  }

  const totalElements = textureSize * textureSize;
  const nodesDataSize = nodesLength * 4 * 4;
  const linksDataSize = linksLength * 2 * 4;
  const positionsSize = totalElements * 4 * 4;
  const linksTextureSize = totalElements * 4 * 4;
  const linkRangesTextureSize = totalElements * 4 * 4;
  const requiredPackedLinks = getPackedLinkRequirement(linksBuffer, linksLength, nodesLength);
  const totalBytes =
    nodesDataSize + linksDataSize + positionsSize + linksTextureSize + linkRangesTextureSize;

  if (requiredPackedLinks > totalElements) {
    throw new InputValidationError(
      'Packed links (' + requiredPackedLinks + ') exceed texture capacity (' + totalElements + ')'
    );
  }
  if (totalBytes > MAX_BUFFER_BYTES) {
    throw new WasmMemoryError(
      'Input requires ' + totalBytes + ' bytes, exceeding ' + MAX_BUFFER_BYTES + ' byte worker limit'
    );
  }

  return {
    totalElements,
    nodesDataSize,
    linksDataSize,
    positionsSize,
    linksTextureSize,
    linkRangesTextureSize,
  };
}

function formatProcessingError(error) {
  if (error instanceof InputValidationError) {
    return { type: 'validation', message: error.message };
  }
  if (error instanceof WasmMemoryError) {
    return { type: 'memory', message: error.message };
  }

  const message = error && error.message ? error.message : String(error);
  if (/out of memory|memory access|WebAssembly\\.Memory|allocation/i.test(message)) {
    return { type: 'memory', message: 'WASM memory failure: ' + message };
  }
  return { type: 'processing', message };
}

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
    nodesBuffer,
    nodesLength,
    linksBuffer,
    linksLength,
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
    const {
      totalElements,
      nodesDataSize,
      linksDataSize,
      positionsSize,
      linksTextureSize,
      linkRangesTextureSize,
    } = validateInput(data);

    const { allocateMemory, freeMemory, processTextures, memory } = wasmModule.exports;
    if (!allocateMemory || !freeMemory || !processTextures || !memory) {
      throw new Error('WASM exports are missing required texture processing functions');
    }

    let packedLinkAmount = 0;
    let nodesDataPtr = 0;
    let linksDataPtr = 0;
    let positionsPtr = 0;
    let linksTexturePtr = 0;
    let linkRangesTexturePtr = 0;
    let positionsResult = null;
    let linksResult = null;
    let linkRangesResult = null;

    try {
      nodesDataPtr = allocateMemory(nodesDataSize);
      linksDataPtr = allocateMemory(linksDataSize);
      positionsPtr = allocateMemory(positionsSize);
      linksTexturePtr = allocateMemory(linksTextureSize);
      linkRangesTexturePtr = allocateMemory(linkRangesTextureSize);

      // Copy pre-serialized typed arrays directly into WASM memory
      const wasmMemory = new Uint8Array(memory.buffer);
      wasmMemory.set(new Uint8Array(nodesBuffer.buffer), nodesDataPtr);
      wasmMemory.set(new Uint8Array(linksBuffer.buffer), linksDataPtr);

      // Process textures in WASM
      packedLinkAmount = processTextures(
        nodesDataPtr,
        nodesLength,
        linksDataPtr,
        linksLength,
        textureSize,
        positionsPtr,
        linksTexturePtr,
        linkRangesTexturePtr,
        frustumSize
      );

      if (packedLinkAmount < 0) {
        throw new Error('Packed links exceed texture capacity');
      }

      // Extract results
      const positionsData = new Float32Array(memory.buffer, positionsPtr, totalElements * 4);
      const linksTextureData = new Float32Array(memory.buffer, linksTexturePtr, totalElements * 4);
      const linkRangesTextureData = new Float32Array(memory.buffer, linkRangesTexturePtr, totalElements * 4);
      
      // Copy results to transferable buffers
      positionsResult = new Float32Array(positionsData);
      linksResult = new Float32Array(linksTextureData);
      linkRangesResult = new Float32Array(linkRangesTextureData);
    } finally {
      if (linkRangesTexturePtr) freeMemory(linkRangesTexturePtr);
      if (linksTexturePtr) freeMemory(linksTexturePtr);
      if (positionsPtr) freeMemory(positionsPtr);
      if (linksDataPtr) freeMemory(linksDataPtr);
      if (nodesDataPtr) freeMemory(nodesDataPtr);
    }
    
    const processingTime = performance.now() - startTime;
    
    // Send results back to main thread
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: true,
      data: {
        positions: positionsResult,
        links: linksResult,
        linkRanges: linkRangesResult,
        packedLinkAmount,
        processingTime,
        memoryUsage: memory.buffer.byteLength
      }
    }, [positionsResult.buffer, linksResult.buffer, linkRangesResult.buffer]);
    
  } catch (error) {
    const { type, message } = formatProcessingError(error);
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: false,
      error: message,
      errorType: type
    });
  }
}

/**
 * Fallback processing without WASM
 */
function processFallback(data) {
  const {
    nodesBuffer,
    nodesLength,
    linksBuffer,
    linksLength,
    textureSize,
    frustumSize,
    requestId
  } = data;

  const startTime = performance.now();

  try {
    const { totalElements } = validateInput(data);
    const positionsData = new Float32Array(totalElements * 4);

    // Process positions from pre-serialized typed array
    for (let i = 0; i < totalElements; i++) {
      const baseIndex = i * 4;

      if (i < nodesLength) {
        const nb = i * 4;
        // NaN encodes "no initial position" — use random placement
        const x = !isNaN(nodesBuffer[nb + 0]) ? nodesBuffer[nb + 0] : (Math.random() * 2 - 1);
        const y = !isNaN(nodesBuffer[nb + 1]) ? nodesBuffer[nb + 1] : (Math.random() * 2 - 1);
        const z = !isNaN(nodesBuffer[nb + 2]) ? nodesBuffer[nb + 2] : (Math.random() * 2 - 1);

        positionsData[baseIndex + 0] = x;
        positionsData[baseIndex + 1] = y;
        positionsData[baseIndex + 2] = z;
        positionsData[baseIndex + 3] = nodesBuffer[nb + 3];
      } else {
        const farAway = frustumSize * 10;
        positionsData[baseIndex + 0] = farAway;
        positionsData[baseIndex + 1] = farAway;
        positionsData[baseIndex + 2] = farAway;
        positionsData[baseIndex + 3] = 0;
      }
    }

    const linkTextureData = buildLinkTextureData(linksBuffer, linksLength, nodesLength, textureSize);
    
    const processingTime = performance.now() - startTime;
    
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: true,
      data: {
        positions: positionsData,
        links: linkTextureData.linksData,
        linkRanges: linkTextureData.linkRangesData,
        packedLinkAmount: linkTextureData.packedLinkAmount,
        processingTime,
        memoryUsage: 0
      }
    }, [positionsData.buffer, linkTextureData.linksData.buffer, linkTextureData.linkRangesData.buffer]);
    
  } catch (error) {
    const { type, message } = formatProcessingError(error);
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: false,
      error: message,
      errorType: type
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
