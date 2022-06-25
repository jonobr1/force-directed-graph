
const positionsFragment = `
  uniform float timeStep;
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 position = texture2D( texturePositions, uv ).xy;
    vec2 velocity = texture2D( textureVelocities, uv ).xy;
    vec2 result = position + velocity * timeStep;
    gl_FragColor = vec4( result.xy, 0.0, 0.0 );
  }
`;

const velocitiesFragment = `
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
  vec2 getPosition( vec2 uv ) {
    return texture2D( texturePositions, uv ).xy;
  }
  vec2 getVelocity( vec2 uv ) {
    return texture2D( textureVelocities, uv ).xy;
  }
  vec2 getAcceleration( vec2 uv ) {
    return texture2D( textureVelocities, uv ).zw;
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
  vec2 collide( float count, int id1, vec2 p1, vec2 v1 ) {
    float r2 = nodeRadius * nodeRadius;
    float xi = p1.x + v1.x;
    float yi = p1.y + v1.y;
    float r  = 2.0 * nodeRadius;
    vec2 result = vec2( 0.0 );
    for ( float i = 0.0; i < count; i += 1.0 ) {
      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;
      vec2 uv2 = vec2( uvx, uvy );
      int id2 = getIndex( uv2 );
      vec2 v2 = getVelocity( uv2 );
      vec2 p2 = getPosition( uv2 );
      if ( id2 != id1 ) {
        float x = xi - ( p2.x + v2.x );
        float y = yi - ( p2.y + v2.y );
        float l = x * x + y * y;
        float seed = float( id1 + id2 );
        if ( l < r2 ) {
          if ( abs( x ) <= 0.1 ) {
            x = jiggle( seed );
            l += x * x;
          }
          if ( abs( y ) <= 0.1 ) {
            y = jiggle( seed );
            l += y * y;
          }
          result.x += (x *= l) * r;
          result.y += (y *= l) * r;
        }
      }
    }
    return result;
  }
  vec2 link( float count, int id1, vec2 p1, vec2 v1 ) {
    vec2 result = vec2( 0.0 );
    for ( float i = 0.0; i < count; i += 1.0 ) {
      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;
      vec4 edge = texture2D( textureEdges, vec2( uvx, uvy ) );
      vec2 source = edge.xy;
      vec2 target = edge.zw;
      int si = getIndex( source );
      float siF = float( si );
      vec2 sv = getVelocity( source );
      vec2 sp = getPosition( source );
      int ti = getIndex( target );
      float tiF = float( ti );
      vec2 tv = getVelocity( target );
      vec2 tp = getPosition( target );
      float x = tp.x + tv.x - ( sp.x + sv.x );
      float y = tp.y + tv.y - ( sp.y + sv.y );
      float seed = float( si + ti );
      if ( abs( x ) <= 0.1 ) {
        x = jiggle( seed );
      }
      if ( abs( y ) <= 0.1 ) {
        y = jiggle( seed );
      }
      float bias = 0.5;
      float l = sqrt( x * x + y * y );
      l = stiffness * ( l - springLength ) / l;
      x *= l;
      y *= l;
      if ( id1 == ti ) {
        result -= vec2( x, y ) * bias;
      } else if ( id1 == si ) {
        result += vec2( x, y ) * bias;
      }
    }
    return result;
  }
  vec2 charge( float count, int id1, vec2 p1, vec2 v1 ) {
    vec2 result = vec2( 0.0 );
    for ( float i = 0.0; i < count; i += 1.0 ) {
      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;
      vec2 uv2 = vec2( uvx, uvy );
      int id2 = getIndex( uv2 );
      vec2 v2 = getVelocity( uv2 );
      vec2 p2 = getPosition( uv2 );
      vec2 diff = ( p2 + v2 ) - ( p1 + v1 );
      float dist = length( diff );
      float magnitude = repulsion / dist;
      float cutoff = ( 1.0 - step( springLength * 10.0, dist ) );
      vec2 dir = normalize( diff );
      if ( id1 != id2 ) {
        result += dir * magnitude;// * cutoff;
      }
    }
    return result;
  }
  vec2 center( vec2 p1 ) {
    vec2 result = - p1 * gravity * 0.1;
    return result;
  }
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );
    vec2 p1 = getPosition( uv );
    vec2 v1 = getVelocity( uv );
    vec2 a1 = getAcceleration( uv );
    // Calculate Acceleration
    // 1.
    vec2 a = collide( nodeAmount, id1, p1, v1 );
    a *= 1.0 - step( nodeAmount, float( id1 ) );
    // 2.
    vec2 b = link( edgeAmount, id1, p1, v1 );
    b *= 1.0 - step( edgeAmount, float( id1 ) );
    // 3.
    vec2 c = charge( nodeAmount, id1, p1, v1 );
    c *= 1.0 - step( nodeAmount, float( id1 ) );
    // 4.
    vec2 d = center( p1 );
    vec2 acceleration = a + b + c + d;
    // Calculate Velocity
    vec2 velocity = ( v1 + ( acceleration * timeStep ) ) * damping;
    velocity = clamp( velocity, - maxSpeed, maxSpeed );
    gl_FragColor = vec4( velocity, acceleration );
  }
`;

const points = {
  vertexShader: `
    uniform float nodeRadius;
    uniform sampler2D texturePositions;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D( texturePositions, position.xy );
      vec3 vPosition = texel.xyz;
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
    uniform sampler2D texturePositions;
    void main() {
      vec4 texel = texture2D( texturePositions, position.xy );
      vec3 vPosition = texel.xyz;
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
