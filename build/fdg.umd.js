var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.js
var index_exports = {};
__export(index_exports, {
  ForceDirectedGraph: () => ForceDirectedGraph
});
module.exports = __toCommonJS(index_exports);
var import_three6 = require("three");
var import_GPUComputationRenderer = require("three/examples/jsm/misc/GPUComputationRenderer.js");

// src/math.js
var pot = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
function getPotSize(number) {
  const side = Math.floor(Math.sqrt(number)) + 1;
  for (let i = 0; i < pot.length; i++) {
    if (pot[i] >= side) {
      return pot[i];
    }
  }
  console.error(
    "ForceDirectedGraph: Texture size is too big.",
    "Consider reducing the size of your data."
  );
}
function clamp(x, min, max) {
  return Math.min(Math.max(x, min), max);
}
var maxFrames = 1e3;
function each(list, func, step, max) {
  if (typeof step !== "number") {
    step = 1;
  }
  if (typeof max !== "number") {
    max = maxFrames;
  }
  return new Promise((resolve) => {
    exec(0);
    function exec(start) {
      const limit = Math.min(start + maxFrames, list.length);
      let i = start;
      while (i < limit) {
        func(list[i], i);
        i += step;
      }
      if (limit < list.length) {
        requestAnimationFrame(() => exec(i));
      } else {
        resolve();
      }
    }
  });
}
function rgbToIndex({ r, g, b }) {
  return r + g * 255 + b * Math.pow(255, 2);
}

// src/shaders/positions.js
var positions = `
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

// src/shaders/partials.js
var circle = `
float circle( vec2 uv, vec2 pos, float rad, float isSmooth ) {

  float limit = 0.02;
  float limit2 = limit * 2.0;
  float d = length( pos - uv ) - ( rad - limit );
  float t = clamp( d, 0.0, 1.0 );

  float viewRange = smoothstep( 0.0, frustumSize * 0.001, abs( vDistance ) );
  float taper = limit2 * viewRange + limit;
  taper = mix( taper, limit2, sizeAttenuation );

  float a = step( 0.5, 1.0 - t );
  float aa = smoothstep( 0.5 - taper, 0.5 + taper, 1.0 - t );;

  return mix( a, aa, isSmooth );

}
`;
var getPosition = `
  vec3 getPosition( vec2 uv ) {
    return texture2D( texturePositions, uv ).xyz;
  }
`;
var getVelocity = `
  vec3 getVelocity( vec2 uv ) {
    return texture2D( textureVelocities, uv ).xyz;
  }
`;
var getIndex = `
  int getIndex( vec2 uv ) {
    int s = int( size );
    int col = int( uv.x * size );
    int row = int( uv.y * size );
    return col + row * s;
  }
`;
var getUVFromIndex = `
  vec2 getUVFromIndex( float i ) {
    float uvx = mod( i, size ) / size;
    float uvy = floor( i / size ) / size;
    return vec2( uvx, uvy );
  }
`;
var random = `
  float random( vec2 seed ) {
    return fract( sin( dot( seed.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  }
`;
var jiggle = `
  float jiggle( float index ) {
    return ( random( vec2( index, time ) ) - 0.5 ) * 0.000001;
  }
`;
var link = `
  vec3 link( int id1, vec2 uv2, float rangeStart, float rangeEnd ) {

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

    float siInRange = step( rangeStart, siF ) * ( 1.0 - step( rangeEnd, siF ) );
    float tiInRange = step( rangeStart, tiF ) * ( 1.0 - step( rangeEnd, tiF ) );
    return result * siInRange * tiInRange;

  }
`;
var charge = `
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
`;
var center = `
  vec3 center( vec3 p1 ) {
    return - p1 * gravity * 0.1;
  }
`;
var anchor = `
  vec3 anchor( vec3 p1, vec3 target ) {
    return ( target - p1 ) * gravity * 0.1;
  }
`;

// src/shaders/velocities.js
var types = ["simplex", "nested"];
var simplex = `
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
  uniform float pinStrength;
  uniform float uBeginning;
  uniform float uEnding;
  uniform sampler2D textureLinks;
  uniform sampler2D textureLinkRanges;
  uniform sampler2D textureTargetPositions;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${getUVFromIndex}
  ${random}
  ${jiggle}
  ${link}
  ${charge}
  ${center}
  ${anchor}

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    float rangeStart = uBeginning * nodeAmount;
    float rangeEnd   = uEnding   * nodeAmount;

    vec3 a = vec3( 0.0 ),
        b = vec3( 0.0 ),
        c = vec3( 0.0 );

    vec4 linkRange = texture2D( textureLinkRanges, uv );
    float linkStart = linkRange.x;
    float linkCount = linkRange.y;

    for ( float i = 0.0; i < edgeAmount; i += 1.0 ) {
      if ( i >= linkCount ) {
        break;
      }
      vec2 linkUV = getUVFromIndex( linkStart + i );
      b += link( id1, linkUV, rangeStart, rangeEnd );
    }

    for ( float i = 0.0; i < nodeAmount; i += 1.0 ) {
      vec2 uv2 = getUVFromIndex( i );
      int id2 = getIndex( uv2 );
      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );
      float id2InRange = step( rangeStart, i ) * ( 1.0 - step( rangeEnd, i ) );
      c += charge( i, id1, p1, v1, id2, p2, v2 ) * id2InRange;
    }

    float id1InRange = step( rangeStart, float( id1 ) ) * ( 1.0 - step( rangeEnd, float( id1 ) ) );
    b *= id1InRange;
    c *= id1InRange;

    // 4.
    vec4 targetTexel = texture2D( textureTargetPositions, uv );
    vec3 d = mix( center( p1 ), anchor( p1, targetTexel.xyz ), pinStrength * targetTexel.w );
    vec3 acceleration = a + b + c + d * id1InRange;

    // Calculate Velocity
    vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;
    velocity = clamp( velocity, - maxSpeed, maxSpeed );
    velocity.z *= 1.0 - is2D;

    gl_FragColor = vec4( velocity, 0.0 );

  }
`;
var nested = `
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
  uniform float pinStrength;
  uniform float uBeginning;
  uniform float uEnding;
  uniform sampler2D textureLinks;
  uniform sampler2D textureLinksLookUp;
  uniform sampler2D textureTargetPositions;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${getUVFromIndex}
  ${random}
  ${jiggle}
  ${link}
  ${charge}
  ${center}
  ${anchor}

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    float rangeStart = uBeginning * nodeAmount;
    float rangeEnd   = uEnding   * nodeAmount;

    vec3 a = vec3( 0.0 ),
        b = vec3( 0.0 ),
        c = vec3( 0.0 );

    /*
    for ( float i = 0.0; i < linkAmount; i += 1.0 ) {
      // TODO: get all edges and link them
      b += link( id1, uv2, rangeStart, rangeEnd );
    }
    */

    for ( float i = 0.0; i < nodeAmount; i += 1.0 ) {

      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;

      vec2 uv2 = vec2( uvx, uvy );

      int id2 = getIndex( uv2 );
      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );

      float id2InRange = step( rangeStart, i ) * ( 1.0 - step( rangeEnd, i ) );
      if ( i < nodeAmount) {
        c += charge( i, id1, p1, v1, id2, p2, v2 ) * id2InRange;
      }

    }

    float id1InRange = step( rangeStart, float( id1 ) ) * ( 1.0 - step( rangeEnd, float( id1 ) ) );
    b *= id1InRange;
    c *= id1InRange;

  // 4.
  vec4 targetTexel = texture2D( textureTargetPositions, uv );
  vec3 d = mix( center( p1 ), anchor( p1, targetTexel.xyz ), pinStrength * targetTexel.w );
  vec3 acceleration = a + b + c + d * id1InRange;

  // Calculate Velocity
  vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;
  velocity = clamp( velocity, - maxSpeed, maxSpeed );
  velocity.z *= 1.0 - is2D;

  gl_FragColor = vec4( velocity, 0.0 );

}
`;

// src/shaders/simulation.js
var simulation_default = {
  positions,
  velocities: simplex,
  simplex,
  nested,
  types
};

// src/points.js
var import_three2 = require("three");

// src/shaders/points.js
var points = {
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

    varying vec3 vColor;
    varying float vImageKey;
    varying float vDistance;
    varying float vViewZ;
    varying vec3 vTargetPosition;
    varying float vHasTarget;

    attribute float imageKey;
    attribute float pointSize;

    void main() {

      float nodeIndex  = position.z - 1.0;
      float rangeStart = uBeginning * uNodeAmount;
      float rangeEnd   = uEnding    * uNodeAmount;
      float inRange    = step( rangeStart, nodeIndex ) * ( 1.0 - step( rangeEnd, nodeIndex ) );

      vec4 texel = texture2D( texturePositions, position.xy );
      vec3 vPosition = texel.xyz;
      vPosition.z *= 1.0 - is2D;

      vec4 targetTexel = texture2D( textureTargetPositions, position.xy );
      vTargetPosition = targetTexel.xyz;
      vHasTarget = targetTexel.w;

      vec4 mvPosition = modelViewMatrix * vec4( vPosition, 1.0 );

      gl_PointSize = nodeRadius * pointSize * nodeScale;
      gl_PointSize *= mix( 1.0, frustumSize / - mvPosition.z, sizeAttenuation );
      gl_PointSize *= inRange;

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

    void main() {

      // Calculate distance from center for circular shape and depth
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = length(cxy);

      // Antialiased circle using fwidth for automatic edge smoothing
      float delta = fwidth(r);
      float t = 1.0 - smoothstep(1.0 - delta, 1.0, r);

      // Calculate custom depth to fix z-fighting with transparent points
      // For fragments inside the circle, offset depth proportionally
      #if defined(GL_EXT_frag_depth)
        if (r <= 1.0) {
          // Keep the center of the node slightly closer so coincident links
          // do not leak through overlapping nodes.
          float depthOffset = (1.0 - r) * 0.0001;
          gl_FragDepthEXT = gl_FragCoord.z - depthOffset;
        } else {
          gl_FragDepthEXT = gl_FragCoord.z;
        }
      #elif __VERSION__ >= 300
        if (r <= 1.0) {
          // Keep the center of the node slightly closer so coincident links
          // do not leak through overlapping nodes.
          float depthOffset = (1.0 - r) * 0.0001;
          gl_FragDepth = gl_FragCoord.z - depthOffset;
        } else {
          gl_FragDepth = gl_FragCoord.z;
        }
      #endif

      // Calculate texture atlas coordinates for image sprites
      float col = mod( vImageKey, imageDimensions );
      float row = floor( vImageKey / imageDimensions );

      vec2 uv = vec2( 0.0 );
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
var points_default = points;

// src/texture-atlas.js
var import_three = require("three");
var anchor2;
var TextureAtlas = class _TextureAtlas extends import_three.Texture {
  map = [];
  dimensions = 1;
  isTextureAtlas = true;
  constructor() {
    if (!anchor2) {
      anchor2 = document.createElement("a");
    }
    super(document.createElement("canvas"));
    this.flipY = false;
  }
  static Resolution = 1024;
  static getAbsoluteURL(path) {
    anchor2.href = path;
    return anchor2.href;
  }
  add(src) {
    const scope = this;
    let img, index;
    if (typeof src === "string") {
      index = this.indexOf(src);
      if (index >= 0) {
        img = this.map[index];
        if (img.complete) {
          onLoad();
        } else {
          img.addEventListener("load", onLoad, false);
        }
      } else {
        img = document.createElement("img");
        img.addEventListener("load", onLoad, false);
        img.src = src;
        index = this.map.length;
        this.map.push(img);
      }
    } else if (typeof src === "object" && "src" in src) {
      img = src;
      src = img.src;
      index = this.indexOf(src);
      if (index >= 0) {
        img = this.map[index];
      } else {
        index = this.map.length;
        this.map.push(img);
      }
      if (img.complete) {
        onLoad();
      } else {
        img.addEventListener("load", onLoad, false);
      }
    }
    this.dimensions = Math.ceil(Math.sqrt(this.map.length));
    return index;
    function onLoad() {
      img.removeEventListener("load", onLoad, false);
      scope.update();
    }
  }
  update() {
    const { image } = this;
    const ctx = image.getContext("2d");
    image.width = _TextureAtlas.Resolution;
    image.height = _TextureAtlas.Resolution;
    const dims = this.dimensions = Math.ceil(Math.sqrt(this.map.length));
    const width = image.width / dims;
    const height = image.height / dims;
    ctx.clearRect(0, 0, image.width, image.height);
    for (let i = 0; i < this.map.length; i++) {
      const col = i % dims;
      const row = Math.floor(i / dims);
      const img = this.map[i];
      const x = col / dims * image.width;
      const y = row / dims * image.height;
      ctx.drawImage(img, x, y, width, height);
    }
    this.needsUpdate = true;
  }
  indexOf(src) {
    const uri = _TextureAtlas.getAbsoluteURL(src);
    for (let i = 0; i < this.map.length; i++) {
      const img = this.map[i];
      if (uri === img.src) {
        return i;
      }
    }
    return -1;
  }
};

// src/points.js
var color = new import_three2.Color();
var Points = class extends import_three2.Points {
  constructor({ atlas, geometry }, uniforms) {
    const material = new import_three2.ShaderMaterial({
      uniforms: { ...import_three2.UniformsLib["fog"], ...{
        is2D: uniforms.is2D,
        sizeAttenuation: uniforms.sizeAttenuation,
        frustumSize: uniforms.frustumSize,
        nodeRadius: uniforms.nodeRadius,
        nodeScale: uniforms.nodeScale,
        imageDimensions: { value: atlas.dimensions },
        texturePositions: { value: null },
        textureTargetPositions: { value: null },
        textureAtlas: { value: atlas },
        size: uniforms.size,
        opacity: uniforms.opacity,
        uColor: uniforms.pointColor,
        inheritColors: uniforms.pointsInheritColor,
        uBeginning: uniforms.uBeginning,
        uEnding: uniforms.uEnding,
        uNodeAmount: uniforms.uNodeAmount
      } },
      vertexShader: points_default.vertexShader,
      fragmentShader: points_default.fragmentShader,
      transparent: true,
      vertexColors: true,
      fog: true
    });
    super(geometry, material);
    this.frustumCulled = false;
  }
  static parse(size2, data) {
    const atlas = new TextureAtlas();
    const vertices2 = [];
    const colors = [];
    const imageKeys = [];
    const sizes = [];
    return each(data.nodes, (_, i) => {
      const node = data.nodes[i];
      const x = i % size2 / size2;
      const y = Math.floor(i / size2) / size2;
      const z = i + 1;
      vertices2.push(x, y, z);
      if (node.color) {
        color.set(node.color);
        colors.push(color.r, color.g, color.b);
      } else {
        colors.push(1, 1, 1);
      }
      if (node.image) {
        imageKeys.push(atlas.add(node.image));
      } else {
        imageKeys.push(-1);
      }
      sizes.push(node.size != null ? node.size : 1);
    }).then(() => {
      const geometry = new import_three2.BufferGeometry();
      geometry.setAttribute(
        "position",
        new import_three2.Float32BufferAttribute(vertices2, 3)
      );
      geometry.setAttribute(
        "color",
        new import_three2.Float32BufferAttribute(colors, 3)
      );
      geometry.setAttribute(
        "imageKey",
        new import_three2.Float32BufferAttribute(imageKeys, 1)
      );
      geometry.setAttribute(
        "pointSize",
        new import_three2.Float32BufferAttribute(sizes, 1)
      );
      return { atlas, geometry };
    });
  }
};

// src/links.js
var import_three3 = require("three");

// src/shaders/links.js
var links = {
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
    uniform float linecap;
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

    float getRectDistance( vec2 point, vec2 start, vec2 end, vec2 extent ) {

      vec2 segment = end - start;
      float segmentLength = length( segment );

      if ( segmentLength <= 0.0 ) {
        return length( point - start ) - extent.y;
      }

      vec2 tangent = segment / segmentLength;
      vec2 normal = vec2( - tangent.y, tangent.x );
      vec2 local = vec2(
        dot( point - start, tangent ) - 0.5 * segmentLength,
        dot( point - start, normal )
      );
      vec2 delta = abs( local ) - extent;

      return length( max( delta, 0.0 ) ) + min( max( delta.x, delta.y ), 0.0 );

    }

    float getLinkDistance( vec2 point, vec2 start, vec2 end, float radius ) {

      vec2 segment = end - start;
      float segmentLength = length( segment );

      if ( segmentLength <= 0.0 ) {
        return length( point - start ) - radius;
      }

      if ( linecap < 0.5 ) {
        return getCapsuleDistance( point, start, end, radius );
      }

      if ( linecap < 1.5 ) {
        return getRectDistance(
          point,
          start,
          end,
          vec2( 0.5 * segmentLength, radius )
        );
      }

      return getRectDistance(
        point,
        start,
        end,
        vec2( 0.5 * segmentLength + radius, radius )
      );

    }

    void main() {

      if ( inRange < 0.5 ) {
        discard;
      }

      float segmentT = getSegmentT( gl_FragCoord.xy, vSource, vTarget );
      float distanceToCapsule = getLinkDistance(
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
  `
};
var links_default = links;

