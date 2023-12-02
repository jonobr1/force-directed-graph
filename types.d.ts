declare module "shaders/partials" {
    /**
     * Draws a circle with uv position pos and radius rad.
     * Relies on uniforms:
     * - float sizeAttenuation: 0, 1
     */
    export const circle: "\nfloat circle( vec2 uv, vec2 pos, float rad, float isSmooth ) {\n\n  float limit = 0.02;\n  float limit2 = limit * 2.0;\n  float d = length( pos - uv ) - ( rad - limit );\n  float t = clamp( d, 0.0, 1.0 );\n\n  float viewRange = smoothstep( 0.0, frustumSize * 0.001, abs( vDistance ) );\n  float taper = limit2 * viewRange + limit;\n  taper = mix( taper, limit2, sizeAttenuation );\n\n  float a = step( 0.5, 1.0 - t );\n  float aa = smoothstep( 0.5 - taper, 0.5 + taper, 1.0 - t );;\n\n  return mix( a, aa, isSmooth );\n\n}\n";
    /**
     * Get the position in local space of a node
     */
    export const getPosition: "\n  vec3 getPosition( vec2 uv ) {\n    return texture2D( texturePositions, uv ).xyz;\n  }\n";
    /**
     * Get the velocity in local space of a node
     */
    export const getVelocity: "\n  vec3 getVelocity( vec2 uv ) {\n    return texture2D( textureVelocities, uv ).xyz;\n  }\n";
    /**
     * Get a node's id from a specific UV coordinate
     * Relies on uniforms:
     * - float size: number
     */
    export const getIndex: "\n  int getIndex( vec2 uv ) {\n    int s = int( size );\n    int col = int( uv.x * size );\n    int row = int( uv.y * size );\n    return col + row * s;\n  }\n";
    /**
     * GLSL version of a random float generator
     */
    export const random: "\n  float random( vec2 seed ) {\n    return fract( sin( dot( seed.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );\n  }\n";
    /**
     * Add slight variation of a given node's index
     * Used for unsticking two nodes that happen to be
     * at the exact same coordinates on any given frame,
     * though usually most common on initialization.
     *
     * Relies on uniforms:
     * - float time: number
     */
    export const jiggle: "\n  float jiggle( float index ) {\n    return ( random( vec2( index, time ) ) - 0.5 ) * 0.000001;\n  }\n";
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
    export const link: "\n  vec3 link( float i, int id1, vec3 p1, vec3 v1, vec2 uv2 ) {\n\n    vec3 result = vec3( 0.0 );\n\n    vec4 edge = texture2D( textureLinks, uv2 );\n\n    vec2 source = edge.xy;\n    vec2 target = edge.zw;\n\n    int si = getIndex( source );\n    float siF = float( si );\n    vec3 sv = getVelocity( source );\n    vec3 sp = getPosition( source );\n\n    int ti = getIndex( target );\n    float tiF = float( ti );\n    vec3 tv = getVelocity( target );\n    vec3 tp = getPosition( target );\n\n    vec3 diff = tp + tv - ( sp + sv );\n    diff.z *= 1.0 - is2D;\n\n    vec3 mag = abs( diff );\n    float seed = float( si + ti );\n\n    float bias = 0.5;\n    float dist = length( diff );\n\n    dist = stiffness * ( dist - springLength ) / dist;\n    diff *= dist;\n\n    if ( id1 == ti ) {\n      result -= diff * bias;\n    } else if ( id1 == si ) {\n      result += diff * bias;\n    }\n\n    result.z *= 1.0 - is2D;\n\n    return result;\n\n  }\n";
    /**
     * Repulses (or not) two nodes together based
     * on a repulsion amount.
     *
     * Relies on uniforms and partials:
     * - float is2D: [0, 1]
     * - float repulsion: number
     */
    export const charge: "\n  vec3 charge( float i, int id1, vec3 p1, vec3 v1, int id2, vec3 v2, vec3 p2 ) {\n\n    vec3 result = vec3( 0.0 );\n\n    vec3 diff = ( p2 + v2 ) - ( p1 + v1 );\n    diff.z *= 1.0 - is2D;\n\n    float dist = length( diff );\n    float mag = repulsion / dist;\n\n    vec3 dir = normalize( diff );\n\n    if ( id1 != id2 ) {\n      result += dir * mag;\n    }\n\n    result.z *= 1.0 - is2D;\n\n    return result;\n\n  }\n";
    /**
     * Attracts (or not) a node to the
     * center of the force directed graph
     * by how much gravity there is.
     *
     * Relies on uniforms:
     * - float gravity: number
     */
    export const center: "\n  vec3 center( vec3 p1 ) {\n    return - p1 * gravity * 0.1;\n  }\n";
}
declare module "shaders/hit" {
    export default hit;
    namespace hit {
        const vertexShader: string;
        const fragmentShader: string;
    }
}
declare module "hit" {
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
declare module "math" {
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
    export function each(list: any[], func: Function, step?: number, max?: number): Promise<any>;
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
declare module "shaders/positions" {
    /**
     * Calculate the next frame's position for all nodes.
     */
    export const positions: "\n  uniform float is2D;\n  uniform float timeStep;\n\n  void main() {\n\n    vec2 uv = gl_FragCoord.xy / resolution.xy;\n    vec4 texel = texture2D( texturePositions, uv );\n    vec3 position = texel.xyz;\n    vec3 velocity = texture2D( textureVelocities, uv ).xyz;\n    float isStatic = texel.w;\n\n    vec3 result = position + velocity * timeStep * ( 1.0 - isStatic );\n\n    gl_FragColor = vec4( result.xyz, isStatic );\n\n  }\n";
}
declare module "shaders/velocities" {
    export const types: string[];
    /**
     * Calculate the next frame's velocity for all nodes.
     */
    export const simplex: string;
    export const nested: string;
}
declare module "shaders/simulation" {
    namespace _default {
        export { positions };
        export { simplex as velocities };
        export { simplex };
        export { nested };
        export { types };
    }
    export default _default;
    import { positions } from "shaders/positions";
    import { simplex } from "shaders/velocities";
    import { nested } from "shaders/velocities";
    import { types } from "shaders/velocities";
}
declare module "shaders/points" {
    export default points;
    namespace points {
        const vertexShader: string;
        const fragmentShader: string;
    }
}
declare module "texture-atlas" {
    export class TextureAtlas {
        static Resolution: number;
        static getAbsoluteURL(path: any): string;
        map: any[];
        dimensions: number;
        isTextureAtlas: boolean;
        flipY: boolean;
        add(src: any): number;
        update(): void;
        needsUpdate: boolean;
        indexOf(src: any): number;
    }
}
declare module "points" {
    export class Points {
        static parse(size: any, data: any): Promise<{
            atlas: TextureAtlas;
            geometry: any;
        }>;
        constructor({ atlas, geometry }: {
            atlas: any;
            geometry: any;
        }, uniforms: any);
        frustumCulled: boolean;
    }
    import { TextureAtlas } from "texture-atlas";
}
declare module "shaders/links" {
    export default links;
    namespace links {
        const vertexShader: string;
        const fragmentShader: string;
    }
}
declare module "links" {
    export class Links {
        static parse(points: any, data: any): Promise<any>;
        constructor(geometry: any, uniforms: any);
        frustumCulled: boolean;
    }
}
declare module "registry" {
    export class Registry {
        constructor(list: any);
        map: {};
        get(id: any): any;
        set(index: any, item: any): void;
        clear(): void;
    }
}
declare module "index" {
    export class ForceDirectedGraph {
        static getPotSize: typeof getPotSize;
        static Properties: string[];
        /**
         * @param {THREE.WebGLRenderer} renderer - the three.js renderer referenced to create the render targets
         * @param {Object} [data] - optional data to automatically set the data of the graph
         */
        constructor(renderer: THREE.WebGLRenderer, data?: any);
        ready: boolean;
        /**
         * @param {Object} data - Object with nodes and links properties based on https://observablehq.com/@d3/force-directed-graph-component
         * @param {Function} callback
         * @description Set the data to an instance of force directed graph. Because of the potential large amount of data this function runs on a request animation frame and returns a promise (or a passed callback) to give indication when the graph is ready to be rendered.
         * @returns {Promise}
         */
        set(data: any, callback: Function): Promise<any>;
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
        intersect(pointer: THREE.Vector2, camera: THREE.Camera): any | null;
        getTexture(name: any): any;
        getPositionFromIndex(i: any): any;
        setPointColorById(id: any, css: any): void;
        setPointColorFromIndex(index: any, css: any): void;
        updateLinksColors(): Promise<boolean>;
        getIndexById(id: any): any;
        getLinksById(id: any): Promise<any[]>;
        getPointById(id: any): any;
        set decay(arg: any);
        get decay(): any;
        set alpha(arg: any);
        get alpha(): any;
        set is2D(arg: any);
        get is2D(): any;
        set time(arg: any);
        get time(): any;
        set size(arg: any);
        get size(): any;
        set maxSpeed(arg: any);
        get maxSpeed(): any;
        set timeStep(arg: any);
        get timeStep(): any;
        set damping(arg: any);
        get damping(): any;
        set repulsion(arg: any);
        get repulsion(): any;
        set springLength(arg: any);
        get springLength(): any;
        set stiffness(arg: any);
        get stiffness(): any;
        set gravity(arg: any);
        get gravity(): any;
        set nodeRadius(arg: any);
        get nodeRadius(): any;
        set nodeScale(arg: any);
        get nodeScale(): any;
        set sizeAttenuation(arg: any);
        get sizeAttenuation(): any;
        set frustumSize(arg: any);
        get frustumSize(): any;
        set linksInheritColor(arg: any);
        get linksInheritColor(): any;
        set pointsInheritColor(arg: any);
        get pointsInheritColor(): any;
        set pointColor(arg: any);
        get pointColor(): any;
        set linksColor(arg: any);
        get linksColor(): any;
        set linkColor(arg: any);
        get linkColor(): any;
        set opacity(arg: any);
        get opacity(): any;
        set blending(arg: any);
        get blending(): any;
        get points(): any;
        get links(): any;
        get uniforms(): any;
        get nodeCount(): any;
        get edgeCount(): any;
    }
    import { getPotSize } from "math";
}
