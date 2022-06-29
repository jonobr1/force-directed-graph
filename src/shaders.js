
const positionsFragment = `
  uniform float is2D;
  uniform float timeStep;

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 texel = texture2D( texturePositions, uv );
    vec3 position = texel.xyz;
    vec3 velocity = texture2D( textureVelocities, uv ).xyz;
    float isStatic = texel.w;

    vec3 result = position + velocity * timeStep * ( 1.0 - isStatic );

    gl_FragColor = vec4( result.xyz, isStatic );

  }
`;

const velocitiesFragment = `
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

  vec3 center( vec3 p1 ) {
    return - p1 * gravity * 0.1;
  }

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

const points = {
  vertexShader: `
    #include <fog_pars_vertex>

    uniform float sizeAttenuation;
    uniform float frustumSize;
    uniform float is2D;
    uniform float nodeRadius;
    uniform float nodeScale;
    uniform sampler2D texturePositions;

    varying vec3 vColor;
    varying vec2 vUv;

    void main() {

      vec4 texel = texture2D( texturePositions, position.xy );
      vec3 vPosition = texel.xyz;
      vPosition.z *= 1.0 - is2D;

      vec4 mvPosition = modelViewMatrix * vec4( vPosition, 1.0 );

      gl_PointSize = nodeRadius * nodeScale;
      gl_PointSize *= mix( 1.0, frustumSize / - mvPosition.z, sizeAttenuation );

      vColor = color;

      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>

    }
  `,
  fragmentShader: `
    #include <fog_pars_fragment>

    uniform float sizeAttenuation;
    uniform float frustumSize;
    uniform vec3 color;
    uniform float size;
    uniform float opacity;

    varying vec2 vUv;
    varying vec3 vColor;

    float circle( vec2 uv, vec2 pos, float rad ) {

      float d = length( pos - uv ) - rad;
      float t = clamp( d, 0.0, 1.0 );

      float viewRange = smoothstep( 0.0, frustumSize * 0.001, abs( 1.0 / vFogDepth ) );
      float taper = 0.15 * viewRange + 0.015;
      taper = mix( taper, 0.15, sizeAttenuation );

      return smoothstep( 0.5 - taper, 0.5 + taper, 1.0 - t );

    }

    void main() {

      vec2 uv = 2.0 * vec2( gl_PointCoord ) - 1.0;
      float t = circle( uv, vec2( 0.0, 0.0 ), 0.5 );
      float id = size * vUv.x + ( size * size * vUv.y );

      gl_FragColor = vec4( vColor * color, opacity * t );
      #include <fog_fragment>

    }
  `
};

const links = {
  vertexShader: `
    #include <fog_pars_vertex>

    uniform float is2D;
    uniform sampler2D texturePositions;

    varying vec3 vColor;

    void main() {

      vec4 texel = texture2D( texturePositions, position.xy );
      vec3 vPosition = texel.xyz;
      vPosition.z *= 1.0 - is2D;

      vec4 mvPosition = modelViewMatrix * vec4( vPosition, 1.0 );
      vColor = color;

      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>

    }
  `,
  fragmentShader: `
    #include <fog_pars_fragment>

    uniform float inheritColors;
    uniform vec3 color;
    uniform float opacity;

    varying vec3 vColor;

    void main() {
      gl_FragColor = vec4( mix( vec3( 1.0 ), vColor, inheritColors ) * color, opacity );
      #include <fog_fragment>
    }
  `
};

export { links, points, positionsFragment, velocitiesFragment };