// src/links.js
var vertices = new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]);
var indices = [0, 1, 2, 2, 1, 3];
var Links = class extends import_three3.Mesh {
  constructor(geometry, uniforms) {
    const material = new import_three3.ShaderMaterial({
      uniforms: {
        ...import_three3.UniformsLib["fog"],
        ...{
          frustumSize: uniforms.frustumSize,
          is2D: uniforms.is2D,
          inheritColors: uniforms.linksInheritColor,
          linecap: uniforms.linecap,
          linewidth: uniforms.linewidth,
          opacity: uniforms.opacity,
          pixelRatio: uniforms.pixelRatio,
          resolution: uniforms.resolution,
          sizeAttenuation: uniforms.sizeAttenuation,
          texturePositions: { value: null },
          uColor: uniforms.linkColor,
          uBeginning: uniforms.uBeginning,
          uEnding: uniforms.uEnding,
          uNodeAmount: uniforms.uNodeAmount
        }
      },
      vertexShader: links_default.vertexShader,
      fragmentShader: links_default.fragmentShader,
      transparent: true,
      fog: true,
      side: import_three3.DoubleSide
    });
    super(geometry, material);
    this.frustumCulled = false;
  }
  static parse(points2, data) {
    const geometry = new import_three3.InstancedBufferGeometry();
    const sources = [];
    const targets = [];
    const sourceColors = [];
    const targetColors = [];
    const v = points2.geometry.attributes.position.array;
    const c = points2.geometry.attributes.color.array;
    geometry.setAttribute("position", new import_three3.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    return each(data.links, (_, i) => {
      const link2 = data.links[i];
      const sourceIndex = 3 * link2.sourceIndex;
      const targetIndex = 3 * link2.targetIndex;
      sources.push(v[sourceIndex + 0], v[sourceIndex + 1], v[sourceIndex + 2]);
      targets.push(v[targetIndex + 0], v[targetIndex + 1], v[targetIndex + 2]);
      sourceColors.push(
        c[sourceIndex + 0],
        c[sourceIndex + 1],
        c[sourceIndex + 2]
      );
      targetColors.push(
        c[targetIndex + 0],
        c[targetIndex + 1],
        c[targetIndex + 2]
      );
    }).then(() => {
      geometry.setAttribute(
        "source",
        new import_three3.InstancedBufferAttribute(new Float32Array(sources), 3)
      );
      geometry.setAttribute(
        "target",
        new import_three3.InstancedBufferAttribute(new Float32Array(targets), 3)
      );
      geometry.setAttribute(
        "sourceColor",
        new import_three3.InstancedBufferAttribute(new Float32Array(sourceColors), 3)
      );
      geometry.setAttribute(
        "targetColor",
        new import_three3.InstancedBufferAttribute(new Float32Array(targetColors), 3)
      );
      geometry.instanceCount = data.links.length;
      return geometry;
    });
  }
};

// src/labels.js
var import_three4 = require("three");

// src/shaders/labels.js
var labels = {
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
    uniform float nodeRadius;
    uniform float nodeScale;
    uniform float labelAlignment;
    uniform float labelBaseline;
    uniform float labelFontSize;
    uniform float labelNear;
    uniform vec2 labelOffset;

    attribute vec3 source;       // .xy = UV into texturePositions, .z = nodeIndex + 1
    attribute vec4 labelUV;      // .xy = atlas UV offset, .zw = atlas UV extent
    attribute float aspectRatio; // label quad width / height
    attribute float pointSize;   // per-node point size scalar
    attribute vec2 visibilityUV; // UV into placement visibility texture

    varying vec2 vLabelUV;
    varying vec2 vVisibilityUV;
    varying vec3 vColor;
    varying float vInRange;

    void main() {

      float nodeIndex  = source.z - 1.0;
      float rangeStart = uBeginning * uNodeAmount;
      float rangeEnd   = uEnding    * uNodeAmount;
      float inRange    = step( rangeStart, nodeIndex ) * ( 1.0 - step( rangeEnd, nodeIndex ) );

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
      vVisibilityUV = visibilityUV;
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
    uniform sampler2D textureVisibility;
    uniform float inheritColors;
    uniform float opacity;
    uniform vec3 uColor;

    varying vec2 vLabelUV;
    varying vec2 vVisibilityUV;
    varying vec3 vColor;
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

      gl_FragColor = vec4(
        texel.rgb * mix( vec3( 1.0 ), vColor, inheritColors ) * uColor,
        alpha
      );
      #include <fog_fragment>
    }
  `
};
var labels_default = labels;

// src/labels.js
var MODEL_VIEW_MATRIX = new import_three4.Matrix4();
var CAMERA_RIGHT = new import_three4.Vector3();
var CAMERA_UP = new import_three4.Vector3();
var LOCAL_NODE = new import_three4.Vector3();
var WORLD_CENTER = new import_three4.Vector3();
var WORLD_CORNER = new import_three4.Vector3();
var PROJECTED_CORNER = new import_three4.Vector3();
var MV_CENTER = new import_three4.Vector4();
var DRAWING_BUFFER_SIZE = new import_three4.Vector2();
var BASE_ATLAS_FONT_SIZE = 120;
var BASE_ATLAS_PADDING = 4;
var ATLAS_RASTER_SCALE = 2;
var DEFAULT_FONT_FAMILY = "Arial, sans-serif";
var DEFAULT_LABEL_CELL_SIZE = 32;
var LABEL_CAMERA_MOVE_EPSILON = 1e-4;
var LABEL_SOLVE_SETTLE_MS = 160;
var LABEL_SOLVE_BUILD_INTERVAL_MS = 80;
var LABEL_SOLVE_BATCH_SIZE = 192;
var LABEL_COMMIT_BATCH_SIZE = 16;
var LABEL_BACKGROUND_REFRESH_MS = 600;
var LABEL_PERSISTENCE_DECAY = 1;
var LABEL_PERSISTENCE_GAIN = 3;
var LABEL_PERSISTENCE_MAX = 12;
var LABEL_NODE_COLOR = new import_three4.Color();
var LabelAlignmentMap = {
  center: 0,
  left: 1,
  right: -1
};
var LabelBaselineMap = {
  top: 1,
  middle: 0,
  bottom: -1
};
function getLabelAlignmentName(value) {
  if (value > 0.5) {
    return "left";
  }
  if (value < -0.5) {
    return "right";
  }
  return "center";
}
function getLabelBaselineName(value) {
  if (value > 0.5) {
    return "top";
  }
  if (value < -0.5) {
    return "bottom";
  }
  return "middle";
}
function sanitizeLabelFontSize(fontSize) {
  if (!Number.isFinite(fontSize)) {
    return 1;
  }
  return Math.max(0.01, fontSize);
}
function sanitizeLabelNearDistance(nearDistance) {
  if (!Number.isFinite(nearDistance)) {
    return 0;
  }
  return Math.max(0, nearDistance);
}
function getNodeColorComponents(node) {
  if (node?.color) {
    LABEL_NODE_COLOR.set(node.color);
    return [LABEL_NODE_COLOR.r, LABEL_NODE_COLOR.g, LABEL_NODE_COLOR.b];
  }
  return [1, 1, 1];
}
function hasMeaningfulMatrixChange(previous, next, epsilon = LABEL_CAMERA_MOVE_EPSILON) {
  if (!previous || !next || previous.length !== next.length) {
    return true;
  }
  for (let i = 0; i < previous.length; i++) {
    if (Math.abs(previous[i] - next[i]) > epsilon) {
      return true;
    }
  }
  return false;
}
function serializeVisibilityNumber(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return Number(value).toFixed(4);
}
function getVisibilitySettingsKey({
  viewportWidth,
  viewportHeight,
  obscurity,
  is2D,
  sizeAttenuation,
  frustumSize,
  nodeRadius,
  nodeScale,
  labelAlignment,
  labelBaseline,
  labelFontSize,
  labelNear,
  labelOffsetX,
  labelOffsetY,
  beginning,
  ending
}) {
  return [
    viewportWidth,
    viewportHeight,
    serializeVisibilityNumber(obscurity),
    Number(Boolean(is2D)),
    Number(Boolean(sizeAttenuation)),
    serializeVisibilityNumber(frustumSize),
    serializeVisibilityNumber(nodeRadius),
    serializeVisibilityNumber(nodeScale),
    serializeVisibilityNumber(labelAlignment),
    serializeVisibilityNumber(labelBaseline),
    serializeVisibilityNumber(labelFontSize),
    serializeVisibilityNumber(labelNear),
    serializeVisibilityNumber(labelOffsetX),
    serializeVisibilityNumber(labelOffsetY),
    serializeVisibilityNumber(beginning),
    serializeVisibilityNumber(ending)
  ].join("|");
}
function setLabelVisibility(data, labelId, visible) {
  const offset = labelId * 4;
  const value = visible ? 255 : 0;
  data[offset + 0] = value;
  data[offset + 1] = value;
  data[offset + 2] = value;
  data[offset + 3] = value;
}
function layoutAtlasRows(items, maxTextureSize) {
  if (!Number.isFinite(maxTextureSize) || maxTextureSize <= 0) {
    return { fits: false, width: 0, height: 0, placements: [] };
  }
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let maxWidth = 0;
  const placements = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const width = Math.max(1, Math.ceil(item.labelWidth));
    const height = Math.max(1, Math.ceil(item.labelHeight));
    if (width > maxTextureSize || height > maxTextureSize) {
      return { fits: false, width: 0, height: 0, placements: [] };
    }
    if (x > 0 && x + width > maxTextureSize) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    placements.push({
      x,
      y,
      width,
      height
    });
    x += width;
    rowHeight = Math.max(rowHeight, height);
    maxWidth = Math.max(maxWidth, x);
    if (y + rowHeight > maxTextureSize) {
      return { fits: false, width: 0, height: 0, placements: [] };
    }
  }
  return {
    fits: true,
    width: Math.max(1, maxWidth),
    height: Math.max(1, y + rowHeight),
    placements
  };
}
function measureAtlasCandidate(tempCtx, rawItems, { requestedFontSize, requestedPadding, fontFamily, scale, maxTextureSize }) {
  const padding = Math.max(1, Math.round(requestedPadding * scale));
  const fontSize = Math.max(1, Math.round(requestedFontSize * scale));
  const tileH = fontSize + padding * 2;
  if (tileH > maxTextureSize) {
    return { fits: false };
  }
  tempCtx.font = `${fontSize}px ${fontFamily}`;
  const items = rawItems.map((item) => {
    const labelWidth = Math.ceil(tempCtx.measureText(item.text).width) + padding * 2;
    return {
      ...item,
      labelWidth,
      labelHeight: tileH,
      aspectRatio: labelWidth / tileH
    };
  });
  const layout = layoutAtlasRows(items, maxTextureSize);
  return {
    fits: layout.fits,
    padding,
    fontSize,
    tileH,
    items,
    layout
  };
}
function fitAtlasLayout(tempCtx, rawItems, { requestedFontSize, requestedPadding, fontFamily, maxTextureSize }) {
  let lo = 0;
  let hi = 1;
  let best = null;
  for (let i = 0; i < 12; i++) {
    const scale = (lo + hi) * 0.5;
    const candidate = measureAtlasCandidate(tempCtx, rawItems, {
      requestedFontSize,
      requestedPadding,
      fontFamily,
      scale,
      maxTextureSize
    });
    if (candidate.fits) {
      best = {
        ...candidate,
        scale
      };
      lo = scale;
    } else {
      hi = scale;
    }
  }
  if (best) {
    return best;
  }
  return measureAtlasCandidate(tempCtx, rawItems, {
    requestedFontSize,
    requestedPadding,
    fontFamily,
    scale: 0.01,
    maxTextureSize
  });
}
function buildTextAtlas(nodes, degrees = [], options = {}) {
  const fontScale = sanitizeLabelFontSize(options.fontSize);
  const atlasScale = ATLAS_RASTER_SCALE;
  const requestedPadding = Math.max(
    1,
    Math.round(BASE_ATLAS_PADDING * fontScale * atlasScale)
  );
  const requestedFontSize = Math.max(
    1,
    Math.round(BASE_ATLAS_FONT_SIZE * fontScale * atlasScale)
  );
  const fontFamily = options.fontFamily || DEFAULT_FONT_FAMILY;
  const maxTextureSize = Math.max(1, options.maxTextureSize || 16384);
  const textColor = "#fff";
  const temp = document.createElement("canvas");
  const tempCtx = temp.getContext("2d");
  tempCtx.font = `${requestedFontSize}px ${fontFamily}`;
  const rawItems = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.label === null || node.label === void 0) {
      continue;
    }
    const text = String(node.label);
    rawItems.push({
      text,
      nodeIndex: i,
      pointSize: typeof node.size === "number" && Number.isFinite(node.size) ? node.size : 1,
      basePriority: getLabelBasePriority(node, degrees[i] || 0)
    });
  }
  if (rawItems.length === 0) {
    return null;
  }
  const fittedAtlas = fitAtlasLayout(tempCtx, rawItems, {
    requestedFontSize,
    requestedPadding,
    fontFamily,
    maxTextureSize
  });
  if (!fittedAtlas.fits) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = fittedAtlas.layout.width;
  canvas.height = fittedAtlas.layout.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.font = `${fittedAtlas.fontSize}px ${fontFamily}`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const entries = [];
  for (let i = 0; i < fittedAtlas.items.length; i++) {
    const item = fittedAtlas.items[i];
    const placement = fittedAtlas.layout.placements[i];
    const px = placement.x;
    const py = placement.y;
    ctx.fillText(
      item.text,
      px + placement.width / 2,
      py + placement.height / 2
    );
    entries.push({
      ...item,
      labelId: i,
      stableId: item.nodeIndex,
      persistence: 0,
      atlasUV: {
        u: px / canvas.width,
        v: 1 - (py + placement.height) / canvas.height,
        uw: placement.width / canvas.width,
        uh: placement.height / canvas.height
      }
    });
  }
  return { canvas, entries };
}
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
function getVisibleQuota(obscurity, labelCount) {
  const quota = Math.round((1 - clamp01(obscurity)) * labelCount);
  return Math.max(0, Math.min(labelCount, quota));
}
function getLabelBasePriority(node, degree = 0) {
  if (typeof node.labelPriority === "number" && Number.isFinite(node.labelPriority)) {
    return node.labelPriority;
  }
  if (typeof node.size === "number" && Number.isFinite(node.size)) {
    return node.size;
  }
  if (Number.isFinite(degree)) {
    return degree;
  }
  return 0;
}
function compareLabelEntries(a, b) {
  if (b.basePriority !== a.basePriority) {
    return b.basePriority - a.basePriority;
  }
  return a.stableId - b.stableId;
}
function compareProjectedEntries(a, b) {
  if (b.entry.basePriority !== a.entry.basePriority) {
    return b.entry.basePriority - a.entry.basePriority;
  }
  const aPersistence = a.entry.persistence || 0;
  const bPersistence = b.entry.persistence || 0;
  if (bPersistence !== aPersistence) {
    return bPersistence - aPersistence;
  }
  if (b.depthPriority !== a.depthPriority) {
    return b.depthPriority - a.depthPriority;
  }
  return a.entry.stableId - b.entry.stableId;
}
function packCollisionCellKey(cellX, cellY, gridWidth) {
  return cellY * gridWidth + cellX;
}
function getPlacementTextureDimensions(itemCount) {
  const width = Math.max(1, Math.ceil(Math.sqrt(itemCount)));
  const height = Math.max(1, Math.ceil(itemCount / width));
  return { width, height };
}
function getLabelAlignmentOffset(alignment) {
  if (alignment > 0.5) {
    return 1;
  }
  if (alignment < -0.5) {
    return -1;
  }
  return 0;
}
function getLabelBaselineOffset(baseline) {
  if (baseline > 0.5) {
    return 1;
  }
  if (baseline < -0.5) {
    return -1;
  }
  return 0;
}
function intersectsBounds(a, b, margin = 0) {
  return !(a.maxX + margin <= b.minX || a.minX >= b.maxX + margin || a.maxY + margin <= b.minY || a.minY >= b.maxY + margin);
}
function getCollisionCellBounds(bounds, cellSize, gridWidth, gridHeight) {
  const minCellX = Math.max(0, Math.floor(bounds.minX / cellSize));
  const maxCellX = Math.min(gridWidth - 1, Math.floor(bounds.maxX / cellSize));
  const minCellY = Math.max(0, Math.floor(bounds.minY / cellSize));
  const maxCellY = Math.min(gridHeight - 1, Math.floor(bounds.maxY / cellSize));
  if (maxCellX < 0 || maxCellY < 0 || minCellX >= gridWidth || minCellY >= gridHeight) {
    return null;
  }
  return {
    minCellX,
    maxCellX,
    minCellY,
    maxCellY
  };
}
function projectLabelBounds({
  nodePosition,
  objectMatrixWorld,
  camera,
  viewportWidth,
  viewportHeight,
  frustumSize,
  is2D,
  sizeAttenuation,
  nodeRadius,
  nodeScale,
  aspectRatio,
  labelAlignment = 0,
  labelBaseline = 1,
  labelFontSize = 1,
  labelNear = 0,
  labelOffset = { x: 0, y: 0 },
  pointSize = 1
}) {
  LOCAL_NODE.copy(nodePosition);
  LOCAL_NODE.z *= 1 - Number(Boolean(is2D));
  MODEL_VIEW_MATRIX.multiplyMatrices(
    camera.matrixWorldInverse,
    objectMatrixWorld
  );
  MV_CENTER.set(LOCAL_NODE.x, LOCAL_NODE.y, LOCAL_NODE.z, 1);
  MV_CENTER.applyMatrix4(MODEL_VIEW_MATRIX);
  if (!Number.isFinite(MV_CENTER.z) || MV_CENTER.z >= 0) {
    return null;
  }
  const viewDistance = -MV_CENTER.z;
  const nearDistance = sanitizeLabelNearDistance(labelNear);
  if (viewDistance <= nearDistance) {
    return null;
  }
  const sizeScale = sizeAttenuation ? frustumSize / Math.max(viewDistance, 1e-3) : 1;
  const labelPixelHeight = 0.1 * nodeRadius * pointSize * nodeScale * sizeScale * sanitizeLabelFontSize(labelFontSize);
  const projectionScaleY = Math.max(
    Math.abs(camera.projectionMatrix.elements[5]),
    1e-4
  );
  const depthScale = camera.isPerspectiveCamera ? viewDistance : 1;
  const worldUnitsPerPixel = 2 * depthScale / Math.max(projectionScaleY * Math.max(viewportHeight, 1), 1e-3);
  const labelHeight = labelPixelHeight * worldUnitsPerPixel;
  const labelWidth = labelHeight * aspectRatio;
  const offsetX = (labelOffset?.x || 0) * labelHeight;
  const offsetY = (labelOffset?.y || 0) * labelHeight;
  WORLD_CENTER.copy(LOCAL_NODE).applyMatrix4(objectMatrixWorld);
  CAMERA_RIGHT.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  CAMERA_UP.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const anchor3 = WORLD_CORNER.copy(WORLD_CENTER).addScaledVector(
    CAMERA_RIGHT,
    labelWidth * 0.5 * getLabelAlignmentOffset(labelAlignment) + offsetX
  ).addScaledVector(
    CAMERA_UP,
    labelHeight * getLabelBaselineOffset(labelBaseline) + offsetY
  );
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let ix = -1; ix <= 1; ix += 2) {
    for (let iy = -1; iy <= 1; iy += 2) {
      PROJECTED_CORNER.copy(anchor3).addScaledVector(CAMERA_RIGHT, ix * labelWidth * 0.5).addScaledVector(CAMERA_UP, iy * labelHeight * 0.5).project(camera);
      if (!Number.isFinite(PROJECTED_CORNER.x) || !Number.isFinite(PROJECTED_CORNER.y)) {
        return null;
      }
      const x = (PROJECTED_CORNER.x * 0.5 + 0.5) * viewportWidth;
      const y = (1 - (PROJECTED_CORNER.y * 0.5 + 0.5)) * viewportHeight;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX <= 0 || maxY <= 0 || minX >= viewportWidth || minY >= viewportHeight) {
    return null;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) * 0.5,
    centerY: (minY + maxY) * 0.5,
    viewDistance,
    depthPriority: 1 / Math.max(viewDistance, 1e-3),
    clipped: minX < 0 || minY < 0 || maxX > viewportWidth || maxY > viewportHeight
  };
}
function createVisibilityTexture(labelCount) {
  const { width, height } = getPlacementTextureDimensions(labelCount);
  const data = new Uint8Array(width * height * 4);
  const texture = new import_three4.DataTexture(
    data,
    width,
    height,
    import_three4.RGBAFormat,
    import_three4.UnsignedByteType
  );
  texture.minFilter = import_three4.NearestFilter;
  texture.magFilter = import_three4.NearestFilter;
  texture.wrapS = import_three4.ClampToEdgeWrapping;
  texture.wrapT = import_three4.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return { data, texture, width, height };
}
function configureAtlasTexture(texture, options = {}) {
  const useMipmaps = Boolean(options.useMipmaps);
  texture.minFilter = useMipmaps ? import_three4.LinearMipmapLinearFilter : import_three4.LinearFilter;
  texture.magFilter = import_three4.LinearFilter;
  texture.wrapS = import_three4.ClampToEdgeWrapping;
  texture.wrapT = import_three4.ClampToEdgeWrapping;
  texture.generateMipmaps = useMipmaps;
  texture.needsUpdate = true;
  return texture;
}
var Labels = class extends import_three4.Mesh {
  constructor({ geometry, texture, entries, fontFamily }, uniforms) {
    const visibility = createVisibilityTexture(entries.length);
    const material = new import_three4.ShaderMaterial({
      uniforms: {
        ...import_three4.UniformsLib.fog,
        ...{
          texturePositions: { value: null },
          textureAtlas: { value: texture },
          textureVisibility: { value: visibility.texture },
          opacity: uniforms.opacity,
          frustumSize: uniforms.frustumSize,
          inheritColors: uniforms.labelsInheritColor,
          is2D: uniforms.is2D,
          sizeAttenuation: uniforms.sizeAttenuation,
          resolution: uniforms.resolution,
          nodeRadius: uniforms.nodeRadius,
          nodeScale: uniforms.nodeScale,
          uColor: uniforms.labelColor,
          labelAlignment: uniforms.labelAlignment,
          labelBaseline: uniforms.labelBaseline,
          labelFontSize: uniforms.labelFontSize,
          labelNear: uniforms.labelNear,
          labelOffset: uniforms.labelOffset,
          uBeginning: uniforms.uBeginning,
          uEnding: uniforms.uEnding,
          uNodeAmount: uniforms.uNodeAmount
        }
      },
      vertexShader: labels_default.vertexShader,
      fragmentShader: labels_default.fragmentShader,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      depthTest: false,
      fog: true
    });
    super(geometry, material);
    this.frustumCulled = false;
    this.entries = entries;
    this.sortedEntries = entries.slice().sort(compareLabelEntries);
    this.visibility = visibility;
    this.positionsBuffer = new Float32Array(0);
    this.projectedEntries = [];
    this.selectionGrid = /* @__PURE__ */ new Map();
    this.acceptedEntries = [];
    this.obscurity = uniforms.obscurity;
    this.userData.fontFamily = fontFamily || DEFAULT_FONT_FAMILY;
    this.userData.fontSize = uniforms.labelFontSize.value;
    this.userData.near = sanitizeLabelNearDistance(uniforms.labelNear.value);
    this.onBeforeRender = (renderer, _scene, camera) => {
      if (this.visible) {
        this.updateVisibility(renderer, camera);
      }
    };
  }
  ensurePositionsBuffer(size2) {
    const requiredLength = size2 * size2 * 4;
    if (this.positionsBuffer.length !== requiredLength) {
      this.positionsBuffer = new Float32Array(requiredLength);
    }
  }
  invalidateVisibility({ deferUntilSettled = true } = {}) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.userData.visibilityDirty = true;
    this.userData.resolveState = null;
    if (deferUntilSettled) {
      this.userData.lastCameraMotionTime = now;
    }
  }
  updateCameraState(camera, now) {
    const nextMatrix = camera.matrixWorld.elements;
    const nextProjection = camera.projectionMatrix.elements;
    if (!this.userData.cameraMatrix) {
      this.userData.cameraMatrix = new Float32Array(nextMatrix);
      this.userData.cameraProjection = new Float32Array(nextProjection);
      return false;
    }
    const moved = hasMeaningfulMatrixChange(this.userData.cameraMatrix, nextMatrix) || hasMeaningfulMatrixChange(this.userData.cameraProjection, nextProjection);
    if (moved) {
      this.userData.cameraMatrix.set(nextMatrix);
      this.userData.cameraProjection.set(nextProjection);
      this.userData.lastCameraMotionTime = now;
      this.userData.visibilityDirty = true;
      this.userData.resolveState = null;
    }
    return moved;
  }
  getVisibilitySettingsKey(viewportWidth, viewportHeight) {
    const uniforms = this.material.uniforms;
    return getVisibilitySettingsKey({
      viewportWidth,
      viewportHeight,
      obscurity: this.obscurity.value,
      is2D: uniforms.is2D.value,
      sizeAttenuation: uniforms.sizeAttenuation.value,
      frustumSize: uniforms.frustumSize.value,
      nodeRadius: uniforms.nodeRadius.value,
      nodeScale: uniforms.nodeScale.value,
      labelAlignment: uniforms.labelAlignment.value,
      labelBaseline: uniforms.labelBaseline.value,
      labelFontSize: uniforms.labelFontSize.value,
      labelNear: uniforms.labelNear.value,
      labelOffsetX: uniforms.labelOffset.value.x,
      labelOffsetY: uniforms.labelOffset.value.y,
      beginning: uniforms.uBeginning.value,
      ending: uniforms.uEnding.value
    });
  }
  decayPersistence() {
    if (!this.userData.persistentEntries) {
      this.userData.persistentEntries = /* @__PURE__ */ new Set();
    }
    for (const entry of this.userData.persistentEntries) {
      entry.persistence = Math.max(
        0,
        (entry.persistence || 0) - LABEL_PERSISTENCE_DECAY
      );
      if (entry.persistence <= 0) {
        this.userData.persistentEntries.delete(entry);
      }
    }
  }
  boostPersistence(entries) {
    if (!this.userData.persistentEntries) {
      this.userData.persistentEntries = /* @__PURE__ */ new Set();
    }
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i].entry;
      entry.persistence = Math.min(
        (entry.persistence || 0) + LABEL_PERSISTENCE_GAIN,
        LABEL_PERSISTENCE_MAX
      );
      this.userData.persistentEntries.add(entry);
    }
  }
  projectEntry(entry, camera, viewportWidth, viewportHeight) {
    const index = entry.nodeIndex * 4;
    const bounds = projectLabelBounds({
      nodePosition: {
        x: this.positionsBuffer[index + 0],
        y: this.positionsBuffer[index + 1],
        z: this.positionsBuffer[index + 2]
      },
      objectMatrixWorld: this.matrixWorld,
      camera,
      viewportWidth,
      viewportHeight,
      frustumSize: this.material.uniforms.frustumSize.value,
      is2D: this.material.uniforms.is2D.value,
      sizeAttenuation: this.material.uniforms.sizeAttenuation.value,
      nodeRadius: this.material.uniforms.nodeRadius.value,
      nodeScale: this.material.uniforms.nodeScale.value,
      aspectRatio: entry.aspectRatio,
      labelAlignment: this.material.uniforms.labelAlignment.value,
      labelBaseline: this.material.uniforms.labelBaseline.value,
      labelFontSize: this.material.uniforms.labelFontSize.value,
      labelNear: this.material.uniforms.labelNear.value,
      labelOffset: this.material.uniforms.labelOffset.value,
      pointSize: entry.pointSize
    });
    if (!bounds) {
      return null;
    }
    return {
      entry,
      bounds,
      depthPriority: bounds.depthPriority
    };
  }
  computeCellSize(entries) {
    if (!entries || entries.length === 0) {
      return this.userData.cachedCellSize || DEFAULT_LABEL_CELL_SIZE;
    }
    let totalHeight = 0;
    for (let i = 0; i < entries.length; i++) {
      totalHeight += entries[i].bounds.height;
    }
    return Math.max(
      12,
      Math.min(
        96,
        totalHeight / Math.max(entries.length, 1) || this.userData.cachedCellSize || DEFAULT_LABEL_CELL_SIZE
      )
    );
  }
  tryAcceptProjected(projected, state) {
    const cellBounds = getCollisionCellBounds(
      projected.bounds,
      state.cellSize,
      state.gridWidth,
      state.gridHeight
    );
    if (!cellBounds) {
      return false;
    }
    const seen = /* @__PURE__ */ new Set();
    let collides = false;
    for (let cy = cellBounds.minCellY; cy <= cellBounds.maxCellY && !collides; cy++) {
      for (let cx = cellBounds.minCellX; cx <= cellBounds.maxCellX; cx++) {
        const key = packCollisionCellKey(cx, cy, state.gridWidth);
        const bucket = state.targetSelectionGrid.get(key);
        if (!bucket) {
          continue;
        }
        for (let j = 0; j < bucket.length; j++) {
          const accepted = bucket[j];
          if (seen.has(accepted.entry.labelId)) {
            continue;
          }
          seen.add(accepted.entry.labelId);
          if (intersectsBounds(projected.bounds, accepted.bounds, 2)) {
            collides = true;
            break;
          }
        }
      }
    }
    if (collides) {
      return false;
    }
    state.targetAcceptedEntries.push(projected);
    state.targetAcceptedLabelIds.add(projected.entry.labelId);
    for (let cy = cellBounds.minCellY; cy <= cellBounds.maxCellY; cy++) {
      for (let cx = cellBounds.minCellX; cx <= cellBounds.maxCellX; cx++) {
        const key = packCollisionCellKey(cx, cy, state.gridWidth);
        const bucket = state.targetSelectionGrid.get(key);
        if (bucket) {
          bucket.push(projected);
        } else {
          state.targetSelectionGrid.set(key, [projected]);
        }
      }
    }
    return true;
  }
  readPositions(renderer, size2, renderTarget) {
    this.ensurePositionsBuffer(size2);
    const activeRenderTarget = renderer.getRenderTarget();
    try {
      renderer.readRenderTargetPixels(
        renderTarget,
        0,
        0,
        size2,
        size2,
        this.positionsBuffer
      );
      renderer.setRenderTarget(activeRenderTarget);
      return true;
    } catch (error) {
      if (!this.userData.didWarnPlacementReadback) {
        console.warn(
          "Force Directed Graph: label placement readback failed.",
          error
        );
        this.userData.didWarnPlacementReadback = true;
      }
      renderer.setRenderTarget(activeRenderTarget);
      return false;
    }
  }
  beginResolveSession(renderer, camera, size2, renderTarget, viewportWidth, viewportHeight, quota, now) {
    if (!this.readPositions(renderer, size2, renderTarget)) {
      this.applyPriorityQuotaOnly();
      this.userData.visibilityDirty = false;
      this.userData.resolveState = null;
      return;
    }
    this.decayPersistence();
    const estimateEntries = [];
    for (let i = 0; i < this.acceptedEntries.length; i++) {
      const projected = this.projectEntry(
        this.acceptedEntries[i].entry,
        camera,
        viewportWidth,
        viewportHeight
      );
      if (projected) {
        estimateEntries.push(projected);
      }
    }
    const cellSize = this.computeCellSize(estimateEntries);
    const gridWidth = Math.max(1, Math.ceil(viewportWidth / cellSize));
    const gridHeight = Math.max(1, Math.ceil(viewportHeight / cellSize));
    this.userData.resolveState = {
      phase: "building",
      quota,
      cellSize,
      gridWidth,
      gridHeight,
      viewportWidth,
      viewportHeight,
      candidateCursor: 0,
      targetAcceptedEntries: [],
      targetAcceptedLabelIds: /* @__PURE__ */ new Set(),
      targetSelectionGrid: /* @__PURE__ */ new Map(),
      pendingAdditions: [],
      pendingRemovals: [],
      currentEntriesById: /* @__PURE__ */ new Map(),
      targetEntriesById: /* @__PURE__ */ new Map()
    };
    this.userData.lastResolveBuildTime = now;
  }
  buildResolveBatch(renderer, camera, size2, renderTarget, now) {
    const state = this.userData.resolveState;
    if (!state || state.phase !== "building" || now - (this.userData.lastResolveBuildTime || 0) < LABEL_SOLVE_BUILD_INTERVAL_MS) {
      return;
    }
    this.userData.lastResolveBuildTime = now;
    if (!this.readPositions(renderer, size2, renderTarget)) {
      this.applyPriorityQuotaOnly();
      this.userData.visibilityDirty = false;
      this.userData.resolveState = null;
      return;
    }
    const batch = [];
    while (batch.length < LABEL_SOLVE_BATCH_SIZE && state.candidateCursor < this.sortedEntries.length) {
      const entry = this.sortedEntries[state.candidateCursor++];
      const projected = this.projectEntry(
        entry,
        camera,
        state.viewportWidth,
        state.viewportHeight
      );
      if (projected) {
        batch.push(projected);
      }
    }
    batch.sort(compareProjectedEntries);
    for (let i = 0; i < batch.length; i++) {
      if (state.targetAcceptedEntries.length >= state.quota) {
        break;
      }
      this.tryAcceptProjected(batch[i], state);
    }
    if (state.targetAcceptedEntries.length >= state.quota || state.candidateCursor >= this.sortedEntries.length) {
      state.phase = "committing";
      state.currentEntriesById = new Map(
        this.acceptedEntries.map((projected) => [projected.entry.labelId, projected])
      );
      state.targetEntriesById = new Map(
        state.targetAcceptedEntries.map((projected) => [
          projected.entry.labelId,
          projected
        ])
      );
      state.pendingRemovals = this.acceptedEntries.filter(
        (projected) => !state.targetEntriesById.has(projected.entry.labelId)
      );
      state.pendingAdditions = state.targetAcceptedEntries.filter(
        (projected) => !state.currentEntriesById.has(projected.entry.labelId)
      );
    }
  }
  applyCommitBatch() {
    const state = this.userData.resolveState;
    if (!state || state.phase !== "committing") {
      return;
    }
    let processed = 0;
    while (processed < LABEL_COMMIT_BATCH_SIZE && (state.pendingRemovals.length > 0 || state.pendingAdditions.length > 0)) {
      if (state.pendingRemovals.length > 0) {
        const projected = state.pendingRemovals.shift();
        state.currentEntriesById.delete(projected.entry.labelId);
        setLabelVisibility(this.visibility.data, projected.entry.labelId, false);
        processed += 1;
      }
      if (processed < LABEL_COMMIT_BATCH_SIZE && state.pendingAdditions.length > 0) {
        const projected = state.pendingAdditions.shift();
        state.currentEntriesById.set(projected.entry.labelId, projected);
        setLabelVisibility(this.visibility.data, projected.entry.labelId, true);
        processed += 1;
      }
    }
    this.acceptedEntries = Array.from(state.currentEntriesById.values());
    this.visibility.texture.needsUpdate = true;
    if (state.pendingRemovals.length === 0 && state.pendingAdditions.length === 0) {
      this.acceptedEntries = state.targetAcceptedEntries.slice();
      this.userData.cachedCellSize = state.cellSize;
      this.userData.resolveState = null;
      this.userData.visibilityDirty = false;
      this.userData.lastResolvedTime = typeof performance !== "undefined" ? performance.now() : Date.now();
      this.boostPersistence(this.acceptedEntries);
    }
  }
  applyPriorityQuotaOnly() {
    this.visibility.data.fill(0);
    const quota = getVisibleQuota(this.obscurity.value, this.entries.length);
    for (let i = 0; i < quota; i++) {
      const entry = this.sortedEntries[i];
      setLabelVisibility(this.visibility.data, entry.labelId, true);
    }
    this.visibility.texture.needsUpdate = true;
  }
  updateVisibility(renderer, camera) {
    const graph = this.parent;
    const { gpgpu, uniforms, variables } = graph?.userData || {};
    if (!graph || !gpgpu || !variables?.positions || !uniforms?.size) {
      return;
    }
    const size2 = uniforms.size.value;
    if (!Number.isFinite(size2) || size2 <= 0) {
      return;
    }
    const renderTarget = gpgpu.getCurrentRenderTarget(variables.positions);
    if (!renderTarget) {
      return;
    }
    renderer.getDrawingBufferSize(DRAWING_BUFFER_SIZE);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const viewportWidth = DRAWING_BUFFER_SIZE.x;
    const viewportHeight = DRAWING_BUFFER_SIZE.y;
    const quota = getVisibleQuota(this.obscurity.value, this.entries.length);
    const settingsKey = this.getVisibilitySettingsKey(
      viewportWidth,
      viewportHeight
    );
    if (this.userData.settingsKey !== settingsKey) {
      const deferUntilSettled = this.acceptedEntries.length > 0;
      this.userData.settingsKey = settingsKey;
      this.invalidateVisibility({ deferUntilSettled });
    }
    const cameraMoved = this.updateCameraState(camera, now);
    if (quota <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      this.acceptedEntries.length = 0;
      this.visibility.data.fill(0);
      this.visibility.texture.needsUpdate = true;
      this.userData.visibilityDirty = false;
      this.userData.resolveState = null;
      return;
    }
    if (cameraMoved) {
      return;
    }
    if (!this.userData.visibilityDirty && !this.userData.resolveState && now - (this.userData.lastResolvedTime || 0) >= LABEL_BACKGROUND_REFRESH_MS) {
      this.invalidateVisibility({ deferUntilSettled: false });
    }
    if (!this.userData.visibilityDirty && !this.userData.resolveState) {
      return;
    }
    if (now - (this.userData.lastCameraMotionTime || 0) < LABEL_SOLVE_SETTLE_MS) {
      return;
    }
    if (!this.userData.resolveState) {
      this.beginResolveSession(
        renderer,
        camera,
        size2,
        renderTarget,
        viewportWidth,
        viewportHeight,
        quota,
        now
      );
      return;
    }
    if (this.userData.resolveState?.phase === "building") {
      this.buildResolveBatch(renderer, camera, size2, renderTarget, now);
    }
    if (this.userData.resolveState?.phase === "committing") {
      this.applyCommitBatch();
    }
  }
  dispose() {
    this.material.uniforms.textureAtlas.value?.dispose?.();
    this.material.uniforms.textureVisibility.value?.dispose?.();
    this.material.dispose();
    this.geometry.dispose();
  }
  replaceData({ geometry, texture, entries, fontFamily, fontSize }) {
    this.geometry.dispose();
    this.material.uniforms.textureAtlas.value?.dispose?.();
    this.material.uniforms.textureVisibility.value?.dispose?.();
    this.geometry = geometry;
    this.entries = entries;
    this.sortedEntries = entries.slice().sort(compareLabelEntries);
    this.visibility = createVisibilityTexture(entries.length);
    this.material.uniforms.textureAtlas.value = texture;
    this.material.uniforms.textureVisibility.value = this.visibility.texture;
    this.projectedEntries.length = 0;
    this.selectionGrid.clear();
    this.acceptedEntries.length = 0;
    this.userData.fontFamily = fontFamily || DEFAULT_FONT_FAMILY;
    this.userData.fontSize = sanitizeLabelFontSize(fontSize);
    this.userData.near = sanitizeLabelNearDistance(
      this.material.uniforms.labelNear.value
    );
    this.userData.cachedCellSize = DEFAULT_LABEL_CELL_SIZE;
    this.visibility.data.fill(0);
    this.visibility.texture.needsUpdate = true;
    this.invalidateVisibility({ deferUntilSettled: false });
  }
  get fontSize() {
    if (this.parent?.userData?.uniforms?.labelFontSize) {
      return this.parent.userData.uniforms.labelFontSize.value;
    }
    return this.userData.fontSize;
  }
  set fontSize(v) {
    const nextValue = sanitizeLabelFontSize(v);
    this.userData.fontSize = nextValue;
    if (!this.material?.uniforms?.labelFontSize) {
      return;
    }
    if (this.material.uniforms.labelFontSize.value === nextValue) {
      return;
    }
    this.material.uniforms.labelFontSize.value = nextValue;
    this.invalidateVisibility({ deferUntilSettled: false });
  }
  get fontFamily() {
    if (this.parent?.userData?.labelFontFamily) {
      return this.parent.userData.labelFontFamily;
    }
    return this.userData.fontFamily;
  }
  set fontFamily(v) {
    const nextValue = typeof v === "string" && v.trim().length > 0 ? v.trim() : DEFAULT_FONT_FAMILY;
    this.userData.fontFamily = nextValue;
    if (!this.parent?.userData) {
      return;
    }
    if (this.parent.userData.labelFontFamily === nextValue) {
      return;
    }
    this.parent.userData.labelFontFamily = nextValue;
    this.parent.refreshLabels();
  }
  get alignment() {
    return getLabelAlignmentName(this.material.uniforms.labelAlignment.value);
  }
  set alignment(v) {
    this.material.uniforms.labelAlignment.value = LabelAlignmentMap[v] ?? LabelAlignmentMap.center;
    this.invalidateVisibility({ deferUntilSettled: false });
  }
  get baseline() {
    return getLabelBaselineName(this.material.uniforms.labelBaseline.value);
  }
  set baseline(v) {
    this.material.uniforms.labelBaseline.value = LabelBaselineMap[v] ?? LabelBaselineMap.top;
    this.invalidateVisibility({ deferUntilSettled: false });
  }
  get offset() {
    return this.material.uniforms.labelOffset.value;
  }
  set offset(v) {
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
      return;
    }
    this.material.uniforms.labelOffset.value.set(v.x, v.y);
    this.invalidateVisibility({ deferUntilSettled: false });
  }
  get near() {
    if (this.parent?.userData?.uniforms?.labelNear) {
      return this.parent.userData.uniforms.labelNear.value;
    }
    return this.userData.near;
  }
  set near(v) {
    const nextValue = sanitizeLabelNearDistance(v);
    this.userData.near = nextValue;
    if (!this.material?.uniforms?.labelNear) {
      return;
    }
    if (this.material.uniforms.labelNear.value === nextValue) {
      return;
    }
    this.material.uniforms.labelNear.value = nextValue;
    this.invalidateVisibility({ deferUntilSettled: false });
  }
  static parse(size2, data, options = {}) {
    const atlas = buildTextAtlas(data.nodes, options.degrees || [], options);
    if (!atlas) {
      return Promise.resolve(null);
    }
    const { canvas, entries } = atlas;
    const quadVerts = new Float32Array([
      -1,
      -1,
      0,
      1,
      -1,
      0,
      -1,
      1,
      0,
      1,
      1,
      0
    ]);
    const quadUVs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    const quadIdx = [0, 1, 2, 2, 1, 3];
    const geometry = new import_three4.InstancedBufferGeometry();
    geometry.setAttribute("position", new import_three4.BufferAttribute(quadVerts, 3));
    geometry.setAttribute("uv", new import_three4.BufferAttribute(quadUVs, 2));
    geometry.setIndex(quadIdx);
    const sources = [];
    const colors = [];
    const labelUVs = [];
    const aspectRatios = [];
    const pointSizes = [];
    const visibilityUVs = [];
    const { width: visibilityWidth, height: visibilityHeight } = getPlacementTextureDimensions(entries.length);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const x = entry.nodeIndex % size2 / size2;
      const y = Math.floor(entry.nodeIndex / size2) / size2;
      const z = entry.nodeIndex + 1;
      sources.push(x, y, z);
      colors.push(...getNodeColorComponents(data.nodes[entry.nodeIndex]));
      labelUVs.push(
        entry.atlasUV.u,
        entry.atlasUV.v,
        entry.atlasUV.uw,
        entry.atlasUV.uh
      );
      aspectRatios.push(entry.aspectRatio);
      pointSizes.push(entry.pointSize);
      visibilityUVs.push(
        (entry.labelId % visibilityWidth + 0.5) / visibilityWidth,
        (Math.floor(entry.labelId / visibilityWidth) + 0.5) / visibilityHeight
      );
    }
    geometry.setAttribute(
      "source",
      new import_three4.InstancedBufferAttribute(new Float32Array(sources), 3)
    );
    geometry.setAttribute(
      "color",
      new import_three4.InstancedBufferAttribute(new Float32Array(colors), 3)
    );
    geometry.setAttribute(
      "labelUV",
      new import_three4.InstancedBufferAttribute(new Float32Array(labelUVs), 4)
    );
    geometry.setAttribute(
      "aspectRatio",
      new import_three4.InstancedBufferAttribute(new Float32Array(aspectRatios), 1)
    );
    geometry.setAttribute(
      "pointSize",
      new import_three4.InstancedBufferAttribute(new Float32Array(pointSizes), 1)
    );
    geometry.setAttribute(
      "visibilityUV",
      new import_three4.InstancedBufferAttribute(new Float32Array(visibilityUVs), 2)
    );
    geometry.instanceCount = entries.length;
    const texture = configureAtlasTexture(new import_three4.CanvasTexture(canvas), options);
    return Promise.resolve({
      geometry,
      texture,
      entries,
      fontFamily: options.fontFamily || DEFAULT_FONT_FAMILY,
      fontSize: sanitizeLabelFontSize(options.fontSize)
    });
  }
};

// src/registry.js
var Registry = class {
  map = {};
  constructor(list) {
    if (list && list.length > 0) {
      for (let i = 0; i < list.length; i++) {
        this.set(i, list[i]);
      }
    }
  }
  get(id) {
    return this.map[id];
  }
  set(index, item) {
    if (item.id !== "undefined") {
      this.map[item.id] = index;
    }
  }
  clear() {
    this.map = {};
  }
};

// src/hit.js
var import_three5 = require("three");

// src/shaders/hit.js
var hit = {
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

    attribute float pointSize;

    varying vec3 vColor;
    varying float vDistance;

    void main() {

      float nodeIndex  = position.z - 1.0;
      float rangeStart = uBeginning * uNodeAmount;
      float rangeEnd   = uEnding   * uNodeAmount;
      float inRange    = step( rangeStart, nodeIndex ) * ( 1.0 - step( rangeEnd, nodeIndex ) );

      if ( inRange < 0.5 ) {
        gl_PointSize = 0.0;
        gl_Position  = vec4( 0.0, 0.0, 10000.0, 1.0 );
        return;
      }

      vec4 texel = texture2D( texturePositions, position.xy );
      vec3 vPosition = texel.xyz;
      vPosition.z *= 1.0 - is2D;

      vec4 mvPosition = modelViewMatrix * vec4( vPosition, 1.0 );

      gl_PointSize = nodeRadius * pointSize * nodeScale;
      gl_PointSize *= mix( 1.0, frustumSize / - mvPosition.z, sizeAttenuation );
      gl_PointSize *= hitScale;

      vDistance = 1.0 / - mvPosition.z;

      float r = mod( position.z, 255.0 ) / 255.0;
      float g = mod( floor( position.z / 255.0 ), 255.0 ) / 255.0;
      float b = mod( floor( position.z / pow( 255.0, 2.0 ) ), 255.0 ) / 255.0;
      vColor = vec3( r, g, b );

      gl_Position = projectionMatrix * mvPosition;

    }
  `,
  fragmentShader: `
    uniform float sizeAttenuation;
    uniform float frustumSize;

    varying vec3 vColor;
    varying float vDistance;

    ${circle}

    void main() {
      vec2 uv = 2.0 * vec2( gl_PointCoord ) - 1.0;
      float t = circle( uv, vec2( 0.0, 0.0 ), 0.5, 0.0 );
      gl_FragColor = vec4( vColor, t );
    }
  `
};
var hit_default = hit;

// src/hit.js
var color2 = new import_three5.Color();
var Hit = class {
  parent = null;
  renderTarget = new import_three5.WebGLRenderTarget(1, 1);
  width = 1;
  height = 1;
  ratio = 1;
  material = null;
  helper = null;
  constructor(fdg) {
    this.parent = fdg;
    this.helper = new import_three5.Sprite(new import_three5.SpriteMaterial({
      map: this.renderTarget.texture
    }));
    this.material = new import_three5.ShaderMaterial({
      uniforms: {
        hitScale: { value: 2 }
      },
      vertexShader: hit_default.vertexShader,
      fragmentShader: hit_default.fragmentShader,
      transparent: true
    });
  }
  inherit(mesh) {
    this.material.uniforms = {
      ...this.material.uniforms,
      ...mesh.material.uniforms
    };
  }
  setSize(width, height) {
    const { helper, ratio, renderTarget } = this;
    const w = width * ratio;
    const h = height * ratio;
    if (this.width !== width || this.height !== height) {
      this.width = width;
      this.height = height;
      renderTarget.setSize(w, h);
      helper.scale.set(w, h, 1);
    }
  }
  compute(renderer, camera) {
    const { parent } = this;
    const renderTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.renderTarget);
    const material = parent.points.material;
    const visible = parent.links.visible;
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(color2);
    parent.points.material = this.material;
    parent.links.visible = false;
    renderer.setClearColor(0, 0);
    renderer.render(parent, camera);
    parent.points.material = material;
    parent.links.visible = visible;
    renderer.setRenderTarget(renderTarget);
    renderer.setClearColor(color2, alpha);
  }
  dispose() {
    this.parent = null;
    this.renderTarget = new import_three5.WebGLRenderTarget(1, 1);
    this.width = 1;
    this.height = 1;
    this.ratio = 1;
    this.material.dispose();
    this.helper.geometry.dispose();
    this.helper.material.dispose();
    this.material = null;
    this.helper = null;
  }
};

