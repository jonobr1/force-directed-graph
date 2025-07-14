/**
 * Performance Monitor for Force Directed Graph
 * Tracks frame rate, memory usage, and automatically tunes parameters
 * to maintain target performance levels
 */
export class PerformanceMonitor {
  constructor(targetFPS = 30, sampleSize = 60) {
    this.targetFPS = targetFPS;
    this.sampleSize = sampleSize;
    
    // Frame timing tracking
    this.frameTimes = [];
    this.lastFrameTime = 0;
    this.currentFPS = 0;
    this.averageFPS = 0;
    this.frameCount = 0;
    
    // Performance metrics
    this.metrics = {
      averageFrameTime: 0,
      minFPS: Infinity,
      maxFPS: 0,
      spatialGridUpdateTime: 0,
      gpuComputeTime: 0,
      memoryUsage: 0,
      nodeCount: 0,
      edgeCount: 0
    };
    
    // Auto-tuning state
    this.autoTuneEnabled = true;
    this.tuneInterval = 120; // Tune every N frames
    this.lastTuneFrame = 0;
    this.tuningHistory = [];
    
    // Performance thresholds
    this.thresholds = {
      critical: this.targetFPS * 0.5,  // 50% of target
      warning: this.targetFPS * 0.75,  // 75% of target
      optimal: this.targetFPS * 1.1    // 110% of target
    };
    
    // Tuning parameters
    this.tuningParams = {
      maxNeighbors: { min: 8, max: 128, current: 32, step: 4 },
      updateInterval: { min: 1, max: 30, current: 10, step: 2 },
      movementThreshold: { min: 0.01, max: 1.0, current: 0.1, step: 0.02 }
    };
    
    // System capabilities detection
    this.systemInfo = {
      webglVersion: this.detectWebGLVersion(),
      maxTextureSize: 0,
      gpuVendor: 'unknown',
      cores: navigator.hardwareConcurrency || 4,
      memory: this.estimateSystemMemory()
    };
    
    this.detectSystemCapabilities();
  }

  /**
   * Update performance metrics with current frame timing
   * @param {number} currentTime - Current timestamp
   * @param {Object} additionalMetrics - Additional performance data
   */
  update(currentTime, additionalMetrics = {}) {
    // Calculate frame time
    if (this.lastFrameTime > 0) {
      const frameTime = currentTime - this.lastFrameTime;
      this.frameTimes.push(frameTime);
      
      // Limit sample size
      if (this.frameTimes.length > this.sampleSize) {
        this.frameTimes.shift();
      }
      
      // Calculate current and average FPS
      this.currentFPS = frameTime > 0 ? 1000 / frameTime : 0;
      this.averageFPS = this.frameTimes.length > 0 ? 
        1000 / (this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length) : 0;
      
      // Update metrics
      this.updateMetrics(additionalMetrics);
    }
    
    this.lastFrameTime = currentTime;
    this.frameCount++;
    
    // Auto-tune if enabled and interval reached
    if (this.autoTuneEnabled && 
        this.frameCount % this.tuneInterval === 0 && 
        this.frameTimes.length >= this.sampleSize) {
      this.autoTune();
    }
  }

  /**
   * Update performance metrics
   * @param {Object} additionalMetrics - Additional metrics to track
   */
  updateMetrics(additionalMetrics) {
    if (this.frameTimes.length === 0) return;
    
    this.metrics.averageFrameTime = this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
    this.metrics.minFPS = Math.min(this.metrics.minFPS, this.currentFPS);
    this.metrics.maxFPS = Math.max(this.metrics.maxFPS, this.currentFPS);
    
    // Update additional metrics
    Object.assign(this.metrics, additionalMetrics);
    
    // Estimate memory usage if not provided
    if (!this.metrics.memoryUsage && performance.memory) {
      this.metrics.memoryUsage = performance.memory.usedJSHeapSize;
    }
  }

