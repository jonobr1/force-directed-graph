import {
  ShaderMaterial,
  WebGLRenderTarget,
  Sprite,
  SpriteMaterial
} from "three";
import { hit as shader } from "./shaders.js";

export class Hit {

  parent = null;

  renderTarget = new WebGLRenderTarget(1, 1);
  width = 1;
  height = 1;
  ratio = 1;

  material = null;
  helper = null;

  constructor(fdg) {

    this.parent = fdg;
    this.helper = new Sprite(new SpriteMaterial({
      map: this.renderTarget.texture
    }));

    const points = fdg.points;

    this.material = new ShaderMaterial({
      uniforms: points.material.uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true
    });

  }

  setSize(width, height) {

    const { helper, ratio, renderTarget } = this;

    const w = width * ratio;
    const h = height * ratio;

    if (this.width !== width || this.height !== height) {
      this.width = width;
      this.height = height;
      renderTarget.setSize(w, h);
      helper.scale.set(w, h, 1);
    }

  }

  compute(renderer, scene, camera) {

    const { parent } = this;
    const renderTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(this.renderTarget);

    const material = parent.points.material;
    const visible = parent.links.visible;

    parent.points.material = this.material;
    parent.links.visible = false;
    renderer.render(scene, camera);

    parent.points.material = material;
    parent.links.visible = visible;

    renderer.setRenderTarget(renderTarget);

  }

}