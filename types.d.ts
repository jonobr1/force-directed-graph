declare namespace ForceDirectedGraphTypes {
  type NodeId = string | number;
  type NodeColor = import('three').ColorRepresentation;
  type NodeImage = string | HTMLImageElement;
  type LabelAlignment = 'center' | 'left' | 'right';
  type LabelBaseline = 'top' | 'middle' | 'bottom';

  interface NodeData {
    id: NodeId;
    x?: number;
    y?: number;
    z?: number;
    isStatic?: boolean;
    color?: NodeColor;
    image?: NodeImage;
    label?: string | number;
    labelPriority?: number;
    size?: number;
    [key: string]: unknown;
  }

  interface LinkData<Id extends NodeId = NodeId> {
    source: Id;
    target: Id;
    sourceIndex?: number;
    targetIndex?: number;
    [key: string]: unknown;
  }

  interface ResolvedLinkData<Id extends NodeId = NodeId>
    extends LinkData<Id> {
    sourceIndex: number;
    targetIndex: number;
  }

  interface GraphData<
    N extends NodeData = NodeData,
    L extends LinkData = LinkData,
  > {
    nodes: N[];
    links: L[];
  }

  interface LabelAtlasUV {
    u: number;
    v: number;
    uw: number;
    uh: number;
  }

  interface LabelEntry {
    text: string;
    nodeIndex: number;
    pointSize: number;
    basePriority: number;
    labelWidth: number;
    labelHeight: number;
    aspectRatio: number;
    labelId: number;
    stableId: number;
    persistence: number;
    atlasUV: LabelAtlasUV;
  }

  interface LabelParseOptions {
    adjacency?: number[][];
    degrees?: number[];
    fontSize?: number;
    fontFamily?: string;
    maxTextureSize?: number;
    useMipmaps?: boolean;
  }

  interface ResolvedLabelParseOptions extends LabelParseOptions {
    adjacency: number[][];
    degrees: number[];
    fontFamily: string;
    maxTextureSize: number;
    useMipmaps: boolean;
  }

  interface LabelParseResult {
    geometry: import('three').InstancedBufferGeometry;
    texture: import('three').CanvasTexture;
    entries: LabelEntry[];
    fontFamily: string;
    fontSize: number;
  }

  interface PointsParseResult {
    atlas: import('@jonobr1/force-directed-graph/texture-atlas').TextureAtlas;
    geometry: import('three').BufferGeometry;
  }

  interface PerformanceInfo {
    workerSupported: boolean;
    workerReady: boolean;
    wasmReady: boolean;
    pendingRequests: number;
  }

  interface TextureProcessRequest<
    N extends NodeData = NodeData,
    L extends ResolvedLinkData = ResolvedLinkData,
  > {
    nodes: N[];
    links: L[];
    textureSize: number;
    frustumSize: number;
    useWasm?: boolean;
  }

  interface TextureProcessResult {
    positions: Float32Array;
    links: Float32Array;
    linkRanges: Float32Array;
    packedLinkAmount: number;
    processingTime: number;
  }

  type TextureWorkerMessage =
    | {
        type: 'wasm-ready';
        success: boolean;
        error?: string;
      }
    | {
        type: 'texture-processed';
        requestId: number;
        success: boolean;
        data?: TextureProcessResult;
        error?: string;
      }
    | {
        type: 'wasm-status';
        ready: boolean;
      }
    | {
        type: 'error';
        error: string;
      };

  interface Uniform<T> {
    value: T;
  }

  interface ForceDirectedGraphUniforms {
    decay: Uniform<number>;
    alpha: Uniform<number>;
    is2D: Uniform<boolean>;
    time: Uniform<number>;
    size: Uniform<number>;
    maxSpeed: Uniform<number>;
    timeStep: Uniform<number>;
    damping: Uniform<number>;
    repulsion: Uniform<number>;
    springLength: Uniform<number>;
    stiffness: Uniform<number>;
    gravity: Uniform<number>;
    pinStrength: Uniform<number>;
    nodeRadius: Uniform<number>;
    nodeScale: Uniform<number>;
    sizeAttenuation: Uniform<boolean>;
    frustumSize: Uniform<number>;
    linksInheritColor: Uniform<boolean>;
    labelsInheritColor: Uniform<boolean>;
    pointsInheritColor: Uniform<boolean>;
    pointColor: Uniform<import('three').Color>;
    linkColor: Uniform<import('three').Color>;
    labelColor: Uniform<import('three').Color>;
    linecap: Uniform<number>;
    linewidth: Uniform<number>;
    opacity: Uniform<number>;
    pixelRatio: Uniform<number>;
    resolution: Uniform<import('three').Vector2>;
    uBeginning: Uniform<number>;
    uEnding: Uniform<number>;
    uNodeAmount: Uniform<number>;
    obscurity: Uniform<number>;
    labelAlignment: Uniform<number>;
    labelBaseline: Uniform<number>;
    labelFontSize: Uniform<number>;
    labelNear: Uniform<number>;
    labelOffset: Uniform<import('three').Vector2>;
  }

  interface ShaderModule {
    vertexShader: string;
    fragmentShader: string;
  }
}

