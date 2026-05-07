import {
  Color,
  ShaderMaterial,
  WebGLRenderTarget,
  Sprite,
  SpriteMaterial,
  Vector2
} from "three";
import pointShader from "./shaders/hit.js";

const color = new Color();

export class Hit {

  parent = null;

  renderTarget = new WebGLRenderTarget(1, 1);
  width = 1;
  height = 1;
  ratio = 1;

  material = null;
  helper = null;
  shader = null;

  constructor(fdg) {

    this.parent = fdg;
    this.helper = new Sprite(new SpriteMaterial({
      map: this.renderTarget.texture
    }));

    this.material = new ShaderMaterial({
      uniforms: {
        hitScale: { value: 2 },
        viewport: { value: new Vector2(1, 1) }
      },
      vertexShader: pointShader.vertexShader,
      fragmentShader: pointShader.fragmentShader,
      transparent: true
    });
    this.shader = pointShader;

  }

  inherit(mesh) {
    const shader = mesh.userData.hitShader || pointShader;
    if (shader !== this.shader) {
      this.material.vertexShader = shader.vertexShader;
      this.material.fragmentShader = shader.fragmentShader;
      this.material.needsUpdate = true;
      this.shader = shader;
    }
    const { hitScale, viewport } = this.material.uniforms;
    this.material.uniforms = {
      ...mesh.material.uniforms,
      hitScale,
      viewport
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
    const alpha = renderer.getClearAlpha();

    if (this.material.uniforms.viewport) {
      this.material.uniforms.viewport.value.set(
        this.renderTarget.width,
        this.renderTarget.height
      );
    }

    renderer.getClearColor(color);

    parent.points.material = this.material;
    parent.links.visible = false;

    renderer.setClearColor(0x000000, 0);
    renderer.render(parent, camera);

    parent.points.material = material;
    parent.links.visible = visible;

    renderer.setRenderTarget(renderTarget);
    renderer.setClearColor(color, alpha);

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
    this.shader = null;

  }

}
