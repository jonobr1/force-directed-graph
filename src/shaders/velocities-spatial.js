import {
  getPosition,
  getVelocity,
  getIndex,
  random,
  jiggle,
  link,
  center
} from "./partials.js";

/**
 * Spatially-optimized velocity shader that uses precomputed neighbor data
 * instead of checking all nodes against all nodes (O(n) vs O(n²))
 */
export const spatial = `
  uniform float alpha;
  uniform float is2D;
  uniform float size;
  uniform float time;
  uniform float nodeRadius;
  uniform float nodeAmount;
  uniform float edgeAmount;
  uniform float maxSpeed;
  uniform float timeStep;
  uniform float damping;
  uniform float repulsion;
  uniform float springLength;
  uniform float stiffness;
  uniform float gravity;
  uniform float maxNeighbors;
  uniform sampler2D textureLinks;
  uniform sampler2D textureNeighbors;
  uniform sampler2D textureNeighborsDistance;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${random}
  ${jiggle}
  ${link}
  ${center}

  // Enhanced charge calculation using precomputed neighbors
  vec3 spatialCharge( int id1, vec3 p1, vec3 v1, vec2 uv ) {
    vec3 result = vec3( 0.0 );
    
    // Get neighbor data for this node
    vec4 neighbors1 = texture2D( textureNeighbors, uv );
    vec4 distances1 = texture2D( textureNeighborsDistance, uv );
    
    // Process up to 4 neighbors per texel lookup
    for ( int comp = 0; comp < 4; comp++ ) {
      float neighborIndexF;
      float distance;
      
      if ( comp == 0 ) {
        neighborIndexF = neighbors1.x;
        distance = distances1.x;
      } else if ( comp == 1 ) {
        neighborIndexF = neighbors1.y;
        distance = distances1.y;
      } else if ( comp == 2 ) {
        neighborIndexF = neighbors1.z;
        distance = distances1.z;
      } else {
        neighborIndexF = neighbors1.w;
        distance = distances1.w;
      }
      
      // Skip invalid neighbors
      if ( neighborIndexF < 0.0 || distance <= 0.0 ) continue;
      
      int neighborIndex = int( neighborIndexF );
      
      // Calculate neighbor UV coordinates
      float uvx = mod( neighborIndexF, size ) / size;
      float uvy = floor( neighborIndexF / size ) / size;
      vec2 neighborUV = vec2( uvx, uvy );
      
      // Get neighbor position and velocity
      vec3 p2 = getPosition( neighborUV );
      vec3 v2 = getVelocity( neighborUV );
      
      // Calculate repulsion force
      vec3 diff = ( p2 + v2 ) - ( p1 + v1 );
      diff.z *= 1.0 - is2D;
      
      float dist = length( diff );
      
      // Avoid division by zero and use precomputed distance for validation
      if ( dist > 0.0001 ) {
        float mag = repulsion / dist;
        vec3 dir = normalize( diff );
        result += dir * mag;
      }
    }
    
    result.z *= 1.0 - is2D;
    return result;
  }

  // Multi-texel neighbor processing for higher neighbor counts
  vec3 spatialChargeExtended( int id1, vec3 p1, vec3 v1, vec2 uv ) {
    vec3 result = vec3( 0.0 );
    
    // Calculate how many texel lookups we need
    float neighborsPerTexel = 4.0;
    float maxLookups = ceil( maxNeighbors / neighborsPerTexel );
    
    for ( float lookupIndex = 0.0; lookupIndex < maxLookups; lookupIndex += 1.0 ) {
      // Calculate offset UV for additional neighbor data
      // Store extended neighbor data in adjacent texels
      float offsetX = mod( lookupIndex, size ) / size;
      float offsetY = floor( lookupIndex / size ) / size;
      vec2 offsetUV = uv + vec2( offsetX, offsetY );
      
      // Wrap UV coordinates
      offsetUV = mod( offsetUV, 1.0 );
      
      vec4 neighbors = texture2D( textureNeighbors, offsetUV );
      vec4 distances = texture2D( textureNeighborsDistance, offsetUV );
      
      // Process neighbors in this texel
      for ( int comp = 0; comp < 4; comp++ ) {
        float currentNeighborSlot = lookupIndex * neighborsPerTexel + float( comp );
        
        // Stop if we've processed maxNeighbors
        if ( currentNeighborSlot >= maxNeighbors ) break;
        
        float neighborIndexF;
        float distance;
        
        if ( comp == 0 ) {
          neighborIndexF = neighbors.x;
          distance = distances.x;
        } else if ( comp == 1 ) {
          neighborIndexF = neighbors.y;
          distance = distances.y;
        } else if ( comp == 2 ) {
          neighborIndexF = neighbors.z;
          distance = distances.z;
        } else {
          neighborIndexF = neighbors.w;
          distance = distances.w;
        }
        
        // Skip invalid neighbors
        if ( neighborIndexF < 0.0 || distance <= 0.0 ) continue;
        
        // Calculate neighbor UV coordinates
        float uvx = mod( neighborIndexF, size ) / size;
        float uvy = floor( neighborIndexF / size ) / size;
        vec2 neighborUV = vec2( uvx, uvy );
        
        // Get neighbor position and velocity
        vec3 p2 = getPosition( neighborUV );
        vec3 v2 = getVelocity( neighborUV );
        
        // Calculate repulsion force using precomputed distance for optimization
        vec3 diff = ( p2 + v2 ) - ( p1 + v1 );
        diff.z *= 1.0 - is2D;
        
        float dist = max( distance, 0.0001 ); // Use precomputed distance
        float mag = repulsion / dist;
        vec3 dir = normalize( diff );
        
        result += dir * mag;
      }
    }
    
    result.z *= 1.0 - is2D;
    return result;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    vec3 a = vec3( 0.0 );
    vec3 b = vec3( 0.0 );
    vec3 c = vec3( 0.0 );

    // 1. Link forces (unchanged - still need to check all links)
    for ( float i = 0.0; i < edgeAmount; i += 1.0 ) {
      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;
      vec2 uv2 = vec2( uvx, uvy );
      
      b += link( i, id1, p1, v1, uv2 );
    }

    // 2. Node repulsion forces using spatial optimization
    if ( maxNeighbors <= 4.0 ) {
      // Simple case: up to 4 neighbors fit in one texel
      c = spatialCharge( id1, p1, v1, uv );
    } else {
      // Extended case: need multiple texel lookups
      c = spatialChargeExtended( id1, p1, v1, uv );
    }

    // Apply forces only to valid nodes
    b *= 1.0 - step( edgeAmount, float( id1 ) );
    c *= 1.0 - step( nodeAmount, float( id1 ) );

    // 3. Center/gravity force
    vec3 d = center( p1 );
    
    // Combine all forces
    vec3 acceleration = a + b + c + d;

    // Calculate velocity with damping and speed limiting
    vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;
    velocity = clamp( velocity, - maxSpeed, maxSpeed );
    velocity.z *= 1.0 - is2D;

    gl_FragColor = vec4( velocity, 0.0 );
  }
`;

