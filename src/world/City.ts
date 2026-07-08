import * as THREE from "three";
import { CollisionWorld } from "./Collision";

/** Deterministic RNG so the city layout is stable across reloads. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUILDING_COLORS = [
  0xc97b4a, 0xd9a05b, 0xa8584a, 0xcabf9e, 0x8c9b6e, 0xb5651d, 0xd8cfc0, 0xb98a6a, 0x9fae8e,
];

/**
 * A compact, handcrafted Mumbai-flavored city block: an asphalt grid of broad
 * roads, sidewalks with curbs, low-poly buildings (windowed, with collision),
 * lane markings, props and a few named landmarks. Built from primitives so
 * nothing blocks on external assets; glTF models can replace the meshes later.
 */
export class City {
  readonly group = new THREE.Group();
  readonly collision = new CollisionWorld();

  // Curated points on sidewalks where customers can wait / be dropped off.
  readonly waitPoints: THREE.Vector3[] = [];

  readonly blockSize = 18;
  readonly roadWidth = 12;
  readonly grid = 7;
  readonly cellPitch = this.blockSize + this.roadWidth;
  readonly span = this.grid * this.cellPitch;

  private rand: () => number;
  private windowCanvas = this.buildWindowCanvas();

  // A fixed seed makes the layout (and the order of `waitPoints`) identical on
  // every client, so in multiplayer a passenger can be referenced purely by its
  // wait-point index and every player resolves the same world position.
  constructor(seed = 1337) {
    this.rand = mulberry32(seed);
    this.buildGround();
    this.buildRoadMarkings();
    this.buildBlocks();
    this.buildBoundaryWalls();
    this.placeLandmarks();
    this.placeProps();
  }

  private get offset(): number {
    return -this.span / 2 + this.cellPitch / 2;
  }

  /** World coordinates of the road centerlines (used to place traffic/cows). */
  get roadLines(): number[] {
    const lines: number[] = [];
    for (let k = 0; k <= this.grid; k++) {
      lines.push(this.offset - this.cellPitch / 2 + k * this.cellPitch);
    }
    return lines;
  }

  private buildGround() {
    // Grass surround.
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x6a854a }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    this.group.add(grass);