  /**
   * Automatically tune parameters based on performance
   */
  autoTune() {
    const performance = this.getPerformanceLevel();
    const adjustment = this.calculateAdjustment(performance);
    
    if (adjustment === 0) return; // No tuning needed
    
    const tuningAction = {
      frame: this.frameCount,
      fps: this.averageFPS,
      performance,
      adjustment,
      changes: {}
    };
    
    // Apply tuning based on performance level
    if (performance === 'critical' || performance === 'warning') {
      // Reduce computational load
      this.adjustParameter('maxNeighbors', -adjustment, tuningAction);
      this.adjustParameter('updateInterval', adjustment, tuningAction);
      
      if (performance === 'critical') {
        this.adjustParameter('movementThreshold', adjustment * 0.02, tuningAction);
      }
      
    } else if (performance === 'optimal' && this.canImproveQuality()) {
      // Increase quality when performance allows
      this.adjustParameter('maxNeighbors', adjustment, tuningAction);
      this.adjustParameter('updateInterval', -Math.floor(adjustment / 2), tuningAction);
    }
    
    // Record tuning action
    if (Object.keys(tuningAction.changes).length > 0) {
      this.tuningHistory.push(tuningAction);
      this.lastTuneFrame = this.frameCount;
      
      console.log(`Auto-tune: ${performance} performance (${this.averageFPS.toFixed(1)} FPS)`, tuningAction.changes);
    }
  }

  /**
   * Get current performance level
   * @returns {string} Performance level: 'critical', 'warning', 'good', 'optimal'
   */
  getPerformanceLevel() {
    if (this.averageFPS < this.thresholds.critical) return 'critical';
    if (this.averageFPS < this.thresholds.warning) return 'warning';
    if (this.averageFPS > this.thresholds.optimal) return 'optimal';
    return 'good';
  }

  /**
   * Calculate adjustment magnitude based on performance
   * @param {string} performance - Performance level
   * @returns {number} Adjustment magnitude
   */
  calculateAdjustment(performance) {
    const fpsRatio = this.averageFPS / this.targetFPS;
    
    switch (performance) {
      case 'critical':
        return Math.max(2, Math.floor((1 - fpsRatio) * 8));
      case 'warning':
        return Math.max(1, Math.floor((1 - fpsRatio) * 4));
      case 'optimal':
        return Math.min(2, Math.floor((fpsRatio - 1) * 2));
      default:
        return 0;
    }
  }

  /**
   * Adjust a specific parameter
   * @param {string} paramName - Parameter name
   * @param {number} adjustment - Adjustment amount
   * @param {Object} tuningAction - Tuning action to record changes
   */
  adjustParameter(paramName, adjustment, tuningAction) {
    const param = this.tuningParams[paramName];
    if (!param) return;
    
    const oldValue = param.current;
    const newValue = Math.max(param.min, Math.min(param.max, 
      param.current + adjustment * param.step));
    
    if (newValue !== oldValue) {
      param.current = newValue;
      tuningAction.changes[paramName] = { from: oldValue, to: newValue };
    }
  }

  /**
   * Check if quality can be improved without hurting performance
   * @returns {boolean} True if quality improvements are safe
   */
  canImproveQuality() {
    // Only improve if we've been stable at good performance
    const recentHistory = this.tuningHistory.slice(-3);
    return recentHistory.length === 0 || 
           recentHistory.every(action => action.performance === 'optimal' || action.performance === 'good');
  }

  /**
   * Get current tuning parameters
   * @returns {Object} Current parameter values
   */
  getTuningParameters() {
    const result = {};
    for (const [name, param] of Object.entries(this.tuningParams)) {
      result[name] = param.current;
    }
    return result;
  }

  /**
   * Set tuning parameter values
   * @param {Object} params - Parameter values to set
   */
  setTuningParameters(params) {
    for (const [name, value] of Object.entries(params)) {
      if (this.tuningParams[name]) {
        this.tuningParams[name].current = Math.max(
          this.tuningParams[name].min,
          Math.min(this.tuningParams[name].max, value)
        );
      }
    }
  }

  /**
   * Get comprehensive performance report
   * @returns {Object} Performance statistics and recommendations
   */
  getPerformanceReport() {
    const performanceLevel = this.getPerformanceLevel();
    const tuningParams = this.getTuningParameters();
    
    return {
      frameRate: {
        current: this.currentFPS,
        average: this.averageFPS,
        target: this.targetFPS,
        min: this.metrics.minFPS,
        max: this.metrics.maxFPS
      },
      performance: {
        level: performanceLevel,
        frameTime: this.metrics.averageFrameTime,
        spatialGridTime: this.metrics.spatialGridUpdateTime,
        gpuTime: this.metrics.gpuComputeTime
      },
      memory: {
        usage: this.metrics.memoryUsage,
        jsHeap: performance.memory ? performance.memory.usedJSHeapSize : 0
      },
      graph: {
        nodes: this.metrics.nodeCount,
        edges: this.metrics.edgeCount
      },
      tuning: {
        enabled: this.autoTuneEnabled,
        parameters: tuningParams,
        history: this.tuningHistory.slice(-5)
      },
      system: this.systemInfo,
      recommendations: this.generateRecommendations(performanceLevel)
    };
  }

