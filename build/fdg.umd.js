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
var import_three5 = require("three");
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
      fog: true
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
var import_three4 = require("three");

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
var color2 = new import_three4.Color();
var Hit = class {
  parent = null;
  renderTarget = new import_three4.WebGLRenderTarget(1, 1);
  width = 1;
  height = 1;
  ratio = 1;
  material = null;
  helper = null;
  constructor(fdg) {
    this.parent = fdg;
    this.helper = new import_three4.Sprite(new import_three4.SpriteMaterial({
      map: this.renderTarget.texture
    }));
    this.material = new import_three4.ShaderMaterial({
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
    this.renderTarget = new import_three4.WebGLRenderTarget(1, 1);
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
var color3 = new import_three5.Color();
var position = new import_three5.Vector3();
var size = new import_three5.Vector2();
var drawingBufferSize = new import_three5.Vector2();
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
var ForceDirectedGraph = class extends import_three5.Group {
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
      pointsInheritColor: { value: true },
      pointColor: { value: new import_three5.Color(1, 1, 1) },
      linkColor: { value: new import_three5.Color(1, 1, 1) },
      linewidth: { value: 1 },
      opacity: { value: 1 },
      pixelRatio: { value: 1 },
      resolution: { value: new import_three5.Vector2(1, 1) },
      uBeginning: { value: 0 },
      uEnding: { value: 1 },
      uNodeAmount: { value: 0 }
    };
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
    "pointsInheritColor",
    "pointColor",
    "linkColor",
    "linewidth",
    "opacity",
    "blending"
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
        variables.positions.wrapS = variables.positions.wrapT = import_three5.RepeatWrapping;
        variables.velocities.wrapS = variables.velocities.wrapT = import_three5.RepeatWrapping;
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
      });
    }
    function complete() {
      scope.ready = true;
      if (callback) {
        callback();
      }
    }
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