// src/inline-worker-factory.js
function createWorkerCode(wasmUrl) {
  return `
let wasmModule = null;
let wasmReady = false;
const MAX_TEXTURE_SIZE = 4096;
const MAX_BUFFER_BYTES = 512 * 1024 * 1024;

class InputValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputValidationError';
  }
}

class WasmMemoryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WasmMemoryError';
  }
}

function buildLinkTextureData(links, nodeAmount, textureSize) {
  const totalElements = textureSize * textureSize;
  const linksData = new Float32Array(totalElements * 4);
  const linkRangesData = new Float32Array(totalElements * 4);
  const linksByNode = Array.from({ length: nodeAmount }, () => []);
  const packedLinks = [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const sourceIndex = link.sourceIndex;
    const targetIndex = link.targetIndex;
    const isValid =
      Number.isInteger(sourceIndex) &&
      Number.isInteger(targetIndex) &&
      sourceIndex >= 0 &&
      targetIndex >= 0 &&
      sourceIndex < nodeAmount &&
      targetIndex < nodeAmount;

    if (!isValid) {
      continue;
    }

    linksByNode[sourceIndex].push(link);
    if (targetIndex !== sourceIndex) {
      linksByNode[targetIndex].push(link);
    }
  }

  for (let i = 0; i < nodeAmount; i++) {
    const incident = linksByNode[i];
    const rangeOffset = i * 4;
    linkRangesData[rangeOffset + 0] = packedLinks.length;
    linkRangesData[rangeOffset + 1] = incident.length;

    for (let j = 0; j < incident.length; j++) {
      packedLinks.push(incident[j]);
    }
  }

  if (packedLinks.length > totalElements) {
    throw new Error(
      \`Packed links (\${packedLinks.length}) exceed texture capacity (\${totalElements}).\`
    );
  }

  for (let i = 0; i < packedLinks.length; i++) {
    const link = packedLinks[i];
    const sourceIndex = link.sourceIndex;
    const targetIndex = link.targetIndex;
    const linkOffset = i * 4;

    linksData[linkOffset + 0] = (sourceIndex % textureSize) / textureSize;
    linksData[linkOffset + 1] = Math.floor(sourceIndex / textureSize) / textureSize;
    linksData[linkOffset + 2] = (targetIndex % textureSize) / textureSize;
    linksData[linkOffset + 3] = Math.floor(targetIndex / textureSize) / textureSize;
  }

  return {
    linksData,
    linkRangesData,
    packedLinkAmount: packedLinks.length,
  };
}

function getPackedLinkRequirement(links, nodeAmount) {
  let packed = 0;
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (!link || typeof link !== 'object') {
      continue;
    }
    const sourceIndex = link.sourceIndex;
    const targetIndex = link.targetIndex;
    const isValid =
      Number.isInteger(sourceIndex) &&
      Number.isInteger(targetIndex) &&
      sourceIndex >= 0 &&
      targetIndex >= 0 &&
      sourceIndex < nodeAmount &&
      targetIndex < nodeAmount;

    if (!isValid) {
      continue;
    }

    packed += sourceIndex === targetIndex ? 1 : 2;
  }
  return packed;
}

function validateInput(data) {
  const { nodes, links, textureSize, frustumSize } = data;

  if (!Array.isArray(nodes)) {
    throw new InputValidationError('Invalid input: nodes must be an array');
  }
  if (!Array.isArray(links)) {
    throw new InputValidationError('Invalid input: links must be an array');
  }
  if (!Number.isInteger(textureSize) || textureSize <= 0) {
    throw new InputValidationError('Invalid input: textureSize must be a positive integer');
  }
  if (textureSize > MAX_TEXTURE_SIZE) {
    throw new InputValidationError(
      'Invalid input: textureSize ' + textureSize + ' exceeds max ' + MAX_TEXTURE_SIZE
    );
  }
  if ((textureSize & (textureSize - 1)) !== 0) {
    throw new InputValidationError('Invalid input: textureSize must be a power of 2');
  }
  if (!Number.isFinite(frustumSize) || frustumSize <= 0) {
    throw new InputValidationError('Invalid input: frustumSize must be a finite positive number');
  }

  const totalElements = textureSize * textureSize;
  const nodesDataSize = nodes.length * 4 * 4;
  const linksDataSize = links.length * 2 * 4;
  const positionsSize = totalElements * 4 * 4;
  const linksTextureSize = totalElements * 4 * 4;
  const linkRangesTextureSize = totalElements * 4 * 4;
  const requiredPackedLinks = getPackedLinkRequirement(links, nodes.length);
  const totalBytes =
    nodesDataSize + linksDataSize + positionsSize + linksTextureSize + linkRangesTextureSize;

  if (requiredPackedLinks > totalElements) {
    throw new InputValidationError(
      'Packed links (' + requiredPackedLinks + ') exceed texture capacity (' + totalElements + ')'
    );
  }
  if (totalBytes > MAX_BUFFER_BYTES) {
    throw new WasmMemoryError(
      'Input requires ' + totalBytes + ' bytes, exceeding ' + MAX_BUFFER_BYTES + ' byte worker limit'
    );
  }

  return {
    totalElements,
    nodesDataSize,
    linksDataSize,
    positionsSize,
    linksTextureSize,
    linkRangesTextureSize,
  };
}

function formatProcessingError(error) {
  if (error instanceof InputValidationError) {
    return { type: 'validation', message: error.message };
  }
  if (error instanceof WasmMemoryError) {
    return { type: 'memory', message: error.message };
  }

  const message = error && error.message ? error.message : String(error);
  if (/out of memory|memory access|WebAssembly\\.Memory|allocation/i.test(message)) {
    return { type: 'memory', message: 'WASM memory failure: ' + message };
  }
  return { type: 'processing', message };
}

/**
 * Initialize WASM module using provided URL
 */
async function initWasm() {
  if (wasmReady) return;
  
  try {
    // Load WASM module using the provided URL
    const wasmResponse = await fetch('${wasmUrl}');
    if (!wasmResponse.ok) {
      throw new Error(\`Failed to fetch WASM: \${wasmResponse.status}\`);
    }
    const wasmBytes = await wasmResponse.arrayBuffer();
    
    // AssemblyScript WASM modules need proper imports based on wasm-objdump output
    const imports = {
      env: {
        // env.seed: () -> f64 (for random number generation)
        seed: () => Math.random(),
        
        // env.abort: (i32, i32, i32, i32) -> nil (for error handling)
        abort: (message, fileName, line, column) => {
          const error = new Error(\`AssemblyScript abort: \${message} at \${fileName}:\${line}:\${column}\`);
          console.error(error);
          throw error;
        }
      },
      'texture-processor': {
        // texture-processor.__heap_base: global i32
        __heap_base: new WebAssembly.Global({ value: 'i32', mutable: false }, 1024)
      }
    };
    
    const wasmInstance = await WebAssembly.instantiate(wasmBytes, imports);
    
    wasmModule = wasmInstance.instance;
    wasmReady = true;
    
    self.postMessage({
      type: 'wasm-ready',
      success: true
    });
  } catch (error) {
    console.warn('WASM loading failed:', error);
    self.postMessage({
      type: 'wasm-ready',
      success: false,
      error: error.message
    });
  }
}

/**
 * Process texture data using WASM
 */
async function processTextures(data) {
  const {
    nodes,
    links,
    textureSize,
    frustumSize,
    requestId
  } = data;
  
  if (!wasmReady) {
    await initWasm();
  }
  
  if (!wasmReady) {
    throw new Error('WASM module failed to initialize');
  }
  
  const startTime = performance.now();
  
  try {
    const {
      totalElements,
      nodesDataSize,
      linksDataSize,
      positionsSize,
      linksTextureSize,
      linkRangesTextureSize,
    } = validateInput(data);
    
    const { allocateMemory, freeMemory, processTextures, memory } = wasmModule.exports;
    if (!allocateMemory || !freeMemory || !processTextures || !memory) {
      throw new Error('WASM exports are missing required texture processing functions');
    }

    let packedLinkAmount = 0;
    let nodesDataPtr = 0;
    let linksDataPtr = 0;
    let positionsPtr = 0;
    let linksTexturePtr = 0;
    let linkRangesTexturePtr = 0;
    let positionsResult = null;
    let linksResult = null;
    let linkRangesResult = null;
    
    try {
      nodesDataPtr = allocateMemory(nodesDataSize);
      linksDataPtr = allocateMemory(linksDataSize);
      positionsPtr = allocateMemory(positionsSize);
      linksTexturePtr = allocateMemory(linksTextureSize);
      linkRangesTexturePtr = allocateMemory(linkRangesTextureSize);
    
      // Prepare and copy node data
      const wasmMemory = new Uint8Array(memory.buffer);
      const nodesFloat32 = new Float32Array(nodes.length * 4);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const offset = i * 4;
        nodesFloat32[offset + 0] = typeof node.x !== 'undefined' ? node.x : NaN;
        nodesFloat32[offset + 1] = typeof node.y !== 'undefined' ? node.y : NaN;
        nodesFloat32[offset + 2] = typeof node.z !== 'undefined' ? node.z : NaN;
        nodesFloat32[offset + 3] = node.isStatic ? 1.0 : 0.0;
      }
      wasmMemory.set(new Uint8Array(nodesFloat32.buffer), nodesDataPtr);
      
      // Prepare and copy links data
      const linksInt32 = new Int32Array(links.length * 2);
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const offset = i * 2;
        linksInt32[offset + 0] = link.sourceIndex;
        linksInt32[offset + 1] = link.targetIndex;
      }
      wasmMemory.set(new Uint8Array(linksInt32.buffer), linksDataPtr);
      
      // Process textures in WASM
      packedLinkAmount = processTextures(
        nodesDataPtr,
        nodes.length,
        linksDataPtr,
        links.length,
        textureSize,
        positionsPtr,
        linksTexturePtr,
        linkRangesTexturePtr,
        frustumSize
      );

      if (packedLinkAmount < 0) {
        throw new Error('Packed links exceed texture capacity');
      }

      // Extract results
      const positionsData = new Float32Array(memory.buffer, positionsPtr, totalElements * 4);
      const linksTextureData = new Float32Array(memory.buffer, linksTexturePtr, totalElements * 4);
      const linkRangesTextureData = new Float32Array(memory.buffer, linkRangesTexturePtr, totalElements * 4);
      
      // Copy results to transferable buffers
      positionsResult = new Float32Array(positionsData);
      linksResult = new Float32Array(linksTextureData);
      linkRangesResult = new Float32Array(linkRangesTextureData);
    } finally {
      if (linkRangesTexturePtr) freeMemory(linkRangesTexturePtr);
      if (linksTexturePtr) freeMemory(linksTexturePtr);
      if (positionsPtr) freeMemory(positionsPtr);
      if (linksDataPtr) freeMemory(linksDataPtr);
      if (nodesDataPtr) freeMemory(nodesDataPtr);
    }
    
    const processingTime = performance.now() - startTime;
    
    // Send results back to main thread
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: true,
      data: {
        positions: positionsResult,
        links: linksResult,
        linkRanges: linkRangesResult,
        packedLinkAmount,
        processingTime,
        memoryUsage: memory.buffer.byteLength
      }
    }, [positionsResult.buffer, linksResult.buffer, linkRangesResult.buffer]);
    
  } catch (error) {
    const { type, message } = formatProcessingError(error);
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: false,
      error: message,
      errorType: type
    });
  }
}

/**
 * Fallback processing without WASM
 */
function processFallback(data) {
  const {
    nodes,
    links,
    textureSize,
    frustumSize,
    requestId
  } = data;
  
  const startTime = performance.now();
  
  try {
    const { totalElements } = validateInput(data);
    const positionsData = new Float32Array(totalElements * 4);
    
    // Process positions
    for (let i = 0; i < totalElements; i++) {
      const baseIndex = i * 4;
      
      if (i < nodes.length) {
        const node = nodes[i];
        const x = typeof node.x !== 'undefined' ? node.x : (Math.random() * 2 - 1);
        const y = typeof node.y !== 'undefined' ? node.y : (Math.random() * 2 - 1);
        const z = typeof node.z !== 'undefined' ? node.z : (Math.random() * 2 - 1);
        
        positionsData[baseIndex + 0] = x;
        positionsData[baseIndex + 1] = y;
        positionsData[baseIndex + 2] = z;
        positionsData[baseIndex + 3] = node.isStatic ? 1 : 0;
      } else {
        const farAway = frustumSize * 10;
        positionsData[baseIndex + 0] = farAway;
        positionsData[baseIndex + 1] = farAway;
        positionsData[baseIndex + 2] = farAway;
        positionsData[baseIndex + 3] = 0;
      }
    }
    
    const linkTextureData = buildLinkTextureData(links, nodes.length, textureSize);
    
    const processingTime = performance.now() - startTime;
    
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: true,
      data: {
        positions: positionsData,
        links: linkTextureData.linksData,
        linkRanges: linkTextureData.linkRangesData,
        packedLinkAmount: linkTextureData.packedLinkAmount,
        processingTime,
        memoryUsage: 0
      }
    }, [positionsData.buffer, linkTextureData.linksData.buffer, linkTextureData.linkRangesData.buffer]);
    
  } catch (error) {
    const { type, message } = formatProcessingError(error);
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: false,
      error: message,
      errorType: type
    });
  }
}

// Message handler
self.onmessage = function(event) {
  const { type, data } = event.data;
  
  switch (type) {
    case 'init':
      initWasm();
      break;
      
    case 'process-textures':
      if (data.useWasm && wasmReady) {
        processTextures(data);
      } else {
        processFallback(data);
      }
      break;
      
    case 'check-wasm':
      self.postMessage({
        type: 'wasm-status',
        ready: wasmReady
      });
      break;
      
    default:
      self.postMessage({
        type: 'error',
        error: \`Unknown message type: \${type}\`
      });
  }
};

// Initialize WASM on worker start
initWasm();
`;
}
function createInlineWorker(wasmUrl) {
  const workerCode = createWorkerCode(wasmUrl);
  const blob = new Blob([workerCode], { type: "application/javascript" });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);
  worker.addEventListener("error", () => URL.revokeObjectURL(workerUrl));
  return worker;
}