  /**
   * Generate performance recommendations
   * @param {string} performanceLevel - Current performance level
   * @returns {Array} Array of recommendation strings
   */
  generateRecommendations(performanceLevel) {
    const recommendations = [];
    
    if (performanceLevel === 'critical') {
      recommendations.push('Consider reducing node count or maxNeighbors');
      recommendations.push('Increase spatial grid update interval');
      recommendations.push('Disable Level-of-Detail if enabled');
    } else if (performanceLevel === 'warning') {
      recommendations.push('Monitor memory usage for potential leaks');
      recommendations.push('Consider enabling temporal coherence');
    } else if (performanceLevel === 'optimal') {
      recommendations.push('Performance is excellent - consider increasing visual quality');
      recommendations.push('You could increase maxNeighbors for better physics');
    }
    
    if (this.metrics.memoryUsage > 1024 * 1024 * 1024) { // 1GB
      recommendations.push('High memory usage detected - consider optimizing textures');
    }
    
    if (this.systemInfo.webglVersion < 2) {
      recommendations.push('WebGL 2.0 would provide better performance');
    }
    
    return recommendations;
  }

  /**
   * Detect WebGL version
   * @returns {number} WebGL version (1 or 2)
   */
  detectWebGLVersion() {
    try {
      const canvas = document.createElement('canvas');
      if (canvas.getContext('webgl2')) return 2;
      if (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) return 1;
      return 0;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Estimate system memory (rough approximation)
   * @returns {number} Estimated memory in MB
   */
  estimateSystemMemory() {
    if (performance.memory) {
      return Math.round(performance.memory.jsHeapSizeLimit / (1024 * 1024));
    }
    
    // Rough estimation based on hardware concurrency
    const cores = navigator.hardwareConcurrency || 4;
    return cores * 1024; // Assume 1GB per core
  }

  /**
   * Detect system capabilities
   */
  detectSystemCapabilities() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      
      if (gl) {
        this.systemInfo.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          this.systemInfo.gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        }
      }
    } catch (e) {
      // Ignore errors in capability detection
    }
  }

  /**
   * Reset performance tracking
   */
  reset() {
    this.frameTimes = [];
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.tuningHistory = [];
    this.lastTuneFrame = 0;
    
    this.metrics = {
      averageFrameTime: 0,
      minFPS: Infinity,
      maxFPS: 0,
      spatialGridUpdateTime: 0,
      gpuComputeTime: 0,
      memoryUsage: 0,
      nodeCount: 0,
      edgeCount: 0
    };
  }

  /**
   * Enable or disable auto-tuning
   * @param {boolean} enabled - Whether to enable auto-tuning
   */
  setAutoTuning(enabled) {
    this.autoTuneEnabled = enabled;
  }

  /**
   * Set target FPS
   * @param {number} fps - Target frame rate
   */
  setTargetFPS(fps) {
    this.targetFPS = fps;
    this.thresholds = {
      critical: this.targetFPS * 0.5,
      warning: this.targetFPS * 0.75,
      optimal: this.targetFPS * 1.1
    };
  }

  /**
   * Set tuning interval
   * @param {number} interval - Frames between tuning attempts
   */
  setTuningInterval(interval) {
    this.tuneInterval = Math.max(30, interval);
  }

  /**
   * Check if performance is acceptable
   * @returns {boolean} True if performance meets minimum requirements
   */
  isPerformanceAcceptable() {
    return this.averageFPS >= this.thresholds.critical;
  }

  /**
   * Get frame time percentiles for detailed analysis
   * @returns {Object} Frame time statistics
   */
  getFrameTimeStatistics() {
    if (this.frameTimes.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const length = sorted.length;
    
    return {
      p50: sorted[Math.floor(length * 0.5)],
      p95: sorted[Math.floor(length * 0.95)],
      p99: sorted[Math.floor(length * 0.99)]
    };
  }
}