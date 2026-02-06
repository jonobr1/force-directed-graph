import { circle } from "./partials.js";

/**
 * Renders points of all nodes as a
 * single draw call.
 */
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
    varying float vImageKey;
    varying float vDistance;
    varying float vViewZ;

    attribute float imageKey;

    void main() {

      vec4 texel = texture2D( texturePositions, position.xy );
      vec3 vPosition = texel.xyz;
      vPosition.z *= 1.0 - is2D;

      vec4 mvPosition = modelViewMatrix * vec4( vPosition, 1.0 );

      gl_PointSize = nodeRadius * nodeScale;
      gl_PointSize *= mix( 1.0, frustumSize / - mvPosition.z, sizeAttenuation );

      vDistance = 1.0 / - mvPosition.z;
      vViewZ = mvPosition.z;
      vColor = color;
      vImageKey = imageKey;

      gl_Position = projectionMatrix * mvPosition;
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
    uniform sampler2D textureAtlas;
    uniform float inheritColors;

    varying vec3 vColor;
    varying float vImageKey;
    varying float vDistance;
    varying float vViewZ;

    ${circle}

    void main() {

      vec2 uv = 2.0 * vec2( gl_PointCoord ) - 1.0;
      float t = circle( uv, vec2( 0.0, 0.0 ), 0.5, 1.0 );

      // Calculate custom depth to fix z-fighting with transparent points
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = length(cxy);

      // For fragments inside the circle, offset depth proportionally
      if (r <= 1.0) {
        // Closer to edge = larger depth offset (appears further back)
        // This creates a spherical depth profile
        float depthOffset = (1.0 - r) * 0.0001;
        gl_FragDepth = gl_FragCoord.z + depthOffset;
      } else {
        gl_FragDepth = gl_FragCoord.z;
      }

      float col = mod( vImageKey, imageDimensions );
      float row = floor( vImageKey / imageDimensions );

      uv = vec2( 0.0 );
      uv.x = mix( 0.0, 1.0 / imageDimensions, gl_PointCoord.x );
      uv.y = mix( 0.0, 1.0 / imageDimensions, gl_PointCoord.y );

      uv = vec2( gl_PointCoord ) / imageDimensions;
      uv.x += col / imageDimensions;
      uv.y += row / imageDimensions;

      vec4 texel = texture2D( textureAtlas, uv );
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
  `
};

export default points;