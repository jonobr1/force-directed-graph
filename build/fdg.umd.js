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
  vec3 link( float i, int id1, vec3 p1, vec3 v1, vec2 uv2 ) {

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

    return result;

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
  uniform sampler2D textureLinks;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${random}
  ${jiggle}
  ${link}
  ${charge}
  ${center}

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    vec3 a = vec3( 0.0 ),
        b = vec3( 0.0 ),
        c = vec3( 0.0 );

    for ( float i = 0.0; i < max( nodeAmount, edgeAmount ); i += 1.0 ) {

      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;

      vec2 uv2 = vec2( uvx, uvy );

      int id2 = getIndex( uv2 );
      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );

      if ( i < edgeAmount ) {
        b += link( i, id1, p1, v1, uv2 );
      }

      if ( i < nodeAmount) {
        c += charge( i, id1, p1, v1, id2, p2, v2 );
      }

    }

    b *= 1.0 - step( edgeAmount, float( id1 ) );
    c *= 1.0 - step( nodeAmount, float( id1 ) );

    // 4.
    vec3 d = center( p1 );
    vec3 acceleration = a + b + c + d;

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
  uniform sampler2D textureLinks;
  uniform sampler2D textureLinksLookUp;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${random}
  ${jiggle}
  ${link}
  ${charge}
  ${center}

  void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    vec3 a = vec3( 0.0 ),
        b = vec3( 0.0 ),
        c = vec3( 0.0 );

    /*
    for ( float i = 0.0; i < linkAmount; i += 1.0 ) {
      // TODO: get all edges and link them
      b += link( i, id1, p1, v1, uv2 );
    }
    */

    for ( float i = 0.0; i < nodeAmount; i += 1.0 ) {

      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;

      vec2 uv2 = vec2( uvx, uvy );

      int id2 = getIndex( uv2 );
      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );

      if ( i < nodeAmount) {
        c += charge( i, id1, p1, v1, id2, p2, v2 );
      }

    }

    b *= 1.0 - step( edgeAmount, float( id1 ) );
    c *= 1.0 - step( nodeAmount, float( id1 ) );

  // 4.
  vec3 d = center( p1 );
  vec3 acceleration = a + b + c + d;

  // Calculate Velocity
  vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;
  velocity = clamp( velocity, - maxSpeed, maxSpeed );
  velocity.z *= 1.0 - is2D;

  gl_FragColor = vec4( velocity, 0.0 );

}
`;

// src/shaders/velocities-spatial.js
var spatial = `
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
  uniform float maxNeighbors;
  uniform sampler2D textureLinks;
  uniform sampler2D textureNeighbors;
  uniform sampler2D textureNeighborsDistance;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${random}
  ${jiggle}
  ${link}
  ${center}

  // Enhanced charge calculation using precomputed neighbors
  vec3 spatialCharge( int id1, vec3 p1, vec3 v1, vec2 uv ) {
    vec3 result = vec3( 0.0 );
    
    // Get neighbor data for this node
    vec4 neighbors1 = texture2D( textureNeighbors, uv );
    vec4 distances1 = texture2D( textureNeighborsDistance, uv );
    
    // Process up to 4 neighbors per texel lookup
    for ( int comp = 0; comp < 4; comp++ ) {
      float neighborIndexF;
      float distance;
      
      if ( comp == 0 ) {
        neighborIndexF = neighbors1.x;
        distance = distances1.x;
      } else if ( comp == 1 ) {
        neighborIndexF = neighbors1.y;
        distance = distances1.y;
      } else if ( comp == 2 ) {
        neighborIndexF = neighbors1.z;
        distance = distances1.z;
      } else {
        neighborIndexF = neighbors1.w;
        distance = distances1.w;
      }
      
      // Skip invalid neighbors
      if ( neighborIndexF < 0.0 || distance <= 0.0 ) continue;
      
      int neighborIndex = int( neighborIndexF );
      
      // Calculate neighbor UV coordinates
      float uvx = mod( neighborIndexF, size ) / size;
      float uvy = floor( neighborIndexF / size ) / size;
      vec2 neighborUV = vec2( uvx, uvy );
      
      // Get neighbor position and velocity
      vec3 p2 = getPosition( neighborUV );
      vec3 v2 = getVelocity( neighborUV );
      
      // Calculate repulsion force
      vec3 diff = ( p2 + v2 ) - ( p1 + v1 );
      diff.z *= 1.0 - is2D;
      
      float dist = length( diff );
      
      // Avoid division by zero and use precomputed distance for validation
      if ( dist > 0.0001 ) {
        float mag = repulsion / dist;
        vec3 dir = normalize( diff );
        result += dir * mag;
      }
    }
    
    result.z *= 1.0 - is2D;
    return result;
  }

  // Multi-texel neighbor processing for higher neighbor counts
  vec3 spatialChargeExtended( int id1, vec3 p1, vec3 v1, vec2 uv ) {
    vec3 result = vec3( 0.0 );
    
    // Calculate how many texel lookups we need
    float neighborsPerTexel = 4.0;
    float maxLookups = ceil( maxNeighbors / neighborsPerTexel );
    
    for ( float lookupIndex = 0.0; lookupIndex < maxLookups; lookupIndex += 1.0 ) {
      // Calculate offset UV for additional neighbor data
      // Store extended neighbor data in adjacent texels
      float offsetX = mod( lookupIndex, size ) / size;
      float offsetY = floor( lookupIndex / size ) / size;
      vec2 offsetUV = uv + vec2( offsetX, offsetY );
      
      // Wrap UV coordinates
      offsetUV = mod( offsetUV, 1.0 );
      
      vec4 neighbors = texture2D( textureNeighbors, offsetUV );
      vec4 distances = texture2D( textureNeighborsDistance, offsetUV );
      
      // Process neighbors in this texel
      for ( int comp = 0; comp < 4; comp++ ) {
        float currentNeighborSlot = lookupIndex * neighborsPerTexel + float( comp );
        
        // Stop if we've processed maxNeighbors
        if ( currentNeighborSlot >= maxNeighbors ) break;
        
        float neighborIndexF;
        float distance;
        
        if ( comp == 0 ) {
          neighborIndexF = neighbors.x;
          distance = distances.x;
        } else if ( comp == 1 ) {
          neighborIndexF = neighbors.y;
          distance = distances.y;
        } else if ( comp == 2 ) {
          neighborIndexF = neighbors.z;
          distance = distances.z;
        } else {
          neighborIndexF = neighbors.w;
          distance = distances.w;
        }
        
        // Skip invalid neighbors
        if ( neighborIndexF < 0.0 || distance <= 0.0 ) continue;
        
        // Calculate neighbor UV coordinates
        float uvx = mod( neighborIndexF, size ) / size;
        float uvy = floor( neighborIndexF / size ) / size;
        vec2 neighborUV = vec2( uvx, uvy );
        
        // Get neighbor position and velocity
        vec3 p2 = getPosition( neighborUV );
        vec3 v2 = getVelocity( neighborUV );
        
        // Calculate repulsion force using precomputed distance for optimization
        vec3 diff = ( p2 + v2 ) - ( p1 + v1 );
        diff.z *= 1.0 - is2D;
        
        float dist = max( distance, 0.0001 ); // Use precomputed distance
        float mag = repulsion / dist;
        vec3 dir = normalize( diff );
        
        result += dir * mag;
      }
    }
    
    result.z *= 1.0 - is2D;
    return result;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    vec3 a = vec3( 0.0 );
    vec3 b = vec3( 0.0 );
    vec3 c = vec3( 0.0 );

    // 1. Link forces (unchanged - still need to check all links)
    for ( float i = 0.0; i < edgeAmount; i += 1.0 ) {
      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;
      vec2 uv2 = vec2( uvx, uvy );
      
      b += link( i, id1, p1, v1, uv2 );
    }

    // 2. Node repulsion forces using spatial optimization
    if ( maxNeighbors <= 4.0 ) {
      // Simple case: up to 4 neighbors fit in one texel
      c = spatialCharge( id1, p1, v1, uv );
    } else {
      // Extended case: need multiple texel lookups
      c = spatialChargeExtended( id1, p1, v1, uv );
    }

    // Apply forces only to valid nodes
    b *= 1.0 - step( edgeAmount, float( id1 ) );
    c *= 1.0 - step( nodeAmount, float( id1 ) );

    // 3. Center/gravity force
    vec3 d = center( p1 );
    
    // Combine all forces
    vec3 acceleration = a + b + c + d;

    // Calculate velocity with damping and speed limiting
    vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;
    velocity = clamp( velocity, - maxSpeed, maxSpeed );
    velocity.z *= 1.0 - is2D;

    gl_FragColor = vec4( velocity, 0.0 );
  }
