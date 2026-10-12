import {
  createElement, forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { createGraphController } from '../react/graph-controller.js';

const EMPTY_OPTIONS = {};

/** A graph inside an existing R3F Canvas; the Canvas owns its renderer. */
export const ForceDirectedGraph = forwardRef(function ForceDirectedGraph({
  data,
  options = EMPTY_OPTIONS,
  paused = false,
  onReady,
  onError,
  children,
  ...groupProps
}, ref) {
  const renderer = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const runtime = useRef(null);
  const callbacks = useRef({ onReady, onError });
  const [graph, setGraph] = useState(null);
  useImperativeHandle(ref, () => graph, [graph]);

  useEffect(() => { callbacks.current = { onReady, onError }; });
  useEffect(() => {
    const controller = createGraphController(renderer, {
      onReady: (value) => {
        invalidate();
        callbacks.current.onReady?.(value);
      },
      onError: (error) => callbacks.current.onError?.(error),
    });
    runtime.current = controller;
    setGraph(controller.graph);
    return () => {
      runtime.current = null;
      controller.dispose();
    };
  }, [renderer, invalidate]);

  useEffect(() => { runtime.current?.configure(options); }, [renderer, invalidate, options]);
  useEffect(() => { runtime.current?.setData(data); }, [renderer, invalidate, data]);
  useEffect(() => { invalidate(); }, [invalidate, paused, options]);
  useFrame((state) => {
    const current = runtime.current?.graph;
    if (!paused && current?.ready) {
      current.update(state.clock.elapsedTime * 1000);
      // Keep a demand Canvas simulating until paused; never take over rendering.
      invalidate();
    }
  }, -1);

  // A primitive leaves graph disposal to the controller, while Fiber still
  // disposes ordinary scene children owned by the consumer.
  return createElement('group', groupProps,
    graph && createElement('primitive', { object: graph }), children);
});