declare module '@jonobr1/force-directed-graph/shaders/partials' {
  export const circle: string;
  export const getPosition: string;
  export const getVelocity: string;
  export const getIndex: string;
  export const getUVFromIndex: string;
  export const random: string;
  export const jiggle: string;
  export const link: string;
  export const charge: string;
  export const center: string;
  export const anchor: string;
}

declare module '@jonobr1/force-directed-graph/shaders/hit' {
  const hit: ForceDirectedGraphTypes.ShaderModule;
  export default hit;
}

declare module '@jonobr1/force-directed-graph/hit' {
  import type {
    Camera,
    ShaderMaterial,
    Sprite,
    WebGLRenderTarget,
    WebGLRenderer,
  } from 'three';
  import type { ForceDirectedGraph } from '@jonobr1/force-directed-graph';

  export class Hit {
    constructor(fdg: ForceDirectedGraph);
    parent: ForceDirectedGraph | null;
    renderTarget: WebGLRenderTarget;
    width: number;
    height: number;
    ratio: number;
    material: ShaderMaterial | null;
    helper: Sprite | null;
    inherit(mesh: { material: { uniforms: Record<string, unknown> } }): void;
    setSize(width: number, height: number): void;
    compute(renderer: WebGLRenderer, camera: Camera): void;
    dispose(): void;
  }
}

declare module '@jonobr1/force-directed-graph/math' {
  export function getPotSize(number: number): number | undefined;
  export function clamp(x: number, min: number, max: number): number;
  export function each<T>(
    list: ArrayLike<T>,
    func: (value: T, index: number) => void,
    step?: number,
    max?: number,
  ): Promise<void>;
  export function indexToRGB(i: number): {
    r: number;
    g: number;
    b: number;
  };
  export function rgbToIndex(params: {
    r: number;
    g: number;
    b: number;
  }): number;
}

declare module '@jonobr1/force-directed-graph/shaders/positions' {
  export const positions: string;
}

declare module '@jonobr1/force-directed-graph/shaders/velocities' {
  export const types: Array<'simplex' | 'nested'>;
  export const simplex: string;
  export const nested: string;
}

declare module '@jonobr1/force-directed-graph/shaders/simulation' {
  const simulation: {
    positions: string;
    velocities: string;
    simplex: string;
    nested: string;
    types: Array<'simplex' | 'nested'>;
  };
  export default simulation;
}

declare module '@jonobr1/force-directed-graph/shaders/points' {
  const points: ForceDirectedGraphTypes.ShaderModule;
  export default points;
}

declare module '@jonobr1/force-directed-graph/texture-atlas' {
  import type { Texture } from 'three';

  export class TextureAtlas extends Texture {
    static Resolution: number;
    static getAbsoluteURL(path: string): string;
    constructor();
    map: HTMLImageElement[];
    dimensions: number;
    isTextureAtlas: boolean;
    flipY: boolean;
    add(src: ForceDirectedGraphTypes.NodeImage): number | undefined;
    update(): void;
    indexOf(src: string): number;
  }
}

declare module '@jonobr1/force-directed-graph/points' {
  import type { Points as BasePoints } from 'three';
  import type { TextureAtlas } from '@jonobr1/force-directed-graph/texture-atlas';

  export type PointsParseResult = ForceDirectedGraphTypes.PointsParseResult;

  export class Points extends BasePoints {
    static parse(
      size: number,
      data: { nodes: ForceDirectedGraphTypes.NodeData[] },
    ): Promise<PointsParseResult>;
    constructor(
      data: {
        atlas: TextureAtlas;
        geometry: PointsParseResult['geometry'];
      },
      uniforms: ForceDirectedGraphTypes.ForceDirectedGraphUniforms,
    );
    frustumCulled: boolean;
  }
}

