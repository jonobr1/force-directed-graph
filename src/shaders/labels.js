/**
 * Renders text labels for nodes as camera-facing billboard quads.
 * Label visibility is driven by a placement-generated visibility texture.
 * The public `obscurity` property controls the placement quota, not alpha.
 */
const labels = {
  vertexShader: `
    #include <fog_pars_vertex>

    uniform sampler2D texturePositions;
    uniform float frustumSize;
    uniform float is2D;
    uniform float sizeAttenuation;
    uniform float uBeginning;
    uniform float uEnding;
    uniform float uNodeAmount;
    uniform float nodeRadius;
    uniform float nodeScale;
    uniform float labelAlignment;
    uniform float labelBaseline;
    uniform float labelFontSize;
    uniform vec2 labelOffset;

    attribute vec3 source;       // .xy = UV into texturePositions, .z = nodeIndex + 1
    attribute vec4 labelUV;      // .xy = atlas UV offset, .zw = atlas UV extent
    attribute float aspectRatio; // label quad width / height
    attribute float pointSize;   // per-node point size scalar
    attribute vec2 visibilityUV; // UV into placement visibility texture

    varying vec2 vLabelUV;
    varying vec2 vVisibilityUV;
    varying float vInRange;

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
      float labelH     = 0.1 * nodeRadius * pointSize * nodeScale * sizeScale * max( labelFontSize, 0.001 );
      float labelW     = labelH * aspectRatio;
      vec2 offset      = labelOffset * labelH;

      // Shift the label relative to the node according to baseline/alignment.
      vec3 worldPos = nodePos
        + right * ( labelW * 0.5 * labelAlignment + offset.x )
        + up    * ( labelH * labelBaseline + offset.y )
        + right * position.x * labelW * 0.5
        + up    * position.y * labelH * 0.5;

      // Map quad UV [0,1] to the atlas region for this label
      vLabelUV = labelUV.xy + uv * labelUV.zw;
      vVisibilityUV = visibilityUV;
      vInRange = inRange;

      vec4 mvPosition = modelViewMatrix * vec4( worldPos, 1.0 );
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `,
  fragmentShader: `
    #include <fog_pars_fragment>

    uniform sampler2D textureAtlas;
    uniform sampler2D textureVisibility;
    uniform float opacity;

    varying vec2 vLabelUV;
    varying vec2 vVisibilityUV;
    varying float vInRange;

    void main() {

      if ( vInRange <= 0.0 ) {
        discard;
      }

      float visibility = texture2D( textureVisibility, vVisibilityUV ).r;
      if ( visibility <= 0.0 ) {
        discard;
      }

      vec4 texel = texture2D( textureAtlas, vLabelUV );
      float alpha = opacity * visibility * texel.a;

      if ( alpha <= 0.0 ) {
        discard;
      }

      gl_FragColor = vec4( texel.rgb, alpha );
      #include <fog_fragment>
    }
  `,
};

export default labels;