`;
var spatialSimplified = `
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
  uniform float maxNeighbors;
  uniform sampler2D textureLinks;

  ${getPosition}
  ${getVelocity}
  ${getIndex}
  ${random}
  ${jiggle}
  ${link}
  ${center}

  // Distance-based sampling for reduced complexity
  vec3 sampledCharge( int id1, vec3 p1, vec3 v1 ) {
    vec3 result = vec3( 0.0 );
    
    // Sample every Nth node instead of all nodes
    float sampleRate = max( 1.0, floor( nodeAmount / maxNeighbors ) );
    
    for ( float i = 0.0; i < nodeAmount; i += sampleRate ) {
      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;
      vec2 uv2 = vec2( uvx, uvy );
      
      int id2 = getIndex( uv2 );
      vec3 v2 = getVelocity( uv2 );
      vec3 p2 = getPosition( uv2 );
      
      if ( id1 != id2 ) {
        vec3 diff = ( p2 + v2 ) - ( p1 + v1 );
        diff.z *= 1.0 - is2D;
        
        float dist = length( diff );
        if ( dist > 0.0001 ) {
          float mag = repulsion / dist;
          vec3 dir = normalize( diff );
          result += dir * mag * sampleRate; // Scale by sample rate
        }
      }
    }
    
    result.z *= 1.0 - is2D;
    return result;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int id1 = getIndex( uv );

    vec3 p1 = getPosition( uv );
    vec3 v1 = getVelocity( uv );

    vec3 a = vec3( 0.0 );
    vec3 b = vec3( 0.0 );
    vec3 c = vec3( 0.0 );

    // Link forces (unchanged)
    for ( float i = 0.0; i < edgeAmount; i += 1.0 ) {
      float uvx = mod( i, size ) / size;
      float uvy = floor( i / size ) / size;
      vec2 uv2 = vec2( uvx, uvy );
      
      b += link( i, id1, p1, v1, uv2 );
    }

    // Sampled repulsion forces
    c = sampledCharge( id1, p1, v1 );

    // Apply forces only to valid nodes
    b *= 1.0 - step( edgeAmount, float( id1 ) );
    c *= 1.0 - step( nodeAmount, float( id1 ) );

    // Center/gravity force
    vec3 d = center( p1 );
    
    // Combine all forces
    vec3 acceleration = a + b + c + d;

    // Calculate velocity
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
  spatial,
  spatialSimplified,
  types: [...types, "spatial", "spatialSimplified"]
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
    uniform sampler2D texturePositions;

    varying vec3 vColor;
    varying float vImageKey;
    varying float vDistance;

    attribute float imageKey;

    void main() {

      vec4 texel = texture2D( texturePositions, position.xy );
      vec3 vPosition = texel.xyz;
      vPosition.z *= 1.0 - is2D;

      vec4 mvPosition = modelViewMatrix * vec4( vPosition, 1.0 );

      gl_PointSize = nodeRadius * nodeScale;
      gl_PointSize *= mix( 1.0, frustumSize / - mvPosition.z, sizeAttenuation );

      vDistance = 1.0 / - mvPosition.z;
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

    ${circle}

    void main() {

      vec2 uv = 2.0 * vec2( gl_PointCoord ) - 1.0;
      float t = circle( uv, vec2( 0.0, 0.0 ), 0.5, 1.0 );

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
var points_default = points;

// src/texture-atlas.js
var import_three = require("three");
var anchor;
var TextureAtlas = class _TextureAtlas extends import_three.Texture {
  map = [];
  dimensions = 1;
  isTextureAtlas = true;
  constructor() {
    if (!anchor) {
      anchor = document.createElement("a");
    }
    super(document.createElement("canvas"));
    this.flipY = false;
  }
  static Resolution = 1024;
  static getAbsoluteURL(path) {
    anchor.href = path;
    return anchor.href;
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
        textureAtlas: { value: atlas },
        size: uniforms.size,
        opacity: uniforms.opacity,
        uColor: uniforms.pointColor,
        inheritColors: uniforms.pointsInheritColor
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
    const vertices = [];
    const colors = [];
    const imageKeys = [];
    return each(data.nodes, (_, i) => {
      const node = data.nodes[i];
      const x = i % size2 / size2;
      const y = Math.floor(i / size2) / size2;
      const z = i + 1;
      vertices.push(x, y, z);
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
    }).then(() => {
      const geometry = new import_three2.BufferGeometry();
      geometry.setAttribute(
        "position",
        new import_three2.Float32BufferAttribute(vertices, 3)
      );
      geometry.setAttribute(
        "color",
        new import_three2.Float32BufferAttribute(colors, 3)
      );
      geometry.setAttribute(
        "imageKey",
        new import_three2.Float32BufferAttribute(imageKeys, 1)
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

    uniform float is2D;
    uniform sampler2D texturePositions;

    varying vec3 vColor;

    void main() {

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
var links_default = links;

// src/links.js
var Links = class extends import_three3.LineSegments {
  constructor(geometry, uniforms) {
    const material = new import_three3.ShaderMaterial({
      uniforms: { ...import_three3.UniformsLib["fog"], ...{
        is2D: uniforms.is2D,
        inheritColors: uniforms.linksInheritColor,
        opacity: uniforms.opacity,
        texturePositions: { value: null },
        uColor: uniforms.linkColor
      } },
      vertexShader: links_default.vertexShader,
      fragmentShader: links_default.fragmentShader,
      transparent: true,
      vertexColors: true,
      fog: true
    });
    super(geometry, material);
    this.frustumCulled = false;
  }
  static parse(points2, data) {
    const geometry = new import_three3.BufferGeometry();
    const vertices = [];
    const colors = [];
    const v = points2.geometry.attributes.position.array;
    const c = points2.geometry.attributes.color.array;
    return each(data.links, (_, i) => {
      const l = data.links[i];
      const si = 3 * l.sourceIndex;
      const ti = 3 * l.targetIndex;
      let x = v[si + 0];
      let y = v[si + 1];
      let z = v[si + 2];
      let r = c[si + 0];
      let g = c[si + 1];
      let b = c[si + 2];
      vertices.push(x, y, z);
      colors.push(r, g, b);
      x = v[ti + 0];
      y = v[ti + 1];
      z = v[ti + 2];
      r = c[ti + 0];
      g = c[ti + 1];
      b = c[ti + 2];
      vertices.push(x, y, z);
      colors.push(r, g, b);
    }).then(() => {
      geometry.setAttribute(
        "position",
        new import_three3.Float32BufferAttribute(vertices, 3)
      );
      geometry.setAttribute(
        "color",
        new import_three3.Float32BufferAttribute(colors, 3)
      );
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
    uniform sampler2D texturePositions;

    varying vec3 vColor;
    varying float vDistance;

    void main() {

      vec4 texel = texture2D( texturePositions, position.xy );
      vec3 vPosition = texel.xyz;
      vPosition.z *= 1.0 - is2D;

      vec4 mvPosition = modelViewMatrix * vec4( vPosition, 1.0 );

      gl_PointSize = nodeRadius * nodeScale;
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
    // Calculate memory requirements
    const totalElements = textureSize * textureSize;
    const nodesDataSize = nodes.length * 4 * 4;
    const linksDataSize = links.length * 2 * 4;
    const positionsSize = totalElements * 4 * 4;
    const linksTextureSize = totalElements * 4 * 4;
    
    // Use simple memory allocation (grow memory as needed)
    const memory = wasmModule.exports.memory;
    const memoryNeeded = nodesDataSize + linksDataSize + positionsSize + linksTextureSize;
    const currentSize = memory.buffer.byteLength;
    
    if (currentSize < memoryNeeded) {
      const pagesNeeded = Math.ceil((memoryNeeded - currentSize) / 65536);
      memory.grow(pagesNeeded);
    }
    
    // Simple memory layout - allocate sequentially
    let memoryOffset = 0;
    const nodesDataPtr = memoryOffset;
    memoryOffset += nodesDataSize;
    const linksDataPtr = memoryOffset;
    memoryOffset += linksDataSize;
    const positionsPtr = memoryOffset;
    memoryOffset += positionsSize;
    const linksTexturePtr = memoryOffset;
    
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
    
    // Process textures in WASM (if function exists)
    if (wasmModule.exports.processTextures) {
      wasmModule.exports.processTextures(
        nodesDataPtr,
        nodes.length,
        linksDataPtr,
        links.length,
        textureSize,
        positionsPtr,
        linksTexturePtr,
        frustumSize
      );
    } else {
      throw new Error('WASM processTextures function not found');
    }
    
    // Extract results
    const positionsData = new Float32Array(memory.buffer, positionsPtr, totalElements * 4);
    const linksTextureData = new Float32Array(memory.buffer, linksTexturePtr, totalElements * 4);
    
    // Copy results to transferable buffers
    const positionsResult = new Float32Array(positionsData);
    const linksResult = new Float32Array(linksTextureData);
    
    const processingTime = performance.now() - startTime;
    
    // Send results back to main thread
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: true,
      data: {
        positions: positionsResult,
        links: linksResult,
        processingTime,
        memoryUsage: memory.buffer.byteLength
      }
    }, [positionsResult.buffer, linksResult.buffer]);
    
  } catch (error) {
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: false,
      error: error.message
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
    const totalElements = textureSize * textureSize;
    const positionsData = new Float32Array(totalElements * 4);
    const linksData = new Float32Array(totalElements * 4);
    
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
    
    // Process links
    for (let i = 0; i < totalElements; i++) {
      const baseIndex = i * 4;
      
      if (i < links.length) {
        const link = links[i];
        const sourceIndex = link.sourceIndex;
        const targetIndex = link.targetIndex;
        
        const sourceU = (sourceIndex % textureSize) / textureSize;
        const sourceV = Math.floor(sourceIndex / textureSize) / textureSize;
        const targetU = (targetIndex % textureSize) / textureSize;
        const targetV = Math.floor(targetIndex / textureSize) / textureSize;
        
        linksData[baseIndex + 0] = sourceU;
        linksData[baseIndex + 1] = sourceV;
        linksData[baseIndex + 2] = targetU;
        linksData[baseIndex + 3] = targetV;
      } else {
        linksData[baseIndex + 0] = 0;
        linksData[baseIndex + 1] = 0;
        linksData[baseIndex + 2] = 0;
        linksData[baseIndex + 3] = 0;
      }
    }
    
    const processingTime = performance.now() - startTime;
    
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: true,
      data: {
        positions: positionsData,
        links: linksData,
        processingTime,
        memoryUsage: 0
      }
    }, [positionsData.buffer, linksData.buffer]);
    
  } catch (error) {
    self.postMessage({
      type: 'texture-processed',
      requestId,
      success: false,
      error: error.message
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

// src/spatial-grid.js
var import_three5 = require("three");
var SpatialGrid = class {
  constructor(gridResolution = 32, maxNeighbors = 32) {
    this.gridResolution = gridResolution;
    this.maxNeighbors = maxNeighbors;
    this.gridSize = gridResolution * gridResolution * gridResolution;
    this.useMultiResolution = true;
    this.denseThreshold = 8;
    this.sparseThreshold = 2;
    this.fineGridResolution = 64;
    this.coarseGridResolution = 16;
    this.grid = /* @__PURE__ */ new Map();
    this.fineGrid = /* @__PURE__ */ new Map();
    this.coarseGrid = /* @__PURE__ */ new Map();
    this.densityMap = /* @__PURE__ */ new Map();
    this.currentResolution = gridResolution;
    this.bounds = { min: { x: -100, y: -100, z: -100 }, max: { x: 100, y: 100, z: 100 } };
    this.cellSize = { x: 200 / gridResolution, y: 200 / gridResolution, z: 200 / gridResolution };
    this.neighborsTexture = null;
    this.neighborsDistanceTexture = null;
    this.textureSize = 0;
    this.previousPositions = null;
    this.movementThreshold = 0.1;
    this.cachedNeighborData = null;
    this.lastFullUpdateFrame = 0;
    this.cpuPositionCache = null;
    this.initialNodePositions = null;
    this.positionUpdateSimulation = null;
    this.lastUpdateTime = 0;
    this.updateInterval = 10;
    this.frameCount = 0;
  }
  /**
   * Initialize spatial grid with node data for CPU-side tracking
   * @param {Array} nodes - Array of node objects with x, y, z, isStatic properties
   */
  setInitialNodeData(nodes) {
    this.initialNodePositions = nodes.map((node) => ({
      x: node.x || (Math.random() - 0.5) * 200,
      y: node.y || (Math.random() - 0.5) * 200,
      z: node.z || (Math.random() - 0.5) * 200,
      isStatic: node.isStatic || false
    }));
    this.cpuPositionCache = null;
    this.initPositionSimulation();
  }
  /**
   * Initialize a simple CPU-side position simulation for movement estimation
   */
  initPositionSimulation() {
    if (!this.initialNodePositions) return;
    this.positionUpdateSimulation = {
      positions: this.initialNodePositions.map((node) => ({ ...node })),
      velocities: this.initialNodePositions.map(() => ({ x: 0, y: 0, z: 0 })),
      lastUpdateTime: performance.now()
    };
  }
  /**
   * Simple CPU-side position simulation to estimate current positions
   * This provides approximate positions without GPU readback
   * Updates only occasionally to reduce CPU overhead
   */
  updatePositionSimulation() {
    if (!this.positionUpdateSimulation) return;
    const currentTime = performance.now();
    const deltaTime = currentTime - this.positionUpdateSimulation.lastUpdateTime;
    if (deltaTime < 100) return;
    const damping = 0.98;
    const timeStep = Math.min(0.05, deltaTime * 1e-3);
    for (let i = 0; i < this.positionUpdateSimulation.positions.length; i++) {
      const pos = this.positionUpdateSimulation.positions[i];
      const vel = this.positionUpdateSimulation.velocities[i];
      if (pos.isStatic) continue;
      const centerForce = 5e-3;
      const randomForce = 2e-3;
      vel.x -= pos.x * centerForce * timeStep;
      vel.y -= pos.y * centerForce * timeStep;
      vel.z -= pos.z * centerForce * timeStep;
      vel.x += (Math.random() - 0.5) * randomForce * timeStep;
      vel.y += (Math.random() - 0.5) * randomForce * timeStep;
      vel.z += (Math.random() - 0.5) * randomForce * timeStep;
      vel.x *= damping;
      vel.y *= damping;
      vel.z *= damping;
      const maxVel = 50;
      vel.x = Math.max(-maxVel, Math.min(maxVel, vel.x));
      vel.y = Math.max(-maxVel, Math.min(maxVel, vel.y));
      vel.z = Math.max(-maxVel, Math.min(maxVel, vel.z));
      pos.x += vel.x * timeStep;
      pos.y += vel.y * timeStep;
      pos.z += vel.z * timeStep;
      const maxPos = 500;
      pos.x = Math.max(-maxPos, Math.min(maxPos, pos.x));
      pos.y = Math.max(-maxPos, Math.min(maxPos, pos.y));
      pos.z = Math.max(-maxPos, Math.min(maxPos, pos.z));
    }
    this.positionUpdateSimulation.lastUpdateTime = currentTime;
    this.updateCpuPositionCache();
  }
  /**
   * Update CPU position cache from simulation
   */
  updateCpuPositionCache() {
    if (!this.positionUpdateSimulation) return;
    const size2 = this.textureSize;
    if (!this.cpuPositionCache || this.cpuPositionCache.length < size2 * size2 * 4) {
      this.cpuPositionCache = new Float32Array(size2 * size2 * 4);
    }
    for (let i = 0; i < this.positionUpdateSimulation.positions.length && i < size2 * size2; i++) {
      const pos = this.positionUpdateSimulation.positions[i];
      const idx = i * 4;
      this.cpuPositionCache[idx] = pos.x;
      this.cpuPositionCache[idx + 1] = pos.y;
      this.cpuPositionCache[idx + 2] = pos.z;
      this.cpuPositionCache[idx + 3] = pos.isStatic ? 1 : 0;
    }
  }
  /**
   * Update spatial grid with current node positions
   * @param {WebGLRenderer} renderer - Three.js renderer
   * @param {DataTexture} positionsTexture - GPU texture containing node positions
   * @param {number} nodeCount - Number of active nodes
   * @param {number} maxNeighbors - Maximum neighbors per node
   */
  update(renderer, positionsTexture, nodeCount, maxNeighbors = this.maxNeighbors) {
    this.frameCount++;
    if (this.frameCount % this.updateInterval !== 0) {
      return false;
    }
    const startTime = performance.now();
    this.maxNeighbors = maxNeighbors;
    this.textureSize = getPotSize(nodeCount);
    this.updatePositionSimulation();
    const positions2 = this.readPositions(renderer, positionsTexture, nodeCount);
    const movementResult = this.previousPositions ? this.hasSignificantMovement(positions2) : true;
    if (movementResult === false) {
      return false;
    }
    let neighborData;
    if (Array.isArray(movementResult)) {
      neighborData = this.incrementalUpdate(positions2, movementResult);
    } else {
      this.updateBounds(positions2);
      this.buildGrid(positions2);
      neighborData = this.findNeighbors(positions2);
    }
    this.updateTextures(neighborData);
    this.cachedNeighborData = {
      indices: new Int32Array(neighborData.indices),
      distances: new Float32Array(neighborData.distances)
    };
    this.previousPositions = new Float32Array(positions2);
    if (!Array.isArray(movementResult)) {
      this.lastFullUpdateFrame = this.frameCount;
    }
    this.lastUpdateTime = performance.now() - startTime;
    return true;
  }
  /**
   * Read position data from GPU texture using a more reliable approach
   * Instead of reading GPU pixels, we'll use CPU-side position tracking
   * @param {WebGLRenderer} renderer - Three.js renderer
   * @param {DataTexture} positionsTexture - GPU texture with positions (not used directly)
   * @param {number} nodeCount - Number of nodes to read
   * @returns {Float32Array} Position data [x1, y1, z1, w1, x2, y2, z2, w2, ...]
   */
  readPositions(renderer, positionsTexture, nodeCount) {
    if (this.cpuPositionCache && this.cpuPositionCache.length >= nodeCount * 4) {
      return this.cpuPositionCache;
    }
    const size2 = this.textureSize;
    const buffer = new Float32Array(size2 * size2 * 4);
    if (this.initialNodePositions) {
      for (let i = 0; i < Math.min(nodeCount, this.initialNodePositions.length); i++) {
        const node = this.initialNodePositions[i];
        const idx = i * 4;
        buffer[idx] = node.x || (Math.random() - 0.5) * 200;
        buffer[idx + 1] = node.y || (Math.random() - 0.5) * 200;
        buffer[idx + 2] = node.z || (Math.random() - 0.5) * 200;
        buffer[idx + 3] = node.isStatic ? 1 : 0;
      }
    } else {
      for (let i = 0; i < nodeCount; i++) {
        const idx = i * 4;
        const angle = i / nodeCount * Math.PI * 2;
        const radius = Math.sqrt(i / nodeCount) * 100;
        buffer[idx] = Math.cos(angle) * radius + (Math.random() - 0.5) * 20;
        buffer[idx + 1] = Math.sin(angle) * radius + (Math.random() - 0.5) * 20;
        buffer[idx + 2] = (Math.random() - 0.5) * 50;
        buffer[idx + 3] = 0;
      }
    }
    this.cpuPositionCache = buffer;
    return buffer;
  }
  /**
   * Check if nodes have moved significantly since last update
   * Uses both global movement threshold and per-node tracking for optimal performance
   * @param {Float32Array} positions - Current positions
   * @returns {boolean|Array} True if significant movement detected, or array of moved node indices
   */
  hasSignificantMovement(positions2) {
    if (!this.previousPositions || this.previousPositions.length !== positions2.length) {
      return true;
    }
    let maxMovement = 0;
    let movedNodes = [];
    const nodeCount = Math.floor(positions2.length / 4);
    for (let i = 0; i < nodeCount; i++) {
      const idx = i * 4;
      const dx = positions2[idx] - this.previousPositions[idx];
      const dy = positions2[idx + 1] - this.previousPositions[idx + 1];
      const dz = positions2[idx + 2] - this.previousPositions[idx + 2];
      const movement = Math.sqrt(dx * dx + dy * dy + dz * dz);
      maxMovement = Math.max(maxMovement, movement);
      if (movement > this.movementThreshold) {
        movedNodes.push(i);
      }
    }
    if (movedNodes.length < nodeCount * 0.1 && movedNodes.length > 0) {
      return movedNodes;
    }
    return maxMovement > this.movementThreshold;
  }
  /**
   * Update spatial bounds based on node positions
   * @param {Float32Array} positions - Node positions
   */
  updateBounds(positions2) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < positions2.length; i += 4) {
      const x = positions2[i];
      const y = positions2[i + 1];
      const z = positions2[i + 2];
      if (isFinite(x) && isFinite(y) && isFinite(z)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }
    }
    const padding = 10;
    this.bounds = {
      min: { x: minX - padding, y: minY - padding, z: minZ - padding },
      max: { x: maxX + padding, y: maxY + padding, z: maxZ + padding }
    };
    this.cellSize = {
      x: (this.bounds.max.x - this.bounds.min.x) / this.gridResolution,
      y: (this.bounds.max.y - this.bounds.min.y) / this.gridResolution,
      z: (this.bounds.max.z - this.bounds.min.z) / this.gridResolution
    };
  }
  /**
   * Build multi-resolution spatial grid from node positions
   * @param {Float32Array} positions - Node positions
   */
  buildGrid(positions2) {
    this.grid.clear();
    this.fineGrid.clear();
    this.coarseGrid.clear();
    this.densityMap.clear();
    if (!this.useMultiResolution) {
      return this.buildSingleGrid(positions2, this.gridResolution, this.grid);
    }
    const densityGrid = /* @__PURE__ */ new Map();
    for (let i = 0; i < positions2.length; i += 4) {
      const x = positions2[i];
      const y = positions2[i + 1];
      const z = positions2[i + 2];
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      const cell = this.getGridCellAtResolution(x, y, z, this.gridResolution);
      const cellKey = this.getCellKey(cell.x, cell.y, cell.z);
      if (!densityGrid.has(cellKey)) {
        densityGrid.set(cellKey, 0);
      }
      densityGrid.set(cellKey, densityGrid.get(cellKey) + 1);
    }
    for (let i = 0; i < positions2.length; i += 4) {
      const x = positions2[i];
      const y = positions2[i + 1];
      const z = positions2[i + 2];
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      const nodeIndex = Math.floor(i / 4);
      const node = { index: nodeIndex, x, y, z };
      const baseCell = this.getGridCellAtResolution(x, y, z, this.gridResolution);
      const baseCellKey = this.getCellKey(baseCell.x, baseCell.y, baseCell.z);
      const density = densityGrid.get(baseCellKey) || 0;
      if (density >= this.denseThreshold) {
        const fineCell = this.getGridCellAtResolution(x, y, z, this.fineGridResolution);
        const fineCellKey = this.getCellKey(fineCell.x, fineCell.y, fineCell.z);
        if (!this.fineGrid.has(fineCellKey)) {
          this.fineGrid.set(fineCellKey, []);
        }
        this.fineGrid.get(fineCellKey).push(node);
      } else if (density <= this.sparseThreshold) {
        const coarseCell = this.getGridCellAtResolution(x, y, z, this.coarseGridResolution);
        const coarseCellKey = this.getCellKey(coarseCell.x, coarseCell.y, coarseCell.z);
        if (!this.coarseGrid.has(coarseCellKey)) {
          this.coarseGrid.set(coarseCellKey, []);
        }
        this.coarseGrid.get(coarseCellKey).push(node);
      } else {
        const cell = this.getGridCellAtResolution(x, y, z, this.gridResolution);
        const cellKey = this.getCellKey(cell.x, cell.y, cell.z);
        if (!this.grid.has(cellKey)) {
          this.grid.set(cellKey, []);
        }
        this.grid.get(cellKey).push(node);
      }
      this.densityMap.set(nodeIndex, density);
    }
  }
  /**
   * Build single-resolution grid (fallback method)
   * @param {Float32Array} positions - Node positions
   * @param {number} resolution - Grid resolution
   * @param {Map} targetGrid - Target grid to populate
   */
  buildSingleGrid(positions2, resolution, targetGrid) {
    for (let i = 0; i < positions2.length; i += 4) {
      const x = positions2[i];
      const y = positions2[i + 1];
      const z = positions2[i + 2];
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      const cell = this.getGridCellAtResolution(x, y, z, resolution);
      const cellKey = this.getCellKey(cell.x, cell.y, cell.z);
      if (!targetGrid.has(cellKey)) {
        targetGrid.set(cellKey, []);
      }
      targetGrid.get(cellKey).push({
        index: Math.floor(i / 4),
        x,
        y,
        z
      });
    }
  }
  /**
   * Get grid cell coordinates for a position at default resolution
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate  
   * @param {number} z - Z coordinate
   * @returns {Object} Grid cell coordinates
   */
  getGridCell(x, y, z) {
    return this.getGridCellAtResolution(x, y, z, this.gridResolution);
  }
  /**
   * Get grid cell coordinates for a position at specific resolution
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate  
   * @param {number} z - Z coordinate
   * @param {number} resolution - Grid resolution
   * @returns {Object} Grid cell coordinates
   */
  getGridCellAtResolution(x, y, z, resolution) {
    const cellSizeX = (this.bounds.max.x - this.bounds.min.x) / resolution;
    const cellSizeY = (this.bounds.max.y - this.bounds.min.y) / resolution;
    const cellSizeZ = (this.bounds.max.z - this.bounds.min.z) / resolution;
    return {
      x: Math.floor((x - this.bounds.min.x) / cellSizeX),
      y: Math.floor((y - this.bounds.min.y) / cellSizeY),
      z: Math.floor((z - this.bounds.min.z) / cellSizeZ)
    };
  }
  /**
   * Generate unique key for grid cell
   * @param {number} x - Cell X coordinate
   * @param {number} y - Cell Y coordinate
   * @param {number} z - Cell Z coordinate
   * @returns {string} Unique cell key
   */
  getCellKey(x, y, z) {
    return `${x},${y},${z}`;
  }
  /**
   * Find N nearest neighbors for each node
   * @param {Float32Array} positions - Node positions
   * @returns {Object} Neighbor data with indices and distances
   */
  findNeighbors(positions2) {
    const nodeCount = Math.floor(positions2.length / 4);
    const neighborIndices = new Int32Array(nodeCount * this.maxNeighbors);
    const neighborDistances = new Float32Array(nodeCount * this.maxNeighbors);
    neighborIndices.fill(-1);
    neighborDistances.fill(Infinity);
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
      const x = positions2[nodeIndex * 4];
      const y = positions2[nodeIndex * 4 + 1];
      const z = positions2[nodeIndex * 4 + 2];
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      const neighbors = this.findNodeNeighbors(nodeIndex, x, y, z);
      const baseIndex = nodeIndex * this.maxNeighbors;
      for (let i = 0; i < Math.min(neighbors.length, this.maxNeighbors); i++) {
        neighborIndices[baseIndex + i] = neighbors[i].index;
        neighborDistances[baseIndex + i] = neighbors[i].distance;
      }
    }
    return { indices: neighborIndices, distances: neighborDistances };
  }
  /**
   * Perform incremental update for specific moved nodes
   * @param {Float32Array} positions - Current node positions
   * @param {Array} movedNodeIndices - Indices of nodes that moved significantly
   * @returns {Object} Updated neighbor data
   */
  incrementalUpdate(positions2, movedNodeIndices) {
    if (!this.cachedNeighborData) {
      this.updateBounds(positions2);
      this.buildGrid(positions2);
      return this.findNeighbors(positions2);
    }
    const neighborIndices = new Int32Array(this.cachedNeighborData.indices);
    const neighborDistances = new Float32Array(this.cachedNeighborData.distances);
    this.buildGrid(positions2);
    const affectedNodes = new Set(movedNodeIndices);
    for (const movedIndex of movedNodeIndices) {
      const x = positions2[movedIndex * 4];
      const y = positions2[movedIndex * 4 + 1];
      const z = positions2[movedIndex * 4 + 2];
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      const influenceRadius = this.cellSize.x * 2;
      const nodeCount = Math.floor(positions2.length / 4);
      for (let i = 0; i < nodeCount; i++) {
        if (affectedNodes.has(i)) continue;
        const otherX = positions2[i * 4];
        const otherY = positions2[i * 4 + 1];
        const otherZ = positions2[i * 4 + 2];
        if (!isFinite(otherX) || !isFinite(otherY) || !isFinite(otherZ)) continue;
        const dx = otherX - x;
        const dy = otherY - y;
        const dz = otherZ - z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance <= influenceRadius) {
          affectedNodes.add(i);
        }
      }
    }
    for (const nodeIndex of affectedNodes) {
      const x = positions2[nodeIndex * 4];
      const y = positions2[nodeIndex * 4 + 1];
      const z = positions2[nodeIndex * 4 + 2];
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      const neighbors = this.findNodeNeighbors(nodeIndex, x, y, z);
      const baseIndex = nodeIndex * this.maxNeighbors;
      for (let i = 0; i < this.maxNeighbors; i++) {
        neighborIndices[baseIndex + i] = -1;
        neighborDistances[baseIndex + i] = Infinity;
      }
      for (let i = 0; i < Math.min(neighbors.length, this.maxNeighbors); i++) {
        neighborIndices[baseIndex + i] = neighbors[i].index;
        neighborDistances[baseIndex + i] = neighbors[i].distance;
      }
    }
    return { indices: neighborIndices, distances: neighborDistances };
  }
  /**
   * Find neighbors for a specific node across all resolution grids
   * @param {number} nodeIndex - Index of the node
   * @param {number} x - Node X position
   * @param {number} y - Node Y position
   * @param {number} z - Node Z position
   * @returns {Array} Sorted array of neighbors
   */
  findNodeNeighbors(nodeIndex, x, y, z) {
    const neighbors = [];
    if (!this.useMultiResolution) {
      return this.findNeighborsInGrid(nodeIndex, x, y, z, this.grid, this.gridResolution);
    }
    const density = this.densityMap.get(nodeIndex) || 0;
    if (density >= this.denseThreshold) {
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.fineGrid, this.fineGridResolution));
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.grid, this.gridResolution));
    } else if (density <= this.sparseThreshold) {
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.coarseGrid, this.coarseGridResolution));
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.grid, this.gridResolution));
    } else {
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.grid, this.gridResolution));
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.fineGrid, this.fineGridResolution));
      neighbors.push(...this.findNeighborsInGrid(nodeIndex, x, y, z, this.coarseGrid, this.coarseGridResolution));
    }
    const uniqueNeighbors = /* @__PURE__ */ new Map();
    for (const neighbor of neighbors) {
      if (!uniqueNeighbors.has(neighbor.index) || uniqueNeighbors.get(neighbor.index).distance > neighbor.distance) {
        uniqueNeighbors.set(neighbor.index, neighbor);
      }
    }
    const result = Array.from(uniqueNeighbors.values());
    result.sort((a, b) => a.distance - b.distance);
    return result.slice(0, this.maxNeighbors * 2);
  }
  /**
   * Find neighbors in a specific grid
   * @param {number} nodeIndex - Index of the node
   * @param {number} x - Node X position
   * @param {number} y - Node Y position
   * @param {number} z - Node Z position
   * @param {Map} grid - Grid to search in
   * @param {number} resolution - Grid resolution
   * @returns {Array} Array of neighbors from this grid
   */
  findNeighborsInGrid(nodeIndex, x, y, z, grid, resolution) {
    const neighbors = [];
    const cell = this.getGridCellAtResolution(x, y, z, resolution);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const searchCell = {
            x: cell.x + dx,
            y: cell.y + dy,
            z: cell.z + dz
          };
          const cellKey = this.getCellKey(searchCell.x, searchCell.y, searchCell.z);
          const cellNodes = grid.get(cellKey);
          if (cellNodes) {
            for (const node of cellNodes) {
              if (node.index === nodeIndex) continue;
              const dx2 = node.x - x;
              const dy2 = node.y - y;
              const dz2 = node.z - z;
              const distance = Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2);
              neighbors.push({ index: node.index, distance });
            }
          }
        }
      }
    }
    return neighbors;
  }
  /**
   * Update GPU textures with neighbor data
   * @param {Object} neighborData - Neighbor indices and distances
   */
  updateTextures(neighborData) {
    const { indices, distances } = neighborData;
    const nodeCount = Math.floor(indices.length / this.maxNeighbors);
    if (!this.neighborsTexture || this.neighborsTexture.image.width !== this.textureSize) {
      this.createTextures();
    }
    const indicesData = new Float32Array(this.textureSize * this.textureSize * 4);
    const distancesData = new Float32Array(this.textureSize * this.textureSize * 4);
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
      const textureIndex = nodeIndex * 4;
      const neighborBase = nodeIndex * this.maxNeighbors;
      for (let i = 0; i < 4 && i < this.maxNeighbors; i++) {
        const neighborIndex = indices[neighborBase + i];
        const distance = distances[neighborBase + i];
        indicesData[textureIndex + i] = neighborIndex >= 0 ? neighborIndex : -1;
        distancesData[textureIndex + i] = isFinite(distance) ? distance : 0;
      }
    }
    this.neighborsTexture.image.data = indicesData;
    this.neighborsTexture.needsUpdate = true;
    this.neighborsDistanceTexture.image.data = distancesData;
    this.neighborsDistanceTexture.needsUpdate = true;
  }
  /**
   * Create GPU textures for neighbor data
   */
  createTextures() {
    const size2 = this.textureSize;
    this.neighborsTexture = new import_three5.DataTexture(
      new Float32Array(size2 * size2 * 4),
      size2,
      size2,
      import_three5.RGBAFormat,
      import_three5.FloatType
    );
    this.neighborsTexture.needsUpdate = true;
    this.neighborsDistanceTexture = new import_three5.DataTexture(
      new Float32Array(size2 * size2 * 4),
      size2,
      size2,
      import_three5.RGBAFormat,
      import_three5.FloatType
    );
    this.neighborsDistanceTexture.needsUpdate = true;
  }
  /**
   * Get neighbor texture for GPU shaders
   * @returns {DataTexture} Texture containing neighbor indices
   */
  getNeighborsTexture() {
    return this.neighborsTexture;
  }
  /**
   * Get neighbor distance texture for GPU shaders
   * @returns {DataTexture} Texture containing neighbor distances
   */
  getNeighborsDistanceTexture() {
    return this.neighborsDistanceTexture;
  }
  /**
   * Get performance statistics
   * @returns {Object} Performance info
   */
  getPerformanceInfo() {
    return {
      lastUpdateTime: this.lastUpdateTime,
      gridCells: this.grid.size,
      maxNeighbors: this.maxNeighbors,
      updateInterval: this.updateInterval,
      frameCount: this.frameCount
    };
  }
  /**
   * Set update interval for performance tuning
   * @param {number} interval - Number of frames between updates
   */
  setUpdateInterval(interval) {
    this.updateInterval = Math.max(1, interval);
  }
  /**
   * Set movement threshold for temporal coherence
   * @param {number} threshold - Minimum movement to trigger update
   */
  setMovementThreshold(threshold) {
    this.movementThreshold = threshold;
  }
  /**
   * Enable or disable multi-resolution grid
   * @param {boolean} enabled - Whether to use multi-resolution
   */
  setMultiResolution(enabled) {
    this.useMultiResolution = enabled;
  }
  /**
   * Configure density thresholds for multi-resolution grid
   * @param {number} denseThreshold - Nodes per cell for fine grid
   * @param {number} sparseThreshold - Nodes per cell for coarse grid
   */
  setDensityThresholds(denseThreshold, sparseThreshold) {
    this.denseThreshold = denseThreshold;
    this.sparseThreshold = sparseThreshold;
  }
  /**
   * Configure grid resolutions
   * @param {number} fine - Fine grid resolution
   * @param {number} standard - Standard grid resolution
   * @param {number} coarse - Coarse grid resolution
   */
  setGridResolutions(fine, standard, coarse) {
    this.fineGridResolution = fine;
    this.gridResolution = standard;
    this.coarseGridResolution = coarse;
  }
  /**
   * Dispose of GPU resources
   */
  dispose() {
    if (this.neighborsTexture) {
      this.neighborsTexture.dispose();
      this.neighborsTexture = null;
    }
    if (this.neighborsDistanceTexture) {
      this.neighborsDistanceTexture.dispose();
      this.neighborsDistanceTexture = null;
    }
    this.grid.clear();
    this.fineGrid.clear();
    this.coarseGrid.clear();
    this.densityMap.clear();
    this.previousPositions = null;
    this.cachedNeighborData = null;
    this.cpuPositionCache = null;
    this.initialNodePositions = null;
    this.positionUpdateSimulation = null;
  }
};

