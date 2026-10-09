/// <reference path="./types.d.ts" />
import type { CSSProperties, ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from 'react';
import type { ForceDirectedGraph as Graph, GraphData } from '@jonobr1/force-directed-graph';
import type { ColorRepresentation } from 'three';

export type GraphOptions = Partial<Pick<Graph,
  'decay' | 'alpha' | 'is2D' | 'maxSpeed' | 'timeStep' | 'damping' |
  'repulsion' | 'springLength' | 'stiffness' | 'gravity' | 'pinStrength' |
  'nodeRadius' | 'nodeScale' | 'sizeAttenuation' | 'frustumSize' |
  'linksInheritColor' | 'labelsInheritColor' | 'pointsInheritColor' |
  'linecap' | 'linewidth' | 'opacity' | 'blending' | 'obscurity'
>> & {
  pointColor?: ColorRepresentation;
  linkColor?: ColorRepresentation;
  labelColor?: ColorRepresentation;
};

export interface GraphProps {
  data: GraphData;
  options?: GraphOptions;
  paused?: boolean;
  onReady?: (graph: Graph) => void;
  onError?: (error: unknown) => void;
}

export interface ForceDirectedGraphProps extends GraphProps,
  Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onError'> {
  controls?: boolean;
  cameraPosition?: [number, number, number];
  background?: ColorRepresentation | null;
  pixelRatio?: number;
  style?: CSSProperties;
}

export declare const ForceDirectedGraph: ForwardRefExoticComponent<
  ForceDirectedGraphProps & RefAttributes<Graph>
>;