// src/texture-worker-manager.js
var import_meta = {};
var TextureWorkerManager = class {
  constructor() {
    this.worker = null;
    this.isWorkerReady = false;
    this.isWasmReady = false;
    this.requestId = 0;
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.workerSupported = typeof Worker !== "undefined";
  }
  /**
   * Resolve WASM URL for different environments
   * @returns {string} URL to WASM file
   */
  resolveWasmUrl() {
    try {
      if (typeof import_meta !== "undefined" && import_meta.url) {
        return new URL("../build/texture-processor.wasm", import_meta.url).href;
      }
    } catch (e) {
    }
    const devPaths = [
      "./build/texture-processor.wasm",
      "../build/texture-processor.wasm",
      "./texture-processor.wasm"
    ];
    return devPaths[0];
  }
  /**
   * Initialize the worker
   * @returns {Promise<boolean>} True if worker initialized successfully
   */
  async init() {
    if (!this.workerSupported) {
      return false;
    }
    try {
      const wasmUrl = this.resolveWasmUrl();
      this.worker = createInlineWorker(wasmUrl);
      this.worker.onmessage = (event) => {
        this.handleWorkerMessage(event.data);
      };
      this.worker.onerror = (error) => {
        console.warn("Texture worker error:", error);
        this.isWorkerReady = false;
      };
      await new Promise((resolve) => {
        const checkReady = () => {
          if (this.isWorkerReady) {
            resolve();
          } else {
            setTimeout(checkReady, 50);
          }
        };
        this.worker.postMessage({ type: "init" });
        checkReady();
      });
      return true;
    } catch (error) {
      console.warn("Failed to initialize texture worker:", error);
      return false;
    }
  }
  /**
   * Handle messages from worker
   * @param {Object} message - Worker message
   */
  handleWorkerMessage(message) {
    const { type, requestId, success, data, error } = message;
    switch (type) {
      case "wasm-ready":
        this.isWasmReady = success;
        this.isWorkerReady = true;
        break;
      case "texture-processed":
        const request = this.pendingRequests.get(requestId);
        if (request) {
          this.pendingRequests.delete(requestId);
          if (success) {
            request.resolve(data);
          } else {
            request.reject(new Error(error));
          }
        }
        break;
      case "error":
        console.error("Worker error:", error);
        break;
    }
  }
  /**
   * Process texture data using worker
   * @param {Object} data - Processing data
   * @param {Array} data.nodes - Node data
   * @param {Array} data.links - Link data
   * @param {number} data.textureSize - Texture size
   * @param {number} data.frustumSize - Frustum size
   * @param {boolean} data.useWasm - Whether to use WASM
   * @returns {Promise<Object>} Processed texture data
   */
  async processTextures(data) {
    if (!this.isWorkerReady) {
      throw new Error("Worker not ready");
    }
    const requestId = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      this.worker.postMessage({
        type: "process-textures",
        data: {
          ...data,
          requestId,
          useWasm: this.isWasmReady && data.useWasm !== false
        }
      });
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error("Texture processing timeout"));
        }
      }, 3e4);
    });
  }
  /**
   * Check if worker and WASM are ready
   * @returns {boolean} True if ready
   */
  isReady() {
    return this.isWorkerReady;
  }
  /**
   * Check if WASM is available
   * @returns {boolean} True if WASM is ready
   */
  isWasmAvailable() {
    return this.isWasmReady;
  }
  /**
   * Get performance statistics
   * @returns {Object} Performance info
   */
  getPerformanceInfo() {
    return {
      workerSupported: this.workerSupported,
      workerReady: this.isWorkerReady,
      wasmReady: this.isWasmReady,
      pendingRequests: this.pendingRequests.size
    };
  }
  /**
   * Cleanup worker resources
   */
  dispose() {
    if (this.worker) {
      this.pendingRequests.forEach((request) => {
        request.reject(new Error("Worker disposed"));
      });
      this.pendingRequests.clear();
      this.worker.terminate();
      this.worker = null;
      this.isWorkerReady = false;
      this.isWasmReady = false;
    }
  }
};

