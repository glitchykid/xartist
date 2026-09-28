export type BrushId = 'ink' | 'pencil' | 'round' | 'marker' | 'airbrush' | 'chalk' | 'wash' | 'tone';
export type Sample = { x: number; y: number; pressure: number; tiltX: number; tiltY: number };
export type BrushSettings = {
  kind: BrushId;
  size: number;
  opacity: number;
  color: string;
  stabilization: number;
  smoothing: number;
  pressure: boolean;
  tilt: boolean;
  sensitivity: number;
};
export const brushes: { id: BrushId; size: number; opacity: number }[] = [
  { id: 'ink', size: 9, opacity: 1 },
  { id: 'pencil', size: 5, opacity: 0.8 },
  { id: 'round', size: 32, opacity: 1 },
  { id: 'marker', size: 28, opacity: 0.65 },
  { id: 'airbrush', size: 100, opacity: 0.3 },
  { id: 'chalk', size: 36, opacity: 0.85 },
  { id: 'wash', size: 80, opacity: 0.25 },
  { id: 'tone', size: 55, opacity: 1 },
];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function interpolate(a: Sample, b: Sample, t: number): Sample {
  return {
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    pressure: mix(a.pressure, b.pressure, t),
    tiltX: mix(a.tiltX, b.tiltX, t),
    tiltY: mix(a.tiltY, b.tiltY, t),
  };
}

/** One continuous dab stream. Spacing carries across pointer events. */
export class Stroke {
  private filtered: Sample;
  private last: Sample;
  private remainder = 0;
  private seed = 173;
  private tip: HTMLCanvasElement;
  constructor(
    private ctx: CanvasRenderingContext2D,
    private settings: BrushSettings,
    first: Sample,
  ) {
    this.filtered = this.last = first;
    this.tip = this.makeTip();
    this.stamp(first);
  }
  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  private makeTip() {
    const tip = document.createElement('canvas');
    tip.width = tip.height = 128;
    const c = tip.getContext('2d')!;
    c.fillStyle = this.settings.color;
    if (this.settings.kind === 'airbrush' || this.settings.kind === 'wash') {
      const gradient = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, this.settings.color);
      gradient.addColorStop(this.settings.kind === 'wash' ? 0.65 : 0.1, this.settings.color + 'aa');
      gradient.addColorStop(1, this.settings.color + '00');
      c.fillStyle = gradient;
    }
    c.beginPath();
    c.arc(64, 64, 63, 0, Math.PI * 2);
    c.fill();
    if (this.settings.kind === 'pencil' || this.settings.kind === 'chalk') {
      c.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 2500; i++) {
        c.globalAlpha = 0.2 + this.random() * 0.8;
        const d = this.settings.kind === 'chalk' ? 2.2 : 1.4;
        c.fillRect(this.random() * 128, this.random() * 128, d * 2, d * 2);
      }
    }
    return tip;
  }
  move(raw: Sample) {
    const lag = this.settings.stabilization;
    const distance = Math.hypot(raw.x - this.filtered.x, raw.y - this.filtered.y);
    const alpha = lag === 0 ? 1 : Math.min(1, Math.max(0.025, distance / (lag * 0.7 + 1)));
    this.filtered = interpolate(this.filtered, raw, alpha);
    const point = interpolate(this.last, this.filtered, 1 - this.settings.smoothing * 0.0065);
    this.segment(point);
  }
  finish(raw: Sample) {
    this.segment(raw);
  }
  private segment(point: Sample) {
    const start = this.last;
    const distance = Math.hypot(point.x - start.x, point.y - start.y);
    const spacing = Math.max(0.35, this.settings.size * 0.055);
    let d = spacing - this.remainder;
    for (; d <= distance; d += spacing) this.stamp(interpolate(start, point, d / distance));
    this.remainder = (this.remainder + distance) % spacing;
    this.last = point;
  }
  private stamp(p: Sample) {
    const s = this.settings;
    const pressure = s.pressure ? Math.pow(Math.max(0.01, p.pressure), s.sensitivity) : 1;
    const tilt = s.tilt ? Math.min(1, Math.hypot(p.tiltX, p.tiltY) / 90) : 0;
    let radius = s.size * 0.5 * (0.12 + 0.88 * pressure);
    if (s.kind === 'airbrush' || s.kind === 'wash') radius = s.size * 0.5 * (0.5 + 0.5 * pressure);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(tilt > 0.05 ? Math.atan2(p.tiltY, p.tiltX) : -0.5);
    const aspect = s.kind === 'marker' ? 0.3 : 1 - tilt * 0.68;
    radius *= 1 + tilt * 0.6;
    if (s.kind === 'tone') {
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = s.color;
      const step = 8;
      for (let y = Math.floor((p.y - radius) / step) * step; y <= p.y + radius; y += step)
        for (let x = Math.floor((p.x - radius) / step) * step; x <= p.x + radius; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
    } else {
      ctx.globalAlpha =
        s.kind === 'airbrush' ? 0.08 : s.kind === 'wash' ? 0.08 : s.kind === 'pencil' ? 0.3 : 1;
      ctx.drawImage(this.tip, -radius, -radius * aspect, radius * 2, radius * 2 * aspect);
    }
    ctx.restore();
  }
}