declare module '@jonobr1/force-directed-graph/shaders/links' {
  const links: ForceDirectedGraphTypes.ShaderModule;
  export default links;
}

declare module '@jonobr1/force-directed-graph/links' {
  import type { InstancedBufferGeometry, Mesh } from 'three';
  import type { Points } from '@jonobr1/force-directed-graph/points';

  export class Links extends Mesh {
    static parse(
      points: Points,
      data: { links: ForceDirectedGraphTypes.ResolvedLinkData[] },
    ): Promise<InstancedBufferGeometry>;
    constructor(
      geometry: InstancedBufferGeometry,
      uniforms: ForceDirectedGraphTypes.ForceDirectedGraphUniforms,
    );
    frustumCulled: boolean;
  }
}

declare module '@jonobr1/force-directed-graph/shaders/labels' {
  const labels: ForceDirectedGraphTypes.ShaderModule;
  export default labels;
}

declare module '@jonobr1/force-directed-graph/labels' {
  import type { Mesh, Vector2 } from 'three';

  export type LabelAlignment = ForceDirectedGraphTypes.LabelAlignment;
  export type LabelBaseline = ForceDirectedGraphTypes.LabelBaseline;
  export type LabelEntry = ForceDirectedGraphTypes.LabelEntry;
  export type LabelParseOptions = ForceDirectedGraphTypes.LabelParseOptions;
  export type LabelParseResult = ForceDirectedGraphTypes.LabelParseResult;

  export class Labels extends Mesh {
    static parse(
      size: number,
      data: { nodes: ForceDirectedGraphTypes.NodeData[] },
      options?: LabelParseOptions,
    ): Promise<LabelParseResult | null>;
    constructor(
      labelData: LabelParseResult,
      uniforms: ForceDirectedGraphTypes.ForceDirectedGraphUniforms,
    );
    entries: LabelEntry[];
    frustumCulled: boolean;
    dispose(): void;
    replaceData(labelData: LabelParseResult): void;
    set alignment(value: LabelAlignment);
    get alignment(): LabelAlignment;
    set baseline(value: LabelBaseline);
    get baseline(): LabelBaseline;
    set offset(value: Vector2);
    get offset(): Vector2;
    set near(value: number);
    get near(): number;
    set fontSize(value: number);
    get fontSize(): number;
    set fontFamily(value: string);
    get fontFamily(): string;
  }

  export const __TEST__: {
    buildLabelSelectionOrder(
      entries: LabelEntry[],
      adjacency?: number[][],
      nodes?: ForceDirectedGraphTypes.NodeData[],
      degrees?: number[],
      maxHops?: number,
    ): LabelEntry[];
    buildSelectionRanks(
      entries: LabelEntry[],
      selectionOrder: LabelEntry[],
    ): Float32Array;
    buildSortTuple(
      cellId: number,
      entry: Pick<LabelEntry, 'basePriority' | 'stableId' | 'labelId'>,
    ): {
      cellId: number;
      priorityKey: number;
      stableId: number;
      labelId: number;
    };
    clamp01(value: number): number;
    compareLabelEntries(a: LabelEntry, b: LabelEntry): number;
    compareProjectedEntries(a: any, b: any): number;
    getCollisionCellBounds(
      bounds: { minX: number; minY: number; maxX: number; maxY: number },
      cellSize: number,
      gridWidth: number,
      gridHeight: number,
    ):
      | {
          minCellX: number;
          maxCellX: number;
          minCellY: number;
          maxCellY: number;
        }
      | null;
    getLabelBasePriority(
      node: ForceDirectedGraphTypes.NodeData,
      degree?: number,
    ): number;
    getLabelAlignmentOffset(alignment: number): -1 | 0 | 1;
    getLabelBaselineOffset(baseline: number): -1 | 0 | 1;
    getVisibleQuota(obscurity: number, labelCount: number): number;
    getPlacementTextureDimensions(itemCount: number): {
      width: number;
      height: number;
    };
    getNodeColorComponents(
      node: ForceDirectedGraphTypes.NodeData,
    ): [number, number, number];
    sanitizeLabelFontSize(fontSize: number): number;
    sanitizeLabelNearDistance(nearDistance: number): number;
    intersectsBounds(
      a: { minX: number; minY: number; maxX: number; maxY: number },
      b: { minX: number; minY: number; maxX: number; maxY: number },
      margin?: number,
    ): boolean;
    packCollisionCellKey(
      cellX: number,
      cellY: number,
      gridWidth: number,
    ): number;
    projectLabelBounds(params: {
      nodePosition: import('three').Vector3;
      objectMatrixWorld: import('three').Matrix4;
      camera: import('three').Camera;
      viewportWidth: number;
      viewportHeight: number;
      frustumSize: number;
      is2D: boolean;
      sizeAttenuation: boolean;
      nodeRadius: number;
      nodeScale: number;
      aspectRatio: number;
      labelAlignment?: number;
      labelBaseline?: number;
      labelFontSize?: number;
      labelNear?: number;
      labelOffset?: { x: number; y: number };
      pointSize?: number;
    }):
      | {
          minX: number;
          minY: number;
          maxX: number;
          maxY: number;
          width: number;
          height: number;
          centerX: number;
          centerY: number;
          viewDistance: number;
          depthPriority: number;
          clipped: boolean;
        }
      | null;
    configureAtlasTexture<T extends Record<string, unknown>>(
      texture: T,
      options?: { useMipmaps?: boolean },
    ): T;
  };
}

