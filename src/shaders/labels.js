/**
 * Renders text labels for nodes as camera-facing billboard quads.
 * Label visibility is driven by a fixed per-label selection rank.
 * The public `obscurity` property controls the active quota, not alpha.
 */
const labels = {
  vertexShader: `
    #include <fog_pars_vertex>

    uniform sampler2D texturePositions;
    uniform float frustumSize;
    uniform float is2D;
    uniform float sizeAttenuation;
    uniform vec2 resolution;
    uniform float uBeginning;
    uniform float uEnding;
    uniform float uNodeAmount;
    uniform float obscurity;
    uniform float nodeRadius;
    uniform float nodeScale;
    uniform float uLabelCount;
    uniform float labelAlignment;
    uniform float labelBaseline;
    uniform float labelFontSize;
    uniform float labelNear;
    uniform vec2 labelOffset;

    attribute vec3 source;       // .xy = UV into texturePositions, .z = nodeIndex + 1
    attribute vec4 labelUV;      // .xy = atlas UV offset, .zw = atlas UV extent
    attribute float aspectRatio; // label quad width / height
    attribute float pointSize;   // per-node point size scalar
    attribute float selectionRank;

    varying vec2 vLabelUV;
    varying vec3 vColor;
    varying float vInRange;

    void main() {

      float nodeIndex  = source.z - 1.0;
      float rangeStart = uBeginning * uNodeAmount;
      float rangeEnd   = uEnding    * uNodeAmount;
      float inRange    = step( rangeStart, nodeIndex ) * ( 1.0 - step( rangeEnd, nodeIndex ) );
      float visibleCount = floor( ( 1.0 - clamp( obscurity, 0.0, 1.0 ) ) * uLabelCount + 0.5 );
      float rankVisible = step( selectionRank + 0.5, visibleCount );
      inRange *= rankVisible;

      vec3 nodePos = texture2D( texturePositions, source.xy ).xyz;
      nodePos.z *= 1.0 - is2D;

      vec4 mvCenter = modelViewMatrix * vec4( nodePos, 1.0 );
      float viewDistance = -mvCenter.z;
      float beyondNear = 1.0 - step( viewDistance, max( labelNear, 0.0 ) );
      inRange *= beyondNear;

      // Billboard: extract camera right and up from the view matrix columns
      vec3 right = normalize( vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] ) );
      vec3 up    = normalize( vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] ) );

      // Match point-sprite sizing by converting the intended screen-space
      // label height into world units for the active projection.
      float sizeScale  = mix( 1.0, frustumSize / max( viewDistance, 0.001 ), sizeAttenuation );
      float labelPixelH = 0.1 * nodeRadius * pointSize * nodeScale * sizeScale * max( labelFontSize, 0.001 );
      float projectionScaleY = max( abs( projectionMatrix[1][1] ), 0.0001 );
      float isPerspectiveCamera = step( 0.5, abs( projectionMatrix[2][3] ) );
      float depthScale = mix( 1.0, viewDistance, isPerspectiveCamera );
      float worldUnitsPerPixel = ( 2.0 * depthScale ) / max( projectionScaleY * max( resolution.y, 1.0 ), 0.001 );
      float labelH     = labelPixelH * worldUnitsPerPixel;
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
      vColor = color;
      vInRange = inRange;

      vec4 mvPosition = modelViewMatrix * vec4( worldPos, 1.0 );
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `,
  fragmentShader: `
    #include <fog_pars_fragment>

    uniform sampler2D textureAtlas;
    uniform float inheritColors;
    uniform float opacity;
    uniform vec3 uColor;

    varying vec2 vLabelUV;
    varying vec3 vColor;
    varying float vInRange;

    void main() {

      if ( vInRange <= 0.0 ) {
        discard;
      }

      vec4 texel = texture2D( textureAtlas, vLabelUV );
      float alpha = opacity * texel.a;

      if ( alpha <= 0.0 ) {
        discard;
      }

      gl_FragColor = vec4(
        texel.rgb * mix( vec3( 1.0 ), vColor, inheritColors ) * uColor,
        alpha
      );
      #include <fog_fragment>
    }
  `,
};

export default labels;
