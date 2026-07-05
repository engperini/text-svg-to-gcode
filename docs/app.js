const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_FONT_URL = 'DejaVuSans.ttf';

const state = {
  lastGcode: '',
  lastSvg: '',
  lastFilename: 'output.gcode',
};

const $ = (id) => document.getElementById(id);
const els = {};

function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function fmt(n) {
  const value = Number.isFinite(n) ? n : 0;
  const text = value.toFixed(3).replace(/0+$/u, '').replace(/\.$/u, '');
  return text || '0';
}

function boundsOfPolylines(polylines) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polylines) {
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function transformPolylines(polylines, cfg) {
  const bounds = boundsOfPolylines(polylines);
  if (!bounds) return [];

  return polylines.map((poly) => poly.map(([x, y]) => {
    let nx = (x - bounds.minX) * cfg.scale;
    let ny = (y - bounds.minY) * cfg.scale;
    if (cfg.invertX) nx = bounds.width * cfg.scale - nx;
    if (cfg.invertY) ny = bounds.height * cfg.scale - ny;
    return [cfg.originX + nx, cfg.originY + ny];
  }));
}

function polylineToSvgPath(poly) {
  return poly.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${fmt(x)} ${fmt(y)}`).join(' ');
}

function polylinesToSvg(polylines) {
  const bounds = boundsOfPolylines(polylines);
  const width = Math.max(bounds?.width || 0, 1);
  const height = Math.max(bounds?.height || 0, 1);
  const pathData = polylines.map((poly) => polylineToSvgPath(poly)).join(' ');
  const translateY = fmt(bounds?.height || 0);
  return `
    <svg xmlns="${SVG_NS}" viewBox="0 0 ${fmt(width)} ${fmt(height)}" fill="none" stroke="#111827" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round">
      <g transform="translate(0 ${translateY}) scale(1 -1)">
        <path d="${pathData}" />
      </g>
    </svg>`;
}

function flattenQuadratic(p0, p1, p2, steps = 16) {
  const pts = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push([
      mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
      mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
    ]);
  }
  return pts;
}

function flattenCubic(p0, p1, p2, p3, steps = 24) {
  const pts = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push([
      mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
      mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1],
    ]);
  }
  return pts;
}

function flattenOpenTypePath(path, tolerance = 0.35) {
  const polylines = [];
  let current = [];
  let prev = [0, 0];
  let start = null;
  const steps = Math.max(8, Math.min(64, Math.round(18 / Math.max(tolerance, 0.05))));

  const pushPoint = (pt) => {
    if (!current.length || current[current.length - 1][0] !== pt[0] || current[current.length - 1][1] !== pt[1]) {
      current.push(pt);
    }
  };

  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M':
        if (current.length > 1) polylines.push(current);
        current = [];
        prev = [cmd.x, cmd.y];
        start = [cmd.x, cmd.y];
        pushPoint(prev);
        break;
      case 'L':
        prev = [cmd.x, cmd.y];
        pushPoint(prev);
        break;
      case 'Q': {
        const pts = flattenQuadratic(prev, [cmd.x1, cmd.y1], [cmd.x, cmd.y], steps);
        for (const pt of pts) pushPoint(pt);
        prev = [cmd.x, cmd.y];
        break;
      }
      case 'C': {
        const pts = flattenCubic(prev, [cmd.x1, cmd.y1], [cmd.x2, cmd.y2], [cmd.x, cmd.y], steps);
        for (const pt of pts) pushPoint(pt);
        prev = [cmd.x, cmd.y];
        break;
      }
      case 'Z':
        if (start) pushPoint(start);
        if (current.length > 1) polylines.push(current);
        current = [];
        prev = start || prev;
        start = null;
        break;
      default:
        break;
    }
  }

  if (current.length > 1) polylines.push(current);
  return polylines;
}

async function textToPolylines(text, options) {
  const font = await new Promise((resolve, reject) => {
    opentype.load(options.fontUrl, (err, loaded) => {
      if (err) reject(err);
      else resolve(loaded);
    });
  });

  const lines = String(text || '').split(/\r?\n/);
  const lineHeight = options.lineHeight || options.fontSize * 1.35;
  const spacing = options.letterSpacing || 0;
  const polylines = [];
  let cursorY = 0;

  for (const line of lines) {
    const glyphPath = font.getPath(line, 0, cursorY, options.fontSize, { kerning: true });
    const linePolylines = flattenOpenTypePath(glyphPath, options.flattenTolerance);
    for (const poly of linePolylines) {
      if (poly.length > 1) polylines.push(poly);
    }
    cursorY += lineHeight;
  }

  if (!polylines.length) {
    throw new Error('O texto gerou zero trajetórias.');
  }

  if (spacing !== 0) {
    return polylines.map((poly) => poly.map(([x, y]) => [x + spacing, y]));
  }

  return polylines;
}

function parsePointsList(pointsText) {
  const nums = pointsText.trim().split(/[\s,]+/u).map(Number).filter((n) => Number.isFinite(n));
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function samplePathElement(pathEl, tolerance = 0.35) {
  const len = pathEl.getTotalLength();
  const steps = Math.max(8, Math.ceil(len / Math.max(tolerance, 0.05)));
  const poly = [];
  for (let i = 0; i <= steps; i += 1) {
    const pt = pathEl.getPointAtLength((len * i) / steps);
    poly.push([pt.x, pt.y]);
  }
  return poly;
}

function shapeToPathData(node) {
  const tag = node.tagName.toLowerCase();
  if (tag === 'rect') {
    const x = Number(node.getAttribute('x') || 0);
    const y = Number(node.getAttribute('y') || 0);
    const w = Number(node.getAttribute('width') || 0);
    const h = Number(node.getAttribute('height') || 0);
    const rx = Number(node.getAttribute('rx') || 0);
    const ry = Number(node.getAttribute('ry') || 0);
    if (!rx && !ry) {
      return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
    }
    // Rounded rectangles are approximated by sampling points.
    const steps = 8;
    const path = [];
    const corners = [
      [x + rx, y],
      [x + w - rx, y],
      [x + w, y + ry],
      [x + w, y + h - ry],
      [x + w - rx, y + h],
      [x + rx, y + h],
      [x, y + h - ry],
      [x, y + ry],
    ];
    corners.forEach(([cx, cy], index) => path.push(`${index === 0 ? 'M' : 'L'} ${cx} ${cy}`));
    return `${path.join(' ')} Z`;
  }
  if (tag === 'line') {
    return `M ${node.getAttribute('x1') || 0} ${node.getAttribute('y1') || 0} L ${node.getAttribute('x2') || 0} ${node.getAttribute('y2') || 0}`;
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const pts = parsePointsList(node.getAttribute('points') || '');
    if (!pts.length) return '';
    const prefix = pts.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
    return tag === 'polygon' ? `${prefix} Z` : prefix;
  }
  if (tag === 'circle') {
    const cx = Number(node.getAttribute('cx') || 0);
    const cy = Number(node.getAttribute('cy') || 0);
    const r = Number(node.getAttribute('r') || 0);
    return `M ${cx + r} ${cy} ` + Array.from({ length: 32 }, (_, i) => {
      const a = (Math.PI * 2 * (i + 1)) / 32;
      return `L ${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`;
    }).join(' ') + ' Z';
  }
  if (tag === 'ellipse') {
    const cx = Number(node.getAttribute('cx') || 0);
    const cy = Number(node.getAttribute('cy') || 0);
    const rx = Number(node.getAttribute('rx') || 0);
    const ry = Number(node.getAttribute('ry') || 0);
    return `M ${cx + rx} ${cy} ` + Array.from({ length: 32 }, (_, i) => {
      const a = (Math.PI * 2 * (i + 1)) / 32;
      return `L ${cx + Math.cos(a) * rx} ${cy + Math.sin(a) * ry}`;
    }).join(' ') + ' Z';
  }
  return node.getAttribute('d') || '';
}

function svgStringToPolylines(svgText, tolerance = 0.35) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) throw new Error('SVG inválido.');

  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '-99999px';
  host.style.top = '-99999px';
  host.style.width = '0';
  host.style.height = '0';
  host.style.overflow = 'hidden';
  document.body.appendChild(host);

  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('xmlns', SVG_NS);
  root.setAttribute('width', svg.getAttribute('width') || '1000');
  root.setAttribute('height', svg.getAttribute('height') || '1000');
  host.appendChild(root);

  const polylines = [];
  try {
    const nodes = svg.querySelectorAll('path, polyline, polygon, line, rect, circle, ellipse');
    for (const node of nodes) {
      const pathData = shapeToPathData(node);
      if (!pathData) continue;
      const pathEl = document.createElementNS(SVG_NS, 'path');
      pathEl.setAttribute('d', pathData);
      root.appendChild(pathEl);
      polylines.push(samplePathElement(pathEl, tolerance));
      pathEl.remove();
    }
  } finally {
    host.remove();
  }

  return polylines.filter((poly) => poly.length > 1);
}

function gcodeFromPolylines(polylines, cfg, sourceName) {
  const transformed = transformPolylines(polylines, cfg);
  const bounds = boundsOfPolylines(transformed);
  const lines = [];
  lines.push('; generated by text-svg-to-gcode');
  lines.push(`; source: ${sourceName}`);
  lines.push(`; machine: default-plotter`);
  lines.push('; units: mm');
  lines.push(`; pen_up_command: ${cfg.penUpCommand}`);
  lines.push(`; pen_down_command: ${cfg.penDownCommand}`);
  lines.push(`; pen_up_angle: ${cfg.penUpAngle}`);
  lines.push(`; pen_down_angle: ${cfg.penDownAngle}`);
  if (bounds) {
    lines.push(`; bounds_mm: min=(${fmt(bounds.minX)}, ${fmt(bounds.minY)}) max=(${fmt(bounds.maxX)}, ${fmt(bounds.maxY)})`);
  }
  lines.push('G21');
  lines.push('G90');
  if (cfg.penUpCommand) lines.push(cfg.penUpCommand);
  lines.push('');

  transformed.forEach((poly, index) => {
    if (poly.length < 2) return;
    const [startX, startY] = poly[0];
    lines.push(`; segment ${index + 1}`);
    lines.push(`G0 X${fmt(startX)} Y${fmt(startY)}`);
    if (cfg.penDownCommand) lines.push(cfg.penDownCommand);
    if (cfg.dwell > 0) lines.push(`G4 P${Math.trunc(cfg.dwell)}`);
    for (const [x, y] of poly.slice(1)) {
      lines.push(`G1 X${fmt(x)} Y${fmt(y)} F${fmt(cfg.feed)}`);
    }
    if (cfg.penUpCommand) lines.push(cfg.penUpCommand);
    if (cfg.dwell > 0) lines.push(`G4 P${Math.trunc(cfg.dwell)}`);
    lines.push('');
  });

  lines.push('M2');
  return lines.join('\n').replace(/\n+$/u, '\n');
}

function readUiConfig() {
  return {
    originX: Number(els.originX.value || 0),
    originY: Number(els.originY.value || 0),
    scale: Number(els.scale.value || 1),
    invertX: els.invertX.checked,
    invertY: els.invertY.checked,
    feed: Number(els.feed.value || 1200),
    travel: Number(els.travel.value || 3000),
    dwell: Number(els.dwell.value || 120),
    penUpCommand: String(els.penUp.value || 'M5').trim(),
    penDownCommand: String(els.penDown.value || 'M3').trim(),
    penUpAngle: Number(els.upAngle.value || 30),
    penDownAngle: Number(els.downAngle.value || 70),
    fontUrl: String(els.fontUrl.value || DEFAULT_FONT_URL).trim(),
    fontSize: Number(els.fontSize.value || 12),
    lineHeight: els.lineHeight.value === '' ? null : Number(els.lineHeight.value),
    letterSpacing: Number(els.letterSpacing.value || 0),
    flattenTolerance: Number(els.flattenTolerance.value || 0.35),
  };
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? '#fca5a5' : '';
}

function setPreview(svgText) {
  els.preview.innerHTML = svgText || '<p style="padding:1rem;color:#64748b">Sem pré-visualização.</p>';
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function currentMode() {
  return document.querySelector('.tab.active')?.dataset.mode || 'text';
}

function showMode(mode) {
  document.querySelectorAll('.tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
  document.querySelectorAll('.mode-panel').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== mode));
}

async function fileToText(file) {
  return await file.text();
}

async function imageFileToSvgString(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler a imagem.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
    image.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / img.width);
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const svgText = ImageTracer.imagedataToSVG(imageData, {
    ltres: 1,
    qtres: 1,
    pathomit: 8,
    numberofcolors: 2,
    scale: 1,
    strokewidth: 1,
    blurradius: 0,
    rightangleenhance: true,
  });

  return svgText;
}

async function generate() {
  const cfg = readUiConfig();
  const mode = currentMode();
  setStatus('Gerando...');
  els.generateBtn.disabled = true;
  els.downloadBtn.disabled = true;

  try {
    let polylines = [];
    let sourceName = mode;

    if (mode === 'text') {
      const text = els.textInput.value || '';
      polylines = await textToPolylines(text, cfg);
      sourceName = 'text';
    } else if (mode === 'svg') {
      const svgText = els.svgInput.value || '';
      if (!svgText.trim()) throw new Error('Cole um SVG ou carregue um arquivo SVG.');
      polylines = svgStringToPolylines(svgText, cfg.flattenTolerance);
      sourceName = 'svg';
    } else if (mode === 'image') {
      const file = els.imageFile.files?.[0];
      if (!file) throw new Error('Carregue uma imagem primeiro.');
      setStatus('Vetorizando a imagem...');
      const svgText = await imageFileToSvgString(file);
      polylines = svgStringToPolylines(svgText, cfg.flattenTolerance);
      sourceName = file.name;
    }

    const svgPreview = polylinesToSvg(polylines);
    const gcode = gcodeFromPolylines(polylines, cfg, sourceName);

    state.lastGcode = gcode;
    state.lastSvg = svgPreview;
    state.lastFilename = `${sourceName.replace(/[^a-z0-9._-]+/gi, '_') || 'output'}.gcode`;

    els.gcodeOutput.value = gcode;
    setPreview(svgPreview);
    els.downloadBtn.disabled = false;
    setStatus(`Pronto: ${polylines.length} trajetória(s) gerada(s).`);
  } catch (error) {
    console.error(error);
    state.lastGcode = '';
    state.lastSvg = '';
    els.gcodeOutput.value = '';
    setPreview('');
    setStatus(error?.message || 'Erro ao gerar.', true);
  } finally {
    els.generateBtn.disabled = false;
  }
}

function wireUi() {
  els.tabs = Array.from(document.querySelectorAll('.tab'));
  els.textInput = $('textInput');
  els.svgInput = $('svgInput');
  els.svgFile = $('svgFile');
  els.imageFile = $('imageFile');
  els.fontUrl = $('fontUrl');
  els.originX = $('originX');
  els.originY = $('originY');
  els.scale = $('scale');
  els.feed = $('feed');
  els.travel = $('travel');
  els.dwell = $('dwell');
  els.penUp = $('penUp');
  els.penDown = $('penDown');
  els.upAngle = $('upAngle');
  els.downAngle = $('downAngle');
  els.fontSize = $('fontSize');
  els.lineHeight = $('lineHeight');
  els.letterSpacing = $('letterSpacing');
  els.flattenTolerance = $('flattenTolerance');
  els.invertX = $('invertX');
  els.invertY = $('invertY');
  els.generateBtn = $('generateBtn');
  els.downloadBtn = $('downloadBtn');
  els.status = $('status');
  els.preview = $('preview');
  els.gcodeOutput = $('gcodeOutput');

  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => showMode(tab.dataset.mode));
  });

  els.svgFile.addEventListener('change', async () => {
    const file = els.svgFile.files?.[0];
    if (file) {
      els.svgInput.value = await fileToText(file);
      showMode('svg');
    }
  });

  els.generateBtn.addEventListener('click', generate);
  els.downloadBtn.addEventListener('click', () => {
    if (!state.lastGcode) return;
    downloadText(state.lastFilename, state.lastGcode);
  });

  document.addEventListener('paste', (event) => {
    if (currentMode() !== 'svg') return;
    const text = event.clipboardData?.getData('text/plain');
    if (text && text.includes('<svg')) {
      els.svgInput.value = text;
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  wireUi();
  setPreview('');
  showMode('text');
});
