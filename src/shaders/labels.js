/**
 * Renders text labels for nodes as camera-facing billboard quads.
 * Label visibility is controlled by the `uObscurity` uniform:
 *   0 → all labels fully visible
 *   1 → all labels fully hidden
 */
const labels = {
  vertexShader: `
    uniform sampler2D texturePositions;
    uniform float frustumSize;
    uniform float is2D;
    uniform float sizeAttenuation;
    uniform float uBeginning;
    uniform float uEnding;
    uniform float uNodeAmount;
    uniform float uObscurity;
    uniform float nodeRadius;
    uniform float nodeScale;

    attribute vec3 source;       // .xy = UV into texturePositions, .z = nodeIndex + 1
    attribute vec4 labelUV;      // .xy = atlas UV offset, .zw = atlas UV extent
    attribute float aspectRatio; // label quad width / height

    varying vec2 vLabelUV;
    varying float vAlpha;

    void main() {

      float nodeIndex  = source.z - 1.0;
      float rangeStart = uBeginning * uNodeAmount;
      float rangeEnd   = uEnding    * uNodeAmount;
      float inRange    = step( rangeStart, nodeIndex ) * ( 1.0 - step( rangeEnd, nodeIndex ) );

      vec3 nodePos = texture2D( texturePositions, source.xy ).xyz;
      nodePos.z *= 1.0 - is2D;

      vec4 mvCenter = modelViewMatrix * vec4( nodePos, 1.0 );

      // Billboard: extract camera right and up from the view matrix columns
      vec3 right = normalize( vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] ) );
      vec3 up    = normalize( vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] ) );

      // Scale label to match node visual size, with optional depth attenuation
      float sizeScale  = mix( 1.0, frustumSize / max( -mvCenter.z, 0.001 ), sizeAttenuation );
      float labelH     = 0.1 * nodeRadius * nodeScale * sizeScale;
      float labelW     = labelH * aspectRatio;

      // Shift the label upward so it sits above the node
      vec3 worldPos = nodePos
        + up    * labelH
        + right * position.x * labelW * 0.5
        + up    * position.y * labelH * 0.5;

      // Map quad UV [0,1] to the atlas region for this label
      vLabelUV = labelUV.xy + uv * labelUV.zw;

      // Alpha: obscurity=0 → fully visible; obscurity=1 → fully hidden
      vAlpha = ( 1.0 - uObscurity ) * inRange;

      gl_Position = projectionMatrix * modelViewMatrix * vec4( worldPos, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D textureAtlas;
    uniform float opacity;

    varying vec2 vLabelUV;
    varying float vAlpha;

    void main() {

      vec4 texel = texture2D( textureAtlas, vLabelUV );
      float alpha = opacity * vAlpha * texel.a;

      if ( alpha <= 0.0 ) {
        discard;
      }

      gl_FragColor = vec4( texel.rgb, alpha );
    }
  `,
};

export default labels;