// src/performance-monitor.js
var PerformanceMonitor = class {
  constructor(targetFPS = 30, sampleSize = 60) {
    this.targetFPS = targetFPS;
    this.sampleSize = sampleSize;
    this.frameTimes = [];
    this.lastFrameTime = 0;
    this.currentFPS = 0;
    this.averageFPS = 0;
    this.frameCount = 0;
    this.metrics = {
      averageFrameTime: 0,
      minFPS: Infinity,
      maxFPS: 0,
      spatialGridUpdateTime: 0,
      gpuComputeTime: 0,
      memoryUsage: 0,
      nodeCount: 0,
      edgeCount: 0
    };
    this.autoTuneEnabled = true;
    this.tuneInterval = 120;
    this.lastTuneFrame = 0;
    this.tuningHistory = [];
    this.thresholds = {
      critical: this.targetFPS * 0.5,
      // 50% of target
      warning: this.targetFPS * 0.75,
      // 75% of target
      optimal: this.targetFPS * 1.1
      // 110% of target
    };
    this.tuningParams = {
      maxNeighbors: { min: 8, max: 128, current: 32, step: 4 },
      updateInterval: { min: 1, max: 30, current: 10, step: 2 },
      movementThreshold: { min: 0.01, max: 1, current: 0.1, step: 0.02 }
    };
    this.systemInfo = {
      webglVersion: this.detectWebGLVersion(),
      maxTextureSize: 0,
      gpuVendor: "unknown",
      cores: navigator.hardwareConcurrency || 4,
      memory: this.estimateSystemMemory()
    };
    this.detectSystemCapabilities();
  }
  /**
   * Update performance metrics with current frame timing
   * @param {number} currentTime - Current timestamp
   * @param {Object} additionalMetrics - Additional performance data
   */
  update(currentTime, additionalMetrics = {}) {
    if (this.lastFrameTime > 0) {
      const frameTime = currentTime - this.lastFrameTime;
      this.frameTimes.push(frameTime);
      if (this.frameTimes.length > this.sampleSize) {
        this.frameTimes.shift();
      }
      this.currentFPS = frameTime > 0 ? 1e3 / frameTime : 0;
      this.averageFPS = this.frameTimes.length > 0 ? 1e3 / (this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length) : 0;
      this.updateMetrics(additionalMetrics);
    }
    this.lastFrameTime = currentTime;
    this.frameCount++;
    if (this.autoTuneEnabled && this.frameCount % this.tuneInterval === 0 && this.frameTimes.length >= this.sampleSize) {
      this.autoTune();
    }
  }
  /**
   * Update performance metrics
   * @param {Object} additionalMetrics - Additional metrics to track
   */
  updateMetrics(additionalMetrics) {
    if (this.frameTimes.length === 0) return;
    this.metrics.averageFrameTime = this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
    this.metrics.minFPS = Math.min(this.metrics.minFPS, this.currentFPS);
    this.metrics.maxFPS = Math.max(this.metrics.maxFPS, this.currentFPS);
    Object.assign(this.metrics, additionalMetrics);
    if (!this.metrics.memoryUsage && performance.memory) {
      this.metrics.memoryUsage = performance.memory.usedJSHeapSize;
    }
  }
  /**
   * Automatically tune parameters based on performance
   */
  autoTune() {
    const performance2 = this.getPerformanceLevel();
    const adjustment = this.calculateAdjustment(performance2);
    if (adjustment === 0) return;
    const tuningAction = {
      frame: this.frameCount,
      fps: this.averageFPS,
      performance: performance2,
      adjustment,
      changes: {}
    };
    if (performance2 === "critical" || performance2 === "warning") {
      this.adjustParameter("maxNeighbors", -adjustment, tuningAction);
      this.adjustParameter("updateInterval", adjustment, tuningAction);
      if (performance2 === "critical") {
        this.adjustParameter("movementThreshold", adjustment * 0.02, tuningAction);
      }
    } else if (performance2 === "optimal" && this.canImproveQuality()) {
      this.adjustParameter("maxNeighbors", adjustment, tuningAction);
      this.adjustParameter("updateInterval", -Math.floor(adjustment / 2), tuningAction);
    }
    if (Object.keys(tuningAction.changes).length > 0) {
      this.tuningHistory.push(tuningAction);
      this.lastTuneFrame = this.frameCount;
      console.log(`Auto-tune: ${performance2} performance (${this.averageFPS.toFixed(1)} FPS)`, tuningAction.changes);
    }
  }
  /**
   * Get current performance level
   * @returns {string} Performance level: 'critical', 'warning', 'good', 'optimal'
   */
  getPerformanceLevel() {
    if (this.averageFPS < this.thresholds.critical) return "critical";
    if (this.averageFPS < this.thresholds.warning) return "warning";
    if (this.averageFPS > this.thresholds.optimal) return "optimal";
    return "good";
  }
  /**
   * Calculate adjustment magnitude based on performance
   * @param {string} performance - Performance level
   * @returns {number} Adjustment magnitude
   */
  calculateAdjustment(performance2) {
    const fpsRatio = this.averageFPS / this.targetFPS;
    switch (performance2) {
      case "critical":
        return Math.max(2, Math.floor((1 - fpsRatio) * 8));
      case "warning":
        return Math.max(1, Math.floor((1 - fpsRatio) * 4));
      case "optimal":
        return Math.min(2, Math.floor((fpsRatio - 1) * 2));
      default:
        return 0;
    }
  }
  /**
   * Adjust a specific parameter
   * @param {string} paramName - Parameter name
   * @param {number} adjustment - Adjustment amount
   * @param {Object} tuningAction - Tuning action to record changes
   */
  adjustParameter(paramName, adjustment, tuningAction) {
    const param = this.tuningParams[paramName];
    if (!param) return;
    const oldValue = param.current;
    const newValue = Math.max(param.min, Math.min(
      param.max,
      param.current + adjustment * param.step
    ));
    if (newValue !== oldValue) {
      param.current = newValue;
      tuningAction.changes[paramName] = { from: oldValue, to: newValue };
    }
  }
  /**
   * Check if quality can be improved without hurting performance
   * @returns {boolean} True if quality improvements are safe
   */
  canImproveQuality() {
    const recentHistory = this.tuningHistory.slice(-3);
    return recentHistory.length === 0 || recentHistory.every((action) => action.performance === "optimal" || action.performance === "good");
  }
  /**
   * Get current tuning parameters
   * @returns {Object} Current parameter values
   */
  getTuningParameters() {
    const result = {};
    for (const [name, param] of Object.entries(this.tuningParams)) {
      result[name] = param.current;
    }
    return result;
  }
  /**
   * Set tuning parameter values
   * @param {Object} params - Parameter values to set
   */
  setTuningParameters(params) {
    for (const [name, value] of Object.entries(params)) {
      if (this.tuningParams[name]) {
        this.tuningParams[name].current = Math.max(
          this.tuningParams[name].min,
          Math.min(this.tuningParams[name].max, value)
        );
      }
    }
  }
  /**
   * Get comprehensive performance report
   * @returns {Object} Performance statistics and recommendations
   */
  getPerformanceReport() {
    const performanceLevel = this.getPerformanceLevel();
    const tuningParams = this.getTuningParameters();
    return {
      frameRate: {
        current: this.currentFPS,
        average: this.averageFPS,
        target: this.targetFPS,
        min: this.metrics.minFPS,
        max: this.metrics.maxFPS
      },
      performance: {
        level: performanceLevel,
        frameTime: this.metrics.averageFrameTime,
        spatialGridTime: this.metrics.spatialGridUpdateTime,
        gpuTime: this.metrics.gpuComputeTime
      },
      memory: {
        usage: this.metrics.memoryUsage,
        jsHeap: performance.memory ? performance.memory.usedJSHeapSize : 0
      },
      graph: {
        nodes: this.metrics.nodeCount,
        edges: this.metrics.edgeCount
      },
      tuning: {
        enabled: this.autoTuneEnabled,
        parameters: tuningParams,
        history: this.tuningHistory.slice(-5)
      },
      system: this.systemInfo,
      recommendations: this.generateRecommendations(performanceLevel)
    };
  }
  /**
   * Generate performance recommendations
   * @param {string} performanceLevel - Current performance level
   * @returns {Array} Array of recommendation strings
   */
  generateRecommendations(performanceLevel) {
    const recommendations = [];
    if (performanceLevel === "critical") {
      recommendations.push("Consider reducing node count or maxNeighbors");
      recommendations.push("Increase spatial grid update interval");
      recommendations.push("Disable Level-of-Detail if enabled");
    } else if (performanceLevel === "warning") {
      recommendations.push("Monitor memory usage for potential leaks");
      recommendations.push("Consider enabling temporal coherence");
    } else if (performanceLevel === "optimal") {
      recommendations.push("Performance is excellent - consider increasing visual quality");
      recommendations.push("You could increase maxNeighbors for better physics");
    }
    if (this.metrics.memoryUsage > 1024 * 1024 * 1024) {
      recommendations.push("High memory usage detected - consider optimizing textures");
    }
    if (this.systemInfo.webglVersion < 2) {
      recommendations.push("WebGL 2.0 would provide better performance");
    }
    return recommendations;
  }
  /**
   * Detect WebGL version
   * @returns {number} WebGL version (1 or 2)
   */
  detectWebGLVersion() {
    try {
      const canvas = document.createElement("canvas");
      if (canvas.getContext("webgl2")) return 2;
      if (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) return 1;
      return 0;
    } catch (e) {
      return 0;
    }
  }
  /**
   * Estimate system memory (rough approximation)
   * @returns {number} Estimated memory in MB
   */
  estimateSystemMemory() {
    if (performance.memory) {
      return Math.round(performance.memory.jsHeapSizeLimit / (1024 * 1024));
    }
    const cores = navigator.hardwareConcurrency || 4;
    return cores * 1024;
  }
  /**
   * Detect system capabilities
   */
  detectSystemCapabilities() {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (gl) {
        this.systemInfo.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          this.systemInfo.gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        }
      }
    } catch (e) {
    }
  }
  /**
   * Reset performance tracking
   */
  reset() {
    this.frameTimes = [];
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.tuningHistory = [];
    this.lastTuneFrame = 0;
    this.metrics = {
      averageFrameTime: 0,
      minFPS: Infinity,
      maxFPS: 0,
      spatialGridUpdateTime: 0,
      gpuComputeTime: 0,
      memoryUsage: 0,
      nodeCount: 0,
      edgeCount: 0
    };
  }
  /**
   * Enable or disable auto-tuning
   * @param {boolean} enabled - Whether to enable auto-tuning
   */
  setAutoTuning(enabled) {
    this.autoTuneEnabled = enabled;
  }
  /**
   * Set target FPS
   * @param {number} fps - Target frame rate
   */
  setTargetFPS(fps) {
    this.targetFPS = fps;
    this.thresholds = {
      critical: this.targetFPS * 0.5,
      warning: this.targetFPS * 0.75,
      optimal: this.targetFPS * 1.1
    };
  }
  /**
   * Set tuning interval
   * @param {number} interval - Frames between tuning attempts
   */
  setTuningInterval(interval) {
    this.tuneInterval = Math.max(30, interval);
  }
  /**
   * Check if performance is acceptable
   * @returns {boolean} True if performance meets minimum requirements
   */
  isPerformanceAcceptable() {
    return this.averageFPS >= this.thresholds.critical;
  }
  /**
   * Get frame time percentiles for detailed analysis
   * @returns {Object} Frame time statistics
   */
  getFrameTimeStatistics() {
    if (this.frameTimes.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const length = sorted.length;
    return {
      p50: sorted[Math.floor(length * 0.5)],
      p95: sorted[Math.floor(length * 0.95)],
      p99: sorted[Math.floor(length * 0.99)]
    };
  }
};

