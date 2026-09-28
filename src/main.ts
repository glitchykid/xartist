import { rasterContext } from './raster';
import './style.css';
import { ArtDocument, surface } from './document';
import type { Blend, Rect } from './document';
import { brushes, Stroke } from './brush';
import type { BrushId, BrushSettings, Sample } from './brush';
import { icon } from './icons';
import { languages, locale, locales, setLocale, t } from './i18n';
import type { Key, Locale } from './i18n';
import { recovery } from './recovery';

declare global {
  interface Window {
    desktop?: {
      open(): Promise<string | null>;
      save(payload: { name: string; data: string; kind: 'project' | 'png' }): Promise<boolean>;
      state(payload: unknown): Promise<void>;
      closeSaved(): Promise<void>;
      onSaveClose(fn: () => void): void;
    };
  }
}
type Tool = 'brush' | 'eraser' | 'select' | 'move' | 'eyedropper' | 'hand';
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const button = (action: string, key: Key, glyph: string, extra = '', shortcut = '') =>
  `<button type="button" data-action="${action}" title="${esc(t(key))}${shortcut ? ` (${shortcut})` : ''}" aria-label="${esc(t(key))}" ${extra}>${icon(glyph)}</button>`;
const range = (id: string, key: Key, min: number, max: number, value: number, unit = '', step = 1) =>
  `<label class="range-field" for="${id}"><span>${t(key)}</span><output id="${id}-value">${value}${unit}</output><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}"></label>`;
const swatches = [
  '#2d2b29',
  '#555b59',
  '#8b9188',
  '#dedbd0',
  '#ffffff',
  '#c6a48a',
  '#a66c55',
  '#724b43',
  '#d6b56f',
  '#9d9e79',
  '#596750',
  '#49404c',
];

