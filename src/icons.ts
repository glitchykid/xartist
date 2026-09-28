const paths: Record<string, string> = {
  brush: '<path d="m14 4 6 6M8 16l-2-2L17 3l4 4-11 11-2-2ZM6 15c-4 0-1 5-4 6 5 1 7-1 6-4"/>',
  eraser: '<path d="m3 14 10-11 8 7-10 11H9l-6-5ZM8 9l8 7M11 21h10"/>',
  select: '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3"/>',
  move: '<path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  eyedropper: '<path d="m14 5 5 5M4 16l11-11 4 4L8 20H4v-4ZM16 3l2-2 5 5-2 2"/>',
  hand: '<path d="M8 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-5l-3-5a2 2 0 0 1 3-2l2 2Z"/>',
  fill: '<path d="m4 10 8-8 8 8-8 8-8-8ZM7 2l8 8M4 10h16M20 16s-3 3-3 4a3 3 0 0 0 6 0c0-1-3-4-3-4Z"/>',
  undo: '<path d="M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12"/>',
  redo: '<path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  open: '<path d="M3 7V4h7l3 3h8v3M3 7v14h16l3-11H6L3 21"/>',
  save: '<path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h10V3M7 21v-8h10v8"/>',
  export: '<path d="M12 15V2M7 7l5-5 5 5M4 13v8h16v-8"/>',
  layers: '<path d="m2 8 10-6 10 6-10 6-10-6ZM2 12l10 6 10-6M2 16l10 6 10-6"/>',
  duplicate: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  delete: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  up: '<path d="m5 15 7-7 7 7"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0M12 14v3"/>',
  transform:
    '<rect x="5" y="5" width="14" height="14"/><path d="M2 2h6v6H2zM16 2h6v6h-6zM2 16h6v6H2zM16 16h6v6h-6z"/>',
  adjust: '<path d="M4 3v18M12 3v18M20 3v18M1 8h6M9 16h6M17 8h6"/>',
  fit: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><rect x="7" y="7" width="10" height="10"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01"/>',
  settings:
    '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="19" r="2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  pen: '<path d="m4 20 3-9L18 0l6 6-11 11-9 3ZM7 11l6 6M4 20l6-6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 17 5-5 4 4 4-7 5 8"/><circle cx="8" cy="8" r="1"/>',
};
export function icon(name: string, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.brush}</svg>`;
}
