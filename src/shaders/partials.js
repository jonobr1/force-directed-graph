/**
 * Draws a circle with uv position pos and radius rad.
 * Relies on uniforms:
 * - float sizeAttenuation: 0, 1
 */
export const circle = `
float circle( vec2 uv, vec2 pos, float rad ) {

  float limit = 0.02;
  float limit2 = limit * 2.0;
  float d = length( pos - uv ) - ( rad - limit );
  float t = clamp( d, 0.0, 1.0 );

  float viewRange = smoothstep( 0.0, frustumSize * 0.001, abs( vDistance ) );
  float taper = limit2 * viewRange + limit;
  taper = mix( taper, limit2, sizeAttenuation );

  return smoothstep( 0.5 - taper, 0.5 + taper, 1.0 - t );

}
`;

/**
 * Get the position in local space of a node
 */
export const getPosition = `
  vec3 getPosition( vec2 uv ) {
    return texture2D( texturePositions, uv ).xyz;
  }
`;

/**
 * Get the velocity in local space of a node
 */
export const getVelocity = `
  vec3 getVelocity( vec2 uv ) {
    return texture2D( textureVelocities, uv ).xyz;
  }
`;

/**
 * Get a node's id from a specific UV coordinate
 * Relies on uniforms:
 * - float size: number
 */
export const getIndex = `
  int getIndex( vec2 uv ) {
    int s = int( size );
    int col = int( uv.x * size );
    int row = int( uv.y * size );
    return col + row * s;
  }
`;

/**
 * GLSL version of a random float generator
 */
export const random = `
  float random( vec2 seed ) {
    return fract( sin( dot( seed.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  }
`;

/**
 * Add slight variation of a given node's index
 * Used for unsticking two nodes that happen to be
 * at the exact same coordinates on any given frame,
 * though usually most common on initialization.
 * 
 * Relies on uniforms:
 * - float time: number
 */
export const jiggle = `
  float jiggle( float index ) {
    return ( random( vec2( index, time ) ) - 0.5 ) * 0.000001;
  }
`;

/**
 * Link two nodes together based on the relied on "links"
 * array from the ingested data. Schema mimics d3's
 * force directed graph: https://observablehq.com/@d3/force-directed-graph-component
 * 
 * Relies on uniforms and partials:
 * - sampler2D textureLinks
 * - int getIndex
 * - vec3 getVelocity
 * - vec3 getPosition
 * - float is2D: [0, 1]
 * - float springLength: number
 */
export const link = `
  vec3 link( float i, int id1, vec3 p1, vec3 v1, vec2 uv2 ) {

    vec3 result = vec3( 0.0 );

    vec4 edge = texture2D( textureLinks, uv2 );

    vec2 source = edge.xy;
    vec2 target = edge.zw;

    int si = getIndex( source );
    float siF = float( si );
    vec3 sv = getVelocity( source );
    vec3 sp = getPosition( source );

    int ti = getIndex( target );
    float tiF = float( ti );
    vec3 tv = getVelocity( target );
    vec3 tp = getPosition( target );

    vec3 diff = tp + tv - ( sp + sv );
    diff.z *= 1.0 - is2D;

    vec3 mag = abs( diff );
    float seed = float( si + ti );

    float bias = 0.5;
    float dist = length( diff );

    dist = stiffness * ( dist - springLength ) / dist;
    diff *= dist;

    if ( id1 == ti ) {
      result -= diff * bias;
    } else if ( id1 == si ) {
      result += diff * bias;
    }

    result.z *= 1.0 - is2D;

    return result;

  }
`;

/**
 * Repulses (or not) two nodes together based
 * on a repulsion amount.
 * 
 * Relies on uniforms and partials:
 * - float is2D: [0, 1]
 * - float repulsion: number
 */
export const charge = `
  vec3 charge( float i, int id1, vec3 p1, vec3 v1, int id2, vec3 v2, vec3 p2 ) {

    vec3 result = vec3( 0.0 );

    vec3 diff = ( p2 + v2 ) - ( p1 + v1 );
    diff.z *= 1.0 - is2D;

    float dist = length( diff );
    float mag = repulsion / dist;

    vec3 dir = normalize( diff );

    if ( id1 != id2 ) {
      result += dir * mag;
    }

    result.z *= 1.0 - is2D;

    return result;

  }
`;

/**
 * Attracts (or not) a node to the
 * center of the force directed graph
 * by how much gravity there is.
 * 
 * Relies on uniforms:
 * - float gravity: number
 */
export const center = `
  vec3 center( vec3 p1 ) {
    return - p1 * gravity * 0.1;
  }
`;