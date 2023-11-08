import {
  Points,
  ShaderMaterial,
  WebGLRenderer,
  Scene,
  Vector2
} from "three";
import { hit as shader } from "./shaders.js";

const size = new Vector2();

export class Hit {

  parent = null;
  renderer = new WebGLRenderer();
  scene = new Scene();
  ratio = 0.25;

  constructor(fdg) {

    this.parent = fdg;

    const points = fdg.points;
    const material = new ShaderMaterial({
      uniforms: points.material.uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true
    });

    const object = new Points(points.geometry, material);
    object.frustumCulled = false;
    object.matrixAutoUpdate = false;
    object.matrixWorldAutoUpdate = false;

    this.scene.add(object);

  }

  setSize(width, height) {

    const { ratio, renderer } = this;

    renderer.getSize(size);

    const w = width * ratio;
    const h = height * ratio;

    if (size.x !== w || size.y !== h) {
      this.renderer.setSize(w, h);
    }

  }

  render(camera) {

    const { renderer, scene, parent } = this;

    const child = scene.children[0];
    child.matrix.copy(parent.matrix);
    child.matrixWorld.copy(parent.matrixWorld);

    renderer.render(scene, camera);

  }

}