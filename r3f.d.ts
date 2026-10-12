import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import type { ForceDirectedGraph as Graph } from '@jonobr1/force-directed-graph';
import type { GraphProps } from './react';
export type { GraphOptions } from './react';

export type ForceDirectedGraphProps = GraphProps &
  Omit<ThreeElements['group'], 'ref' | 'dispose' | keyof GraphProps>;

export declare const ForceDirectedGraph: ForwardRefExoticComponent<
  ForceDirectedGraphProps & RefAttributes<Graph>
>;