// src/index.js
var color3 = new import_three6.Color();
var position = new import_three6.Vector3();
var size = new import_three6.Vector2();
var buffers = {
  int: new Uint8ClampedArray(4),
  float: new Float32Array(4)
};
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
      nodeRadius: { value: 1 },
      nodeScale: { value: 8 },
      sizeAttenuation: { value: true },
      frustumSize: { value: 100 },
      linksInheritColor: { value: false },
      pointsInheritColor: { value: true },
      pointColor: { value: new import_three6.Color(1, 1, 1) },
      linkColor: { value: new import_three6.Color(1, 1, 1) },
      opacity: { value: 1 },
      maxNeighbors: { value: 32 },
      useSpatialGrid: { value: true }
    };
    this.userData.hit = new Hit(this);
    this.userData.workerManager = new TextureWorkerManager();
    this.userData.spatialGrid = null;
    this.userData.frameCount = 0;
    this.userData.performanceMonitor = new PerformanceMonitor();
    this.userData.fallbackState = {
      spatialGridFailed: false,
      currentShader: null,
      fallbackReason: null,
      retryAttempts: 0,
      maxRetries: 3
    };
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
    "nodeRadius",
    "nodeScale",
    "sizeAttenuation",
    "frustumSize",
    "linksInheritColor",
    "pointsInheritColor",
    "pointColor",
    "linkColor",
    "opacity",
    "blending",
    "maxNeighbors",
    "useSpatialGrid"
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
    const size2 = getPotSize(Math.max(data.nodes.length, data.links.length));
    uniforms.size.value = size2;
    gpgpu = new import_GPUComputationRenderer.GPUComputationRenderer(size2, size2, renderer);
    const textures = {
      positions: gpgpu.createTexture(),
      velocities: gpgpu.createTexture(),
      links: gpgpu.createTexture()
    };
    const { velocityShader, fallbackReason } = this.selectOptimalShader(data.nodes.length);
    if (fallbackReason) {
      console.warn(`Force Directed Graph fallback: ${fallbackReason}`);
      this.userData.fallbackState.fallbackReason = fallbackReason;
    }
    const variables = {
      positions: gpgpu.addVariable(
        "texturePositions",
        simulation_default.positions,
        textures.positions
      ),
      velocities: gpgpu.addVariable(
        "textureVelocities",
        velocityShader,
        textures.velocities
      )
    };
    this.userData.gpgpu = gpgpu;
    this.userData.variables = variables;
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
      if (!workerManager.isReady()) {
        await workerManager.init();
      }
      if (workerManager.isReady()) {
        try {
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
          const result = await workerManager.processTextures({
            nodes: data.nodes,
            links: preparedLinks,
            textureSize: size2,
            frustumSize: uniforms.frustumSize.value
          });
          textures.positions.image.data.set(result.positions);
          textures.links.image.data.set(result.links);
          console.log(`Texture processing completed in ${result.processingTime.toFixed(2)}ms using ${workerManager.isWasmAvailable() ? "WASM" : "JavaScript"}`);
          return Promise.resolve();
        } catch (error) {
          console.warn("Worker processing failed, falling back to main thread:", error);
        }
      }
      return fillMainThread();
    }
    function fillMainThread() {
      let k = 0;
      return each(
        textures.positions.image.data,
        (_, i) => {
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
          let i1, i2, uvx, uvy;
          if (k < data.links.length) {
            i1 = registry.get(data.links[k].source);
            i2 = registry.get(data.links[k].target);
            data.links[k].sourceIndex = i1;
            data.links[k].targetIndex = i2;
            uvx = i1 % size2 / size2;
            uvy = Math.floor(i1 / size2) / size2;
            textures.links.image.data[i + 0] = uvx;
            textures.links.image.data[i + 1] = uvy;
            uvx = i2 % size2 / size2;
            uvy = Math.floor(i2 / size2) / size2;
            textures.links.image.data[i + 2] = uvx;
            textures.links.image.data[i + 3] = uvy;
          }
          k++;
        },
        4
      );
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
        variables.velocities.material.uniforms.edgeAmount = {
          value: data.links.length
        };
        variables.velocities.material.uniforms.maxSpeed = uniforms.maxSpeed;
        variables.velocities.material.uniforms.timeStep = uniforms.timeStep;
        variables.velocities.material.uniforms.damping = uniforms.damping;
        variables.velocities.material.uniforms.repulsion = uniforms.repulsion;
        variables.velocities.material.uniforms.textureLinks = {
          value: textures.links
        };
        variables.velocities.material.uniforms.springLength = uniforms.springLength;
        variables.velocities.material.uniforms.stiffness = uniforms.stiffness;
        variables.velocities.material.uniforms.gravity = uniforms.gravity;
        variables.velocities.material.uniforms.maxNeighbors = uniforms.maxNeighbors;
        if (scope.userData.spatialGrid) {
          variables.velocities.material.uniforms.textureNeighbors = { value: null };
          variables.velocities.material.uniforms.textureNeighborsDistance = { value: null };
        }
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
   * Select optimal velocity shader with fallback support
   * @param {number} nodeCount - Number of nodes in the graph
   * @returns {Object} Object with velocityShader and fallbackReason
   */
  selectOptimalShader(nodeCount) {
    const { uniforms, fallbackState } = this.userData;
    let result = { velocityShader: simulation_default.velocities, fallbackReason: null };
    try {
      const shouldUseSpatialGrid = uniforms.useSpatialGrid.value && nodeCount > 2e3 && !fallbackState.spatialGridFailed;
      if (shouldUseSpatialGrid) {
        if (!this.checkWebGLCapabilities()) {
          result.fallbackReason = "WebGL 2.0 or required extensions not available";
          return result;
        }
        const textureSize = getPotSize(nodeCount);
        if (!this.checkTextureSizeSupport(textureSize)) {
          result.fallbackReason = `Texture size ${textureSize}x${textureSize} exceeds GPU limits`;
          return result;
        }
        try {
          if (this.userData.spatialGrid) {
            this.userData.spatialGrid.dispose();
          }
          this.userData.spatialGrid = new SpatialGrid(32, uniforms.maxNeighbors.value);
          this.userData.spatialGrid.setInitialNodeData(this.userData.data.nodes);
          result.velocityShader = simulation_default.spatial;
          fallbackState.currentShader = "spatial";
          fallbackState.retryAttempts = 0;
          console.log(`Using spatial grid optimization for ${nodeCount} nodes`);
        } catch (error) {
          console.warn("Failed to create spatial grid:", error);
          result.fallbackReason = `Spatial grid creation failed: ${error.message}`;
          fallbackState.spatialGridFailed = true;
          fallbackState.retryAttempts++;
        }
      } else {
        if (nodeCount > 1e3 && nodeCount <= 2e3) {
          result.velocityShader = simulation_default.spatialSimplified;
          fallbackState.currentShader = "spatialSimplified";
          console.log(`Using simplified spatial optimization for ${nodeCount} nodes`);
        } else {
          fallbackState.currentShader = "standard";
          if (nodeCount <= 1e3) {
            console.log(`Using standard shader for ${nodeCount} nodes (under optimization threshold)`);
          }
        }
        if (this.userData.spatialGrid) {
          this.userData.spatialGrid.dispose();
          this.userData.spatialGrid = null;
        }
      }
    } catch (error) {
      console.error("Error in shader selection:", error);
      result.fallbackReason = `Shader selection failed: ${error.message}`;
      fallbackState.currentShader = "standard";
    }
    return result;
  }
  /**
   * Check WebGL capabilities for spatial grid support
   * @returns {boolean} True if capabilities are sufficient
   */
  checkWebGLCapabilities() {
    try {
      const gl = this.userData.renderer.getContext();
      if (!gl.getParameter) return false;
      const floatTextureExt = gl.getExtension("OES_texture_float") || gl.getExtension("EXT_color_buffer_float");
      if (!floatTextureExt && !gl.getParameter(gl.VERSION).includes("WebGL 2.0")) {
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }
  /**
   * Check if texture size is supported by the GPU
   * @param {number} size - Texture size to check
   * @returns {boolean} True if size is supported
   */
  checkTextureSizeSupport(size2) {
    try {
      const gl = this.userData.renderer.getContext();
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      return size2 <= maxTextureSize;
    } catch (error) {
      return false;
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
    const { gpgpu, variables, uniforms, spatialGrid, renderer, performanceMonitor, fallbackState } = this.userData;
    const startTime = performance.now();
    uniforms.alpha.value *= uniforms.decay.value;
    let spatialGridUpdateTime = 0;
    let hasErrors = false;
    if (spatialGrid) {
      this.userData.frameCount++;
      const positionsTexture = this.getTexture("positions");
      const nodeCount = variables.velocities.material.uniforms.nodeAmount.value;
      try {
        const spatialStartTime = performance.now();
        const gridUpdated = spatialGrid.update(
          renderer,
          positionsTexture,
          nodeCount,
          uniforms.maxNeighbors.value
        );
        spatialGridUpdateTime = performance.now() - spatialStartTime;
        if (gridUpdated) {
          const neighborsTexture = spatialGrid.getNeighborsTexture();
          const neighborsDistanceTexture = spatialGrid.getNeighborsDistanceTexture();
          if (neighborsTexture && neighborsDistanceTexture) {
            variables.velocities.material.uniforms.textureNeighbors.value = neighborsTexture;
            variables.velocities.material.uniforms.textureNeighborsDistance.value = neighborsDistanceTexture;
          }
        }
        fallbackState.spatialGridFailed = false;
      } catch (error) {
        console.warn("SpatialGrid update failed:", error);
        hasErrors = true;
        spatialGridUpdateTime = 0;
        fallbackState.spatialGridFailed = true;
        fallbackState.retryAttempts++;
        if (fallbackState.retryAttempts >= fallbackState.maxRetries) {
          console.warn("Maximum spatial grid retry attempts reached, disabling optimization");
          fallbackState.fallbackReason = `Spatial grid permanently disabled after ${fallbackState.maxRetries} failures`;
          spatialGrid.dispose();
          this.userData.spatialGrid = null;
        }
      }
    }
    try {
      variables.velocities.material.uniforms.time.value = time / 1e3;
      const tuningParams = performanceMonitor.getTuningParameters();
      if (tuningParams.maxNeighbors !== uniforms.maxNeighbors.value) {
        uniforms.maxNeighbors.value = tuningParams.maxNeighbors;
        if (spatialGrid) {
          spatialGrid.maxNeighbors = tuningParams.maxNeighbors;
        }
      }
      if (spatialGrid && tuningParams.updateInterval !== spatialGrid.updateInterval) {
        spatialGrid.setUpdateInterval(tuningParams.updateInterval);
      }
      if (spatialGrid && tuningParams.movementThreshold !== spatialGrid.movementThreshold) {
        spatialGrid.setMovementThreshold(tuningParams.movementThreshold);
      }
      const gpuStartTime = performance.now();
      gpgpu.compute();
      const gpuComputeTime = performance.now() - gpuStartTime;
      const texture = this.getTexture("positions");
      for (let i = 0; i < this.children.length; i++) {
        const child = this.children[i];
        child.material.uniforms.texturePositions.value = texture;
      }
      const totalFrameTime = performance.now() - startTime;
      performanceMonitor.update(time, {
        spatialGridUpdateTime,
        gpuComputeTime,
        nodeCount: variables.velocities.material.uniforms.nodeAmount.value,
        edgeCount: variables.velocities.material.uniforms.edgeAmount.value
      });
    } catch (error) {
      console.error("Critical error in update loop:", error);
      hasErrors = true;
      if (this.userData.spatialGrid) {
        console.warn("Disabling spatial grid due to critical error");
        this.userData.spatialGrid.dispose();
        this.userData.spatialGrid = null;
        fallbackState.spatialGridFailed = true;
        fallbackState.fallbackReason = `Critical error: ${error.message}`;
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
    const attribute = this.links.geometry.getAttribute("color");
    const colors = attribute.array;
    return each(data.links, (_, i) => {
      const l = data.links[i];
      const li = i * 6;
      const si = 3 * l.sourceIndex;
      const ti = 3 * l.targetIndex;
      colors[li + 0] = ref[si + 0];
      colors[li + 1] = ref[si + 1];
      colors[li + 2] = ref[si + 2];
      colors[li + 3] = ref[ti + 0];
      colors[li + 4] = ref[ti + 1];
      colors[li + 5] = ref[ti + 2];
    }).then(() => attribute.needsUpdate = true);
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
    const { gpgpu, workerManager, spatialGrid, performanceMonitor } = this.userData;
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
    if (spatialGrid) {
      spatialGrid.dispose();
    }
    if (performanceMonitor) {
      performanceMonitor.reset();
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
  get opacity() {
    return this.userData.uniforms.opacity.value;
  }
  set opacity(v) {
    this.userData.uniforms.opacity.value = v;
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
  get maxNeighbors() {
    return this.userData.uniforms.maxNeighbors.value;
  }
  set maxNeighbors(v) {
    this.userData.uniforms.maxNeighbors.value = Math.max(1, Math.min(256, v));
    if (this.userData.spatialGrid) {
      this.userData.spatialGrid.maxNeighbors = this.userData.uniforms.maxNeighbors.value;
    }
  }
  get useSpatialGrid() {
    return this.userData.uniforms.useSpatialGrid.value;
  }
  set useSpatialGrid(v) {
    this.userData.uniforms.useSpatialGrid.value = v;
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
   * Get comprehensive performance information
   * @returns {Object} Performance statistics and system state
   */
  getPerformanceInfo() {
    const { workerManager, spatialGrid, performanceMonitor, fallbackState } = this.userData;
    const workerInfo = workerManager ? workerManager.getPerformanceInfo() : {
      workerSupported: false,
      workerReady: false,
      wasmReady: false,
      pendingRequests: 0
    };
    const spatialInfo = spatialGrid ? spatialGrid.getPerformanceInfo() : {
      lastUpdateTime: 0,
      gridCells: 0,
      maxNeighbors: 0,
      updateInterval: 0,
      frameCount: 0
    };
    const performanceReport = performanceMonitor ? performanceMonitor.getPerformanceReport() : {
      frameRate: { current: 0, average: 0, target: 30 },
      performance: { level: "unknown" },
      memory: { usage: 0 },
      tuning: { enabled: false, parameters: {} },
      recommendations: []
    };
    return {
      ...workerInfo,
      spatialGrid: spatialInfo,
      performance: performanceReport,
      fallback: {
        currentShader: fallbackState.currentShader,
        spatialGridFailed: fallbackState.spatialGridFailed,
        fallbackReason: fallbackState.fallbackReason,
        retryAttempts: fallbackState.retryAttempts,
        maxRetries: fallbackState.maxRetries
      },
      optimizations: {
        usingSpatialGrid: !!spatialGrid,
        usingWorkers: workerInfo.workerReady,
        usingWasm: workerInfo.wasmReady,
        autoTuning: performanceReport.tuning.enabled
      }
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
