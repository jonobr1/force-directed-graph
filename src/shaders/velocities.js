import {
  getPosition,
  getVelocity,
  getIndex,
  getUVFromIndex,
  random,
  jiggle,
  link,
  charge,
  center,
  anchor
} from "./partials.js";

export const types = ["simplex", "nested"];

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
  uniform float pinStrength;
  uniform float uBeginning;
  uniform float uEnding;
  uniform sampler2D textureLinks;
  uniform sampler2D textureLinkRanges;
  uniform sampler2D textureTargetPositions;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${getUVFromIndex}
  ${random}
  ${jiggle}
  ${link}
  ${charge}
  ${center}
  ${anchor}

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    float rangeStart = uBeginning * nodeAmount;
    float rangeEnd   = uEnding   * nodeAmount;

    vec3 a = vec3( 0.0 ),
        b = vec3( 0.0 ),
        c = vec3( 0.0 );

    vec4 linkRange = texture2D( textureLinkRanges, uv );
    float linkStart = linkRange.x;
    float linkCount = linkRange.y;

    for ( float i = 0.0; i < edgeAmount; i += 1.0 ) {
      if ( i >= linkCount ) {
        break;
      }
      vec2 linkUV = getUVFromIndex( linkStart + i );
      b += link( id1, linkUV, rangeStart, rangeEnd );
    }

    for ( float i = 0.0; i < nodeAmount; i += 1.0 ) {
      vec2 uv2 = getUVFromIndex( i );
      int id2 = getIndex( uv2 );
      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );
      float id2InRange = step( rangeStart, i ) * ( 1.0 - step( rangeEnd, i ) );
      c += charge( i, id1, p1, v1, id2, p2, v2 ) * id2InRange;
    }

    float id1InRange = step( rangeStart, float( id1 ) ) * ( 1.0 - step( rangeEnd, float( id1 ) ) );
    b *= id1InRange;
    c *= id1InRange;

    // 4.
    vec4 targetTexel = texture2D( textureTargetPositions, uv );
    vec3 d = mix( center( p1 ), anchor( p1, targetTexel.xyz ), pinStrength * targetTexel.w );
    vec3 acceleration = a + b + c + d * id1InRange;

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
  uniform float pinStrength;
  uniform float uBeginning;
  uniform float uEnding;
  uniform sampler2D textureLinks;
  uniform sampler2D textureLinksLookUp;
  uniform sampler2D textureTargetPositions;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${getUVFromIndex}
  ${random}
  ${jiggle}
  ${link}
  ${charge}
  ${center}
  ${anchor}

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    float rangeStart = uBeginning * nodeAmount;
    float rangeEnd   = uEnding   * nodeAmount;

    vec3 a = vec3( 0.0 ),
        b = vec3( 0.0 ),
        c = vec3( 0.0 );

    /*
    for ( float i = 0.0; i < linkAmount; i += 1.0 ) {
      // TODO: get all edges and link them
      b += link( id1, uv2, rangeStart, rangeEnd );
    }
    */

    for ( float i = 0.0; i < nodeAmount; i += 1.0 ) {

      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;

      vec2 uv2 = vec2( uvx, uvy );

      int id2 = getIndex( uv2 );
      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );

      float id2InRange = step( rangeStart, i ) * ( 1.0 - step( rangeEnd, i ) );
      if ( i < nodeAmount) {
        c += charge( i, id1, p1, v1, id2, p2, v2 ) * id2InRange;
      }

    }

    float id1InRange = step( rangeStart, float( id1 ) ) * ( 1.0 - step( rangeEnd, float( id1 ) ) );
    b *= id1InRange;
    c *= id1InRange;

  // 4.
  vec4 targetTexel = texture2D( textureTargetPositions, uv );
  vec3 d = mix( center( p1 ), anchor( p1, targetTexel.xyz ), pinStrength * targetTexel.w );
  vec3 acceleration = a + b + c + d * id1InRange;

  // Calculate Velocity
  vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;
  velocity = clamp( velocity, - maxSpeed, maxSpeed );
  velocity.z *= 1.0 - is2D;

  gl_FragColor = vec4( velocity, 0.0 );

}
`;