/**
 * Fallback velocity shader with reduced neighbor count for performance
 * Uses a simplified spatial approach when full spatial grid fails
 */
export const spatialSimplified = `
  uniform float alpha;
  uniform float is2D;
  uniform float size;
  uniform float time;
  uniform float nodeRadius;
  uniform float nodeAmount;
  uniform float edgeAmount;
  uniform float maxSpeed;
  uniform float timeStep;
  uniform float damping;
  uniform float repulsion;
  uniform float springLength;
  uniform float stiffness;
  uniform float gravity;
  uniform float maxNeighbors;
  uniform sampler2D textureLinks;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${random}
  ${jiggle}
  ${link}
  ${center}

  // Distance-based sampling for reduced complexity
  vec3 sampledCharge( int id1, vec3 p1, vec3 v1 ) {
    vec3 result = vec3( 0.0 );
    
    // Sample every Nth node instead of all nodes
    float sampleRate = max( 1.0, floor( nodeAmount / maxNeighbors ) );
    
    for ( float i = 0.0; i < nodeAmount; i += sampleRate ) {
      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;
      vec2 uv2 = vec2( uvx, uvy );
      
      int id2 = getIndex( uv2 );
      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );
      
      if ( id1 != id2 ) {
        vec3 diff = ( p2 + v2 ) - ( p1 + v1 );
        diff.z *= 1.0 - is2D;
        
        float dist = length( diff );
        if ( dist > 0.0001 ) {
          float mag = repulsion / dist;
          vec3 dir = normalize( diff );
          result += dir * mag * sampleRate; // Scale by sample rate
        }
      }
    }
    
    result.z *= 1.0 - is2D;
    return result;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    vec3 a = vec3( 0.0 );
    vec3 b = vec3( 0.0 );
    vec3 c = vec3( 0.0 );

    // Link forces (unchanged)
    for ( float i = 0.0; i < edgeAmount; i += 1.0 ) {
      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;
      vec2 uv2 = vec2( uvx, uvy );
      
      b += link( i, id1, p1, v1, uv2 );
    }

    // Sampled repulsion forces
    c = sampledCharge( id1, p1, v1 );

    // Apply forces only to valid nodes
    b *= 1.0 - step( edgeAmount, float( id1 ) );
    c *= 1.0 - step( nodeAmount, float( id1 ) );

    // Center/gravity force
    vec3 d = center( p1 );
    
    // Combine all forces
    vec3 acceleration = a + b + c + d;

    // Calculate velocity
    vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;
    velocity = clamp( velocity, - maxSpeed, maxSpeed );
    velocity.z *= 1.0 - is2D;

    gl_FragColor = vec4( velocity, 0.0 );
  }
`;