    // Asphalt covering the whole grid area.
    const pad = this.roadWidth;
    const asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(this.span + pad, this.span + pad),
      new THREE.MeshStandardMaterial({ color: 0x55555e, roughness: 0.95 }),
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.receiveShadow = true;
    this.group.add(asphalt);
  }

  // --- Road markings (texture-based: one mesh per road line) -----------------

  private buildRoadMarkings() {
    const dashTex = this.buildDashTexture();
    const half = this.span / 2;
    const lane = this.roadWidth / 2 - 0.7; // edge-line offset from centerline

    for (const coord of this.roadLines) {
      // Yellow dashed centerline along each road, both axes.
      this.addLine(dashTex.clone(), coord, true, half, 0.22, this.span / 3.4);
      this.addLine(dashTex.clone(), coord, false, half, 0.22, this.span / 3.4);
      // Solid white edge lines on either side of the centerline.
      for (const s of [-1, 1]) {
        this.addSolidLine(coord + s * lane, true, half);
        this.addSolidLine(coord + s * lane, false, half);
      }
    }
  }

  /** A dashed line (textured plane) running along one axis at a fixed coord. */
  private addLine(
    tex: THREE.Texture,
    fixed: number,
    horizontal: boolean,
    half: number,
    width: number,
    repeats: number,
  ) {
    tex.repeat.set(repeats, 1);
    const geo = new THREE.PlaneGeometry(half * 2, width);
    geo.rotateX(-Math.PI / 2); // lie flat, length along local X
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    if (!horizontal) mesh.rotation.y = Math.PI / 2; // turn length to Z
    mesh.position.set(horizontal ? 0 : fixed, 0.02, horizontal ? fixed : 0);
    this.group.add(mesh);
  }

  private addSolidLine(fixed: number, horizontal: boolean, half: number) {
    const geo = new THREE.PlaneGeometry(half * 2, 0.14);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfcfc4, transparent: true, opacity: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    if (!horizontal) mesh.rotation.y = Math.PI / 2;
    mesh.position.set(horizontal ? 0 : fixed, 0.015, horizontal ? fixed : 0);
    this.group.add(mesh);
  }

  private buildDashTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 8;
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, 32, 8);
    x.fillStyle = "#e8c54a";
    x.fillRect(0, 2, 16, 4); // dash (left half) + gap (right half), repeats along u
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // --- Blocks, sidewalks, buildings -----------------------------------------

  private buildBlocks() {
    for (let i = 0; i < this.grid; i++) {
      for (let j = 0; j < this.grid; j++) {
        const cx = this.offset + i * this.cellPitch;
        const cz = this.offset + j * this.cellPitch;
        this.buildSidewalk(cx, cz);
        this.buildBuildings(cx, cz);
        this.collectWaitPoints(cx, cz);
      }
    }
  }

  private buildSidewalk(cx: number, cz: number) {
    // Curb lip (slightly larger, darker, lower) reads as a road edge.
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(this.blockSize + 1.2, 0.14, this.blockSize + 1.2),
      new THREE.MeshStandardMaterial({ color: 0x6f6a62 }),
    );
    curb.position.set(cx, 0.07, cz);
    curb.receiveShadow = true;
    this.group.add(curb);

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(this.blockSize, 0.2, this.blockSize),
      new THREE.MeshStandardMaterial({ color: 0xa39e94 }),
    );
    slab.position.set(cx, 0.12, cz);
    slab.receiveShadow = true;
    this.group.add(slab);
  }

  private buildBuildings(cx: number, cz: number) {
    // Place 1–4 buildings on the block, inside a sidewalk margin.
    const inner = this.blockSize - 3.5;
    const cols = this.rand() > 0.5 ? 2 : 1;
    const rows = this.rand() > 0.5 ? 2 : 1;
    const cell = inner / Math.max(cols, rows);

    for (let bi = 0; bi < cols; bi++) {
      for (let bj = 0; bj < rows; bj++) {
        if (this.rand() < 0.15) continue; // occasional open lot
        const w = cell * (0.6 + this.rand() * 0.3);
        const d = cell * (0.6 + this.rand() * 0.3);
        const h = 5 + this.rand() * 20;
        const bx = cx - inner / 2 + cell * (bi + 0.5);
        const bz = cz - inner / 2 + cell * (bj + 0.5);

        const color = BUILDING_COLORS[Math.floor(this.rand() * BUILDING_COLORS.length)];

        // Window texture tiled to the facade size.
        const tex = new THREE.CanvasTexture(this.windowCanvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.repeat.set(Math.max(1, Math.round(w / 2.6)), Math.max(1, Math.round(h / 3)));

        const building = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.82 }),
        );
        building.position.set(bx, h / 2 + 0.22, bz);
        building.castShadow = true;
        building.receiveShadow = true;
        this.group.add(building);

        // Flat rooftop trim for a touch of detail.
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3),
          new THREE.MeshStandardMaterial({ color: 0x5b5048 }),
        );
        trim.position.set(bx, h + 0.22, bz);
        this.group.add(trim);

        // Occasional rooftop water tank.
        if (this.rand() < 0.5) {
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.4, 0.8, 10),
            new THREE.MeshStandardMaterial({ color: 0x3a6ea5 }),
          );
          tank.position.set(bx + (this.rand() - 0.5) * w * 0.5, h + 0.6, bz + (this.rand() - 0.5) * d * 0.5);
          // No castShadow: tiny rooftop detail, not worth the shadow-pass cost.
          this.group.add(tank);
        }

        this.collision.addBox(bx, bz, w, d);
      }
    }
  }

  private buildWindowCanvas(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const x = c.getContext("2d")!;
    // Light wall so the building's tint shows through the texture multiply.
    x.fillStyle = "#e9e4da";
    x.fillRect(0, 0, 64, 64);
    // A single window pane (with a sill) per tile.
    x.fillStyle = "#2c3b4a";
    x.fillRect(14, 12, 36, 30);
    x.fillStyle = "#3f5468"; // glass highlight
    x.fillRect(16, 14, 15, 26);
    x.fillStyle = "#6a625a"; // sill
    x.fillRect(12, 42, 40, 5);
    return c;
  }

  /** Wait points sit on the road just outside each block, near the curb. */
  private collectWaitPoints(cx: number, cz: number) {
    const edge = this.blockSize / 2 + this.roadWidth / 2 - 2;
    const candidates = [
      new THREE.Vector3(cx, 0.2, cz + edge),
      new THREE.Vector3(cx, 0.2, cz - edge),
      new THREE.Vector3(cx + edge, 0.2, cz),
      new THREE.Vector3(cx - edge, 0.2, cz),
    ];
    // Keep points that stay within the road grid bounds.
    const limit = this.span / 2 - 1;
    for (const p of candidates) {
      if (Math.abs(p.x) <= limit && Math.abs(p.z) <= limit) this.waitPoints.push(p);
    }
  }

  private buildBoundaryWalls() {
    // Low walls keep the player inside the playable area.
    const half = this.span / 2 + 1;
    const t = 2;
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4a52 });
    const make = (x: number, z: number, sx: number, sz: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 2, sz), mat);
      wall.position.set(x, 1, z);
      this.group.add(wall);
      this.collision.addBox(x, z, sx, sz);
    };
    make(0, half, this.span + t * 2, t);
    make(0, -half, this.span + t * 2, t);
    make(half, 0, t, this.span + t * 2);
    make(-half, 0, t, this.span + t * 2);
  }

  private placeLandmarks() {
    const names = ["MARINE DRIVE", "DADAR STN", "CHOWPATTY", "CST", "GATEWAY"];
    // Drop signs near a few block corners.
    const slots: [number, number][] = [
      [0, 0],
      [this.grid - 1, 0],
      [0, this.grid - 1],
      [this.grid - 1, this.grid - 1],
      [Math.floor(this.grid / 2), Math.floor(this.grid / 2)],
    ];
    slots.forEach(([i, j], idx) => {
      const cx = this.offset + i * this.cellPitch;
      const cz = this.offset + j * this.cellPitch;
      this.addSign(cx, cz - this.blockSize / 2 - 1, names[idx]);
    });
  }

  /** Decorative palms, market stalls and lamp posts along the sidewalk edges. */
  private placeProps() {
    const edge = this.blockSize / 2 - 0.8;
    for (let i = 0; i < this.grid; i++) {
      for (let j = 0; j < this.grid; j++) {
        const cx = this.offset + i * this.cellPitch;
        const cz = this.offset + j * this.cellPitch;
        const corners = [
          [cx - edge, cz - edge],
          [cx + edge, cz - edge],
          [cx - edge, cz + edge],
          [cx + edge, cz + edge],
        ];
        for (const [px, pz] of corners) {
          const r = this.rand();
          if (r < 0.3) this.group.add(this.buildPalm(px, pz));
          else if (r < 0.45) this.group.add(this.buildStall(px, pz));
          else if (r < 0.55) this.group.add(this.buildLamp(px, pz));
        }
      }
    }
  }

  // Decorative props (palms, stalls, lamps) skip castShadow — there are many
  // of them scattered around the map, and their shadows are small enough not
  // to be missed, so it's a cheap win to exclude them from the shadow pass.
  private buildPalm(x: number, z: number): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.2, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a6a43 }),
    );
    trunk.position.y = 1.3;
    g.add(trunk);

    const frondMat = new THREE.MeshStandardMaterial({ color: 0x3f8f3a });
    for (let k = 0; k < 5; k++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.3, 4), frondMat);
      const a = (k / 5) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 0.5, 2.7, Math.sin(a) * 0.5);
      frond.rotation.z = Math.cos(a) * 0.9;
      frond.rotation.x = -Math.sin(a) * 0.9;
      g.add(frond);
    }
    g.position.set(x, 0.2, z);
    return g;
  }

  private buildStall(x: number, z: number): THREE.Group {
    const g = new THREE.Group();
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.8, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x8d6e4f }),
    );
    counter.position.y = 0.6;
    g.add(counter);

    const tarpColor = [0xd64545, 0x4577d6, 0x46b06a, 0xe0a93f][Math.floor(this.rand() * 4)];
    const tarp = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.12, 1.3),
      new THREE.MeshStandardMaterial({ color: tarpColor }),
    );
    tarp.position.y = 1.7;
    g.add(tarp);

    const poleGeo = new THREE.BoxGeometry(0.08, 1.1, 0.08);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(sx * 0.7, 1.15, sz * 0.5);
        g.add(pole);
      }
    }
    g.position.set(x, 0.2, z);
    return g;
  }

  private buildLamp(x: number, z: number): THREE.Group {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x2e2e34, roughness: 0.6 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8), metal);
    post.position.y = 1.7;
    g.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), metal);
    arm.position.set(0.3, 3.35, 0);
    g.add(arm);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffd98a, emissiveIntensity: 1.8 }),
    );
    bulb.position.set(0.62, 3.28, 0);
    g.add(bulb);
    g.position.set(x, 0.2, z);
    return g;
  }

  private addSign(x: number, z: number, text: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#10303a";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#ffd23f";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#ffd23f";
    ctx.strokeRect(8, 8, 496, 112);
    ctx.font = "bold 56px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 70);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 1),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    board.position.set(x, 3, z);

    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 3, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x555555 }),
    );
    post.position.set(x, 1.5, z);

    this.group.add(post);
    this.group.add(board);
  }
}
