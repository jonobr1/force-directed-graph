import {
  ShaderMaterial,
  WebGLRenderTarget,
  Sprite,
  SpriteMaterial
} from "three";
import shader from "./shaders/hit.js";

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

    this.material = new ShaderMaterial({
      uniforms: {
        hitScale: { value: 2 }
      },
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      transparent: true
    });

  }

  inherit(mesh) {
    this.material.uniforms = {
      ...this.material.uniforms,
      ...mesh.material.uniforms
    };
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

  compute(renderer, camera) {

    const { parent } = this;
    const renderTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(this.renderTarget);

    const material = parent.points.material;
    const visible = parent.links.visible;

    parent.points.material = this.material;
    parent.links.visible = false;
    renderer.render(parent, camera);

    parent.points.material = material;
    parent.links.visible = visible;

    renderer.setRenderTarget(renderTarget);

  }

  dispose() {

    this.parent = null;

    this.renderTarget = new WebGLRenderTarget(1, 1);
    this.width = 1;
    this.height = 1;
    this.ratio = 1;
  
    this.material.dispose();
    this.helper.geometry.dispose();
    this.helper.material.dispose();

    this.material = null;
    this.helper = null;

  }

}