// src/index.js
var color3 = new import_three6.Color();
var position = new import_three6.Vector3();
var size = new import_three6.Vector2();
var drawingBufferSize = new import_three6.Vector2();
var LineCaps = ["round", "butt", "square"];
var LineCapsMap = {
  round: 0,
  butt: 1,
  square: 2
};
var DEFAULT_LABEL_FONT_FAMILY = "Arial, sans-serif";
var buffers = {
  int: new Uint8ClampedArray(4),
  float: new Float32Array(4)
};
function buildLinkTextureData(preparedLinks, nodeAmount, size2) {
  const totalElements = size2 * size2;
  const linksData = new Float32Array(totalElements * 4);
  const linkRangesData = new Float32Array(totalElements * 4);
  const linksByNode = Array.from({ length: nodeAmount }, () => []);
  const packedLinks = [];
  for (let i = 0; i < preparedLinks.length; i++) {
    const link2 = preparedLinks[i];
    const sourceIndex = link2.sourceIndex;
    const targetIndex = link2.targetIndex;
    const isValid = Number.isInteger(sourceIndex) && Number.isInteger(targetIndex) && sourceIndex >= 0 && targetIndex >= 0 && sourceIndex < nodeAmount && targetIndex < nodeAmount;
    if (!isValid) {
      continue;
    }
    linksByNode[sourceIndex].push(link2);
    if (targetIndex !== sourceIndex) {
      linksByNode[targetIndex].push(link2);
    }
  }
  for (let i = 0; i < nodeAmount; i++) {
    const rangeOffset = i * 4;
    const incident = linksByNode[i];
    linkRangesData[rangeOffset + 0] = packedLinks.length;
    linkRangesData[rangeOffset + 1] = incident.length;
    for (let j = 0; j < incident.length; j++) {
      packedLinks.push(incident[j]);
    }
  }
  if (packedLinks.length > totalElements) {
    throw new Error(
      `Packed links (${packedLinks.length}) exceed texture capacity (${totalElements}).`
    );
  }
  for (let i = 0; i < packedLinks.length; i++) {
    const link2 = packedLinks[i];
    const sourceIndex = link2.sourceIndex;
    const targetIndex = link2.targetIndex;
    const linkOffset = i * 4;
    linksData[linkOffset + 0] = sourceIndex % size2 / size2;
    linksData[linkOffset + 1] = Math.floor(sourceIndex / size2) / size2;
    linksData[linkOffset + 2] = targetIndex % size2 / size2;
    linksData[linkOffset + 3] = Math.floor(targetIndex / size2) / size2;
  }
  return {
    linksData,
    linkRangesData,
    packedLinkAmount: packedLinks.length
  };
}
var ForceDirectedGraph = class extends import_three6.Group {
  ready = false;
  /**
   * @param {THREE.WebGLRenderer} renderer - the three.js renderer referenced to create the render targets
   * @param {Object} [data] - optional data to automatically set the data of the graph
   */
  constructor(renderer, data) {
    super();
    this.userData.registry = new Registry();
    this.userData.renderer = renderer;
    this.userData.uniforms = {
      decay: { value: 1 },
      alpha: { value: 1 },
      is2D: { value: false },
      time: { value: 0 },
      size: { value: 64 },
      maxSpeed: { value: 10 },
      timeStep: { value: 1 },
      damping: { value: 0.7 },
      repulsion: { value: -0.3 },
      springLength: { value: 2 },
      stiffness: { value: 0.1 },
      gravity: { value: 0.1 },
      pinStrength: { value: 0 },
      nodeRadius: { value: 1 },
      nodeScale: { value: 8 },
      sizeAttenuation: { value: true },
      frustumSize: { value: 100 },
      linksInheritColor: { value: false },
      labelsInheritColor: { value: false },
      pointsInheritColor: { value: true },
      pointColor: { value: new import_three6.Color(1, 1, 1) },
      linkColor: { value: new import_three6.Color(1, 1, 1) },
      labelColor: { value: new import_three6.Color(0, 0, 0) },
      linecap: { value: LineCapsMap.round },
      linewidth: { value: 1 },
      opacity: { value: 1 },
      pixelRatio: { value: 1 },
      resolution: { value: new import_three6.Vector2(1, 1) },
      uBeginning: { value: 0 },
      uEnding: { value: 1 },
      uNodeAmount: { value: 0 },
      obscurity: { value: 0.9 },
      labelAlignment: { value: 0 },
      labelBaseline: { value: 1 },
      labelFontSize: { value: 24 },
      labelNear: { value: 50 },
      labelOffset: { value: new import_three6.Vector2(0, 0) }
    };
    this.userData.labelFontFamily = DEFAULT_LABEL_FONT_FAMILY;
    this.userData.hit = new Hit(this);
    this.userData.workerManager = new TextureWorkerManager();
    if (data) {
      this.set(data);
    }
  }
  static getPotSize = getPotSize;
  static Properties = [
    "decay",
    "alpha",
    "is2D",
    "time",
    "size",
    "maxSpeed",
    "timeStep",
    "damping",
    "repulsion",
    "springLength",
    "stiffness",
    "gravity",
    "pinStrength",
    "nodeRadius",
    "nodeScale",
    "sizeAttenuation",
    "frustumSize",
    "linksInheritColor",
    "labelsInheritColor",
    "pointsInheritColor",
    "pointColor",
    "linkColor",
    "labelColor",
    "linecap",
    "linewidth",
    "opacity",
    "blending",
    "obscurity"
  ];
  /**
   * @param {Object} data - Object with nodes and links properties based on https://observablehq.com/@d3/force-directed-graph-component
   * @param {Function} callback
   * @description Set the data to an instance of force directed graph. Because of the potential large amount of data this function runs on a request animation frame and returns a promise (or a passed callback) to give indication when the graph is ready to be rendered.
   * @returns {Promise}
   */
  set(data, callback) {
    const scope = this;
    let { gpgpu, registry, renderer, uniforms } = this.userData;
    let packedLinkAmount = 0;
    this.ready = false;
    this.userData.data = data;
    registry.clear();
    if (gpgpu) {
      for (let i = 0; i < gpgpu.variables.length; i++) {
        const variable = gpgpu.variables[i];
        for (let j = 0; j < variable.renderTargets.length; j++) {
          const renderTarget = variable.renderTargets[j];
          renderTarget.dispose();
        }
        variable.initialValueTexture.dispose();
        variable.material.dispose();
      }
    }
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      this.remove(child);
      if ("dispose" in child) {
        child.dispose();
      }
    }
    this.userData.labels = null;
    const size2 = getPotSize(Math.max(data.nodes.length, data.links.length * 2));
    uniforms.size.value = size2;
    gpgpu = new import_GPUComputationRenderer.GPUComputationRenderer(size2, size2, renderer);
    const textures = {
      positions: gpgpu.createTexture(),
      velocities: gpgpu.createTexture(),
      links: gpgpu.createTexture(),
      linkRanges: gpgpu.createTexture(),
      targetPositions: gpgpu.createTexture()
    };
    const variables = {
      positions: gpgpu.addVariable(
        "texturePositions",
        simulation_default.positions,
        textures.positions
      ),
      velocities: gpgpu.addVariable(
        "textureVelocities",
        simulation_default.velocities,
        textures.velocities
      )
    };
    this.userData.gpgpu = gpgpu;
    this.userData.variables = variables;
    this.userData.textures = textures;
    return register().then(fill).then(setup).then(generate).then(complete).catch((error) => {
      console.warn("Force Directed Graph:", error);
    });
    function register() {
      return each(data.nodes, (node, i) => {
        registry.set(i, node);
      });
    }
    async function fill() {
      const { workerManager } = scope.userData;
      const preparedLinks = data.links.map((link2) => {
        const sourceIndex = registry.get(link2.source);
        const targetIndex = registry.get(link2.target);
        link2.sourceIndex = sourceIndex;
        link2.targetIndex = targetIndex;
        return {
          ...link2,
          sourceIndex,
          targetIndex
        };
      });
      const nodeDegrees = new Array(data.nodes.length).fill(0);
      for (let i = 0; i < preparedLinks.length; i++) {
        const link2 = preparedLinks[i];
        nodeDegrees[link2.sourceIndex] += 1;
        nodeDegrees[link2.targetIndex] += 1;
      }
      scope.userData.nodeDegrees = nodeDegrees;
      if (!workerManager.isReady()) {
        await workerManager.init();
      }
      if (workerManager.isReady()) {
        try {
          const result = await workerManager.processTextures({
            nodes: data.nodes,
            links: preparedLinks,
            textureSize: size2,
            frustumSize: uniforms.frustumSize.value
          });
          textures.positions.image.data.set(result.positions);
          textures.links.image.data.set(result.links);
          textures.linkRanges.image.data.set(result.linkRanges);
          packedLinkAmount = result.packedLinkAmount;
          fillTargetPositions();
          console.log(
            `Texture processing completed in ${result.processingTime.toFixed(2)}ms using ${workerManager.isWasmAvailable() ? "WASM" : "JavaScript"}`
          );
          return Promise.resolve();
        } catch (error) {
          console.warn(
            "Worker processing failed, falling back to main thread:",
            error
          );
        }
      }
      return fillMainThread(preparedLinks);
    }
    function fillMainThread(preparedLinks) {
      const linkTextureData = buildLinkTextureData(
        preparedLinks,
        data.nodes.length,
        size2
      );
      textures.links.image.data.set(linkTextureData.linksData);
      textures.linkRanges.image.data.set(linkTextureData.linkRangesData);
      packedLinkAmount = linkTextureData.packedLinkAmount;
      return each(
        textures.positions.image.data,
        (_, i) => {
          const k = i / 4;
          const x = Math.random() * 2 - 1;
          const y = Math.random() * 2 - 1;
          const z = Math.random() * 2 - 1;
          if (k < data.nodes.length) {
            const node = data.nodes[k];
            textures.positions.image.data[i + 0] = typeof node.x !== "undefined" ? node.x : x;
            textures.positions.image.data[i + 1] = typeof node.y !== "undefined" ? node.y : y;
            textures.positions.image.data[i + 2] = typeof node.z !== "undefined" ? node.z : z;
            textures.positions.image.data[i + 3] = node.isStatic ? 1 : 0;
          } else {
            textures.positions.image.data[i + 0] = uniforms.frustumSize.value * 10;
            textures.positions.image.data[i + 1] = uniforms.frustumSize.value * 10;
            textures.positions.image.data[i + 2] = uniforms.frustumSize.value * 10;
            textures.positions.image.data[i + 3] = uniforms.frustumSize.value * 10;
          }
        },
        4
      ).then(fillTargetPositions);
    }
    function fillTargetPositions() {
      for (let k = 0; k < data.nodes.length; k++) {
        const node = data.nodes[k];
        const i = k * 4;
        const hasX = typeof node.x !== "undefined";
        const hasY = typeof node.y !== "undefined";
        const hasZ = typeof node.z !== "undefined";
        const definedCount = (hasX ? 1 : 0) + (hasY ? 1 : 0) + (hasZ ? 1 : 0);
        const hasTarget = definedCount >= 2 ? 1 : 0;
        textures.targetPositions.image.data[i + 0] = hasTarget ? node.x ?? 0 : 0;
        textures.targetPositions.image.data[i + 1] = hasTarget ? node.y ?? 0 : 0;
        textures.targetPositions.image.data[i + 2] = hasTarget ? node.z ?? 0 : 0;
        textures.targetPositions.image.data[i + 3] = hasTarget;
      }
    }
    function setup() {
      return new Promise((resolve, reject) => {
        gpgpu.setVariableDependencies(variables.positions, [
          variables.positions,
          variables.velocities
        ]);
        gpgpu.setVariableDependencies(variables.velocities, [
          variables.velocities,
          variables.positions
        ]);
        variables.positions.material.uniforms.is2D = uniforms.is2D;
        variables.positions.material.uniforms.timeStep = uniforms.timeStep;
        variables.velocities.material.uniforms.alpha = uniforms.alpha;
        variables.velocities.material.uniforms.is2D = uniforms.is2D;
        variables.velocities.material.uniforms.size = uniforms.size;
        variables.velocities.material.uniforms.time = uniforms.time;
        variables.velocities.material.uniforms.nodeRadius = uniforms.nodeRadius;
        variables.velocities.material.uniforms.nodeAmount = {
          value: data.nodes.length
        };
        variables.velocities.material.uniforms.uBeginning = uniforms.uBeginning;
        variables.velocities.material.uniforms.uEnding = uniforms.uEnding;
        uniforms.uNodeAmount.value = data.nodes.length;
        variables.velocities.material.uniforms.edgeAmount = {
          value: packedLinkAmount
        };
        variables.velocities.material.uniforms.maxSpeed = uniforms.maxSpeed;
        variables.velocities.material.uniforms.timeStep = uniforms.timeStep;
        variables.velocities.material.uniforms.damping = uniforms.damping;
        variables.velocities.material.uniforms.repulsion = uniforms.repulsion;
        variables.velocities.material.uniforms.textureLinks = {
          value: textures.links
        };
        variables.velocities.material.uniforms.textureLinkRanges = {
          value: textures.linkRanges
        };
        variables.velocities.material.uniforms.springLength = uniforms.springLength;
        variables.velocities.material.uniforms.stiffness = uniforms.stiffness;
        variables.velocities.material.uniforms.gravity = uniforms.gravity;
        variables.velocities.material.uniforms.pinStrength = uniforms.pinStrength;
        variables.velocities.material.uniforms.textureTargetPositions = {
          value: textures.targetPositions
        };
        variables.positions.wrapS = variables.positions.wrapT = import_three6.RepeatWrapping;
        variables.velocities.wrapS = variables.velocities.wrapT = import_three6.RepeatWrapping;
        const error = gpgpu.init();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    }
    function generate() {
      let points2;
      return Points.parse(size2, data).then((geometry) => {
        points2 = new Points(geometry, uniforms);
      }).then(() => Links.parse(points2, data)).then((geometry) => {
        const links2 = new Links(geometry, uniforms);
        scope.add(points2, links2);
        points2.renderOrder = links2.renderOrder + 1;
        scope.userData.hit.inherit(points2);
      }).then(
        () => Labels.parse(size2, data, {
          degrees: scope.userData.nodeDegrees,
          fontFamily: scope.userData.labelFontFamily
        })
      ).then((result) => {
        if (result) {
          const labels2 = new Labels(result, uniforms);
          scope.userData.labels = labels2;
          labels2.renderOrder = points2.renderOrder + 1;
          scope.add(labels2);
        }
      });
    }
    function complete() {
      scope.ready = true;
      if (callback) {
        callback();
      }
    }
  }
  getLabelParseOptions() {
    const { nodeDegrees, labelFontFamily, uniforms, renderer } = this.userData;
    return {
      degrees: nodeDegrees || [],
      fontFamily: labelFontFamily,
      maxTextureSize: renderer?.capabilities?.maxTextureSize || 16384,
      useMipmaps: renderer?.capabilities?.isWebGL2 === true
    };
  }
  refreshLabels() {
    const { data, uniforms } = this.userData;
    if (!data || !this.ready || !this.points) {
      return Promise.resolve(null);
    }
    this.userData.labelRefreshToken = (this.userData.labelRefreshToken || 0) + 1;
    const refreshToken = this.userData.labelRefreshToken;
    return Labels.parse(
      uniforms.size.value,
      data,
      this.getLabelParseOptions()
    ).then((result) => {
      if (refreshToken !== this.userData.labelRefreshToken) {
        if (result) {
          result.texture?.dispose?.();
          result.geometry?.dispose?.();
        }
        return this.userData.labels || null;
      }
      const previousLabels = this.userData.labels;
      if (previousLabels) {
        if (!result) {
          this.remove(previousLabels);
          previousLabels.dispose();
          this.userData.labels = null;
          return null;
        }
        previousLabels.replaceData(result);
        if (this.userData.variables?.positions) {
          previousLabels.material.uniforms.texturePositions.value = this.getTexture("positions");
        }
        return previousLabels;
      }
      if (!result) {
        this.userData.labels = null;
        return null;
      }
      const nextLabels = new Labels(result, uniforms);
      nextLabels.renderOrder = this.points.renderOrder + 1;
      this.userData.labels = nextLabels;
      this.add(nextLabels);
      if (this.userData.variables?.positions) {
        nextLabels.material.uniforms.texturePositions.value = this.getTexture("positions");
      }
      return nextLabels;
    });
  }
  /**
   * @param {Number} time
   * @description Function to update the instance meant to be run before three.js's renderer.render method.
   * @returns {Void}
   */
  update(time) {
    if (!this.ready) {
      return this;
    }
    const { gpgpu, renderer, textures, variables, uniforms } = this.userData;
    uniforms.alpha.value *= uniforms.decay.value;
    variables.velocities.material.uniforms.time.value = time / 1e3;
    gpgpu.compute();
    renderer.getSize(size);
    renderer.getDrawingBufferSize(drawingBufferSize);
    uniforms.resolution.value.copy(drawingBufferSize);
    uniforms.pixelRatio.value = size.x > 0 ? drawingBufferSize.x / size.x : 1;
    const texture = this.getTexture("positions");
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      child.material.uniforms.texturePositions.value = texture;
      if (child.material.uniforms.textureTargetPositions) {
        child.material.uniforms.textureTargetPositions.value = textures.targetPositions;
      }
    }
    return this;
  }
  /**
   * @param {THREE.Vector2} pointer - x, y values normalized to the camera's clipspace
   * @param {THREE.Camera} camera - the camera to reference ray casting matrices
   * @description Check to see if a point in the browser's screenspace intersects with any points in the force directed graph. If none found, then null is returned.
   * @returns {Object|Null}
   */
  intersect(pointer, camera) {
    const { hit: hit2, renderer } = this.userData;
    renderer.getSize(size);
    hit2.setSize(size.x, size.y);
    hit2.compute(renderer, camera);
    const x = hit2.ratio * size.x * clamp(pointer.x, 0, 1);
    const y = hit2.ratio * size.y * (1 - clamp(pointer.y, 0, 1));
    renderer.readRenderTargetPixels(
      hit2.renderTarget,
      x - 0.5,
      y - 0.5,
      1,
      1,
      buffers.int
    );
    const [r, g, b, a] = buffers.int;
    const z = 0;
    const w = 255;
    const isBlack = r === z && g === z && b === z && a === z;
    const isWhite = r === w && g === w && b === w && a === w;
    if (isBlack || isWhite) {
      return null;
    }
    const index = rgbToIndex({ r, g, b }) - 1;
    const point = this.getPositionFromIndex(index);
    return {
      point,
      data: this.userData.data.nodes[index]
    };
  }
  getTexture(name) {
    const { gpgpu, variables } = this.userData;
    return gpgpu.getCurrentRenderTarget(variables[name]).texture;
  }
  getPositionFromIndex(i) {
    const { points: points2, size: size2 } = this;
    const { gpgpu, renderer, variables } = this.userData;
    if (!points2 || !renderer || !size2) {
      console.warn(
        "Force Directed Graph:",
        "unable to calculate position without points or renderer."
      );
      return;
    }
    const index = i * 3;
    const uvs = points2.geometry.attributes.position.array;
    const uvx = Math.floor(uvs[index + 0] * size2);
    const uvy = Math.floor(uvs[index + 1] * size2);
    const renderTarget = gpgpu.getCurrentRenderTarget(variables.positions);
    renderer.readRenderTargetPixels(
      renderTarget,
      uvx,
      uvy,
      1,
      1,
      buffers.float
    );
    const [x, y, z] = buffers.float;
    position.set(x, y, z);
    return position;
  }
  setPointColorById(id, css) {
    const index = this.getIndexById(id);
    this.setPointColorFromIndex(index, css);
  }
  setPointColorFromIndex(index, css) {
    const attribute = this.points.geometry.getAttribute("color");
    const colors = attribute.array;
    color3.set(css);
    colors[3 * index + 0] = color3.r;
    colors[3 * index + 1] = color3.g;
    colors[3 * index + 2] = color3.b;
    attribute.needsUpdate = true;
  }
  updateLinksColors() {
    const { data } = this.userData;
    const ref = this.points.geometry.attributes.color.array;
    const sourceAttribute = this.links.geometry.getAttribute("sourceColor");
    const targetAttribute = this.links.geometry.getAttribute("targetColor");
    const sourceColors = sourceAttribute.array;
    const targetColors = targetAttribute.array;
    return each(data.links, (_, i) => {
      const l = data.links[i];
      const li = i * 3;
      const si = 3 * l.sourceIndex;
      const ti = 3 * l.targetIndex;
      sourceColors[li + 0] = ref[si + 0];
      sourceColors[li + 1] = ref[si + 1];
      sourceColors[li + 2] = ref[si + 2];
      targetColors[li + 0] = ref[ti + 0];
      targetColors[li + 1] = ref[ti + 1];
      targetColors[li + 2] = ref[ti + 2];
    }).then(() => {
      sourceAttribute.needsUpdate = true;
      targetAttribute.needsUpdate = true;
      return true;
    });
  }
  getIndexById(id) {
    const { registry } = this.userData;
    return registry.get(id);
  }
  getLinksById(id) {
    const { data } = this.userData;
    const index = this.getIndexById(id);
    const result = [];
    const promise = each(data.links, (link2) => {
      const { sourceIndex, targetIndex } = link2;
      if (sourceIndex === index || targetIndex === index) {
        result.push(link2);
      }
    });
    return promise.then(() => result);
  }
  getPointById(id) {
    const { data } = this.userData;
    const index = this.getIndexById(id);
    return data.nodes[index];
  }
  dispose() {
    const { gpgpu, workerManager } = this.userData;
    if (gpgpu) {
      for (let i = 0; i < gpgpu.variables.length; i++) {
        const variable = gpgpu.variables[i];
        variable.material.dispose();
        variable.initialValueTexture.dispose();
        for (let j = 0; j < variable.renderTargets.length; j++) {
          const target = variable.renderTargets[j];
          target.dispose();
        }
      }
    }
    if (workerManager) {
      workerManager.dispose();
    }
    this.userData = {};
    return this;
  }
  // Getters / Setters
  get decay() {
    return this.userData.uniforms.decay.value;
  }
  set decay(v) {
    this.userData.uniforms.decay.value = v;
  }
  get alpha() {
    return this.userData.uniforms.alpha.value;
  }
  set alpha(v) {
    this.userData.uniforms.alpha.value = v;
  }
  get is2D() {
    return this.userData.uniforms.is2D.value;
  }
  set is2D(v) {
    this.userData.uniforms.is2D.value = v;
  }
  get time() {
    return this.userData.uniforms.time.value;
  }
  set time(v) {
    this.userData.uniforms.time.value = v;
  }
  get size() {
    return this.userData.uniforms.size.value;
  }
  set size(v) {
    this.userData.uniforms.size.value = v;
  }
  get maxSpeed() {
    return this.userData.uniforms.maxSpeed.value;
  }
  set maxSpeed(v) {
    this.userData.uniforms.maxSpeed.value = v;
  }
  get timeStep() {
    return this.userData.uniforms.timeStep.value;
  }
  set timeStep(v) {
    this.userData.uniforms.timeStep.value = v;
  }
  get damping() {
    return this.userData.uniforms.damping.value;
  }
  set damping(v) {
    this.userData.uniforms.damping.value = v;
  }
  get repulsion() {
    return this.userData.uniforms.repulsion.value;
  }
  set repulsion(v) {
    this.userData.uniforms.repulsion.value = v;
  }
  get springLength() {
    return this.userData.uniforms.springLength.value;
  }
  set springLength(v) {
    this.userData.uniforms.springLength.value = v;
  }
  get stiffness() {
    return this.userData.uniforms.stiffness.value;
  }
  set stiffness(v) {
    this.userData.uniforms.stiffness.value = v;
  }
  get gravity() {
    return this.userData.uniforms.gravity.value;
  }
  set gravity(v) {
    this.userData.uniforms.gravity.value = v;
  }
  get pinStrength() {
    return this.userData.uniforms.pinStrength.value;
  }
  set pinStrength(v) {
    this.userData.uniforms.pinStrength.value = v;
  }
  get nodeRadius() {
    return this.userData.uniforms.nodeRadius.value;
  }
  set nodeRadius(v) {
    this.userData.uniforms.nodeRadius.value = v;
  }
  get nodeScale() {
    return this.userData.uniforms.nodeScale.value;
  }
  set nodeScale(v) {
    this.userData.uniforms.nodeScale.value = v;
  }
  get sizeAttenuation() {
    return this.userData.uniforms.sizeAttenuation.value;
  }
  set sizeAttenuation(v) {
    this.userData.uniforms.sizeAttenuation.value = v;
  }
  get frustumSize() {
    return this.userData.uniforms.frustumSize.value;
  }
  set frustumSize(v) {
    this.userData.uniforms.frustumSize.value = v;
  }
  get linksInheritColor() {
    return this.userData.uniforms.linksInheritColor.value;
  }
  set linksInheritColor(v) {
    this.userData.uniforms.linksInheritColor.value = v;
  }
  get pointsInheritColor() {
    return this.userData.uniforms.pointsInheritColor.value;
  }
  set pointsInheritColor(v) {
    this.userData.uniforms.pointsInheritColor.value = v;
  }
  get labelsInheritColor() {
    return this.userData.uniforms.labelsInheritColor.value;
  }
  set labelsInheritColor(v) {
    this.userData.uniforms.labelsInheritColor.value = v;
  }
  get pointColor() {
    return this.userData.uniforms.pointColor.value;
  }
  set pointColor(v) {
    this.userData.uniforms.pointColor.value = v;
  }
  get linksColor() {
    return this.linkColor;
  }
  set linksColor(v) {
    this.linkColor = v;
  }
  get linkColor() {
    return this.userData.uniforms.linkColor.value;
  }
  set linkColor(v) {
    this.userData.uniforms.linkColor.value = v;
  }
  get labelsColor() {
    return this.labelColor;
  }
  set labelsColor(v) {
    this.labelColor = v;
  }
  get labelColor() {
    return this.userData.uniforms.labelColor.value;
  }
  set labelColor(v) {
    this.userData.uniforms.labelColor.value = v;
  }
  get linecap() {
    const index = Math.round(this.userData.uniforms.linecap.value);
    return LineCaps[index] || "round";
  }
  set linecap(v) {
    this.userData.uniforms.linecap.value = LineCapsMap[v] ?? LineCapsMap.round;
  }
  get linewidth() {
    return this.userData.uniforms.linewidth.value;
  }
  set linewidth(v) {
    this.userData.uniforms.linewidth.value = v;
  }
  get opacity() {
    return this.userData.uniforms.opacity.value;
  }
  set opacity(v) {
    this.userData.uniforms.opacity.value = v;
  }
  get beginning() {
    return this.userData.uniforms.uBeginning.value;
  }
  set beginning(v) {
    this.userData.uniforms.uBeginning.value = v;
  }
  get ending() {
    return this.userData.uniforms.uEnding.value;
  }
  set ending(v) {
    this.userData.uniforms.uEnding.value = v;
  }
  get obscurity() {
    return this.userData.uniforms.obscurity.value;
  }
  set obscurity(v) {
    this.userData.uniforms.obscurity.value = Math.max(0, Math.min(1, v));
  }
  get blending() {
    return this.children[0].material.blending;
  }
  set blending(v) {
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      child.material.blending = v;
    }
  }
  get points() {
    return this.children[0];
  }
  get links() {
    return this.children[1];
  }
  get labels() {
    return this.userData.labels || null;
  }
  get uniforms() {
    return this.userData.uniforms;
  }
  get nodeCount() {
    const { variables } = this.userData;
    return variables.velocities.material.uniforms.nodeAmount.value;
  }
  get edgeCount() {
    const { variables } = this.userData;
    return variables.velocities.material.uniforms.edgeAmount.value;
  }
  /**
   * Get performance information about texture processing
   * @returns {Object} Performance statistics
   */
  getPerformanceInfo() {
    const { workerManager } = this.userData;
    return workerManager ? workerManager.getPerformanceInfo() : {
      workerSupported: false,
      workerReady: false,
      wasmReady: false,
      pendingRequests: 0
    };
  }
  /**
   * Check if worker-based processing is available
   * @returns {boolean} True if worker processing is available
   */
  isWorkerProcessingAvailable() {
    const { workerManager } = this.userData;
    return workerManager && workerManager.isReady();
  }
  /**
   * Check if WASM acceleration is available
   * @returns {boolean} True if WASM is available
   */
  isWasmAccelerationAvailable() {
    const { workerManager } = this.userData;
    return workerManager && workerManager.isWasmAvailable();
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ForceDirectedGraph
});
