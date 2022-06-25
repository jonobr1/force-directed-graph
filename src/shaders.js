
const positionsFragment = `
  uniform float is2D;
  uniform float timeStep;

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 position = texture2D( texturePositions, uv ).xyz;
    vec3 velocity = texture2D( textureVelocities, uv ).xyz;

    vec3 result = position + velocity * timeStep;

    gl_FragColor = vec4( result.xyz, 0.0 );

  }
`;

const velocitiesFragment = `
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
  uniform sampler2D textureEdges;

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

  float random( vec2 seed ) {
    return fract( sin( dot( seed.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  }

  float jiggle( float index ) {
    return ( random( vec2( index, time ) ) - 0.5 ) * 0.000001;
  }

  vec3 collide( float count, int id1, vec3 p1, vec3 v1 ) {

    float r  = 2.0 * nodeRadius;
    float r2 = nodeRadius * nodeRadius;

    vec3 p = p1 + v1;
    vec3 result = vec3( 0.0 );

    for ( float i = 0.0; i < count; i += 1.0 ) {

      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;

      vec2 uv2 = vec2( uvx, uvy );

      int id2 = getIndex( uv2 );

      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );

      if ( id2 != id1 ) {

        vec3 diff = p - ( p2 + v2 );
        vec3 mag = abs( diff );
        float dist = length( diff );
        float seed = float( id1 + id2 );

        if ( dist < r2 ) {

          if ( mag.x <= 0.1 ) {
            diff.x = jiggle( seed );
            dist += diff.x * diff.x;
          }
          if ( mag.y <= 0.1 ) {
            diff.y = jiggle( seed );
            dist += diff.y * diff.y;
          }
          if ( mag.z <= 0.1 && is2D <= 0.0 ) {
            diff.z = jiggle( seed );
            dist += diff.z * diff.z;
          }

          result += ( diff *= dist ) * r;

        }
      }
    }

    result.z *= ( 1.0 - is2D );

    return result;

  }

  vec3 link( float count, int id1, vec3 p1, vec3 v1 ) {

    vec3 result = vec3( 0.0 );

    for ( float i = 0.0; i < count; i += 1.0 ) {

      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;

      vec4 edge = texture2D( textureEdges, vec2( uvx, uvy ) );

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

    }

    result.z *= 1.0 - is2D;

    return result;

  }

  vec3 charge( float count, int id1, vec3 p1, vec3 v1 ) {

    vec3 result = vec3( 0.0 );

    for ( float i = 0.0; i < count; i += 1.0 ) {

      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;

      vec2 uv2 = vec2( uvx, uvy );
      int id2 = getIndex( uv2 );
      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );

      vec3 diff = ( p2 + v2 ) - ( p1 + v1 );
      diff.z *= 1.0 - is2D;

      float dist = length( diff );
      float mag = repulsion / dist;

      vec3 dir = normalize( diff );

      if ( id1 != id2 ) {
        result += dir * mag;
      }

    }

    result.z *= 1.0 - is2D;

    return result;

  }

  vec3 center( vec3 p1 ) {
    return - p1 * gravity * 0.1;
  }

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    // Calculate Acceleration
    // 1.
    vec3 a = collide( nodeAmount, id1, p1, v1 );
    a *= 1.0 - step( nodeAmount, float( id1 ) );

    // 2.
    vec3 b = link( edgeAmount, id1, p1, v1 );
    b *= 1.0 - step( edgeAmount, float( id1 ) );

    // 3.
    vec3 c = charge( nodeAmount, id1, p1, v1 );
    c *= 1.0 - step( nodeAmount, float( id1 ) );

    // 4.
    vec3 d = center( p1 );
    vec3 acceleration = a + b + c + d;

    // Calculate Velocity
    vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping;
    velocity = clamp( velocity, - maxSpeed, maxSpeed );
    velocity.z *= 1.0 - is2D;

    gl_FragColor = vec4( velocity, 0.0 );

  }
`;

const points = {
  vertexShader: `
    uniform float is2D;
    uniform float nodeRadius;
    uniform sampler2D texturePositions;
    varying vec2 vUv;

    void main() {

      vec4 texel = texture2D( texturePositions, position.xy );
      vec3 vPosition = texel.xyz;
      vPosition.z *= 1.0 - is2D;

      gl_PointSize = nodeRadius * 5.0;

      gl_Position = projectionMatrix * modelViewMatrix * vec4( vPosition, 1.0 );

    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform float size;
    varying vec2 vUv;

    float circle( vec2 uv, vec2 pos, float rad ) {
      float d = length( pos - uv ) - rad;
      float t = clamp( d, 0.0, 1.0 );
      return smoothstep(0.33, 0.66, 1.0 - t);
    }

    void main() {

      vec2 uv = 2.0 * vec2( gl_PointCoord ) - 1.0;
      float t = circle( uv, vec2( 0.0, 0.0 ), 0.5 );
      float id = size * vUv.x + ( size * size * vUv.y );

      gl_FragColor = vec4( color, t );

    }
  `
};

const links = {
  vertexShader: `
    uniform float is2D;
    uniform sampler2D texturePositions;

    void main() {

      vec4 texel = texture2D( texturePositions, position.xy );
      vec3 vPosition = texel.xyz;
      vPosition.z *= 1.0 - is2D;

      gl_Position = projectionMatrix * modelViewMatrix * vec4( vPosition, 1.0 );

    }
  `,
  fragmentShader: `
    uniform vec3 color;

    void main() {
      gl_FragColor = vec4( color.rgb, 1.0 );
    }
  `
};

export { links, points, positionsFragment, velocitiesFragment };
