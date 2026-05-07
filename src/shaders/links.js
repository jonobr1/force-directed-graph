const links = {
  vertexShader: `
    #include <fog_pars_vertex>

    uniform float frustumSize;
    uniform float is2D;
    uniform float linewidth;
    uniform float pixelRatio;
    uniform float sizeAttenuation;
    uniform float uBeginning;
    uniform float uEnding;
    uniform float uNodeAmount;
    uniform vec2 resolution;
    uniform sampler2D texturePositions;

    attribute vec3 source;
    attribute vec3 target;
    attribute vec3 sourceColor;
    attribute vec3 targetColor;

    varying vec2 vSource;
    varying vec2 vTarget;
    varying vec3 vSourceColor;
    varying vec3 vTargetColor;
    varying float vHalfWidth;
    varying float inRange;

    void main() {

      float sourceIndex    = source.z - 1.0;
      float targetIndex    = target.z - 1.0;
      float rangeStart     = uBeginning * uNodeAmount;
      float rangeEnd       = uEnding * uNodeAmount;
      float sourceInRange  = step( rangeStart, sourceIndex ) * ( 1.0 - step( rangeEnd, sourceIndex ) );
      float targetInRange  = step( rangeStart, targetIndex ) * ( 1.0 - step( rangeEnd, targetIndex ) );

      vec3 sourcePosition = texture2D( texturePositions, source.xy ).xyz;
      vec3 targetPosition = texture2D( texturePositions, target.xy ).xyz;
      sourcePosition.z *= 1.0 - is2D;
      targetPosition.z *= 1.0 - is2D;

      vec4 sourceModelView = modelViewMatrix * vec4( sourcePosition, 1.0 );
      vec4 targetModelView = modelViewMatrix * vec4( targetPosition, 1.0 );
      vec4 sourceClip = projectionMatrix * sourceModelView;
      vec4 targetClip = projectionMatrix * targetModelView;

      vec2 safeResolution = max( resolution, vec2( 1.0 ) );
      vec2 sourceNdc = sourceClip.xy / sourceClip.w;
      vec2 targetNdc = targetClip.xy / targetClip.w;
      vec2 sourceScreen = ( sourceNdc * 0.5 + 0.5 ) * safeResolution;
      vec2 targetScreen = ( targetNdc * 0.5 + 0.5 ) * safeResolution;
      vec2 delta = targetScreen - sourceScreen;

      float segmentLength = length( delta );
      vec2 tangent = segmentLength > 0.0 ? delta / segmentLength : vec2( 1.0, 0.0 );
      vec2 normal = vec2( - tangent.y, tangent.x );

      float centerViewZ = 0.5 * ( sourceModelView.z + targetModelView.z );
      float widthScale = mix(
        1.0,
        frustumSize / max( -centerViewZ, 0.0001 ),
        sizeAttenuation
      );
      float halfWidth = max( 0.5 * linewidth * pixelRatio * widthScale, 0.5 );
      float expansion = halfWidth + 1.0;
      float edgeT = position.x * 0.5 + 0.5;

      vec2 base = mix( sourceScreen, targetScreen, edgeT );
      vec2 screen = base + tangent * position.x * expansion + normal * position.y * expansion;
      vec2 ndc = ( screen / safeResolution ) * 2.0 - 1.0;

      float clipW = mix( sourceClip.w, targetClip.w, edgeT );
      float clipZ = mix( sourceClip.z, targetClip.z, edgeT );
      gl_Position = vec4( ndc * clipW, clipZ, clipW );

      vec4 mvPosition = mix( sourceModelView, targetModelView, edgeT );
      vSource = sourceScreen;
      vTarget = targetScreen;
      vSourceColor = sourceColor;
      vTargetColor = targetColor;
      vHalfWidth = halfWidth;
      inRange = sourceInRange * targetInRange;

      #include <fog_vertex>

    }
  `,
  fragmentShader: `
    #include <fog_pars_fragment>

    uniform float inheritColors;
    uniform vec3 uColor;
    uniform float opacity;

    varying vec2 vSource;
    varying vec2 vTarget;
    varying vec3 vSourceColor;
    varying vec3 vTargetColor;
    varying float vHalfWidth;
    varying float inRange;

    float getSegmentT( vec2 point, vec2 start, vec2 end ) {

      vec2 segment = end - start;
      float lengthSquared = dot( segment, segment );

      if ( lengthSquared <= 0.0 ) {
        return 0.0;
      }

      return clamp( dot( point - start, segment ) / lengthSquared, 0.0, 1.0 );

    }

    float getCapsuleDistance( vec2 point, vec2 start, vec2 end, float radius ) {

      float t = getSegmentT( point, start, end );
      vec2 closest = mix( start, end, t );

      return length( point - closest ) - radius;

    }

    void main() {

      if ( inRange < 0.5 ) {
        discard;
      }

      float segmentT = getSegmentT( gl_FragCoord.xy, vSource, vTarget );
      float distanceToCapsule = getCapsuleDistance(
        gl_FragCoord.xy,
        vSource,
        vTarget,
        vHalfWidth
      );
      float alpha = 1.0 - smoothstep( 0.0, 1.0, distanceToCapsule );

      if ( alpha <= 0.0 ) {
        discard;
      }

      vec3 gradient = mix( vSourceColor, vTargetColor, segmentT );
      gl_FragColor = vec4(
        mix( vec3( 1.0 ), gradient, inheritColors ) * uColor,
        opacity * alpha
      );

      #include <fog_fragment>

    }
  `,
};

export default links;
