export type Blend = 'source-over' | 'multiply' | 'screen' | 'overlay';
export type Rect = { x: number; y: number; w: number; h: number };
export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: Blend;
  canvas: HTMLCanvasElement;
};
type Entry = { undo: () => void; redo: () => void; bytes: number };
export const LIMITS = {
  side: 4096,
  pixels: 16_000_000,
  layerPixels: 64_000_000,
  layers: 24,
  history: 128 * 1024 * 1024,
};
export function surface(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export function dimensions(w: number, h: number) {
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 16 ||
    h < 16 ||
    w > LIMITS.side ||
    h > LIMITS.side ||
    w * h > LIMITS.pixels
  )
    throw new Error('dimensions');
}
export class ArtDocument {
  layers: Layer[] = [];
  active = '';
  selection: Rect | null = null;
  dirty = false;
  revision = 0;
  private past: Entry[] = [];
  private future: Entry[] = [];
  onChange = () => {};
  constructor(
    public width = 1280,
    public height = 900,
    public name = 'Untitled',
  ) {
    dimensions(width, height);
    this.addLayer('Layer 1', false);
  }
  get layer() {
    return this.layers.find((l) => l.id === this.active)!;
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  change() {
    this.dirty = true;
    this.revision++;
    this.onChange();
  }
  private record(entry: Entry) {
    this.future = [];
    this.past.push(entry);
    let bytes = this.past.reduce((n, e) => n + e.bytes, 0);
    while (this.past.length > 1 && (bytes > LIMITS.history || this.past.length > 40))
      bytes -= this.past.shift()!.bytes;
    this.change();
  }
  undo() {
    const e = this.past.pop();
    if (e) {
      e.undo();
      this.future.push(e);
      this.change();
    }
  }
  redo() {
    const e = this.future.pop();
    if (e) {
      e.redo();
      this.past.push(e);
      this.change();
    }
  }
  canAddLayer() {
    return (
      this.layers.length < LIMITS.layers &&
      (this.layers.length + 1) * this.width * this.height <= LIMITS.layerPixels
    );
  }
  addLayer(name: string, record = true, source?: HTMLCanvasElement) {
    if (!this.canAddLayer()) throw new Error('layerLimit');
    const layer: Layer = {
      id: crypto.randomUUID(),
      name,
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'source-over',
      canvas: surface(this.width, this.height),
    };
    if (source) layer.canvas.getContext('2d')!.drawImage(source, 0, 0);
    const previous = this.active;
    const index = this.layers.findIndex((l) => l.id === previous) + 1;
    this.layers.splice(index, 0, layer);
    this.active = layer.id;
    if (record)
      this.record({
        bytes: this.width * this.height * 4,
        undo: () => {
          this.layers = this.layers.filter((l) => l.id !== layer.id);
          this.active = previous;
        },
        redo: () => {
          this.layers.splice(index, 0, layer);
          this.active = layer.id;
        },
      });
    return layer;
  }
  deleteLayer() {
    if (this.layers.length === 1) return;
    const layer = this.layer,
      index = this.layers.indexOf(layer);
    const remove = () => {
      this.layers = this.layers.filter((l) => l.id !== layer.id);
      this.active = this.layers[Math.max(0, index - 1)].id;
    };
    remove();
    this.record({
      bytes: this.width * this.height * 4,
      undo: () => {
        this.layers.splice(index, 0, layer);
        this.active = layer.id;
      },
      redo: remove,
    });
  }
  moveLayer(delta: number) {
    const id = this.active,
      from = this.layers.findIndex((l) => l.id === id),
      to = from + delta;
    if (to < 0 || to >= this.layers.length) return;
    const move = (a: number, b: number) => {
      const [l] = this.layers.splice(a, 1);
      this.layers.splice(b, 0, l);
    };
    move(from, to);
    this.record({ bytes: 0, undo: () => move(to, from), redo: () => move(from, to) });
  }
  property<K extends 'name' | 'visible' | 'locked' | 'opacity' | 'blend'>(
    id: string,
    key: K,
    value: Layer[K],
  ) {
    const l = this.layers.find((l) => l.id === id)!;
    const before = l[key];
    if (before === value) return;
    l[key] = value;
    this.record({
      bytes: 0,
      undo: () => {
        l[key] = before;
      },
      redo: () => {
        l[key] = value;
      },
    });
  }
  capture() {
    return this.layer.canvas.getContext('2d')!.getImageData(0, 0, this.width, this.height);
  }
  commitPixels(before: ImageData, id = this.active) {
    const l = this.layers.find((l) => l.id === id)!;
    const ctx = l.canvas.getContext('2d')!;
    const after = ctx.getImageData(0, 0, this.width, this.height);
    this.record({
      bytes: before.data.byteLength + after.data.byteLength,
      undo: () => {
        ctx.putImageData(before, 0, 0);
        this.active = id;
      },
      redo: () => {
        ctx.putImageData(after, 0, 0);
        this.active = id;
      },
    });
  }
  edit(fn: (ctx: CanvasRenderingContext2D) => void) {
    if (this.layer.locked || !this.layer.visible) throw new Error('locked');
    const before = this.capture();
    const ctx = this.layer.canvas.getContext('2d')!;
    ctx.save();
    if (this.selection) {
      const { x, y, w, h } = this.selection;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
    }
    try {
      fn(ctx);
    } finally {
      ctx.restore();
    }
    this.commitPixels(before);
  }
  composite(paper = false) {
    const c = surface(this.width, this.height),
      ctx = c.getContext('2d')!;
    if (paper) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, this.width, this.height);
    }
    for (const l of this.layers)
      if (l.visible) {
        ctx.globalAlpha = l.opacity;
        ctx.globalCompositeOperation = l.blend;
        ctx.drawImage(l.canvas, 0, 0);
      }
    return c;
  }
  serialize() {
    return JSON.stringify({
      format: 'xartist',
      version: 1,
      name: this.name,
      width: this.width,
      height: this.height,
      active: this.active,
      layers: this.layers.map(({ canvas, ...l }) => ({ ...l, png: canvas.toDataURL('image/png') })),
    });
  }
  static async parse(text: string) {
    if (text.length > 192 * 1024 * 1024) throw new Error('invalidProject');
    const p = JSON.parse(text);
    if (p?.format !== 'xartist' || p.version !== 1 || typeof p.name !== 'string' || p.name.length > 200)
      throw new Error('invalidProject');
    dimensions(p.width, p.height);
    if (
      !Array.isArray(p.layers) ||
      p.layers.length < 1 ||
      p.layers.length > LIMITS.layers ||
      p.layers.length * p.width * p.height > LIMITS.layerPixels
    )
      throw new Error('invalidProject');
    const ids = new Set();
    for (const l of p.layers) {
      if (
        !l ||
        typeof l.id !== 'string' ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(l.id) ||
        ids.has(l.id) ||
        typeof l.name !== 'string' ||
        l.name.length > 200 ||
        typeof l.visible !== 'boolean' ||
        typeof l.locked !== 'boolean' ||
        typeof l.opacity !== 'number' ||
        l.opacity < 0 ||
        l.opacity > 1 ||
        !['source-over', 'multiply', 'screen', 'overlay'].includes(l.blend) ||
        typeof l.png !== 'string' ||
        !l.png.startsWith('data:image/png;base64,')
      )
        throw new Error('invalidProject');
      // Validate PNG dimensions before decoding to prevent compressed oversized images.
      const header = atob(l.png.slice(22, 66));
      const u32 = (i: number) =>
        header.charCodeAt(i) * 16777216 +
        (header.charCodeAt(i + 1) << 16) +
        (header.charCodeAt(i + 2) << 8) +
        header.charCodeAt(i + 3);
      if (header.slice(1, 4) !== 'PNG' || u32(16) !== p.width || u32(20) !== p.height)
        throw new Error('invalidProject');
      ids.add(l.id);
    }
    if (!ids.has(p.active)) throw new Error('invalidProject');
    const doc = new ArtDocument(p.width, p.height, p.name);
    doc.layers = [];
    for (const l of p.layers) {
      const img = new Image();
      img.src = l.png;
      await img.decode();
      const canvas = surface(p.width, p.height);
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      doc.layers.push({
        id: l.id,
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        blend: l.blend,
        canvas,
      });
    }
    doc.active = p.active;
    return doc;
  }
}
