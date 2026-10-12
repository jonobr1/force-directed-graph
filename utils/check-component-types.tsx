import { createRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ForceDirectedGraph as Graph, type GraphData } from '@jonobr1/force-directed-graph';
import { ForceDirectedGraph as ReactGraph, type GraphOptions } from '@jonobr1/force-directed-graph/react';
import { ForceDirectedGraph as FiberGraph } from '@jonobr1/force-directed-graph/r3f';

const data: GraphData = { nodes: [{ id: 1 }], links: [] };
const options: GraphOptions = { pointColor: '#ff0000', linewidth: 2, is2D: true };
const ref = createRef<Graph>();

export const standalone = <ReactGraph data={data} options={options} ref={ref}
  style={{ height: 500 }} cameraPosition={[0, 0, 100]} background={null}
  onReady={(graph) => graph.getPointById(1)} onError={(error) => console.error(error)} />;
export const fiber = <Canvas><FiberGraph data={data} options={options} ref={ref}
  position={[1, 2, 3]} paused><mesh /></FiberGraph></Canvas>;

// @ts-expect-error Data is required.
export const missingData = <ReactGraph />;
// @ts-expect-error Graph options have typed values.
export const invalidOption = <ReactGraph data={data} options={{ linewidth: 'wide' }} />;
// @ts-expect-error A Fiber graph does not own Canvas camera settings.
export const invalidCamera = <FiberGraph data={data} cameraPosition={[0, 0, 100]} />;
