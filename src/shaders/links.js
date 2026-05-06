const links = {
  vertexShader: `
    #include <fog_pars_vertex>

    uniform float is2D;
    uniform float uBeginning;
    uniform float uEnding;
    uniform float uNodeAmount;
    uniform sampler2D texturePositions;

    attribute float partnerIndex;

    varying vec3 vColor;

    void main() {

      float ownIndex      = position.z - 1.0;
      float partnerIdx    = partnerIndex - 1.0;
      float rangeStart    = uBeginning * uNodeAmount;
      float rangeEnd      = uEnding   * uNodeAmount;
      float ownInRange     = step( rangeStart, ownIndex )   * ( 1.0 - step( rangeEnd, ownIndex ) );
      float partnerInRange = step( rangeStart, partnerIdx ) * ( 1.0 - step( rangeEnd, partnerIdx ) );

      if ( ownInRange * partnerInRange < 0.5 ) {
        gl_Position = vec4( 0.0, 0.0, 10000.0, 1.0 );
        return;
      }

      vec3 vPosition = texture2D( texturePositions, position.xy ).xyz;
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
    uniform vec3 uColor;
    uniform float opacity;

    varying vec3 vColor;

    void main() {
      gl_FragColor = vec4( mix( vec3( 1.0 ), vColor, inheritColors ) * uColor, opacity );
      #include <fog_fragment>
    }
  `
};

export default links;