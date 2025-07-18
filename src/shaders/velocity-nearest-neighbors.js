import {
  random,
  jiggle,
  link,
  charge,
  center,
} from './partials.js';

/**
 * Nearest neighbors velocity calculation shader
 * Clean implementation without runtime conditionals
 * Uses pre-computed nearest neighbors texture for O(n×k) complexity
 */
export const nearestNeighborsVelocity = `
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
      c += charge(float(i), id1, p1, v1, id2, p2, v2);
    }

    b *= 1.0 - step( edgeAmount, float( id1 ) );
    c *= 1.0 - step( nodeAmount, float( id1 ) );

    // Apply center force
    vec3 d = center( p1 );
    vec3 acceleration = a + b + c + d;

    // Calculate Velocity
    vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;
    velocity = clamp( velocity, - maxSpeed, maxSpeed );
    velocity.z *= 1.0 - is2D;

    gl_FragColor = vec4( velocity, 0.0 );

  }
`;