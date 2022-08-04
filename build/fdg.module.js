var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};

// src/index.js
import {
  Group,
  Color as Color2,
  RepeatWrapping
} from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";

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

// src/shaders.js
var positionsFragment = `
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
var velocitiesFragment = `
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

  vec3 getPosition( vec2 uv ) {
    return texture2D( texturePositions, uv ).xyz;
  }

  vec3 getVelocity( vec2 uv ) {
    return texture2D( textureVelocities, uv ).xyz;
  }

  int getIndex( vec2 uv ) {
    int s = int( size );
    int col = int( uv.x * size );
    int row = int( uv.y * size );
    return col + row * s;
  }

  float random( vec2 seed ) {
    return fract( sin( dot( seed.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  }

  float jiggle( float index ) {
    return ( random( vec2( index, time ) ) - 0.5 ) * 0.000001;
  }

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

  vec3 center( vec3 p1 ) {
    return - p1 * gravity * 0.1;
  }

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
    uniform vec3 color;
    uniform float size;
    uniform float opacity;
    uniform float imageDimensions;
    uniform sampler2D textureAtlas;
    uniform float inheritColors;

    varying vec3 vColor;
    varying float vImageKey;
    varying float vDistance;

    float circle( vec2 uv, vec2 pos, float rad ) {

      float limit = 0.02;
      float limit2 = limit * 2.0;
      float d = length( pos - uv ) - ( rad - limit );
      float t = clamp( d, 0.0, 1.0 );

      float viewRange = smoothstep( 0.0, frustumSize * 0.001, abs( vDistance ) );
      float taper = limit2 * viewRange + limit;
      taper = mix( taper, limit2, sizeAttenuation );

      return smoothstep( 0.5 - taper, 0.5 + taper, 1.0 - t );

    }

    void main() {

      vec2 uv = 2.0 * vec2( gl_PointCoord ) - 1.0;
      float t = circle( uv, vec2( 0.0, 0.0 ), 0.5 );

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

      gl_FragColor = vec4( layer * mix( vec3( 1.0 ), vColor, inheritColors ) * color, alpha );
      #include <fog_fragment>

    }
  `
};
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
    uniform vec3 color;
    uniform float opacity;

    varying vec3 vColor;

    void main() {
      gl_FragColor = vec4( mix( vec3( 1.0 ), vColor, inheritColors ) * color, opacity );
      #include <fog_fragment>
    }
  `
};

// src/points.js
import {
  Points as BasePoints,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  Color,
  UniformsLib
} from "three";

// src/texture-atlas.js
import {
  Texture
} from "three";
var anchor = document.createElement("a");
var _TextureAtlas = class extends Texture {
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
var color = new Color();
var Points = class extends BasePoints {
  constructor(size, { data, uniforms }) {
    const atlas = new TextureAtlas();
    const vertices = [];
    const colors = [];
    const imageKeys = [];
    for (let i = 0; i < data.nodes.length; i++) {
      const node = data.nodes[i];
      const x = i % size / size;
      const y = Math.floor(i / size) / size;
      const z = 0;
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
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.setAttribute("imageKey", new Float32BufferAttribute(imageKeys, 1));
    const material = new ShaderMaterial({
      uniforms: { ...UniformsLib["fog"], ...{
        is2D: uniforms.is2D,
        sizeAttenuation: uniforms.sizeAttenuation,
        frustumSize: uniforms.frustumSize,
        nodeRadius: uniforms.nodeRadius,
        nodeScale: uniforms.nodeScale,
        imageDimensions: { value: atlas.dimensions },
        texturePositions: { value: null },
        textureAtlas: { value: atlas },
        size: { value: size },
        opacity: uniforms.opacity,
        color: uniforms.pointColor,
        inheritColors: uniforms.pointsInheritColor
      } },
      vertexShader: points.vertexShader,
      fragmentShader: points.fragmentShader,
      transparent: true,
      vertexColors: true,
      fog: true
    });
    super(geometry, material);
    this.frustumCulled = false;
    this.userData.vertices = vertices;
    this.userData.colors = colors;
  }
};

// src/links.js
import {
  LineSegments,
  BufferGeometry as BufferGeometry2,
  Float32BufferAttribute as Float32BufferAttribute2,
  ShaderMaterial as ShaderMaterial2,
  UniformsLib as UniformsLib2
} from "three";
var Links = class extends LineSegments {
  constructor(points2, { data, uniforms }) {
    const geometry = new BufferGeometry2();
    const vertices = [];
    const colors = [];
    for (let i = 0; i < data.links.length; i++) {
      const l = data.links[i];
      const si = 3 * l.sourceIndex;
      const ti = 3 * l.targetIndex;
      let x = points2.userData.vertices[si + 0];
      let y = points2.userData.vertices[si + 1];
      let z = points2.userData.vertices[si + 2];
      let r = points2.userData.colors[si + 0];
      let g = points2.userData.colors[si + 1];
      let b = points2.userData.colors[si + 2];
      vertices.push(x, y, z);
      colors.push(r, g, b);
      x = points2.userData.vertices[ti + 0];
      y = points2.userData.vertices[ti + 1];
      z = points2.userData.vertices[ti + 2];
      r = points2.userData.colors[ti + 0];
      g = points2.userData.colors[ti + 1];
      b = points2.userData.colors[ti + 2];
      vertices.push(x, y, z);
      colors.push(r, g, b);
    }
    geometry.setAttribute("position", new Float32BufferAttribute2(vertices, 3));
    geometry.setAttribute("color", new Float32BufferAttribute2(colors, 3));
    const material = new ShaderMaterial2({
      uniforms: { ...UniformsLib2["fog"], ...{
        is2D: uniforms.is2D,
        inheritColors: uniforms.linksInheritColor,
        opacity: uniforms.opacity,
        texturePositions: { value: null },
        color: uniforms.linkColor
      } },
      vertexShader: links.vertexShader,
      fragmentShader: links.fragmentShader,
      transparent: true,
      vertexColors: true,
      fog: true
    });
    super(geometry, material);
    this.frustumCulled = false;
  }
};

// src/registry.js
var Registry = class {
  map = {};
  constructor(list) {
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item.id !== "undefined") {
        this.map[item.id] = i;
      }
    }
  }
  get(id) {
    return this.map[id];
  }
};

// src/index.js
var ForceDirectedGraph = class extends Group {
  constructor(renderer, data) {
    super();
    const registry = new Registry(data.nodes);
    const size = getPotSize(Math.max(data.nodes.length, data.links.length));
    const gpgpu = new GPUComputationRenderer(size, size, renderer);
    const uniforms = {
      decay: { value: 1 },
      alpha: { value: 1 },
      is2D: { value: false },
      time: { value: 0 },
      size: { value: size },
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
      pointColor: { value: new Color2(1, 1, 1) },
      linkColor: { value: new Color2(1, 1, 1) },
      opacity: { value: 1 }
    };
    const textures = {
      positions: gpgpu.createTexture(),
      velocities: gpgpu.createTexture(),
      links: gpgpu.createTexture()
    };
    let k = 0;
    for (let i = 0; i < textures.positions.image.data.length; i += 4) {
      const v = 0;
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
      textures.velocities.image.data[i + 0] = v;
      textures.velocities.image.data[i + 1] = v;
      textures.velocities.image.data[i + 2] = 0;
      textures.velocities.image.data[i + 3] = 0;
      let i1, i2, uvx, uvy;
      if (k < data.links.length) {
        i1 = registry.get(data.links[k].source);
        i2 = registry.get(data.links[k].target);
        data.links[k].sourceIndex = i1;
        data.links[k].targetIndex = i2;
        uvx = i1 % size / size;
        uvy = Math.floor(i1 / size) / size;
        textures.links.image.data[i + 0] = uvx;
        textures.links.image.data[i + 1] = uvy;
        uvx = i2 % size / size;
        uvy = Math.floor(i2 / size) / size;
        textures.links.image.data[i + 2] = uvx;
        textures.links.image.data[i + 3] = uvy;
      }
      k++;
    }
    const variables = {
      positions: gpgpu.addVariable("texturePositions", positionsFragment, textures.positions),
      velocities: gpgpu.addVariable("textureVelocities", velocitiesFragment, textures.velocities)
    };
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
    variables.positions.wrapS = variables.positions.wrapT = RepeatWrapping;
    variables.velocities.wrapS = variables.velocities.wrapT = RepeatWrapping;
    const error = gpgpu.init();
    if (error) {
      console.error("ForceDirectedGraph", error);
    }
    const points2 = new Points(size, { uniforms, data });
    const links2 = new Links(points2, { uniforms, data });
    this.add(points2);
    this.add(links2);
    points2.renderOrder = links2.renderOrder + 1;
    this.userData.gpgpu = gpgpu;
    this.userData.uniforms = uniforms;
    this.userData.textures = textures;
    this.userData.variables = variables;
  }
  update(time) {
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
  getTexture(name) {
    const { gpgpu, variables } = this.userData;
    return gpgpu.getCurrentRenderTarget(variables[name]).texture;
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
export {
  ForceDirectedGraph
};
