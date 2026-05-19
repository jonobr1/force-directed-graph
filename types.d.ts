declare module '@jonobr1/force-directed-graph/shaders/partials' {
  /**
   * Draws a circle with uv position pos and radius rad.
   * Relies on uniforms:
   * - float sizeAttenuation: 0, 1
   */
  export const circle: string;
  /**
   * Get the position in local space of a node
   */
  export const getPosition: string;
  /**
   * Get the velocity in local space of a node
   */
  export const getVelocity: string;
  /**
   * Get a node's id from a specific UV coordinate
   * Relies on uniforms:
   * - float size: number
   */
  export const getIndex: string;
  /**
   * GLSL version of a random float generator
   */
  export const random: string;
  /**
   * Add slight variation of a given node's index
   * Used for unsticking two nodes that happen to be
   * at the exact same coordinates on any given frame,
   * though usually most common on initialization.
   *
   * Relies on uniforms:
   * - float time: number
   */
  export const jiggle: string;
  /**
   * Link two nodes together based on the relied on "links"
   * array from the ingested data. Schema mimics d3's
   * force directed graph: https://observablehq.com/@d3/force-directed-graph-component
   *
   * Relies on uniforms and partials:
   * - sampler2D textureLinks
   * - int getIndex
   * - vec3 getVelocity
   * - vec3 getPosition
   * - float is2D: [0, 1]
   * - float springLength: number
   */
  export const link: string;
  /**
   * Repulses (or not) two nodes together based
   * on a repulsion amount.
   *
   * Relies on uniforms and partials:
   * - float is2D: [0, 1]
   * - float repulsion: number
   */
  export const charge: string;
  /**
   * Attracts (or not) a node to the
   * center of the force directed graph
   * by how much gravity there is.
   *
   * Relies on uniforms:
   * - float gravity: number
   */
  export const center: string;
  /**
   * Attracts a node toward its supplied target position,
   * using the same gravity scaling as center().
   *
   * Relies on uniforms:
   * - float gravity: number
   */
  export const anchor: string;
}
declare module '@jonobr1/force-directed-graph/shaders/hit' {
  export default hit;
  namespace hit {
    const vertexShader: string;
    const fragmentShader: string;
  }
}
declare module '@jonobr1/force-directed-graph/hit' {
  export class Hit {
    constructor(fdg: any);
    parent: any;
    renderTarget: any;
    width: number;
    height: number;
    ratio: number;
    material: any;
    helper: any;
    inherit(mesh: any): void;
    setSize(width: any, height: any): void;
    compute(renderer: any, camera: any): void;
    dispose(): void;
  }
}
declare module '@jonobr1/force-directed-graph/math' {
  /**
   *
   * @param {Number} number - The number to snap to a power of two size
   * @returns
   */
  export function getPotSize(number: number): number;
  /**
   *
   * @param {Number} x - the value to clamp
   * @param {Number} min - the minimum possible value
   * @param {Number} max - the maximum possible value
   * @returns {Number}
   */
  export function clamp(x: number, min: number, max: number): number;
  /**
   * An asynchronous each loop. Max
   * @param {Array} list - an array like object that can be iterated over
   * @param {Function} func - the function to iterate passing in the index and value each time it's invoked
   * @param {Number} [step] - the amount the iterator should increment by. Default is 1
   * @param {Number} [max] - the max number of iterations before request animation is invoked. Default is 1000
   * @returns {Promise}
   */
  export function each(
    list: any[],
    func: Function,
    step?: number,
    max?: number,
  ): Promise<any>;
  /**
   *
   * @param {Number} i - index to turn into color
   * @returns {Object} - with `r`, `g`, `b` properties between 0 and 255
   */
  export function indexToRGB(i: number): any;
  /**
   *
   * @param {Object} params - object with properties `r`, `g`, `b` between 0 and 255
   * @returns {Number} - the corresponding index
   */
  export function rgbToIndex({ r, g, b }: any): number;
}
declare module '@jonobr1/force-directed-graph/shaders/positions' {
  /**
   * Calculate the next frame's position for all nodes.
   */
  export const positions: '\n  uniform float is2D;\n  uniform float timeStep;\n\n  void main() {\n\n    vec2 uv = gl_FragCoord.xy / resolution.xy;\n    vec4 texel = texture2D( texturePositions, uv );\n    vec3 position = texel.xyz;\n    vec3 velocity = texture2D( textureVelocities, uv ).xyz;\n    float isStatic = texel.w;\n\n    vec3 result = position + velocity * timeStep * ( 1.0 - isStatic );\n\n    gl_FragColor = vec4( result.xyz, isStatic );\n\n  }\n';
}
declare module '@jonobr1/force-directed-graph/shaders/velocities' {
  export const types: string[];
  /**
   * Calculate the next frame's velocity for all nodes.
   */
  export const simplex: string;
  export const nested: string;
}
declare module '@jonobr1/force-directed-graph/shaders/simulation' {
  namespace _default {
    export { positions };
    export { simplex as velocities };
    export { simplex };
    export { nested };
    export { types };
  }
  export default _default;
  import { positions } from '@jonobr1/force-directed-graph/shaders/positions';
  import { simplex } from '@jonobr1/force-directed-graph/shaders/velocities';
  import { nested } from '@jonobr1/force-directed-graph/shaders/velocities';
  import { types } from '@jonobr1/force-directed-graph/shaders/velocities';
}
declare module '@jonobr1/force-directed-graph/shaders/points' {
  export default points;
  namespace points {
    const vertexShader: string;
    const fragmentShader: string;
  }
}
declare module '@jonobr1/force-directed-graph/texture-atlas' {
  export class TextureAtlas extends Texture {
    static Resolution: number;
    static getAbsoluteURL(path: any): string;
    map: any[];
    dimensions: number;
    isTextureAtlas: boolean;
    flipY: boolean;
    add(src: any): number;
    update(): void;
    indexOf(src: any): number;
  }
  import { Texture } from 'three';
}
declare module '@jonobr1/force-directed-graph/points' {
  export class Points extends BasePoints {
    static parse(
      size: any,
      data: any,
    ): Promise<{
      atlas: TextureAtlas;
      geometry: any;
    }>;
    constructor(
      {
        atlas,
        geometry,
      }: {
        atlas: any;
        geometry: any;
      },
      uniforms: any,
    );
    frustumCulled: boolean;
  }
  import { TextureAtlas } from '@jonobr1/force-directed-graph/texture-atlas';
  import { Points as BasePoints } from 'three';
}
declare module '@jonobr1/force-directed-graph/shaders/links' {
  export default links;
  namespace links {
    const vertexShader: string;
    const fragmentShader: string;
  }
}
declare module '@jonobr1/force-directed-graph/links' {
  export class Links extends Mesh {
    static parse(points: any, data: any): Promise<any>;
    constructor(geometry: any, uniforms: any);
    frustumCulled: boolean;
  }
  import { Mesh } from 'three';
}
declare module '@jonobr1/force-directed-graph/shaders/labels' {
  export default labels;
  namespace labels {
    const vertexShader: string;
    const fragmentShader: string;
  }
}
declare module '@jonobr1/force-directed-graph/labels' {
  export class Labels extends Mesh {
    static parse(
      size: number,
      data: any,
      options?: {
        degrees?: number[];
        fontSize?: number;
        fontFamily?: string;
        useMipmaps?: boolean;
      },
    ): Promise<{ geometry: any; texture: any; entries: any[] } | null>;
    constructor(
      labelData: {
        geometry: any;
        texture: any;
        entries: any[];
        fontFamily?: string;
        fontSize?: number;
      },
      uniforms: any,
    );
    frustumCulled: boolean;
    set alignment(arg: 'center' | 'left' | 'right');
    get alignment(): 'center' | 'left' | 'right';
    set baseline(arg: 'top' | 'middle' | 'bottom');
    get baseline(): 'top' | 'middle' | 'bottom';
    set offset(arg: Vector2);
    get offset(): Vector2;
    set near(arg: number);
    get near(): number;
    set fontSize(arg: number);
    get fontSize(): number;
    set fontFamily(arg: string);
    get fontFamily(): string;
  }
  import { Mesh, Vector2 } from 'three';
}
declare module '@jonobr1/force-directed-graph/registry' {
  export class Registry {
    constructor(list: any);
    map: {};
    get(id: any): any;
    set(index: any, item: any): void;
    clear(): void;
  }
}
declare module '@jonobr1/force-directed-graph' {
  export type NodeData = {
    id: string | number;
    x?: number;
    y?: number;
    z?: number;
    isStatic?: boolean;
    color?: CSSStyleValue;
    image?: string;
    label?: string;
    labelPriority?: number;
    size?: number;
  };
  export type LinkData = { source: number; target: number };
  export type DataType = {
    nodes: NodeData[];
    links: LinkData[];
  };
  export class ForceDirectedGraph extends Group {
    static getPotSize: typeof getPotSize;
    static Properties: string[];
    /**
     * @param {THREE.WebGLRenderer} renderer - the three.js renderer referenced to create the render targets
     * @param {Object} [data] - optional data to automatically set the data of the graph
     */
    constructor(renderer: WebGLRenderer, data?: DataType);
    ready: boolean;
    /**
     * @param {Object} data - Object with nodes and links properties based on https://observablehq.com/@d3/force-directed-graph-component
     * @param {Function} callback
     * @description Set the data to an instance of force directed graph. Because of the potential large amount of data this function runs on a request animation frame and returns a promise (or a passed callback) to give indication when the graph is ready to be rendered.
     * @returns {Promise}
     */
    set(data: DataType, callback?: () => void): Promise<void>;
    /**
     * @param {Number} time
     * @description Function to update the instance meant to be run before three.js's renderer.render method.
     * @returns {Void}
     */
    update(time: number): void;
    /**
     * @param {THREE.Vector2} pointer - x, y values normalized to the camera's clipspace
     * @param {THREE.Camera} camera - the camera to reference ray casting matrices
     * @description Check to see if a point in the browser's screenspace intersects with any points in the force directed graph. If none found, then null is returned.
     * @returns {Object|Null}
     */
    intersect(
      pointer: Vector2,
      camera: Camera,
    ): { point: Vector3; data: NodeData } | null;
    getTexture(name: string): Texture;
    getPositionFromIndex(i: number): Vector3;
    setPointColorById(id: string | number, css: CSSStyleValue): void;
    setPointColorFromIndex(index: number, css: CSSStyleValue): void;
    updateLinksColors(): Promise<boolean>;
    getIndexById(id: string | number): number;
    getLinksById(id: string | number): Promise<LinkData[]>;
    getPointById(id: string | number): NodeData;
    dispose(): void;
    set beginning(arg: number);
    get beginning(): number;
    set ending(arg: number);
    get ending(): number;
    set decay(arg: number);
    get decay(): number;
    set alpha(arg: number);
    get alpha(): number;
    set is2D(arg: boolean);
    get is2D(): boolean;
    set time(arg: number);
    get time(): number;
    set size(arg: number);
    get size(): number;
    set maxSpeed(arg: number);
    get maxSpeed(): number;
    set timeStep(arg: number);
    get timeStep(): number;
    set damping(arg: number);
    get damping(): number;
    set repulsion(arg: number);
    get repulsion(): number;
    set springLength(arg: number);
    get springLength(): number;
    set stiffness(arg: number);
    get stiffness(): number;
    set gravity(arg: number);
    get gravity(): number;
    set pinStrength(arg: number);
    get pinStrength(): number;
    set nodeRadius(arg: number);
    get nodeRadius(): number;
    set nodeScale(arg: number);
    get nodeScale(): number;
    set sizeAttenuation(arg: boolean);
    get sizeAttenuation(): boolean;
    set frustumSize(arg: number);
    get frustumSize(): number;
    set linksInheritColor(arg: boolean);
    get linksInheritColor(): boolean;
    set pointsInheritColor(arg: boolean);
    get pointsInheritColor(): boolean;
    set pointColor(arg: Color);
    get pointColor(): Color;
    set linksColor(arg: Color);
    get linksColor(): Color;
    set linkColor(arg: Color);
    get linkColor(): Color;
    set linecap(arg: 'round' | 'butt' | 'square');
    get linecap(): 'round' | 'butt' | 'square';
    set linewidth(arg: number);
    get linewidth(): number;
    set opacity(arg: number);
    get opacity(): number;
    /**
     * Label-density control in [0, 1].
     * 0 keeps as many labels visible as placement allows.
     * 1 hides all labels.
     */
    set obscurity(arg: number);
    get obscurity(): number;
    set blending(
      arg:
        | typeof NoBlending
        | typeof NormalBlending
        | typeof AdditiveBlending
        | typeof SubtractiveBlending
        | typeof MultiplyBlending
        | typeof CustomBlending,
    );
    get blending():
      | typeof NoBlending
      | typeof NormalBlending
      | typeof AdditiveBlending
      | typeof SubtractiveBlending
      | typeof MultiplyBlending
      | typeof CustomBlending;
    get points(): Points;
    get links(): Links;
    get labels(): import('@jonobr1/force-directed-graph/labels').Labels | null;
    get uniforms(): any;
    get nodeCount(): number;
    get edgeCount(): number;
    getPerformanceInfo(): {
      workerSupported: boolean;
      workerReady: boolean;
      wasmReady: boolean;
      pendingRequests: number;
    };
    isWorkerProcessingAvailable(): boolean;
    isWasmAccelerationAvailable(): boolean;
  }
  import { getPotSize } from '@jonobr1/force-directed-graph/math';
  import { Points } from '@jonobr1/force-directed-graph/points';
  import { Links } from '@jonobr1/force-directed-graph/links';
  import {
    NoBlending,
    NormalBlending,
    AdditiveBlending,
    SubtractiveBlending,
    MultiplyBlending,
    CustomBlending,
    Camera,
    Color,
    Group,
    Texture,
    WebGLRenderer,
    Vector2,
    Vector3,
  } from 'three';
}
