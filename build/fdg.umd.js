var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
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
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};

// src/index.js
var src_exports = {};
__export(src_exports, {
  ForceDirectedGraph: () => ForceDirectedGraph
});
module.exports = __toCommonJS(src_exports);
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
  console.error("ForceDirectedGraph: Texture size is too big.", "Consider reducing the size of your data.");
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
var anchor = document.createElement("a");
var _TextureAtlas = class extends import_three.Texture {
  map = [];
  dimensions = 1;
  isTextureAtlas = true;
  constructor() {
    super(document.createElement("canvas"));
    this.flipY = false;
  }
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
var TextureAtlas = _TextureAtlas;
__publicField(TextureAtlas, "Resolution", 1024);

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
      geometry.setAttribute("position", new import_three2.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute("color", new import_three2.Float32BufferAttribute(colors, 3));
      geometry.setAttribute("imageKey", new import_three2.Float32BufferAttribute(imageKeys, 1));
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
      geometry.setAttribute("position", new import_three3.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute("color", new import_three3.Float32BufferAttribute(colors, 3));
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

// src/index.js
var color3 = new import_three5.Color();
var position = new import_three5.Vector3();
var size = new import_three5.Vector2();
var buffers = {
  int: new Uint8ClampedArray(4),
  float: new Float32Array(4)
};
var ForceDirectedGraph = class extends import_three5.Group {
  ready = false;
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
      pointColor: { value: new import_three5.Color(1, 1, 1) },
      linkColor: { value: new import_three5.Color(1, 1, 1) },
      opacity: { value: 1 }
    };
    this.userData.hit = new Hit(this);
    if (data) {
      this.set(data);
    }
  }
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
    const variables = {
      positions: gpgpu.addVariable("texturePositions", simulation_default.positions, textures.positions),
      velocities: gpgpu.addVariable("textureVelocities", simulation_default.velocities, textures.velocities)
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
    function fill() {
      let k = 0;
      return each(textures.positions.image.data, (_, i) => {
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
      }, 4);
    }
    function setup() {
      return new Promise((resolve, reject) => {
        gpgpu.setVariableDependencies(variables.positions, [variables.positions, variables.velocities]);
        gpgpu.setVariableDependencies(variables.velocities, [variables.velocities, variables.positions]);
        variables.positions.material.uniforms.is2D = uniforms.is2D;
        variables.positions.material.uniforms.timeStep = uniforms.timeStep;
        variables.velocities.material.uniforms.alpha = uniforms.alpha;
        variables.velocities.material.uniforms.is2D = uniforms.is2D;
        variables.velocities.material.uniforms.size = uniforms.size;
        variables.velocities.material.uniforms.time = uniforms.time;
        variables.velocities.material.uniforms.nodeRadius = uniforms.nodeRadius;
        variables.velocities.material.uniforms.nodeAmount = { value: data.nodes.length };
        variables.velocities.material.uniforms.edgeAmount = { value: data.links.length };
        variables.velocities.material.uniforms.maxSpeed = uniforms.maxSpeed;
        variables.velocities.material.uniforms.timeStep = uniforms.timeStep;
        variables.velocities.material.uniforms.damping = uniforms.damping;
        variables.velocities.material.uniforms.repulsion = uniforms.repulsion;
        variables.velocities.material.uniforms.textureLinks = { value: textures.links };
        variables.velocities.material.uniforms.springLength = uniforms.springLength;
        variables.velocities.material.uniforms.stiffness = uniforms.stiffness;
        variables.velocities.material.uniforms.gravity = uniforms.gravity;
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
  update(time) {
    if (!this.ready) {
      return this;
    }
    const { gpgpu, variables, uniforms } = this.userData;
    uniforms.alpha.value *= uniforms.decay.value;
    variables.velocities.material.uniforms.time.value = time / 1e3;
    gpgpu.compute();
    const texture = this.getTexture("positions");
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      child.material.uniforms.texturePositions.value = texture;
    }
    return this;
  }
  intersect(pointer, camera) {
    const { hit: hit2, renderer } = this.userData;
    renderer.getSize(size);
    hit2.setSize(size.x, size.y);
    hit2.compute(renderer, camera);
    const x = hit2.ratio * size.x * clamp(pointer.x, 0, 1);
    const y = hit2.ratio * size.y * (1 - clamp(pointer.y, 0, 1));
    renderer.readRenderTargetPixels(hit2.renderTarget, x - 0.5, y - 0.5, 1, 1, buffers.int);
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
      console.warn("Force Directed Graph:", "unable to calculate position without points or renderer.");
      return;
    }
    const index = i * 3;
    const uvs = points2.geometry.attributes.position.array;
    const uvx = Math.floor(uvs[index + 0] * size2);
    const uvy = Math.floor(uvs[index + 1] * size2);
    const renderTarget = gpgpu.getCurrentRenderTarget(variables.positions);
    renderer.readRenderTargetPixels(renderTarget, uvx, uvy, 1, 1, buffers.float);
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
};
__publicField(ForceDirectedGraph, "getPotSize", getPotSize);
__publicField(ForceDirectedGraph, "Properties", [
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
  "blending"
]);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ForceDirectedGraph
});