class Studio {
  doc = new ArtDocument(1280, 900, t('untitled'));
  settings: BrushSettings = {
    kind: 'ink',
    size: 9,
    opacity: 1,
    color: '#2d2b29',
    stabilization: 25,
    smoothing: 35,
    pressure: true,
    tilt: true,
    sensitivity: 1,
  };
  tool: Tool = 'brush';
  zoom = 0.6;
  pan = { x: 0, y: 0 };
  paper = true;
  private frame = 0;
  private space = false;
  private busy = false;
  private pointer: number | null = null;
  private gesture: 'draw' | 'select' | 'move' | 'pan' | null = null;
  private start = { x: 0, y: 0 };
  private panStart = { x: 0, y: 0 };
  private last!: Sample;
  private before!: ImageData;
  private stroke: Stroke | null = null;
  private strokeSurface = surface(this.doc.width, this.doc.height);
  private working: HTMLCanvasElement | null = null;
  private moving: HTMLCanvasElement | null = null;
  private moveSource: Rect | null = null;
  private moveSelection: Rect | null = null;
  private hsv = { h: 20, s: 0.45, v: 0.65 };
  private erased = false;
  private recoveryTimer = 0;
  private toastTimer = 0;
  private hasMarks = false;
  private layerPage = 0;
  private savedRecovery: string | undefined;
  private inspectorCancel: (() => void) | null = null;
  constructor() {
    this.doc.layer.name = `${t('layer')} 1`;
    this.mount();
    this.bindDocument();
    this.fit();
    window.addEventListener('resize', () => {
      this.fit();
      this.refresh(true);
    });
    window.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.space = false;
        this.cursorMode();
      }
    });
    window.addEventListener('blur', () => {
      this.space = false;
      this.finishGesture(true);
      this.cursorMode();
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.doc.dirty && !window.desktop) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    window.desktop?.onSaveClose(async () => {
      if (await this.save()) await window.desktop!.closeSaved();
    });
    void recovery()
      .then((data) => {
        this.savedRecovery = data;
        $('#restore').hidden = !data;
      })
      .catch(() => {});
  }
  private mount() {
    document.documentElement.lang = locale;
    $('#app').innerHTML = `
      <header class="topbar"><div class="brand"><img src="./icon.png" alt=""><span>X Artist<small>${t('studio')}</small></span><span class="version">0.1</span></div>
        <nav class="file-actions">${button('new', 'new', 'plus', '', 'Ctrl+N')}${button('open', 'open', 'open', '', 'Ctrl+O')}<span class="divider"></span>${button('save', 'save', 'save', '', 'Ctrl+S')}<button class="export-button" data-action="export">${icon('export', 16)}<span>${t('export')}</span></button></nav>
        <div class="header-end"><button data-action="restore" id="restore" hidden>${icon('undo', 16)} ${t('recovery')}</button>${button('help', 'shortcuts', 'help', '', '?')}${button('settings', 'settings', 'settings')}</div></header>
      <div class="options"><div class="current-brush"><span id="tool-icon">${icon(this.tool)}</span><strong id="brush-label">${t(this.settings.kind)}</strong></div>
        ${range('size', 'size', 1, 300, this.settings.size, ' px')}${range('opacity', 'opacity', 1, 100, Math.round(this.settings.opacity * 100), '%')}
        <span class="divider"></span>${range('stabilization', 'stabilization', 0, 100, this.settings.stabilization, '%')}${range('smoothing', 'smoothing', 0, 100, this.settings.smoothing, '%')}
        <div class="history-actions">${button('undo', 'undo', 'undo', 'id="undo"', 'Ctrl+Z')}${button('redo', 'redo', 'redo', 'id="redo"', 'Ctrl+Shift+Z')}</div></div>
      <div class="workspace"><aside class="toolbar" aria-label="${t('essentials')}">
        ${(['brush', 'eraser', 'select', 'move', 'eyedropper', 'hand'] as Tool[]).map((tool, i) => button('tool:' + tool, tool, tool, `data-tool="${tool}"`, ['B', 'E', 'M', 'V', 'I', 'H'][i])).join('')}
        <span class="tool-separator"></span>${button('fill', 'fill', 'fill', '', 'G')}${button('transform', 'transform', 'transform', '', 'Ctrl+T')}${button('adjust', 'adjust', 'adjust', '', 'Ctrl+U')}
        <div class="toolbar-bottom"><label class="toolbar-color" title="${t('color')}"><input type="color" id="tool-color" value="${this.settings.color}" aria-label="${t('color')}"></label>${button('fit', 'fit', 'fit', '', 'Ctrl+0')}</div></aside>
      <aside class="left-panel"><div class="panel-heading"><span>${t('brushes')}</span><span class="count">08</span></div><div class="brush-list">${brushes.map((b, i) => `<button class="brush-card ${b.id === this.settings.kind ? 'active' : ''}" data-action="brush:${b.id}" aria-pressed="${b.id === this.settings.kind}"><span class="brush-info"><span>${t(b.id)}</span><small>${String(i + 1).padStart(2, '0')}</small></span><canvas width="340" height="68" data-brush-preview="${b.id}" aria-hidden="true"></canvas></button>`).join('')}</div>
        <section class="dynamics"><div class="panel-heading">${t('dynamics')}${icon('pen', 15)}</div><label class="toggle-row"><span>${t('pressure')}</span><input id="pressure" type="checkbox" ${this.settings.pressure ? 'checked' : ''}></label><label class="toggle-row"><span>${t('tilt')}</span><input id="tilt" type="checkbox" ${this.settings.tilt ? 'checked' : ''}></label>${range('sensitivity', 'sensitivity', 0.3, 2.5, this.settings.sensitivity, '', 0.1)}<div class="pressure-curve"><svg id="curve" viewBox="0 0 160 40" aria-hidden="true"></svg><span>0</span><span>1</span></div></section>
      </aside>
      <main class="canvas-area"><div class="document-bar"><span class="document-dot"></span><span id="document-name"></span><span id="document-size"></span><div class="document-tools">${button('deselect', 'deselect', 'select', 'id="deselect"', 'Ctrl+D')}${button('import', 'import', 'image')}</div></div>
        <div id="viewport" tabindex="0" aria-label="${t('new')}"><div id="stage"><canvas id="artwork"></canvas><canvas id="selection"></canvas></div><div id="empty-hint"><span class="empty-mark">✳</span><h1>${t('ready')}</h1><p>${t('start')}</p><div><kbd>B</kbd> ${t('brush')}<span>·</span><kbd>Space</kbd> ${t('hand')}</div></div><div id="brush-cursor"></div>
          <div class="canvas-controls">${button('zoom-out', 'zoom', 'minus')}<button data-action="actual" id="zoom-label">100%</button>${button('zoom-in', 'zoom', 'plus')}<span class="divider"></span>${button('fit', 'fit', 'fit')}</div></div>
      </main>
      <aside class="right-panel"><section class="color-panel"><div class="panel-heading">${t('color')}<span id="hex-value">${this.settings.color.toUpperCase()}</span></div><div id="color-field" role="slider" tabindex="0" aria-label="${t('color')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="color-point"></span></div><input id="hue" type="range" min="0" max="359" value="20" aria-label="${t('color')}" class="hue"><div class="color-value"><label class="color-chip"><input id="color-picker" type="color" value="${this.settings.color}" aria-label="${t('color')}"></label><input id="hex" value="${this.settings.color}" aria-label="HEX" maxlength="7"><button data-action="tool:eyedropper" title="${t('eyedropper')}">${icon('eyedropper', 16)}</button></div><div class="palette-label">${t('palette')}</div><div class="swatches">${swatches.map((c) => `<button style="--swatch:${c}" data-color="${c}" title="${c}" aria-label="${c}"></button>`).join('')}</div></section>
        <section class="layers-panel"><div class="panel-heading"><span>${t('layers')}</span>${button('add-layer', 'addLayer', 'plus')}</div><div class="layer-options"><select id="blend" aria-label="${t('blend')}">${(['source-over', 'multiply', 'screen', 'overlay'] as Blend[]).map((v) => `<option value="${v}">${t(v === 'source-over' ? 'normal' : v)}</option>`).join('')}</select><label class="layer-alpha" title="${t('opacity')}"><input id="layer-opacity" type="number" min="0" max="100" value="100" aria-label="${t('opacity')}"><span>%</span></label></div><div id="layers"></div><div class="layer-actions">${button('duplicate', 'duplicate', 'duplicate')}${button('up', 'up', 'up')}${button('down', 'down', 'down')}<div class="layer-pager">${button('page-prev', 'previousPage', 'left')}<span id="layer-page" aria-live="polite">1/1</span>${button('page-next', 'nextPage', 'right')}</div>${button('delete-layer', 'delete', 'delete')}</div></section>
        <div class="paper-setting"><label for="paper">${t('background')}</label><select id="paper"><option value="white" ${this.paper ? 'selected' : ''}>${t('paper')}</option><option value="transparent" ${!this.paper ? 'selected' : ''}>${t('transparent')}</option></select></div>
        <div class="pen-panel" title="${t('penHint')}"><div><span class="status-led"></span><strong id="device">${t('mouse')}</strong><span id="pressure-number">0%</span></div><div class="meter"><i id="pressure-meter"></i></div><p><span id="tilt-number">0° / 0°</span><span>Windows Ink</span></p></div>
      </aside></div><footer class="statusbar"><span class="status-led"></span><span id="status">${t('essentials')}</span><span class="footer-tip"><kbd>[</kbd> <kbd>]</kbd> ${t('size')} <span>·</span> <kbd>Space</kbd> ${t('hand')}</span><span id="selection-info"></span><span>sRGB · 8 bit</span></footer>
      <div id="toast" role="status"></div><dialog id="dialog"></dialog><input type="file" id="project-input" accept=".xartist" hidden><input type="file" id="image-input" accept="image/png,image/jpeg,image/webp" hidden>`;
    $('#app').addEventListener('click', (e) => {
      const target = (e.target as Element).closest<HTMLElement>('[data-action]');
      if (target) void this.action(target.dataset.action!);
      const swatch = (e.target as Element).closest<HTMLElement>('[data-color]');
      if (swatch) this.color(swatch.dataset.color!);
    });
    for (const id of ['size', 'opacity', 'stabilization', 'smoothing', 'sensitivity'] as const) {
      $<HTMLInputElement>('#' + id).addEventListener('input', (e) => {
        const input = e.target as HTMLInputElement;
        const value = Number(input.value);
        this.settings[id] = id === 'opacity' ? value / 100 : value;
        $('#' + id + '-value').textContent = value + input.dataset.unit!;
        this.curve();
      });
    }
    for (const id of ['pressure', 'tilt'] as const)
      $<HTMLInputElement>('#' + id).onchange = (e) => {
        this.settings[id] = (e.target as HTMLInputElement).checked;
      };
    for (const id of ['tool-color', 'color-picker'])
      $<HTMLInputElement>('#' + id).oninput = (e) => this.color((e.target as HTMLInputElement).value);
    $<HTMLInputElement>('#hex').onchange = (e) => {
      const input = e.target as HTMLInputElement;
      if (/^#[0-9a-f]{6}$/i.test(input.value)) this.color(input.value);
      else input.value = this.settings.color;
    };
    $<HTMLSelectElement>('#blend').onchange = (e) =>
      this.doc.property(this.doc.active, 'blend', (e.target as HTMLSelectElement).value as Blend);
    $<HTMLInputElement>('#layer-opacity').onchange = (e) => {
      const value = Number((e.target as HTMLInputElement).value);
      this.doc.property(
        this.doc.active,
        'opacity',
        Math.max(0, Math.min(1, (Number.isFinite(value) ? value : 100) / 100)),
      );
    };
    $<HTMLSelectElement>('#paper').onchange = (e) => {
      this.paper = (e.target as HTMLSelectElement).value === 'white';
      this.render();
    };
    $<HTMLInputElement>('#project-input').onchange = (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (file)
        void this.run(async () => {
          if (file.size > 192 * 1024 * 1024) throw new Error('invalidProject');
          this.replace(await ArtDocument.parse(await file.text()));
        });
    };
    $<HTMLInputElement>('#image-input').onchange = (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (file) void this.run(() => this.importImage(file));
    };
    const vp = $('#viewport');
    vp.addEventListener('pointerdown', (e) => this.pointerDown(e));
    vp.addEventListener('pointermove', (e) => this.pointerMove(e));
    vp.addEventListener('pointerup', (e) => {
      if (e.pointerId === this.pointer) {
        this.last = { ...this.sample(e), pressure: this.last.pressure };
        this.finishGesture(false);
      }
    });
    vp.addEventListener('pointercancel', (e) => {
      if (e.pointerId === this.pointer) this.finishGesture(true);
    });
    vp.addEventListener('lostpointercapture', () => {
      if (this.gesture) this.finishGesture(true);
    });
    vp.addEventListener('pointerleave', () => ($('#brush-cursor').style.display = 'none'));
    vp.addEventListener('contextmenu', (e) => e.preventDefault());
    vp.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = vp.getBoundingClientRect();
        this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false },
    );
    this.bindColorField();
    this.color(this.settings.color);
    this.previews();
    this.curve();
    this.refresh();
    this.chooseTool(this.tool);
  }
  private bindDocument() {
    this.doc.onChange = () => {
      this.hasMarks = true;
      this.refresh(true);
      this.render();
      this.syncDirty();
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = window.setTimeout(() => {
        if (this.gesture || this.inspectorCancel) {
          this.doc.onChange();
          return;
        }
        const revision = this.doc.revision;
        void recovery(this.doc.serialize())
          .then(() => {
            if (revision === this.doc.revision) $('#status').textContent = t('autosave');
          })
          .catch(() => this.toast(t('recoveryFailed')));
      }, 1500);
    };
  }
  private syncDirty() {
    document.title = `${this.doc.dirty ? '• ' : ''}${this.doc.name} — X Artist`;
    void window.desktop?.state({
      dirty: this.doc.dirty,
      labels: {
        title: t('unsaved'),
        message: t('discardHint'),
        save: t('save'),
        discard: t('discard'),
        cancel: t('cancel'),
      },
    });
  }
  private replace(doc: ArtDocument) {
    clearTimeout(this.recoveryTimer);
    this.doc = doc;
    this.hasMarks = true;
    this.strokeSurface = surface(doc.width, doc.height);
    this.working = null;
    this.bindDocument();
    this.refresh(true);
    this.fit();
    this.syncDirty();
  }
  private refresh(revealActive = false) {
    $('#document-name').textContent = this.doc.name + (this.doc.dirty ? ' •' : '');
    $('#document-size').textContent = `${this.doc.width} × ${this.doc.height} px`;
    $<HTMLButtonElement>('#undo').disabled = !this.doc.canUndo;
    $<HTMLButtonElement>('#redo').disabled = !this.doc.canRedo;
    $<HTMLButtonElement>('#deselect').disabled = !this.doc.selection;
    $('#empty-hint').hidden = this.hasMarks;
    const ordered = [...this.doc.layers].reverse();
    const rows = Math.max(1, Math.floor($('#layers').clientHeight / 43));
    const pages = Math.max(1, Math.ceil(ordered.length / rows));
    if (revealActive) this.layerPage = Math.floor(ordered.findIndex((l) => l.id === this.doc.active) / rows);
    this.layerPage = Math.max(0, Math.min(pages - 1, this.layerPage));
    $('#layer-page').textContent = `${this.layerPage + 1}/${pages}`;
    $<HTMLButtonElement>('[data-action="page-prev"]').disabled = this.layerPage === 0;
    $<HTMLButtonElement>('[data-action="page-next"]').disabled = this.layerPage === pages - 1;
    $('#layers').replaceChildren(
      ...ordered.slice(this.layerPage * rows, (this.layerPage + 1) * rows).map((l) => {
        const row = document.createElement('div');
        row.className = 'layer-row' + (l.id === this.doc.active ? ' active' : '');
        row.dataset.layerId = l.id;
        row.innerHTML = `${button('visibility:' + l.id, 'visibility', 'eye', `class="visibility ${!l.visible ? 'muted' : ''}" aria-pressed="${l.visible}"`)}<button class="layer-select" data-action="layer:${l.id}"><canvas width="80" height="60" class="layer-thumb"></canvas><span class="layer-name"></span></button>${button('lock:' + l.id, 'lock', l.locked ? 'lock' : 'unlock', `class="layer-lock ${l.locked ? 'locked' : ''}" aria-pressed="${l.locked}"`)}`;
        row.querySelector('.layer-name')!.textContent = l.name;
        rasterContext(row.querySelector('canvas')!).drawImage(l.canvas, 0, 0, 80, 60);
        row.querySelector('.layer-select')!.addEventListener('dblclick', () => this.rename());
        return row;
      }),
    );
    $<HTMLSelectElement>('#blend').value = this.doc.layer.blend;
    $<HTMLInputElement>('#layer-opacity').value = String(Math.round(this.doc.layer.opacity * 100));
    $<HTMLButtonElement>('[data-action="add-layer"]').disabled = !this.doc.canAddLayer();
    $<HTMLButtonElement>('[data-action="duplicate"]').disabled = !this.doc.canAddLayer();
    $<HTMLButtonElement>('[data-action="delete-layer"]').disabled = this.doc.layers.length === 1;
  }
  private render() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.paint();
    });
  }
  private paint() {
    const canvas = $<HTMLCanvasElement>('#artwork');
    if (canvas.width !== this.doc.width || canvas.height !== this.doc.height) {
      canvas.width = this.doc.width;
      canvas.height = this.doc.height;
    }
    const ctx = rasterContext(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.paper) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (this.stroke && this.working) {
      const c = rasterContext(this.working);
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.drawImage(this.doc.layer.canvas, 0, 0);
      c.save();
      c.globalAlpha = this.settings.opacity;
      c.globalCompositeOperation = this.erased ? 'destination-out' : 'source-over';
      c.drawImage(this.strokeSurface, 0, 0);
      c.restore();
    }
    for (const l of this.doc.layers)
      if (l.visible) {
        ctx.save();
        ctx.globalAlpha = l.opacity;
        ctx.globalCompositeOperation = l.blend;
        ctx.drawImage(l.id === this.doc.active && this.working ? this.working : l.canvas, 0, 0);
        ctx.restore();
      }
    const overlay = $<HTMLCanvasElement>('#selection');
    overlay.width = this.doc.width;
    overlay.height = this.doc.height;
    const c = rasterContext(overlay);
    const r = this.doc.selection;
    if (r) {
      c.lineWidth = 1 / this.zoom;
      c.strokeStyle = '#fff';
      c.strokeRect(r.x, r.y, r.w, r.h);
      c.strokeStyle = '#252a2b';
      c.setLineDash([5 / this.zoom, 5 / this.zoom]);
      c.strokeRect(r.x, r.y, r.w, r.h);
    }
    $('#selection-info').textContent = r ? `${Math.round(r.w)} × ${Math.round(r.h)} px` : '';
    $<HTMLButtonElement>('#deselect').disabled = !r;
  }
  fit() {
    const vp = $('#viewport');
    this.zoom = Math.min(
      (vp.clientWidth - 92) / this.doc.width,
      (vp.clientHeight - 110) / this.doc.height,
      1,
    );
    this.pan = {
      x: (vp.clientWidth - this.doc.width * this.zoom) / 2,
      y: (vp.clientHeight - this.doc.height * this.zoom) / 2 - 12,
    };
    this.view();
  }
  private setZoom(value: number, x = $('#viewport').clientWidth / 2, y = $('#viewport').clientHeight / 2) {
    const next = Math.min(8, Math.max(0.05, value));
    const ratio = next / this.zoom;
    this.pan = { x: x - (x - this.pan.x) * ratio, y: y - (y - this.pan.y) * ratio };
    this.zoom = next;
    this.view();
  }
  private view() {
    $('#stage').style.cssText =
      `width:${this.doc.width}px;height:${this.doc.height}px;transform:translate(${this.pan.x}px,${this.pan.y}px) scale(${this.zoom})`;
    $('#zoom-label').textContent = `${Math.round(this.zoom * 100)}%`;
    this.render();
  }
  private sample(e: PointerEvent): Sample {
    const r = $('#viewport').getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.pan.x) / this.zoom,
      y: (e.clientY - r.top - this.pan.y) / this.zoom,
      pressure: e.pointerType === 'pen' ? Math.max(0.01, e.pressure) : 1,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
    };
  }
  private pointerDown(e: PointerEvent) {
    if ((e.target as Element).closest('button') || this.pointer !== null || this.busy || e.button === 2)
      return;
    e.preventDefault();
    $('#viewport').focus({ preventScroll: true });
    const p = this.sample(e);
    this.last = p;
    this.start = p;
    if (this.space || this.tool === 'hand' || e.button === 1 || e.pointerType === 'touch') {
      this.gesture = 'pan';
      this.start = { x: e.clientX, y: e.clientY };
      this.panStart = { ...this.pan };
    } else {
      if (p.x < 0 || p.y < 0 || p.x > this.doc.width || p.y > this.doc.height) return;
      if (this.tool === 'eyedropper' || e.altKey) {
        this.pick(p);
        return;
      }
      if (this.tool === 'select') {
        this.gesture = 'select';
        this.doc.selection = null;
      } else {
        if (this.doc.layer.locked || !this.doc.layer.visible) {
          this.toast(t('locked'));
          return;
        }
        this.before = this.doc.capture();
        this.working = surface(this.doc.width, this.doc.height);
        if (this.tool === 'move') {
          this.gesture = 'move';
          this.moveSelection = this.doc.selection ? { ...this.doc.selection } : null;
          this.moveSource = this.moveSelection || { x: 0, y: 0, w: this.doc.width, h: this.doc.height };
          const r = this.moveSource;
          this.moving = surface(r.w, r.h);
          rasterContext(this.moving).drawImage(this.doc.layer.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        } else {
          this.gesture = 'draw';
          this.erased = this.tool === 'eraser' || (e.buttons & 32) !== 0 || e.button === 5;
          this.strokeSurface.width = this.doc.width;
          this.strokeSurface.height = this.doc.height;
          const ctx = rasterContext(this.strokeSurface);
          if (this.doc.selection) {
            const r = this.doc.selection;
            ctx.beginPath();
            ctx.rect(r.x, r.y, r.w, r.h);
            ctx.clip();
          }
          this.stroke = new Stroke(
            ctx,
            { ...this.settings, kind: this.erased ? 'round' : this.settings.kind },
            p,
          );
          this.hasMarks = true;
          $('#empty-hint').hidden = true;
        }
      }
    }
    this.pointer = e.pointerId;
    try {
      $('#viewport').setPointerCapture(e.pointerId);
    } catch {
      /* Synthetic tests have no active hardware pointer. */
    }
    this.render();
  }
  private pointerMove(e: PointerEvent) {
    const p = this.sample(e);
    const pen = e.pointerType === 'pen';
    $('#device').textContent = t(pen ? 'pen' : 'mouse');
    $('#pressure-number').textContent = `${Math.round(e.pressure * 100)}%`;
    $('#pressure-meter').style.width = `${e.pressure * 100}%`;
    $('#tilt-number').textContent = `${e.tiltX}° / ${e.tiltY}°`;
    const cursor = $('#brush-cursor'),
      vp = $('#viewport').getBoundingClientRect();
    const size = Math.max(4, this.settings.size * this.zoom);
    cursor.style.cssText = `display:${['brush', 'eraser'].includes(this.tool) && !this.space ? 'block' : 'none'};width:${size}px;height:${size}px;left:${e.clientX - vp.left}px;top:${e.clientY - vp.top}px`;
    if (this.pointer !== e.pointerId) return;
    this.last = p;
    if (this.gesture === 'pan') {
      this.pan = {
        x: this.panStart.x + e.clientX - this.start.x,
        y: this.panStart.y + e.clientY - this.start.y,
      };
      this.view();
    }
    if (this.gesture === 'draw') {
      const samples = e.getCoalescedEvents?.();
      for (const event of samples?.length ? samples : [e]) this.stroke!.move(this.sample(event));
    }
    if (this.gesture === 'select') {
      const x = Math.round(Math.max(0, Math.min(this.doc.width, p.x))),
        y = Math.round(Math.max(0, Math.min(this.doc.height, p.y)));
      const sx = Math.round(this.start.x),
        sy = Math.round(this.start.y);
      this.doc.selection = {
        x: Math.min(sx, x),
        y: Math.min(sy, y),
        w: Math.abs(x - sx),
        h: Math.abs(y - sy),
      };
    }
    if (this.gesture === 'move') {
      const r = this.moveSource!,
        dx = Math.round(p.x - this.start.x),
        dy = Math.round(p.y - this.start.y);
      const c = rasterContext(this.working!);
      c.putImageData(this.before, 0, 0);
      c.clearRect(r.x, r.y, r.w, r.h);
      c.drawImage(this.moving!, r.x + dx, r.y + dy);
      if (this.doc.selection) this.doc.selection = { ...r, x: r.x + dx, y: r.y + dy };
    }
    this.render();
  }
  private finishGesture(cancel: boolean) {
    if (!this.gesture) return;
    if (!cancel && this.gesture === 'draw') {
      this.stroke!.finish(this.last);
      this.paint();
    }
    if (!cancel && (this.gesture === 'draw' || this.gesture === 'move')) {
      if (this.gesture === 'move' && this.last.x === this.start.x && this.last.y === this.start.y)
        this.working = null;
      if (this.working) {
        const c = rasterContext(this.doc.layer.canvas);
        c.clearRect(0, 0, this.doc.width, this.doc.height);
        c.drawImage(this.working, 0, 0);
        this.doc.commitPixels(this.before);
      }
    }
    if (cancel && this.gesture === 'move') this.doc.selection = this.moveSelection;
    if (
      this.gesture === 'select' &&
      this.doc.selection &&
      (this.doc.selection.w < 1 || this.doc.selection.h < 1)
    )
      this.doc.selection = null;
    const id = this.pointer;
    this.pointer = null;
    this.gesture = null;
    this.stroke = null;
    this.working = null;
    this.moving = null;
    if (id !== null && $('#viewport').hasPointerCapture(id)) $('#viewport').releasePointerCapture(id);
    this.render();
  }
  private cursorMode() {
    $('#viewport').dataset.tool = this.space ? 'hand' : this.tool;
  }
  private chooseTool(tool: Tool) {
    this.tool = tool;
    this.cursorMode();
    document.querySelectorAll<HTMLElement>('[data-tool]').forEach((el) => {
      const active = el.dataset.tool === tool;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });
    $('#tool-icon').innerHTML = icon(tool);
    $('#brush-label').textContent = t(tool === 'brush' ? this.settings.kind : tool);
  }
  private color(value: string) {
    this.settings.color = value.toLowerCase();
    for (const id of ['hex', 'color-picker', 'tool-color']) $<HTMLInputElement>('#' + id).value = value;
    $('#hex-value').textContent = value.toUpperCase();
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      delta = max - min;
    if (delta > 0)
      this.hsv.h =
        ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) %
        360;
    this.hsv.s = max === 0 ? 0 : delta / max;
    this.hsv.v = max;
    $('#color-field').style.backgroundColor = `hsl(${this.hsv.h} 100% 50%)`;
    $('#color-field').setAttribute('aria-valuenow', String(Math.round(max * 100)));
    $('#color-point').style.cssText = `left:${this.hsv.s * 100}%;top:${(1 - max) * 100}%`;
    $<HTMLInputElement>('#hue').value = String(this.hsv.h);
  }
  private pick(p: Sample) {
    const c = rasterContext(this.doc.composite(this.paper));
    const d = c.getImageData(
      Math.min(this.doc.width - 1, Math.max(0, Math.floor(p.x))),
      Math.min(this.doc.height - 1, Math.max(0, Math.floor(p.y))),
      1,
      1,
    ).data;
    if (d[3]) this.color('#' + [...d.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join(''));
  }
  private bindColorField() {
    const field = $('#color-field');
    const update = () => {
      const { h: hue, s: saturation, v: value } = this.hsv;
      const f = (n: number) => {
        const k = (n + hue / 60) % 6;
        return Math.round((value - value * saturation * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
          .toString(16)
          .padStart(2, '0');
      };
      this.color('#' + f(5) + f(3) + f(1));
    };
    const pick = (e: PointerEvent) => {
      const r = field.getBoundingClientRect();
      this.hsv.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      this.hsv.v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      update();
    };
    field.onpointerdown = (e) => {
      field.setPointerCapture(e.pointerId);
      pick(e);
    };
    field.onpointermove = (e) => {
      if (field.hasPointerCapture(e.pointerId)) pick(e);
    };
    field.onkeydown = (e) => {
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        this.hsv.s = Math.max(
          0,
          Math.min(1, this.hsv.s + (e.key === 'ArrowRight' ? 0.02 : e.key === 'ArrowLeft' ? -0.02 : 0)),
        );
        this.hsv.v = Math.max(
          0,
          Math.min(1, this.hsv.v + (e.key === 'ArrowUp' ? 0.02 : e.key === 'ArrowDown' ? -0.02 : 0)),
        );
        update();
      }
    };
    $<HTMLInputElement>('#hue').oninput = (e) => {
      this.hsv.h = Number((e.target as HTMLInputElement).value);
      update();
    };
  }
  private curve() {
    const points = Array.from(
      { length: 33 },
      (_, i) => `${i * 5},${39 - Math.pow(i / 32, this.settings.sensitivity) * 38}`,
    ).join(' ');
    $('#curve').innerHTML =
      `<path d="M0 39H160M0 0V40" stroke="#454b4b" fill="none"/><polyline points="${points}" stroke="#c9ab8e" stroke-width="1.5" fill="none"/>`;
  }
  private previews() {
    document.querySelectorAll<HTMLCanvasElement>('[data-brush-preview]').forEach((c) => {
      const kind = c.dataset.brushPreview as BrushId;
      const context = rasterContext(c);
      const points = Array.from({ length: 100 }, (_, i) => ({
        x: 12 + i * 3.15,
        y: 34 + Math.sin(i * 0.07) * 11,
        pressure: 0.12 + Math.sin((i / 100) * Math.PI) * 0.85,
        tiltX: 15,
        tiltY: 0,
      }));
      const stroke = new Stroke(
        context,
        {
          ...this.settings,
          kind,
          size: kind === 'pencil' ? 5 : kind === 'airbrush' ? 36 : 22,
          color: '#d3c7b9',
          opacity: 1,
          stabilization: 0,
          smoothing: 0,
        },
        points[0],
      );
      points.slice(1).forEach((p) => stroke.move(p));
      stroke.finish(points.at(-1)!);
    });
  }
  private toast(text: string) {
    $('#toast').textContent = text;
    $('#toast').classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => $('#toast').classList.remove('show'), 4500);
  }
  private async run(fn: () => unknown | Promise<unknown>) {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      this.toast(
        t(['invalidProject', 'dimensions', 'layerLimit', 'locked'].includes(code) ? (code as Key) : 'failed'),
      );
      console.error(error);
    } finally {
      this.busy = false;
    }
  }
  private modal(title: Key, content: string) {
    const dialog = $<HTMLDialogElement>('#dialog');
    dialog.classList.toggle('wide-dialog', title === 'shortcuts');
    dialog.innerHTML = `<div class="dialog-heading"><h2>${t(title)}</h2><button type="button" id="dialog-close" aria-label="${t('close')}">${icon('close')}</button></div>${content}`;
    $('#dialog-close').onclick = () => this.closeDialog();
    dialog.oncancel = (e) => {
      e.preventDefault();
      this.closeDialog();
    };
    dialog.showModal();
    return dialog;
  }
  private closeDialog() {
    this.inspectorCancel?.();
    this.inspectorCancel = null;
    $<HTMLDialogElement>('#dialog').close();
  }
  private async confirmReplace(): Promise<boolean> {
    if (!this.doc.dirty) return true;
    return new Promise((resolve) => {
      const d = this.modal(
        'unsaved',
        `<p class="dialog-copy">${t('discardHint')}</p><div class="dialog-actions"><button id="confirm-cancel">${t('cancel')}</button><button id="confirm-discard">${t('discard')}</button><button id="confirm-save" class="primary">${t('save')}</button></div>`,
      );
      let resolved = false;
      const done = (ok: boolean) => {
        if (resolved) return;
        resolved = true;
        d.close();
        resolve(ok);
      };
      d.onclose = () => done(false);
      $('#confirm-cancel').onclick = () => done(false);
      $('#confirm-discard').onclick = () => done(true);
      $('#confirm-save').onclick = async () => {
        if (await this.save()) done(true);
      };
    });
  }
  private newCanvas() {
    const d = this.modal(
      'new',
      `<form id="new-form"><label class="text-field">${t('name')}<input id="new-name" maxlength="200" value="${esc(t('untitled'))}"></label><div class="presets"><button type="button" data-preset="1280,900">1280 × 900</button><button type="button" data-preset="1080,1080">1080 × 1080</button><button type="button" data-preset="1600,2400">1600 × 2400</button></div><div class="field-grid"><label class="text-field">${t('width')}<input id="new-width" type="number" min="16" max="4096" value="1280" required></label><label class="text-field">${t('height')}<input id="new-height" type="number" min="16" max="4096" value="900" required></label></div><p class="dialog-copy">${t('canvasHint')}</p><div class="dialog-actions"><button type="submit" class="primary">${t('create')}</button></div></form>`,
    );
    d.querySelectorAll<HTMLElement>('[data-preset]').forEach(
      (b) =>
        (b.onclick = () => {
          const [w, h] = b.dataset.preset!.split(',');
          $<HTMLInputElement>('#new-width').value = w;
          $<HTMLInputElement>('#new-height').value = h;
        }),
    );
    $('#new-form').onsubmit = (e) => {
      e.preventDefault();
      void this.run(() => {
        const doc = new ArtDocument(
          Number($<HTMLInputElement>('#new-width').value),
          Number($<HTMLInputElement>('#new-height').value),
          $<HTMLInputElement>('#new-name').value.trim() || t('untitled'),
        );
        doc.layer.name = `${t('layer')} 1`;
        this.replace(doc);
        this.hasMarks = false;
        this.refresh();
        d.close();
      });
    };
  }
  private rename() {
    this.modal(
      'rename',
      `<form id="rename-form"><label class="text-field">${t('name')}<input id="layer-name" value="${esc(this.doc.layer.name)}" maxlength="200" required></label><div class="dialog-actions"><button class="primary">${t('apply')}</button></div></form>`,
    );
    $('#rename-form').onsubmit = (e) => {
      e.preventDefault();
      this.doc.property(this.doc.active, 'name', $<HTMLInputElement>('#layer-name').value);
      this.closeDialog();
    };
  }
  private inspector(kind: 'adjust' | 'transform') {
    if (this.doc.layer.locked || !this.doc.layer.visible) {
      this.toast(t('locked'));
      return;
    }
    const before = this.doc.capture(),
      original = surface(this.doc.width, this.doc.height);
    rasterContext(original).putImageData(before, 0, 0);
    const selection = this.doc.selection ? { ...this.doc.selection } : null;
    const r = selection || { x: 0, y: 0, w: this.doc.width, h: this.doc.height };
    const cropped = surface(r.w, r.h);
    rasterContext(cropped).drawImage(original, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    this.working = surface(this.doc.width, this.doc.height);
    this.modal(
      kind,
      `<p class="dialog-copy">${t('selectionHint')}</p><div class="inspector-controls">${kind === 'adjust' ? range('brightness', 'brightness', -100, 100, 0) + range('contrast', 'contrast', -100, 100, 0) + range('saturation', 'saturation', -100, 100, 0) : range('rotation', 'rotation', -180, 180, 0, '°') + range('scale', 'scale', 10, 300, 100, '%') + `<label class="toggle-row"><span>${t('flip')}</span><input id="flip" type="checkbox"></label>`}</div><div class="preview-label">${icon('eye', 15)} ${t('preview')}</div><div class="dialog-actions"><button id="inspector-reset">${t('reset')}</button><button id="inspector-cancel">${t('cancel')}</button><button id="inspector-apply" class="primary">${t('apply')}</button></div>`,
    );
    const update = () => {
      if (!this.working) return;
      const c = rasterContext(this.working);
      c.clearRect(0, 0, this.doc.width, this.doc.height);
      c.drawImage(original, 0, 0);
      c.clearRect(r.x, r.y, r.w, r.h);
      c.save();
      const val = (id: string) => Number($<HTMLInputElement>('#' + id).value);
      if (kind === 'adjust') {
        c.filter = `brightness(${1 + val('brightness') / 100}) contrast(${1 + val('contrast') / 100}) saturate(${1 + val('saturation') / 100})`;
        c.drawImage(cropped, r.x, r.y);
      } else {
        c.translate(r.x + r.w / 2, r.y + r.h / 2);
        c.rotate((val('rotation') * Math.PI) / 180);
        const scale = val('scale') / 100;
        c.scale($<HTMLInputElement>('#flip').checked ? -scale : scale, scale);
        c.drawImage(cropped, -r.w / 2, -r.h / 2);
      }
      c.restore();
      this.render();
      document
        .querySelectorAll<HTMLInputElement>('.inspector-controls input[type="range"]')
        .forEach((i) => ($('#' + i.id + '-value').textContent = i.value + i.dataset.unit));
    };
    this.inspectorCancel = () => {
      this.working = null;
      this.render();
    };
    document
      .querySelectorAll<HTMLInputElement>('.inspector-controls input')
      .forEach((i) => (i.oninput = update));
    $('#inspector-cancel').onclick = () => this.closeDialog();
    $('#inspector-reset').onclick = () => {
      document.querySelectorAll<HTMLInputElement>('.inspector-controls input').forEach((i) => {
        i.value = i.defaultValue;
        i.checked = false;
      });
      update();
    };
    $('#inspector-apply').onclick = () => {
      const c = rasterContext(this.doc.layer.canvas);
      c.clearRect(0, 0, this.doc.width, this.doc.height);
      c.drawImage(this.working!, 0, 0);
      this.working = null;
      this.inspectorCancel = null;
      if (kind === 'transform') this.doc.selection = null;
      this.doc.commitPixels(before);
      this.closeDialog();
    };
    update();
  }
  private help() {
    const shortcuts: [string, Key][] = [
      ['B', 'brush'],
      ['E', 'eraser'],
      ['M', 'select'],
      ['V', 'move'],
      ['I / Alt', 'eyedropper'],
      ['H / Space', 'hand'],
      ['G', 'fill'],
      ['[ / ]', 'size'],
      ['Ctrl + Z', 'undo'],
      ['Ctrl + Shift + Z', 'redo'],
      ['Ctrl + S', 'save'],
      ['Ctrl + O', 'open'],
      ['Ctrl + N', 'new'],
      ['Ctrl + Shift + E', 'export'],
      ['Ctrl + T', 'transform'],
      ['Ctrl + U', 'adjust'],
      ['Ctrl + D / Esc', 'deselect'],
      ['Delete', 'clear'],
      ['Ctrl + 0', 'fit'],
      ['Ctrl + 1', 'actual'],
    ];
    this.modal(
      'shortcuts',
      `<div class="shortcut-list">${shortcuts.map(([key, label]) => `<div><span>${t(label)}</span><kbd>${key}</kbd></div>`).join('')}</div><p class="dialog-copy">${t('touch')}</p>`,
    );
  }
  private preferences() {
    this.modal(
      'settings',
      `<label class="text-field">${t('language')}<select id="language">${locales.map((l, i) => `<option value="${l}" ${l === locale ? 'selected' : ''}>${languages[i]}</option>`).join('')}</select></label><p class="dialog-copy">${t('penHint')}</p><p class="settings-about">X Artist 0.1.2 · MIT<br>Electron 44 · Canvas 2D</p>`,
    );
    $<HTMLSelectElement>('#language').onchange = (e) => {
      setLocale((e.target as HTMLSelectElement).value as Locale);
      this.closeDialog();
      this.mount();
      this.view();
      this.syncDirty();
    };
  }
  async save() {
    try {
      const current = this.doc,
        revision = current.revision,
        data = current.serialize();
      const ok = await this.writeFile(data, 'project');
      if (ok && this.doc === current && current.revision === revision) {
        this.doc.dirty = false;
        this.refresh();
        this.syncDirty();
        this.toast(t('saved'));
      }
      return ok && this.doc === current && current.revision === revision;
    } catch (e) {
      console.error(e);
      this.toast(t('failed'));
      return false;
    }
  }
  private async writeFile(data: string, kind: 'project' | 'png') {
    if (window.desktop) return window.desktop.save({ data, kind, name: this.doc.name });
    const blob =
      kind === 'project'
        ? new Blob([data], { type: 'application/json' })
        : new Blob([Uint8Array.from(atob(data.slice(22)), (c) => c.charCodeAt(0))], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.doc.name}.${kind === 'project' ? 'xartist' : 'png'}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }
  private async importImage(file: File) {
    if (file.size > 64 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      throw new Error('invalidProject');
    if (!this.doc.canAddLayer()) throw new Error('layerLimit');
    const image = await createImageBitmap(file, { resizeWidth: this.doc.width, resizeQuality: 'high' });
    try {
      const c = surface(this.doc.width, this.doc.height);
      const scale = Math.min(c.width / image.width, c.height / image.height, 1);
      rasterContext(c).drawImage(
        image,
        (c.width - image.width * scale) / 2,
        (c.height - image.height * scale) / 2,
        image.width * scale,
        image.height * scale,
      );
      this.doc.addLayer(file.name.slice(0, 200), true, c);
    } finally {
      image.close();
    }
  }
  private async action(action: string) {
    if (this.gesture || this.busy || ($<HTMLDialogElement>('#dialog').open && !action.startsWith('dialog')))
      return;
    const [type, value] = action.split(':');
    if (type === 'new') {
      if (await this.confirmReplace()) this.newCanvas();
      return;
    }
    if (type === 'open') {
      if (!(await this.confirmReplace())) return;
      if (!window.desktop) {
        $<HTMLInputElement>('#project-input').click();
        return;
      }
    }
    if (type === 'restore') {
      if (!this.savedRecovery || !(await this.confirmReplace())) return;
    }
    await this.run(async () => {
      switch (type) {
        case 'tool':
          this.chooseTool(value as Tool);
          break;
        case 'brush': {
          const brush = brushes.find((b) => b.id === value)!;
          this.settings.kind = brush.id;
          this.settings.size = brush.size;
          this.settings.opacity = brush.opacity;
          $<HTMLInputElement>('#size').value = String(brush.size);
          $('#size-value').textContent = brush.size + ' px';
          $<HTMLInputElement>('#opacity').value = String(brush.opacity * 100);
          $('#opacity-value').textContent = Math.round(brush.opacity * 100) + '%';
          document.querySelectorAll<HTMLElement>('.brush-card').forEach((el) => {
            const active = el.dataset.action === action;
            el.classList.toggle('active', active);
            el.setAttribute('aria-pressed', String(active));
          });
          this.chooseTool('brush');
          break;
        }
        case 'save':
          await this.save();
          break;
        case 'export':
          if (await this.writeFile(this.doc.composite(this.paper).toDataURL('image/png'), 'png'))
            this.toast(t('exported'));
          break;
        case 'open': {
          const text = await window.desktop!.open();
          if (text) this.replace(await ArtDocument.parse(text));
          break;
        }
        case 'restore': {
          const doc = await ArtDocument.parse(this.savedRecovery!);
          doc.dirty = true;
          this.replace(doc);
          this.toast(t('recovered'));
          break;
        }
        case 'import':
          $<HTMLInputElement>('#image-input').click();
          break;
        case 'undo':
          this.doc.selection = null;
          this.doc.undo();
          break;
        case 'redo':
          this.doc.selection = null;
          this.doc.redo();
          break;
        case 'add-layer':
          this.doc.addLayer(`${t('layer')} ${this.doc.layers.length + 1}`);
          break;
        case 'delete-layer':
          this.doc.deleteLayer();
          break;
        case 'duplicate': {
          const l = this.doc.layer;
          const copy = this.doc.addLayer(l.name + ' +', true, l.canvas);
          copy.opacity = l.opacity;
          copy.blend = l.blend;
          this.refresh();
          break;
        }
        case 'up':
          this.doc.moveLayer(1);
          break;
        case 'down':
          this.doc.moveLayer(-1);
          break;
        case 'page-prev':
          this.layerPage--;
          this.refresh();
          break;
        case 'page-next':
          this.layerPage++;
          this.refresh();
          break;
        case 'layer':
          this.doc.active = value;
          this.refresh();
          break;
        case 'visibility': {
          const l = this.doc.layers.find((l) => l.id === value)!;
          this.doc.property(value, 'visible', !l.visible);
          break;
        }
        case 'lock': {
          const l = this.doc.layers.find((l) => l.id === value)!;
          this.doc.property(value, 'locked', !l.locked);
          break;
        }
        case 'fill':
          this.doc.edit((c) => {
            c.fillStyle = this.settings.color;
            c.globalAlpha = this.settings.opacity;
            c.fillRect(0, 0, this.doc.width, this.doc.height);
          });
          break;
        case 'clear':
          this.doc.edit((c) => c.clearRect(0, 0, this.doc.width, this.doc.height));
          break;
        case 'deselect':
          this.doc.selection = null;
          this.render();
          break;
        case 'fit':
          this.fit();
          break;
        case 'actual':
          this.setZoom(1);
          break;
        case 'zoom-in':
          this.setZoom(this.zoom * 1.2);
          break;
        case 'zoom-out':
          this.setZoom(this.zoom / 1.2);
          break;
        case 'help':
          this.help();
          break;
        case 'settings':
          this.preferences();
          break;
        case 'transform':
          this.inspector('transform');
          break;
        case 'adjust':
          this.inspector('adjust');
          break;
      }
    });
  }
  private key(e: KeyboardEvent) {
    if (
      $<HTMLDialogElement>('#dialog').open ||
      (e.target as Element).closest('input,select,textarea') ||
      this.gesture ||
      this.busy
    )
      return;
    const ctrl = e.ctrlKey || e.metaKey;
    const shortcuts: Record<string, string> = ctrl
      ? {
          KeyN: 'new',
          KeyO: 'open',
          KeyS: 'save',
          KeyZ: e.shiftKey ? 'redo' : 'undo',
          KeyY: 'redo',
          KeyD: 'deselect',
          Digit0: 'fit',
          Digit1: 'actual',
          KeyT: 'transform',
          KeyU: 'adjust',
          ...(e.shiftKey ? { KeyE: 'export' } : {}),
        }
      : {
          KeyB: 'tool:brush',
          KeyE: 'tool:eraser',
          KeyM: 'tool:select',
          KeyV: 'tool:move',
          KeyI: 'tool:eyedropper',
          KeyH: 'tool:hand',
          KeyG: 'fill',
          Escape: 'deselect',
          Delete: 'clear',
          Slash: 'help',
        };
    if (shortcuts[e.code]) {
      e.preventDefault();
      void this.action(shortcuts[e.code]);
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      this.space = true;
      this.cursorMode();
    }
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      e.preventDefault();
      const current = this.settings.size;
      const next =
        e.code === 'BracketRight'
          ? Math.max(current + 1, Math.round(current * 1.2))
          : Math.min(current - 1, Math.round(current / 1.2));
      this.settings.size = Math.min(300, Math.max(1, next));
      $<HTMLInputElement>('#size').value = String(this.settings.size);
      $('#size-value').textContent = this.settings.size + ' px';
    }
  }
}
new Studio();
