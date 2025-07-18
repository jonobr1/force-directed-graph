import {
  getPosition,
  getVelocity,
  getIndex,
  random,
  jiggle,
  link,
  charge,
  center,
} from './partials.js';

export const types = ['simplex', 'nested', 'optimized'];

/**
 * Calculate the next frame's velocity for all nodes.
 */
export const simplex = `
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
  uniform sampler2D textureLinks;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${random}
  ${jiggle}
  ${link}
  ${charge}
  ${center}

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    vec3 a = vec3( 0.0 ),
        b = vec3( 0.0 ),
        c = vec3( 0.0 );

    for ( float i = 0.0; i < max( nodeAmount, edgeAmount ); i += 1.0 ) {

      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;

      vec2 uv2 = vec2( uvx, uvy );

      int id2 = getIndex( uv2 );
      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );

      if ( i < edgeAmount ) {
        b += link( i, id1, p1, v1, uv2 );
      }

      if ( i < nodeAmount) {
        c += charge( i, id1, p1, v1, id2, p2, v2 );
      }

    }

    b *= 1.0 - step( edgeAmount, float( id1 ) );
    c *= 1.0 - step( nodeAmount, float( id1 ) );

    // 4.
    vec3 d = center( p1 );
    vec3 acceleration = a + b + c + d;

    // Calculate Velocity
    vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;
    velocity = clamp( velocity, - maxSpeed, maxSpeed );
    velocity.z *= 1.0 - is2D;

    gl_FragColor = vec4( velocity, 0.0 );

  }
`;

export const nested = `
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
  uniform sampler2D textureLinks;
  uniform sampler2D textureLinksLookUp;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${random}
  ${jiggle}
  ${link}
  ${charge}
  ${center}

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    vec3 a = vec3( 0.0 ),
        b = vec3( 0.0 ),
        c = vec3( 0.0 );

    // Get link lookup data for this node
    vec4 linkLookup = texture2D( textureLinksLookUp, uv );
    float startLinkIndex = linkLookup.r;
    float endLinkIndex = linkLookup.g;
    float linkCount = linkLookup.b;

    // Iterate through all links connected to this node
    for ( float i = startLinkIndex; i < endLinkIndex; i += 1.0 ) {
      // Calculate UV coordinates for this link index in the links texture
      float linkUvx = mod( i, size ) / size;
      float linkUvy = floor( i / size ) / size;
      vec2 linkUv = vec2( linkUvx, linkUvy );

      b += link( i, id1, p1, v1, linkUv );
    }

    for ( float i = 0.0; i < nodeAmount; i += 1.0 ) {

      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;

      vec2 uv2 = vec2( uvx, uvy );

      int id2 = getIndex( uv2 );
      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );

      if ( i < nodeAmount) {
        c += charge( i, id1, p1, v1, id2, p2, v2 );
      }

    }

    b *= 1.0 - step( edgeAmount, float( id1 ) );
    c *= 1.0 - step( nodeAmount, float( id1 ) );

  // 4.
  vec3 d = center( p1 );
  vec3 acceleration = a + b + c + d;

  // Calculate Velocity
  vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;
  velocity = clamp( velocity, - maxSpeed, maxSpeed );
  velocity.z *= 1.0 - is2D;

  gl_FragColor = vec4( velocity, 0.0 );

}
`;

/**
 * Optimized velocity calculation using nearest neighbors
 * Replaces O(n²) loop with O(k) where k is the number of nearest neighbors
 */
export const optimized = `
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
  uniform float enableNearestNeighbors;
  uniform sampler2D textureLinks;
  uniform sampler2D textureLinksLookUp;
  uniform sampler2D textureNearestNeighbors;
  uniform sampler2D texturePositions;
  uniform sampler2D textureVelocities;

  vec3 getPosition( vec2 uv ) {
    return texture2D( texturePositions, uv ).xyz;
  }

  vec3 getVelocity( vec2 uv ) {
    return texture2D( textureVelocities, uv ).xyz;
  }

  int getIndex( vec2 uv ) {
    int s = int( size );
    int col = int( uv.x * size );
    int row = int( uv.y * size );
    return col + row * s;
  }

  ${random}
  ${jiggle}
  ${link}
  ${charge}
  ${center}

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    vec3 a = vec3( 0.0 ),
        b = vec3( 0.0 ),
        c = vec3( 0.0 );

    /*
    for ( float i = 0.0; i < linkAmount; i += 1.0 ) {
      // TODO: get all edges and link them
      b += link( i, id1, p1, v1, uv2 );
    }
    */

    // Use nearest neighbors optimization if enabled
    if (enableNearestNeighbors > 0.5) {
      // Get the nearest neighbors from the precomputed texture
      vec4 neighbors = texture2D(textureNearestNeighbors, uv);
      
      // Process each neighbor (stored as indices in RGBA channels)
      for (int i = 0; i < 4; i++) {
        float neighborIndex = -1.0;
        if (i == 0) neighborIndex = neighbors.r;
        else if (i == 1) neighborIndex = neighbors.g;
        else if (i == 2) neighborIndex = neighbors.b;
        else if (i == 3) neighborIndex = neighbors.a;
        
        // Skip if no valid neighbor
        if (neighborIndex < 0.0) continue;
        
        // Calculate UV coordinates for this neighbor
        float uvx = mod(neighborIndex, size) / size;
        float uvy = floor(neighborIndex / size) / size;
        vec2 uv2 = vec2(uvx, uvy);
        
        int id2 = getIndex(uv2);
        vec3 v2 = getVelocity(uv2);
        vec3 p2 = getPosition(uv2);
        
        // Calculate charge between this node and its neighbor
        // Fix type conversion: use int casting for the loop index
        c += charge(float(i), id1, p1, v1, id2, p2, v2);
      }
    } else {
      // Fallback to original O(n²) algorithm
      for ( float i = 0.0; i < nodeAmount; i += 1.0 ) {

        float uvx = mod( i, size ) / size;
        float uvy = floor( i / size ) / size;

        vec2 uv2 = vec2( uvx, uvy );

        int id2 = getIndex( uv2 );
        vec3 v2 = getVelocity( uv2 );
        vec3 p2 = getPosition( uv2 );

        if ( i < nodeAmount) {
          c += charge( i, id1, p1, v1, id2, p2, v2 );
        }

      }
    }

    b *= 1.0 - step( edgeAmount, float( id1 ) );
    c *= 1.0 - step( nodeAmount, float( id1 ) );

    // 4.
    vec3 d = center( p1 );
    vec3 acceleration = a + b + c + d;

    // Calculate Velocity
    vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;
    velocity = clamp( velocity, - maxSpeed, maxSpeed );
    velocity.z *= 1.0 - is2D;

    gl_FragColor = vec4( velocity, 0.0 );

  }
`;
