// The 3D arena: night graveyard at the gym's perimeter fence, assembled from
// Kenney's CC0 Graveyard Kit. One fullscreen WebGL renderer; the webcam feed
// lives in a small PiP corner element instead of behind everything.
//
// Perf choices for mobile: no shadow maps (blob shadows under characters
// instead), fog doing the depth work, pixel ratio capped at 2, small draw
// call count (~30 static props).

import * as THREE from 'three';
import { loadGltf } from './actors.js';

const ENV = 'assets/env/';

// [model, x, z, rotationY-degrees, optional uniform scale]
const LAYOUT = [
  // Perimeter fence line the zombies come through (a broken gap in the middle)
  ['iron-fence.glb', -4.5, -4.2, 0],
  ['iron-fence.glb', -3.0, -4.2, 0],
  ['iron-fence-damaged.glb', -1.5, -4.2, 0],
  ['iron-fence-damaged.glb', 1.5, -4.2, 180],
  ['iron-fence.glb', 3.0, -4.2, 0],
  ['iron-fence.glb', 4.5, -4.2, 0],
  ['iron-fence-border-column.glb', -5.3, -4.2, 0],
  ['iron-fence-border-column.glb', 5.3, -4.2, 0],

  // Gravestones beyond the fence, receding into fog
  ['gravestone-round.glb', -3.4, -6.0, 15],
  ['gravestone-cross.glb', -1.8, -7.2, -10],
  ['gravestone-broken.glb', 0.6, -6.4, 25],
  ['gravestone-bevel.glb', 2.6, -7.6, -20],
  ['gravestone-wide.glb', 4.2, -6.2, 8],
  ['grave-border.glb', -2.6, -8.8, 5],
  ['cross-wood.glb', 1.6, -9.0, -12],
  ['gravestone-decorative.glb', -4.8, -8.4, 30],

  // Big silhouettes in the deep fog
  ['crypt-large.glb', -7.5, -11.5, 25],
  ['crypt-small.glb', 7.0, -10.5, -30],
  ['pine.glb', -6.2, -7.5, 0, 1.4],
  ['pine-crooked.glb', 6.0, -7.8, 40, 1.3],
  ['pine.glb', 8.5, -13.0, 80, 1.6],
  ['pine-fall.glb', -9.0, -13.5, 10, 1.5],

  // Player's side of the fence: the gym's last stand
  ['lightpost-single.glb', -2.6, -3.0, 30],
  ['debris-wood.glb', 2.4, -2.6, 60],
  ['debris.glb', -3.6, -1.4, 15],
  ['fire-basket.glb', 2.9, -2.9, 0],
  ['trunk.glb', -5.0, 0.5, 75],
  ['lantern-candle.glb', 3.4, 0.8, 0],
  ['rocks.glb', 5.2, -1.0, 20],
];

export class GameScene {
  constructor(canvasEl) {
    this.canvasEl = canvasEl;

    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e14);
    this.scene.fog = new THREE.FogExp2(0x0a0e14, 0.075);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
    // Over-the-shoulder: survivor stands near origin facing -z (the fence);
    // camera behind and above.
    this.camera.position.set(0, 2.1, 4.8);
    this.camera.lookAt(0, 1.1, -2);

    this._addLights();
    this._addGround();

    this.resize();
  }

  _addLights() {
    // Cold moonlight + dim ambient base.
    const moon = new THREE.DirectionalLight(0x8fa8ff, 0.7);
    moon.position.set(-6, 10, -4);
    const ambient = new THREE.AmbientLight(0x33404f, 1.1);

    // The gym floodlight behind the player — warm, the thing drawing them in.
    const flood = new THREE.SpotLight(0xffd9a0, 250, 30, Math.PI / 5, 0.5, 1.8);
    flood.position.set(0, 5.5, 7);
    flood.target.position.set(0, 0.5, -4);

    // Small warm fill at the lightpost by the fence.
    const post = new THREE.PointLight(0xffb055, 12, 9, 1.6);
    post.position.set(-2.4, 2.4, -2.9);

    this.scene.add(moon, ambient, flood, flood.target, post);
  }

  _addGround() {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(35, 40),
      new THREE.MeshStandardMaterial({ color: 0x1c2b1e, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
  }

  // Loads and places all environment props. onProgress(loaded, total) optional.
  async load(onProgress) {
    let done = 0;
    const cache = new Map(); // model file -> loaded scene (cloned per placement)

    for (const [file] of LAYOUT) {
      if (!cache.has(file)) cache.set(file, null);
    }
    const uniqueFiles = [...cache.keys()];

    await Promise.all(
      uniqueFiles.map(async (file) => {
        const gltf = await loadGltf(ENV + file);
        cache.set(file, gltf.scene);
        done += 1;
        if (onProgress) onProgress(done, uniqueFiles.length);
      })
    );

    for (const [file, x, z, rotDeg = 0, s = 1] of LAYOUT) {
      const instance = cache.get(file).clone();
      instance.position.set(x, 0, z);
      instance.rotation.y = (rotDeg * Math.PI) / 180;
      instance.scale.setScalar(s);
      this.scene.add(instance);
    }
  }

  // Simple dark disc under a character — cheap stand-in for real shadows.
  makeBlobShadow(radius = 0.5) {
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.01;
    return blob;
  }

  add(object3d) {
    this.scene.add(object3d);
  }

  resize() {
    const w = this.canvasEl.clientWidth || window.innerWidth;
    const h = this.canvasEl.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
