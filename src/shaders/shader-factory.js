import { positions } from './positions.js';
import { simplex, nested, optimized } from './velocities.js';
// import { nearestNeighborsSimple } from './nearest-neighbors-simple.js';
import { nearestNeighbors } from './nearest-neighbors.js';

/**
 * Shader factory that returns appropriate shader configuration based on type
 * @param {string} shaderType - The shader type: 'simplex', 'nested', or 'optimized'
 * @returns {Object} Shader configuration object
 */
export function createShaderConfig(shaderType) {
  const baseConfig = {
    positions,
    types: ['simplex', 'nested', 'optimized'],
  };

  switch (shaderType) {
    case 'simplex':
      return {
        ...baseConfig,
        velocities: simplex,
        requiresNearestNeighbors: false,
        complexity: 'O(n²)',
        description: 'Basic force calculation for all nodes',
      };

    case 'nested':
      return {
        ...baseConfig,
        velocities: nested,
        requiresNearestNeighbors: false,
        complexity: 'O(n²)',
        description: 'Unidirectional links calculated for better performances',
      };

    case 'optimized': // TODO: WIP
      return {
        ...baseConfig,
        velocities: optimized,
        nearestNeighbors, // Could be nearestNeigbors or nearestNeighborsSimple
        requiresNearestNeighbors: true,
        complexity: 'O(n×k)',
        description:
          'Unidirectional links and nearest neighbor repulsion comparison',
      };

    default:
      throw new Error(`Unknown shader type: ${shaderType}`);
  }
}

/**
 * Get list of available shader types
 * @returns {string[]} Array of shader type names
 */
export function getAvailableShaderTypes() {
  return ['simplex', 'nested', 'optimized'];
}

/**
 * Get shader type information
 * @param {string} shaderType - The shader type to get info for
 * @returns {Object} Shader type information
 */
export function getShaderTypeInfo(shaderType) {
  const config = createShaderConfig(shaderType);
  return {
    type: shaderType,
    complexity: config.complexity,
    description: config.description,
    requiresNearestNeighbors: config.requiresNearestNeighbors,
    recommendedFor: getRecommendation(shaderType),
  };
}

/**
 * Get recommendation for shader type based on use case
 * @param {string} shaderType - The shader type
 * @returns {string} Recommendation text
 */
function getRecommendation(shaderType) {
  switch (shaderType) {
    case 'simplex':
      return 'Small graphs (< 100 nodes), fastest setup, minimal GPU usage';
    case 'nested':
      return 'Medium graphs (100-1000 nodes), balanced performance and features';
    case 'optimized':
      return 'Large graphs (> 1000 nodes), maximum performance for dense datasets';
    default:
      return 'Unknown shader type';
  }
}
