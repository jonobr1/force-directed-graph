import {
  createElement, forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createGraphController } from './graph-controller.js';

const EMPTY_OPTIONS = {};
const CAMERA_POSITION = [0, 0, 250];

/** A self-contained WebGL canvas with optional OrbitControls. */
export const ForceDirectedGraph = forwardRef(function ForceDirectedGraph({
  data,
  options = EMPTY_OPTIONS,
  paused = false,
  controls = true,
  cameraPosition = CAMERA_POSITION,
  background = '#111827',
  pixelRatio,
  onReady,
  onError,
  className,
  style,
  ...containerProps
}, ref) {
  const container = useRef(null);
  const runtime = useRef(null);
  const callbacks = useRef({ onReady, onError });
  const [graph, setGraph] = useState(null);
  useImperativeHandle(ref, () => graph, [graph]);

  useEffect(() => { callbacks.current = { onReady, onError }; });

  useEffect(() => {
    const host = container.current;
    let renderer;
    let controller;
    let orbit;
    let observer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
      const scene = new Scene();
      const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
      orbit = new OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = true;
      controller = createGraphController(renderer, {
        onReady: (value) => callbacks.current.onReady?.(value),
        onError: (error) => callbacks.current.onError?.(error),
      });
      scene.add(controller.graph);
      host.appendChild(renderer.domElement);
      renderer.domElement.style.display = 'block';
      const state = { renderer, scene, camera, orbit, controller, paused: false };
      state.resize = () => {
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      runtime.current = state;
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(state.resize);
        observer.observe(host);
      }
      window.addEventListener('resize', state.resize);
      state.resize();
      renderer.setAnimationLoop((time) => {
        if (!state.paused) controller.graph.update(time);
        if (orbit.enabled) orbit.update();
        renderer.render(scene, camera);
      });
      setGraph(controller.graph);
    } catch (error) {
      callbacks.current.onError?.(error);
    }

    return () => {
      const state = runtime.current;
      runtime.current = null;
      observer?.disconnect();
      if (state) window.removeEventListener('resize', state.resize);
      renderer?.setAnimationLoop(null);
      orbit?.dispose();
      renderer?.domElement.remove();
      // A load may still be using this renderer after React removes the canvas.
      if (controller) controller.dispose().finally(() => renderer.dispose());
      else renderer?.dispose();
    };
  }, []);

  useEffect(() => { runtime.current?.controller.configure(options); }, [options]);
  useEffect(() => { runtime.current?.controller.setData(data); }, [data]);
  useEffect(() => {
    const state = runtime.current;
    if (!state) return;
    state.paused = paused;
    state.orbit.enabled = controls;
    state.renderer.setClearColor(background ?? '#000000', background == null ? 0 : 1);
    state.renderer.setPixelRatio(pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2));
    state.resize();
  }, [paused, controls, background, pixelRatio]);
  useEffect(() => {
    const state = runtime.current;
    if (!state) return;
    state.camera.position.set(...cameraPosition);
    state.camera.lookAt(0, 0, 0);
    state.orbit.update();
  }, [cameraPosition]);

  return createElement('div', {
    ...containerProps,
    ref: container,
    className,
    style: { width: '100%', height: '100%', minHeight: 300, ...style },
  });
});
