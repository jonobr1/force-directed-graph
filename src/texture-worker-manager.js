/**
 * Worker manager for texture processing
 * Handles worker lifecycle, message passing, and fallback logic
 */

import { createInlineWorker } from './inline-worker-factory.js';

class TextureWorkerManager {
  constructor() {
    this.worker = null;
    this.isWorkerReady = false;
    this.isWasmReady = false;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.workerSupported = typeof Worker !== 'undefined';
  }

  /**
   * Resolve WASM URL for different environments
   * @returns {string} URL to WASM file
   */
  resolveWasmUrl() {
    // Try different URL resolution strategies
    try {
      // Strategy 1: Use import.meta.url for ES modules
      if (typeof import.meta !== 'undefined' && import.meta.url) {
        return new URL('../build/texture-processor.wasm', import.meta.url).href;
      }
    } catch (e) {
      // Fall through to next strategy
    }
    
    // Strategy 2: Try relative to current page for development
    const devPaths = [
      './build/texture-processor.wasm',
      '../build/texture-processor.wasm',
      './texture-processor.wasm'
    ];
    
    // Return the first path that might work
    // In production, this should be configured by the build system
    return devPaths[0];
  }

  /**
   * Initialize the worker
   * @returns {Promise<boolean>} True if worker initialized successfully
   */
  async init() {
    if (!this.workerSupported) {
      return false;
    }

    try {
      // Resolve WASM URL relative to this module
      const wasmUrl = this.resolveWasmUrl();
      
      // Create inline worker with proper WASM URL
      this.worker = createInlineWorker(wasmUrl);
      
      // Set up message handler
      this.worker.onmessage = (event) => {
        this.handleWorkerMessage(event.data);
      };
      
      this.worker.onerror = (error) => {
        console.warn('Texture worker error:', error);
        this.isWorkerReady = false;
      };
      
      // Wait for worker to be ready
      await new Promise((resolve) => {
        const checkReady = () => {
          if (this.isWorkerReady) {
            resolve();
          } else {
            setTimeout(checkReady, 50);
          }
        };
        
        this.worker.postMessage({ type: 'init' });
        checkReady();
      });
      
      return true;
    } catch (error) {
      console.warn('Failed to initialize texture worker:', error);
      return false;
    }
  }

  /**
   * Handle messages from worker
   * @param {Object} message - Worker message
   */
  handleWorkerMessage(message) {
    const { type, requestId, success, data, error } = message;
    
    switch (type) {
      case 'wasm-ready':
        this.isWasmReady = success;
        this.isWorkerReady = true;
        break;
        
      case 'texture-processed':
        const request = this.pendingRequests.get(requestId);
        if (request) {
          this.pendingRequests.delete(requestId);
          
          if (success) {
            request.resolve(data);
          } else {
            request.reject(new Error(error));
          }
        }
        break;
        
      case 'error':
        console.error('Worker error:', error);
        break;
    }
  }

  /**
   * Process texture data using worker
   * @param {Object} data - Processing data
   * @param {Array} data.nodes - Node data
   * @param {Array} data.links - Link data
   * @param {number} data.textureSize - Texture size
   * @param {number} data.frustumSize - Frustum size
   * @param {boolean} data.useWasm - Whether to use WASM
   * @returns {Promise<Object>} Processed texture data
   */
  async processTextures(data) {
    if (!this.isWorkerReady) {
      throw new Error('Worker not ready');
    }
    
    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      // Store request for response handling
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Send processing request
      this.worker.postMessage({
        type: 'process-textures',
        data: {
          ...data,
          requestId,
          useWasm: this.isWasmReady && data.useWasm !== false
        }
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Texture processing timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Check if worker and WASM are ready
   * @returns {boolean} True if ready
   */
  isReady() {
    return this.isWorkerReady;
  }

  /**
   * Check if WASM is available
   * @returns {boolean} True if WASM is ready
   */
  isWasmAvailable() {
    return this.isWasmReady;
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance info
   */
  getPerformanceInfo() {
    return {
      workerSupported: this.workerSupported,
      workerReady: this.isWorkerReady,
      wasmReady: this.isWasmReady,
      pendingRequests: this.pendingRequests.size
    };
  }

  /**
   * Cleanup worker resources
   */
  dispose() {
    if (this.worker) {
      // Reject all pending requests
      this.pendingRequests.forEach((request) => {
        request.reject(new Error('Worker disposed'));
      });
      this.pendingRequests.clear();
      
      // Terminate worker (this will also clean up the blob URL)
      this.worker.terminate();
      this.worker = null;
      this.isWorkerReady = false;
      this.isWasmReady = false;
    }
  }
}

export { TextureWorkerManager };