declare module '@jonobr1/force-directed-graph/registry' {
  export class Registry {
    constructor(list?: Array<{ id: ForceDirectedGraphTypes.NodeId }>);
    map: Record<string, number>;
    get(id: ForceDirectedGraphTypes.NodeId): number | undefined;
    set(index: number, item: { id: ForceDirectedGraphTypes.NodeId }): void;
    clear(): void;
  }
}

declare module '@jonobr1/force-directed-graph/texture-worker-manager' {
  export type TextureProcessRequest =
    ForceDirectedGraphTypes.TextureProcessRequest;
  export type TextureProcessResult =
    ForceDirectedGraphTypes.TextureProcessResult;
  export type TextureWorkerMessage =
    ForceDirectedGraphTypes.TextureWorkerMessage;
  export type PerformanceInfo = ForceDirectedGraphTypes.PerformanceInfo;

  export class TextureWorkerManager {
    constructor();
    worker: Worker | null;
    isWorkerReady: boolean;
    isWasmReady: boolean;
    requestId: number;
    pendingRequests: Map<
      number,
      {
        resolve: (result: TextureProcessResult) => void;
        reject: (reason?: unknown) => void;
      }
    >;
    workerSupported: boolean;
    resolveWasmUrl(): string;
    init(): Promise<boolean>;
    handleWorkerMessage(message: TextureWorkerMessage): void;
    processTextures(data: TextureProcessRequest): Promise<TextureProcessResult>;
    isReady(): boolean;
    isWasmAvailable(): boolean;
    getPerformanceInfo(): PerformanceInfo;
    dispose(): void;
  }
}

declare module '@jonobr1/force-directed-graph/inline-worker-factory' {
  export function createInlineWorker(wasmUrl: string): Worker;
}

declare module '@jonobr1/force-directed-graph' {
  import {
    AdditiveBlending,
    Camera,
    Color,
    CustomBlending,
    Group,
    MultiplyBlending,
    NoBlending,
    NormalBlending,
    SubtractiveBlending,
    Texture,
    Vector2,
    Vector3,
    WebGLRenderer,
  } from 'three';
  import type { ColorRepresentation } from 'three';

  export type NodeId = ForceDirectedGraphTypes.NodeId;
  export type NodeColor = ForceDirectedGraphTypes.NodeColor;
  export type NodeImage = ForceDirectedGraphTypes.NodeImage;
  export type NodeData = ForceDirectedGraphTypes.NodeData;
  export type LinkData<Id extends NodeId = NodeId> =
    ForceDirectedGraphTypes.LinkData<Id>;
  export type ResolvedLinkData<Id extends NodeId = NodeId> =
    ForceDirectedGraphTypes.ResolvedLinkData<Id>;
  export type GraphData<
    N extends NodeData = NodeData,
    L extends LinkData = LinkData,
  > = ForceDirectedGraphTypes.GraphData<N, L>;
  export type DataType<
    N extends NodeData = NodeData,
    L extends LinkData = LinkData,
  > = GraphData<N, L>;
  export type LabelAlignment = ForceDirectedGraphTypes.LabelAlignment;
  export type LabelBaseline = ForceDirectedGraphTypes.LabelBaseline;
  export type LabelEntry = ForceDirectedGraphTypes.LabelEntry;
  export type LabelParseOptions = ForceDirectedGraphTypes.LabelParseOptions;
  export type LabelParseResult = ForceDirectedGraphTypes.LabelParseResult;
  export type PerformanceInfo = ForceDirectedGraphTypes.PerformanceInfo;
  export type ForceDirectedGraphUniforms =
    ForceDirectedGraphTypes.ForceDirectedGraphUniforms;

