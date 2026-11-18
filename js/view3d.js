// 3D view of furniture (three.js). Every panel is a box in its real size and color.
// Tap a part to see what it is. Exploded view and opening doors help explain how it goes together.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { finishById } from './core.js';

const S = 0.001; // mm → metres

// Wood finishes get a simple grain texture drawn on a canvas
const texCache = new Map();
function woodTexture(hex) {
  if (texCache.has(hex)) return texCache.get(hex);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = hex;
  g.fillRect(0, 0, 256, 256);
  const base = new THREE.Color(hex);
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * 256;
    const shade = base.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
    g.strokeStyle = `#${shade.getHexString()}`;
    g.globalAlpha = 0.35 + Math.random() * 0.4;
    g.lineWidth = 0.5 + Math.random() * 2.5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin((x + i * 13) / 40) * 3 + (Math.random() - 0.5) * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(hex, t);
  return t;
}

export class Viewer {
  constructor(container, { onPick } = {}) {
    this.container = container;
    this.onPick = onPick;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 6, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -6; sun.shadow.camera.right = 6; sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
    this.scene.add(sun);
    this.sun = sun;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.grid = new THREE.GridHelper(20, 40, 0x6b6560, 0x3a3631);
    this.grid.material.opacity = 0.25;
    this.grid.material.transparent = true;
    this.scene.add(this.grid);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.explode = 0;
    this.openAmount = 0;
    this.picked = null;
    this.raycaster = new THREE.Raycaster();
    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(container);
    let down = null;
    this.renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) this.pick(e);
      down = null;
    });
    this.resize();
    this.running = true;
    requestAnimationFrame(this.loop);
  }

  resize() {
    const w = this.container.clientWidth || 300;
    const h = this.container.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loop() {
    if (!this.running) return;
    this.controls.update();
    this.animate();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }

  // groups: [{ out, offset: [x, y, z] (mm), label }]
  setModel(groups, { keepCamera = false } = {}) {
    this.clear();
    const mats = new Map();
    const matFor = (color, role) => {
      const f = finishById(color);
      const key = f.hex + '|' + (f.wood ? 'w' : '') + role;
      if (!mats.has(key)) {
        const m = new THREE.MeshStandardMaterial({ color: f.wood ? 0xffffff : f.hex, map: f.wood ? woodTexture(f.hex) : null, roughness: role === 'door' ? 0.45 : 0.7, metalness: 0.02 });
        mats.set(key, m);
      }
      return mats.get(key);
    };
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x1b1714, transparent: true, opacity: 0.35 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x8d9399, roughness: 0.35, metalness: 0.85 });
    const timber = new THREE.MeshStandardMaterial({ color: 0xc9a46a, map: woodTexture('#c9a46a'), roughness: 0.8 });
    const box = new THREE.Box3();
    this.meshes = [];
    for (const { out, offset = [0, 0, 0] } of groups) {
      if (!out) continue;
      const [ox, oy, oz] = offset;
      for (const p of out.panels) {
        const b = p.box;
        const geo = new THREE.BoxGeometry(Math.max(1, b.w) * S, Math.max(1, b.h) * S, Math.max(1, b.d) * S);
        const mesh = new THREE.Mesh(geo, matFor(p.color, p.role));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
        const center = new THREE.Vector3((ox + b.x + b.w / 2) * S, (oy + b.y + b.h / 2) * S, (oz + b.z + b.d / 2) * S);
        const holder = new THREE.Group();
        holder.userData = { panel: p, home: center.clone(), explode: p.explode || [0, 0, 0], door: p.door };
        if (p.door && !p.door.drawer) {
          // pivot on the hinge edge, at the back face of the door
          const hingeLeft = p.door.hinge !== 'R';
          const px = (ox + b.x + (hingeLeft ? 0 : b.w)) * S;
          const pz = (oz + b.z) * S;
          holder.position.set(px, center.y, pz);
          mesh.position.set(center.x - px, 0, center.z - pz);
          holder.userData.pivot = holder.position.clone();
          holder.userData.sign = hingeLeft ? -1 : 1;
          // hinge cups on the back of the door, 22.5 mm in from the hinge edge
          for (const hy of p.hinges || []) {
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0175, 0.004, 16), metal);
            cup.rotation.x = Math.PI / 2;
            cup.position.set((hingeLeft ? -b.w / 2 + 22.5 : b.w / 2 - 22.5) * S, (b.h / 2 - hy) * S, (-b.d / 2 - 1) * S);
            mesh.add(cup);
          }
        } else {
          holder.position.copy(center);
        }
        holder.add(mesh);
        mesh.userData.holder = holder;
        this.root.add(holder);
        this.meshes.push(mesh);
        box.expandByPoint(new THREE.Vector3((ox + b.x) * S, (oy + b.y) * S, (oz + b.z) * S));
        box.expandByPoint(new THREE.Vector3((ox + b.x + b.w) * S, (oy + b.y + b.h) * S, (oz + b.z + b.d) * S));
      }
      for (const r of out.rails || []) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, r.len * S, 16), metal);
        rod.rotation.z = Math.PI / 2;
        rod.position.set((ox + r.x + r.len / 2) * S, (oy + r.y) * S, (oz + r.z) * S);
        rod.castShadow = true;
        this.root.add(rod);
      }
      for (const bar of out.bars || []) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(bar.w * S, bar.h * S, bar.d * S), bar.kind === 'metal' ? metal : timber);
        m.position.set((ox + bar.x + bar.w / 2) * S, (oy + bar.y + bar.h / 2) * S, (oz + bar.z + bar.d / 2) * S);
        m.castShadow = true;
        m.userData = { info: bar.kind === 'metal' ? 'Steel support' : 'Timber support' };
        this.root.add(m);
      }
      for (const l of out.legs || []) {
        if (!l.h) continue;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, l.h * S, 16), l.metal ? metal : new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
        leg.position.set((ox + l.x) * S, (oy + l.y + l.h / 2) * S, (oz + l.z) * S);
        leg.castShadow = true;
        this.root.add(leg);
      }
    }
    this.bounds = box;
    if (!keepCamera || !this.fitted) this.fit();
    this.applyPose(true);
  }

  fit() {
    const box = this.bounds;
    if (!box || box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.5 + 0.1;
    const dist = r / Math.sin((this.camera.fov * Math.PI) / 360) * 1.05;
    const dir = new THREE.Vector3(0.75, 0.55, 1.15).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.target.copy(center);
    this.camera.near = dist / 100;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.grid.position.set(center.x, 0.0005, center.z);
    this.fitted = true;
  }

  setExplode(v) { this.explode = v; this.applyPose(); }
  setOpen(v) { this.openAmount = v; this.applyPose(); }

  applyPose(instant = false) {
    this.target = { explode: this.explode, open: this.openAmount };
    if (instant) this.cur = { ...this.target };
  }

  animate() {
    if (!this.target) return;
    this.cur = this.cur || { explode: 0, open: 0 };
    const k = 0.18;
    const before = JSON.stringify(this.cur);
    this.cur.explode += (this.target.explode - this.cur.explode) * k;
    this.cur.open += (this.target.open - this.cur.open) * k;
    if (Math.abs(this.cur.explode - this.target.explode) < 1e-3) this.cur.explode = this.target.explode;
    if (Math.abs(this.cur.open - this.target.open) < 1e-3) this.cur.open = this.target.open;
    if (before === JSON.stringify(this.cur) && this.posed) return;
    this.posed = true;
    for (const h of this.root.children) {
      const u = h.userData;
      if (!u || !u.panel) continue;
      const e = u.explode;
      const dist = 0.12 * this.cur.explode;
      const base = u.pivot || u.home;
      h.position.set(base.x + e[0] * dist, base.y + e[1] * dist, base.z + e[2] * dist);
      if (u.door && !u.door.drawer && u.pivot) h.rotation.y = u.sign * (Math.PI * 0.55) * this.cur.open;
      if (u.door && u.door.drawer) h.position.z += 0.35 * this.cur.open;
      if (u.panel.role === 'drawer') h.position.z += 0.35 * this.cur.open;
    }
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    if (this.picked) { this.picked.material = this.picked.userData.mat; this.picked = null; }
    if (!hit) { if (this.onPick) this.onPick(null); return; }
    const mesh = hit.object;
    mesh.userData.mat = mesh.material;
    mesh.material = mesh.material.clone();
    mesh.material.emissive = new THREE.Color(0x2563eb);
    mesh.material.emissiveIntensity = 0.45;
    this.picked = mesh;
    if (this.onPick) this.onPick(mesh.userData.holder.userData.panel);
  }

  snapshot(w = 480) {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round(w * (src.height / src.width));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75);
  }

  clear() {
    for (const o of [...this.root.children]) {
      o.traverse((x) => { if (x.geometry) x.geometry.dispose(); });
      this.root.remove(o);
    }
    this.picked = null;
    this.posed = false;
  }

  destroy() {
    this.running = false;
    this.ro.disconnect();
    this.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
