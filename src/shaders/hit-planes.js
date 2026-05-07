/**
 * Render planes as RGB indexed frame buffer
 * for hit testing what the pointer has selected
 */
const hitPlanes = {
  vertexShader: `
    uniform float sizeAttenuation;
    uniform float frustumSize;
    uniform float is2D;
    uniform float nodeRadius;
    uniform float nodeScale;
    uniform float hitScale;
    uniform float uBeginning;
    uniform float uEnding;
    uniform float uNodeAmount;
    uniform sampler2D texturePositions;
    uniform vec2 viewport;

    attribute vec2 lookup;
    attribute float nodeIndex;
    attribute float pointSize;

    varying vec3 vColor;

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

      vec4 mvPosition = modelViewMatrix * vec4( vPosition, 1.0 );
      float planeSize = nodeRadius * pointSize * nodeScale;
      planeSize *= mix( 1.0, frustumSize / - mvPosition.z, sizeAttenuation );
      planeSize *= hitScale;

      vec4 clipPosition = projectionMatrix * mvPosition;
      vec2 quadOffset = position.xy * planeSize / viewport * 2.0 * clipPosition.w;

      float r = mod( nodeIndex, 255.0 ) / 255.0;
      float g = mod( floor( nodeIndex / 255.0 ), 255.0 ) / 255.0;
      float b = mod( floor( nodeIndex / pow( 255.0, 2.0 ) ), 255.0 ) / 255.0;
      vColor = vec3( r, g, b );

      gl_Position = clipPosition + vec4( quadOffset, 0.0, 0.0 );

    }
  `,
  fragmentShader: `
    varying vec3 vColor;

    void main() {
      gl_FragColor = vec4( vColor, 1.0 );
    }
  `
};

export default hitPlanes;
