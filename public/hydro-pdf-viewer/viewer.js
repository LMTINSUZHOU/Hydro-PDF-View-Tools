const ASSET_ROOT = new URL('.', import.meta.url).href;
const VIEWER_SELECTOR = '[data-hydro-pdf-viewer]';
const MAX_DEVICE_SCALE = 2;
const SCALE_STEP = 0.2;
const MIN_SCALE = 0.35;
const MAX_SCALE = 4;
const INITIAL_SCALE = 1.25;
const RENDER_BUFFER = 2;
const UNLOAD_DISTANCE_PAGES = 5;

let pdfjsPromise;

const ICONS = {
  prev: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg>',
  next: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5"/></svg>',
  zoomOut: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="M12.5 12.5 16 16M6.5 8.5h4"/></svg>',
  zoomIn: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="M12.5 12.5 16 16M6.5 8.5h4M8.5 6.5v4"/></svg>',
  fit: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 3.5h-3v3M13.5 3.5h3v3M16.5 13.5v3h-3M3.5 13.5v3h3"/></svg>',
  open: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 3.5h5.5V9M16 3.5 9 10.5M8 4.5H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 16.5h9a1.5 1.5 0 0 0 1.5-1.5v-3"/></svg>',
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function encodePathSegment(segment) {
  const escapes = [];
  const protectedSegment = segment.replace(/%[0-9a-f]{2}/gi, (match) => {
    escapes.push(match.toUpperCase());
    return `\u0000${escapes.length - 1}\u0000`;
  });
  return encodeURIComponent(protectedSegment).replace(/%00(\d+)%00/g, (_, index) => escapes[Number(index)]);
}

function encodeUrlPath(value) {
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

function normalizeBasicUrl(value) {
  const normalized = String(value).replace(/&amp;/g, '&');
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized) && !/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  return encodeUrlPath(normalized);
}

function normalizePdfSourceUrl(value) {
  const normalized = String(value).replace(/&amp;/g, '&');
  const hashIndex = normalized.indexOf('#');
  const beforeHash = hashIndex >= 0 ? normalized.slice(0, hashIndex) : normalized;
  const hash = hashIndex >= 0 ? normalized.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  const path = encodeUrlPath(queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash);
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';
  const params = query ? query.split('&').filter(Boolean) : [];
  const filtered = [];
  let hasNoDisposition = false;

  for (const param of params) {
    const [name] = param.split('=', 1);
    if (name === 'noDisposition') {
      if (!hasNoDisposition) filtered.push('noDisposition=1');
      hasNoDisposition = true;
    } else {
      filtered.push(param);
    }
  }
  if (!hasNoDisposition) filtered.push('noDisposition=1');

  return `${path}?${filtered.join('&')}${hash}`;
}

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(`${ASSET_ROOT}pdfjs/pdf.mjs`).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `${ASSET_ROOT}pdfjs/pdf.worker.mjs`;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function iconButton(action, title, icon) {
  return `<button type="button" class="hydro-pdf-viewer__btn" data-action="${action}" title="${title}" aria-label="${title}">${icon}</button>`;
}

function buildViewerDom(root, src, title) {
  root.innerHTML = [
    '<div class="hydro-pdf-viewer__toolbar">',
    `<span class="hydro-pdf-viewer__title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>`,
    '<span class="hydro-pdf-viewer__spacer"></span>',
    '<div class="hydro-pdf-viewer__group">',
    iconButton('prev', 'Previous page', ICONS.prev),
    '<input class="hydro-pdf-viewer__page-input" data-role="page-input" type="number" min="1" value="1" aria-label="Page number">',
    '<span class="hydro-pdf-viewer__page-count" data-role="page-count">/ -</span>',
    iconButton('next', 'Next page', ICONS.next),
    '</div>',
    '<div class="hydro-pdf-viewer__group">',
    iconButton('zoom-out', 'Zoom out', ICONS.zoomOut),
    iconButton('zoom-in', 'Zoom in', ICONS.zoomIn),
    iconButton('fit', 'Fit width', ICONS.fit),
    `<a class="hydro-pdf-viewer__btn" href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer" title="Open in new tab" aria-label="Open in new tab">${ICONS.open}</a>`,
    '</div>',
    '</div>',
    '<div class="hydro-pdf-viewer__stage" data-role="stage" tabindex="0">',
    '<div class="hydro-pdf-viewer__pages" data-role="pages">',
    '<div class="hydro-pdf-viewer__loading">Loading PDF...</div>',
    '</div>',
    '</div>',
  ].join('');
}

class HydroPdfViewer {
  constructor(root) {
    this.root = root;
    this.src = normalizePdfSourceUrl(root.dataset.src || '');
    this.title = root.dataset.title || 'PDF';
    this.pdfjs = null;
    this.pdf = null;
    this.pageCount = 0;
    this.currentPage = 1;
    this.scale = INITIAL_SCALE;
    this.fitWidth = true;
    this.pageWrappers = [];
    this.renderedPages = new Set();
    this.pendingPages = new Set();
    this.renderTasks = new Map();
    this.renderRevision = 0;
    this.resizeTimer = 0;
    this.scrollTimer = 0;
    this.scrollFrame = 0;
    this.pageInputFocused = false;
    this.observer = null;
    this.linkService = this.createLinkService();
    this.downloadManager = this.createDownloadManager();
  }

  async init() {
    this.root.dataset.hydroPdfReady = '1';
    buildViewerDom(this.root, this.src, this.title);

    this.stage = this.root.querySelector('[data-role="stage"]');
    this.pages = this.root.querySelector('[data-role="pages"]');
    this.pageInput = this.root.querySelector('[data-role="page-input"]');
    this.pageCountLabel = this.root.querySelector('[data-role="page-count"]');
    this.bindEvents();

    try {
      const pdfjs = await loadPdfjs();
      this.pdfjs = pdfjs;
      const loadingTask = pdfjs.getDocument({
        url: this.src,
        withCredentials: true,
        cMapUrl: `${ASSET_ROOT}pdfjs/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${ASSET_ROOT}pdfjs/standard_fonts/`,
      });

      this.pdf = await loadingTask.promise;
      this.pageCount = this.pdf.numPages;
      this.pageInput.max = String(this.pageCount);
      this.pageCountLabel.textContent = `/ ${this.pageCount}`;

      await this.createPagePlaceholders();
      this.setupIntersectionObserver();
      this.updateControls();
      await this.renderPage(1);
      this.prefetchAround(1);
    } catch (error) {
      this.showFallback(error);
    }
  }

  bindEvents() {
    this.root.addEventListener('click', (event) => {
      const control = event.target.closest('[data-action]');
      if (!control || !this.root.contains(control)) return;

      const action = control.dataset.action;
      if (action === 'prev') this.scrollToPage(this.currentPage - 1);
      if (action === 'next') this.scrollToPage(this.currentPage + 1);
      if (action === 'zoom-out') this.setScale(this.scale - SCALE_STEP);
      if (action === 'zoom-in') this.setScale(this.scale + SCALE_STEP);
      if (action === 'fit') this.toggleFitWidth();
    });

    this.pageInput.addEventListener('focus', () => { this.pageInputFocused = true; });
    this.pageInput.addEventListener('blur', () => { this.pageInputFocused = false; });
    this.pageInput.addEventListener('change', () => this.scrollToPage(Number(this.pageInput.value)));
    this.pageInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.scrollToPage(Number(this.pageInput.value));
    });

    this.stage.addEventListener('scroll', () => {
      if (!this.scrollFrame) {
        this.scrollFrame = window.requestAnimationFrame(() => {
          this.scrollFrame = 0;
          this.updateCurrentPageFromScroll();
        });
      }
      clearTimeout(this.scrollTimer);
      this.scrollTimer = window.setTimeout(() => this.cleanupDistantPages(), 250);
    });

    window.addEventListener('resize', () => {
      if (!this.pdf || !this.fitWidth) return;
      clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.rerenderVisiblePages(), 160);
    });
  }

  async createPagePlaceholders() {
    const estimatedHeight = await this.getEstimatedPageHeight();
    this.pages.innerHTML = '';

    for (let pageNumber = 1; pageNumber <= this.pageCount; pageNumber++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'hydro-pdf-viewer__page';
      wrapper.dataset.page = String(pageNumber);
      wrapper.style.minHeight = `${estimatedHeight}px`;

      const canvas = document.createElement('canvas');
      canvas.className = 'hydro-pdf-viewer__canvas';
      wrapper.appendChild(canvas);

      const textLayer = document.createElement('div');
      textLayer.className = 'hydro-pdf-viewer__text-layer textLayer';
      wrapper.appendChild(textLayer);

      const annotationLayer = document.createElement('div');
      annotationLayer.className = 'hydro-pdf-viewer__annotation-layer annotationLayer';
      wrapper.appendChild(annotationLayer);

      this.pages.appendChild(wrapper);
      this.pageWrappers[pageNumber] = wrapper;
    }
  }

  async getEstimatedPageHeight() {
    try {
      const firstPage = await this.pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });
      const scale = this.fitWidth ? this.getFitScale(viewport.width) : this.scale;
      return Math.max(220, Math.floor(viewport.height * scale));
    } catch (_) {
      return 600;
    }
  }

  setupIntersectionObserver() {
    if (this.observer) this.observer.disconnect();

    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageNumber = Number(entry.target.dataset.page);
        this.renderPage(pageNumber);
        this.prefetchAround(pageNumber);
      }
    }, {
      root: this.stage,
      rootMargin: '120% 0px',
      threshold: 0,
    });

    for (let pageNumber = 1; pageNumber <= this.pageCount; pageNumber++) {
      this.observer.observe(this.pageWrappers[pageNumber]);
    }
  }

  async renderPage(pageNumber, revision = this.renderRevision) {
    if (!this.pdf || pageNumber < 1 || pageNumber > this.pageCount) return;
    if (this.renderedPages.has(pageNumber) || this.pendingPages.has(pageNumber)) return;

    const wrapper = this.pageWrappers[pageNumber];
    const canvas = wrapper && wrapper.querySelector('canvas');
    const textLayer = wrapper && wrapper.querySelector('.hydro-pdf-viewer__text-layer');
    const annotationLayer = wrapper && wrapper.querySelector('.hydro-pdf-viewer__annotation-layer');
    if (!wrapper || !canvas || !textLayer || !annotationLayer) return;

    this.pendingPages.add(pageNumber);

    try {
      const page = await this.pdf.getPage(pageNumber);
      if (revision !== this.renderRevision) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const scale = this.fitWidth ? this.getFitScale(baseViewport.width) : this.scale;
      const viewport = page.getViewport({ scale });
      const deviceScale = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_SCALE);
      const context = canvas.getContext('2d');

      canvas.width = Math.floor(viewport.width * deviceScale);
      canvas.height = Math.floor(viewport.height * deviceScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      wrapper.style.width = `${Math.floor(viewport.width)}px`;
      wrapper.style.height = `${Math.floor(viewport.height)}px`;
      wrapper.style.minHeight = `${Math.floor(viewport.height)}px`;
      wrapper.style.setProperty('--scale-factor', scale);
      textLayer.style.setProperty('--scale-factor', scale);
      annotationLayer.style.setProperty('--scale-factor', scale);
      textLayer.replaceChildren();
      annotationLayer.replaceChildren();

      context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);

      const renderTask = page.render({ canvasContext: context, viewport });
      this.renderTasks.set(pageNumber, renderTask);
      await renderTask.promise;
      this.renderTasks.delete(pageNumber);

      if (revision !== this.renderRevision) return;

      await Promise.all([
        this.renderTextLayer(page, viewport, textLayer),
        this.renderAnnotationLayer(page, viewport, annotationLayer),
      ]);

      if (revision !== this.renderRevision) {
        textLayer.replaceChildren();
        annotationLayer.replaceChildren();
        return;
      }

      this.renderedPages.add(pageNumber);
      if (this.fitWidth) this.scale = scale;
    } catch (error) {
      this.renderTasks.delete(pageNumber);
      if (error && error.name === 'RenderingCancelledException') return;
      console.warn(`[hydro-pdf-viewer] Failed to render page ${pageNumber}.`, error);
    } finally {
      this.pendingPages.delete(pageNumber);
    }
  }

  async renderTextLayer(page, viewport, container) {
    try {
      const textLayer = new this.pdfjs.TextLayer({
        textContentSource: page.streamTextContent({ includeMarkedContent: true }),
        container,
        viewport,
      });
      await textLayer.render();
    } catch (error) {
      console.warn('[hydro-pdf-viewer] Failed to render text layer.', error);
    }
  }

  async renderAnnotationLayer(page, viewport, container) {
    try {
      const annotations = await page.getAnnotations({ intent: 'display' });
      if (!annotations.length) return;

      const annotationViewport = viewport.clone({ dontFlip: true });
      const annotationLayer = new this.pdfjs.AnnotationLayer({
        div: container,
        page,
        viewport: annotationViewport,
      });

      await annotationLayer.render({
        annotations,
        linkService: this.linkService,
        downloadManager: this.downloadManager,
        annotationStorage: this.pdf.annotationStorage,
        renderForms: false,
      });
    } catch (error) {
      console.warn('[hydro-pdf-viewer] Failed to render annotation layer.', error);
    }
  }

  prefetchAround(pageNumber) {
    for (let offset = 1; offset <= RENDER_BUFFER; offset++) {
      this.renderPage(pageNumber + offset);
      this.renderPage(pageNumber - offset);
    }
  }

  async rerenderVisiblePages() {
    const pageToKeep = this.currentPage;
    const nextRevision = this.renderRevision + 1;
    this.renderRevision = nextRevision;

    for (const task of this.renderTasks.values()) {
      try { task.cancel(); } catch (_) { /* ignore */ }
    }
    this.renderTasks.clear();
    this.renderedPages.clear();
    this.pendingPages.clear();

    const estimatedHeight = await this.getEstimatedPageHeight();
    if (this.renderRevision !== nextRevision) return;

    for (const wrapper of this.pageWrappers) {
      if (!wrapper) continue;
      const canvas = wrapper.querySelector('canvas');
      wrapper.style.minHeight = `${estimatedHeight}px`;
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
        canvas.style.width = '';
        canvas.style.height = '';
      }
      wrapper.querySelector('.hydro-pdf-viewer__text-layer')?.replaceChildren();
      wrapper.querySelector('.hydro-pdf-viewer__annotation-layer')?.replaceChildren();
    }

    this.updateControls();
    const wrapper = this.pageWrappers[pageToKeep];
    if (wrapper) {
      this.stage.scrollTo({
        top: wrapper.offsetTop - this.pages.offsetTop,
        behavior: 'auto',
      });
      this.setCurrentPage(pageToKeep);
    }
    await this.renderPage(pageToKeep, nextRevision);
    if (this.renderRevision !== nextRevision) return;
    this.prefetchAround(pageToKeep);
  }

  setScale(scale) {
    this.fitWidth = false;
    this.scale = clamp(scale, MIN_SCALE, MAX_SCALE);
    this.rerenderVisiblePages();
  }

  toggleFitWidth() {
    this.fitWidth = !this.fitWidth;
    this.rerenderVisiblePages();
  }

  scrollToPage(pageNumber, smooth = true) {
    if (!this.pdf) return;
    const targetPage = clamp(Number(pageNumber) || 1, 1, this.pageCount);
    const wrapper = this.pageWrappers[targetPage];
    if (!wrapper) return;

    this.stage.scrollTo({
      top: wrapper.offsetTop - this.pages.offsetTop,
      behavior: smooth ? 'smooth' : 'auto',
    });
    this.setCurrentPage(targetPage);
    this.renderPage(targetPage);
    this.prefetchAround(targetPage);
  }

  updateCurrentPageFromScroll() {
    const stageRect = this.stage.getBoundingClientRect();
    let bestPage = this.currentPage;
    let bestVisibleHeight = -1;

    for (let pageNumber = 1; pageNumber <= this.pageCount; pageNumber++) {
      const wrapper = this.pageWrappers[pageNumber];
      if (!wrapper) continue;

      const rect = wrapper.getBoundingClientRect();
      const visibleTop = Math.max(rect.top, stageRect.top);
      const visibleBottom = Math.min(rect.bottom, stageRect.bottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);

      if (visibleHeight > bestVisibleHeight) {
        bestVisibleHeight = visibleHeight;
        bestPage = pageNumber;
      }
    }

    this.setCurrentPage(bestPage);
  }

  setCurrentPage(pageNumber) {
    this.currentPage = clamp(pageNumber, 1, this.pageCount || 1);
    if (!this.pageInputFocused) this.pageInput.value = String(this.currentPage);
    this.updateControls();
  }

  cleanupDistantPages() {
    const visiblePage = this.currentPage;
    for (const pageNumber of Array.from(this.renderedPages)) {
      if (Math.abs(pageNumber - visiblePage) <= UNLOAD_DISTANCE_PAGES) continue;

      const wrapper = this.pageWrappers[pageNumber];
      const canvas = wrapper && wrapper.querySelector('canvas');
      if (!wrapper || !canvas) continue;

      const height = Math.max(220, Math.floor(wrapper.getBoundingClientRect().height));
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = '';
      canvas.style.height = '';
      wrapper.querySelector('.hydro-pdf-viewer__text-layer')?.replaceChildren();
      wrapper.querySelector('.hydro-pdf-viewer__annotation-layer')?.replaceChildren();
      wrapper.style.minHeight = `${height}px`;
      this.renderedPages.delete(pageNumber);
      this.pendingPages.delete(pageNumber);
    }
  }

  createLinkService() {
    return {
      externalLinkTarget: 2,
      externalLinkRel: 'noopener noreferrer',
      addLinkAttributes: (link, url, newWindow = false) => {
        link.href = normalizeBasicUrl(url);
        link.target = newWindow ? '_blank' : '_blank';
        link.rel = 'noopener noreferrer';
      },
      getDestinationHash: () => '#',
      getAnchorUrl: () => '#',
      goToDestination: (destination) => this.goToDestination(destination),
      executeNamedAction: (action) => this.executeNamedAction(action),
      executeSetOCGState: () => {},
      eventBus: { dispatch() {} },
    };
  }

  createDownloadManager() {
    return {
      openOrDownloadData(data, filename = 'attachment') {
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener noreferrer';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    };
  }

  async goToDestination(destination) {
    try {
      const explicitDest = typeof destination === 'string'
        ? await this.pdf.getDestination(destination)
        : destination;
      if (!Array.isArray(explicitDest) || !explicitDest.length) return;

      const pageRef = explicitDest[0];
      const pageNumber = typeof pageRef === 'number'
        ? pageRef + 1
        : (await this.pdf.getPageIndex(pageRef)) + 1;
      const targetPage = clamp(pageNumber, 1, this.pageCount);
      const wrapper = this.pageWrappers[targetPage];
      if (!wrapper) return;

      let topOffset = 0;
      const mode = explicitDest[1] && explicitDest[1].name;
      if ((mode === 'XYZ' || mode === 'FitH' || mode === 'FitBH') && explicitDest[3] != null) {
        const page = await this.pdf.getPage(targetPage);
        const viewport = page.getViewport({ scale: this.scale });
        const [, y] = viewport.convertToViewportPoint(0, explicitDest[3]);
        topOffset = Math.max(0, Math.floor(y));
      }

      this.stage.scrollTo({
        top: wrapper.offsetTop - this.pages.offsetTop + topOffset,
        behavior: 'smooth',
      });
      this.setCurrentPage(targetPage);
      this.renderPage(targetPage);
      this.prefetchAround(targetPage);
    } catch (error) {
      console.warn('[hydro-pdf-viewer] Failed to follow PDF link.', error);
    }
  }

  executeNamedAction(action) {
    if (action === 'NextPage') this.scrollToPage(this.currentPage + 1);
    if (action === 'PrevPage') this.scrollToPage(this.currentPage - 1);
    if (action === 'FirstPage') this.scrollToPage(1);
    if (action === 'LastPage') this.scrollToPage(this.pageCount);
  }

  getFitScale(pageWidth) {
    const availableWidth = Math.max(240, this.stage.clientWidth - 32);
    return clamp(availableWidth / pageWidth, MIN_SCALE, MAX_SCALE);
  }

  updateControls() {
    const prev = this.root.querySelector('[data-action="prev"]');
    const next = this.root.querySelector('[data-action="next"]');
    const zoomOut = this.root.querySelector('[data-action="zoom-out"]');
    const zoomIn = this.root.querySelector('[data-action="zoom-in"]');
    const fit = this.root.querySelector('[data-action="fit"]');

    if (prev) prev.disabled = !this.pdf || this.currentPage <= 1;
    if (next) next.disabled = !this.pdf || this.currentPage >= this.pageCount;
    if (zoomOut) zoomOut.disabled = !this.pdf || (!this.fitWidth && this.scale <= MIN_SCALE);
    if (zoomIn) zoomIn.disabled = !this.pdf || (!this.fitWidth && this.scale >= MAX_SCALE);
    if (fit) {
      fit.disabled = !this.pdf;
      fit.setAttribute('aria-pressed', this.fitWidth ? 'true' : 'false');
      fit.classList.toggle('hydro-pdf-viewer__btn--active', this.fitWidth);
    }
  }

  showFallback(error) {
    const message = error && error.message ? error.message : 'PDF rendering failed.';
    this.root.innerHTML = [
      '<div class="hydro-pdf-viewer__error">',
      `<p>${escapeHtml(message)}</p>`,
      `<p><a href="${escapeHtml(this.src)}" target="_blank" rel="noopener noreferrer">Open PDF</a></p>`,
      '</div>',
      `<iframe class="hydro-pdf-viewer__fallback" src="${escapeHtml(this.src)}" title="${escapeHtml(this.title)}"></iframe>`,
    ].join('');
  }
}

function initViewers(scope = document) {
  for (const root of scope.querySelectorAll(VIEWER_SELECTOR)) {
    if (root.dataset.hydroPdfReady) continue;
    const viewer = new HydroPdfViewer(root);
    viewer.init();
  }
}

initViewers();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initViewers());
}

new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches(VIEWER_SELECTOR)) initViewers(node.parentElement || document);
      else initViewers(node);
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });
