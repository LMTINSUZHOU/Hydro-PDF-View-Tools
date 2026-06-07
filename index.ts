type MarkdownItWithHydroPath = {
  options: {
    $path?: string;
  };
};

interface Context {
  provideModule(type: 'richmedia', name: string, value: RichMediaRenderer): void;
}

interface RichMediaRenderer {
  get(service: string, src: string, md: MarkdownItWithHydroPath): string | null;
}

const VIEWER_ROOT = '/hydro-pdf-viewer';
const ASSET_VERSION = '0.1.4';
const SERVICES = ['pdf', 'hpdf', 'pdfjs'];
const LOCAL_PREFIXES = ['file://', './', '../'];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]!));
}

function encodePathSegment(segment: string) {
  const escapes: string[] = [];
  const protectedSegment = segment.replace(/%[0-9a-f]{2}/gi, (match) => {
    escapes.push(match.toUpperCase());
    return `\u0000${escapes.length - 1}\u0000`;
  });
  return encodeURIComponent(protectedSegment).replace(/%00(\d+)%00/g, (_, index) => escapes[Number(index)]);
}

function encodeUrlPath(value: string) {
  const hashIndex = value.indexOf('#');
  const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  const beforeQuery = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex) : '';
  const originMatch = beforeQuery.match(/^([a-z][a-z0-9+.-]*:\/\/[^/]*)(.*)$/i);
  const origin = originMatch ? originMatch[1] : '';
  const pathname = originMatch ? originMatch[2] || '/' : beforeQuery;
  const encodedPathname = pathname.split('/').map(encodePathSegment).join('/');
  return `${origin}${encodedPathname}${query}${hash}`;
}

function isRootRelative(src: string) {
  return src.startsWith('/') && !src.startsWith('//');
}

function hasUnsafeScheme(src: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('file://');
}

function isLocalAttachmentSource(src: string) {
  if (!src) return false;
  if (LOCAL_PREFIXES.some((prefix) => src.startsWith(prefix))) return true;
  if (isRootRelative(src)) return true;
  return !hasUnsafeScheme(src) && !src.startsWith('//');
}

function appendNoDisposition(src: string) {
  src = src.replace(/&amp;/g, '&');
  const hashIndex = src.indexOf('#');
  const beforeHash = hashIndex >= 0 ? src.slice(0, hashIndex) : src;
  const hash = hashIndex >= 0 ? src.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  const path = encodeUrlPath(queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash);
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';
  const params = query.split('&').filter(Boolean).filter((param) => param.split('=', 1)[0] !== 'noDisposition');
  params.push('noDisposition=1');
  return `${path}?${params.join('&')}${hash}`;
}

function normalizeAttachmentSource(src: string, md: MarkdownItWithHydroPath) {
  const trimmed = src.trim();
  if (!isLocalAttachmentSource(trimmed)) return null;
  if (trimmed.startsWith('file://')) {
    const basePath = md.options.$path || '';
    return appendNoDisposition(`${basePath}${trimmed.slice('file://'.length)}`);
  }
  return appendNoDisposition(trimmed);
}

function getTitleFromSource(src: string) {
  const clean = src.split('#')[0].split('?')[0];
  const basename = clean.split('/').filter(Boolean).pop();
  if (!basename) return 'PDF';
  try {
    return decodeURIComponent(basename);
  } catch {
    return basename;
  }
}

function renderBlockedLink(src: string) {
  const safeHref = /^https?:\/\//i.test(src) ? src : '#';
  return [
    '<p class="hydro-pdf-viewer-blocked">',
    'Embedding this PDF is disabled. ',
    `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">Open PDF</a>`,
    '</p>',
  ].join('');
}

function viewerAsset(filename: string) {
  return `${VIEWER_ROOT}/${filename}?v=${ASSET_VERSION}`;
}

const renderer: RichMediaRenderer = {
  get(_service, src, md) {
    const normalized = normalizeAttachmentSource(src, md);
    if (!normalized) return renderBlockedLink(src);

    const escapedSrc = escapeHtml(normalized);
    const escapedTitle = escapeHtml(getTitleFromSource(normalized));

    return [
      `<div class="hydro-pdf-viewer" data-hydro-pdf-viewer data-src="${escapedSrc}" data-title="${escapedTitle}">`,
      '<div class="hydro-pdf-viewer__loading">Loading PDF...</div>',
      `<noscript><a href="${escapedSrc}" target="_blank" rel="noopener noreferrer">Open PDF</a></noscript>`,
      '</div>',
      `<link rel="stylesheet" href="${viewerAsset('viewer.css')}">`,
      `<script type="module" src="${viewerAsset('viewer.js')}"></script>`,
    ].join('');
  },
};

export function apply(ctx: Context) {
  for (const service of SERVICES) {
    try {
      ctx.provideModule('richmedia', service, renderer);
    } catch (error) {
      console.warn(`[hydro-pdf-viewer] Cannot register richmedia service "${service}".`, error);
    }
  }
}
