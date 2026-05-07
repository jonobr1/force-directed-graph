/**
 * Renders nodes as instanced camera-facing quads.
 */
const planes = {
  vertexShader: `
    #include <fog_pars_vertex>

    uniform float sizeAttenuation;
    uniform float frustumSize;
    uniform float is2D;
    uniform float nodeRadius;
    uniform float nodeScale;
    uniform float uBeginning;
    uniform float uEnding;
    uniform float uNodeAmount;
    uniform sampler2D texturePositions;
    uniform sampler2D textureTargetPositions;
    uniform vec2 viewport;

    varying vec2 vUv;
    varying vec3 vColor;
    varying float vImageKey;
    varying float vDistance;
    varying float vViewZ;

    attribute vec2 lookup;
    attribute float nodeIndex;
    attribute float imageKey;
    attribute float pointSize;

    void main() {

      float graphNodeIndex = nodeIndex - 1.0;
      float rangeStart = uBeginning * uNodeAmount;
      float rangeEnd = uEnding * uNodeAmount;
      float inRange = step( rangeStart, graphNodeIndex ) * ( 1.0 - step( rangeEnd, graphNodeIndex ) );

      if ( inRange < 0.5 ) {
        gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
        return;
      }

      vec4 texel = texture2D( texturePositions, lookup );
      vec3 vPosition = texel.xyz;
      vPosition.z *= 1.0 - is2D;

      vec4 targetTexel = texture2D( textureTargetPositions, lookup );
      vec4 mvPosition = modelViewMatrix * vec4( vPosition, 1.0 );
      float planeSize = nodeRadius * pointSize * nodeScale;
      planeSize *= mix( 1.0, frustumSize / - mvPosition.z, sizeAttenuation );

      vec4 clipPosition = projectionMatrix * mvPosition;
      vec2 quadOffset = position.xy * planeSize / viewport * 2.0 * clipPosition.w;

      vUv = uv;
      vDistance = 1.0 / - mvPosition.z;
      vViewZ = mvPosition.z;
      vColor = color;
      vImageKey = imageKey + targetTexel.w * 0.0;

      gl_Position = clipPosition + vec4( quadOffset, 0.0, 0.0 );
      #include <fog_vertex>

    }
  `,
  fragmentShader: `
    #include <fog_pars_fragment>

    uniform float sizeAttenuation;
    uniform float frustumSize;
    uniform vec3 uColor;
    uniform float opacity;
    uniform float imageDimensions;
    uniform float atlasResolution;
    uniform float atlasInset;
    uniform sampler2D textureAtlas;
    uniform float inheritColors;

    varying vec2 vUv;
    varying vec3 vColor;
    varying float vImageKey;
    varying float vDistance;
    varying float vViewZ;

    void main() {

      vec2 cxy = 2.0 * vUv - 1.0;
      float r = length( cxy );
      float delta = fwidth( r );
      float t = 1.0 - smoothstep( 1.0 - delta, 1.0, r );

      #if defined(GL_EXT_frag_depth)
        if ( r <= 1.0 ) {
          float depthOffset = ( 1.0 - r ) * 0.0001;
          gl_FragDepthEXT = gl_FragCoord.z + depthOffset;
        } else {
          gl_FragDepthEXT = gl_FragCoord.z;
        }
      #elif __VERSION__ >= 300
        if ( r <= 1.0 ) {
          float depthOffset = ( 1.0 - r ) * 0.0001;
          gl_FragDepth = gl_FragCoord.z + depthOffset;
        } else {
          gl_FragDepth = gl_FragCoord.z;
        }
      #endif

      float col = mod( vImageKey, imageDimensions );
      float row = floor( vImageKey / imageDimensions );
      float cellSize = 1.0 / imageDimensions;
      float inset = atlasInset / atlasResolution;

      vec2 atlasUv = mix( vec2( inset ), vec2( cellSize - inset ), vUv );
      atlasUv.x += col * cellSize;
      atlasUv.y += row * cellSize;

      vec4 texel = texture2D( textureAtlas, atlasUv );
      float useImage = step( 0.0, vImageKey );

      t = mix( t, texel.a, useImage );
      vec3 layer = mix( vec3( 1.0 ), texel.rgb, useImage );

      float alpha = opacity * t;
      if ( alpha <= 0.0 ) {
        discard;
      }

      gl_FragColor = vec4( layer * mix( vec3( 1.0 ), vColor, inheritColors ) * uColor, alpha );
      #include <fog_fragment>

    }
  `,
};

export default planes;