  export class ForceDirectedGraph<
    N extends NodeData = NodeData,
    L extends LinkData = LinkData,
  > extends Group {
    static getPotSize: typeof import('@jonobr1/force-directed-graph/math').getPotSize;
    static readonly Properties: readonly string[];

    constructor(renderer: WebGLRenderer, data?: GraphData<N, L>);

    ready: boolean;

    set(data: GraphData<N, L>, callback?: () => void): Promise<void>;
    getLabelParseOptions(): ForceDirectedGraphTypes.ResolvedLabelParseOptions;
    refreshLabels(): Promise<import('@jonobr1/force-directed-graph/labels').Labels | null>;
    update(time: number): this;
    intersect(
      pointer: Vector2,
      camera: Camera,
    ): { point: Vector3; data: N } | null;
    getTexture(name: 'positions' | 'velocities'): Texture;
    getPositionFromIndex(index: number): Vector3 | undefined;
    setPointColorById(id: NodeId, css: ColorRepresentation): void;
    setPointColorFromIndex(index: number, css: ColorRepresentation): void;
    updateLinksColors(): Promise<boolean>;
    getIndexById(id: NodeId): number | undefined;
    getLinksById(
      id: NodeId,
    ): Promise<Array<L & ForceDirectedGraphTypes.ResolvedLinkData>>;
    getPointById(id: NodeId): N | undefined;
    dispose(): this;

    set beginning(value: number);
    get beginning(): number;
    set ending(value: number);
    get ending(): number;
    set decay(value: number);
    get decay(): number;
    set alpha(value: number);
    get alpha(): number;
    set is2D(value: boolean);
    get is2D(): boolean;
    set time(value: number);
    get time(): number;
    set size(value: number);
    get size(): number;
    set maxSpeed(value: number);
    get maxSpeed(): number;
    set timeStep(value: number);
    get timeStep(): number;
    set damping(value: number);
    get damping(): number;
    set repulsion(value: number);
    get repulsion(): number;
    set springLength(value: number);
    get springLength(): number;
    set stiffness(value: number);
    get stiffness(): number;
    set gravity(value: number);
    get gravity(): number;
    set pinStrength(value: number);
    get pinStrength(): number;
    set nodeRadius(value: number);
    get nodeRadius(): number;
    set nodeScale(value: number);
    get nodeScale(): number;
    set sizeAttenuation(value: boolean);
    get sizeAttenuation(): boolean;
    set frustumSize(value: number);
    get frustumSize(): number;
    set linksInheritColor(value: boolean);
    get linksInheritColor(): boolean;
    set labelsInheritColor(value: boolean);
    get labelsInheritColor(): boolean;
    set pointsInheritColor(value: boolean);
    get pointsInheritColor(): boolean;
    set pointColor(value: Color);
    get pointColor(): Color;
    set linksColor(value: Color);
    get linksColor(): Color;
    set linkColor(value: Color);
    get linkColor(): Color;
    set labelsColor(value: Color);
    get labelsColor(): Color;
    set labelColor(value: Color);
    get labelColor(): Color;
    set linecap(value: 'round' | 'butt' | 'square');
    get linecap(): 'round' | 'butt' | 'square';
    set linewidth(value: number);
    get linewidth(): number;
    set opacity(value: number);
    get opacity(): number;
    set obscurity(value: number);
    get obscurity(): number;
    set blending(
      value:
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

    get points(): import('@jonobr1/force-directed-graph/points').Points | undefined;
    get links(): import('@jonobr1/force-directed-graph/links').Links | undefined;
    get labels(): import('@jonobr1/force-directed-graph/labels').Labels | null;
    get uniforms(): ForceDirectedGraphUniforms;
    get nodeCount(): number;
    get edgeCount(): number;
    getPerformanceInfo(): PerformanceInfo;
    isWorkerProcessingAvailable(): boolean;
    isWasmAccelerationAvailable(): boolean;
  }
}
