/** Casellas-Maknikar page context menu. No playground or runtime dependencies. */

// Native controls keep their own editing, link, media, and accessibility behavior.
export function usesNativeMenu(target) {
  return !!target?.closest?.('input, textarea, select, option, button, a[href], img, picture, video, audio, canvas, iframe, object, embed, dialog, [role="dialog"], [contenteditable]:not([contenteditable="false"]), [data-native-context-menu]') || !!target?.isContentEditable;
}

export function installContextMenu() {
  if (!document.body || document.getElementById('cm-menu-host')) return;
  const initialMarkup = '<!doctype html>\n' + document.documentElement.outerHTML;
  const host = document.createElement('div');
  host.id = 'cm-menu-host';
  host.hidden = true;
  host.innerHTML = "<div id=\"cm-context-menu\" class=\"menu\" role=\"menu\" aria-label=\"Casellas-Maknikar actions\" aria-describedby=\"cm-menu-help\" hidden>\n    <div id=\"cm-menu-items\" role=\"presentation\"></div>\n    <div id=\"cm-menu-footer\" class=\"menu-footer\" role=\"presentation\"><span class=\"footer-brand\" aria-hidden=\"true\">Casellas-Maknikar</span></div>\n  </div>\n  <div id=\"cm-about-submenu\" class=\"menu\" role=\"menu\" aria-labelledby=\"cm-about\" hidden>\n    <button id=\"cm-submenu-back\" type=\"button\" role=\"menuitem\" tabindex=\"-1\" aria-label=\"Back to main menu\">← Back</button>\n    <div id=\"cm-submenu-items\" role=\"presentation\"></div>\n  </div>\n  <p id=\"cm-menu-help\" class=\"sr-only\">Use Up and Down to move, Home and End to jump, Right to open a submenu, and Left to return. Enter or Space activates. Escape returns; Tab leaves the menu. Type a name to find an action. Shortcuts work while the menu has focus. Section headers expand with Right and collapse with Left.</p>\n  <div id=\"cm-status\" class=\"status\" aria-hidden=\"true\"></div>\n  <div id=\"cm-feedback-announcement\" class=\"sr-only\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\"></div>\n  <dialog id=\"cm-tool-dialog\" class=\"tool-dialog\" aria-labelledby=\"cm-tool-title\" aria-describedby=\"cm-tool-description\">\n    <div class=\"dialog-header\"><h2 id=\"cm-tool-title\"></h2><button id=\"cm-tool-close\" class=\"dialog-close\" type=\"button\" autofocus>Close</button></div>\n    <p id=\"cm-tool-description\" class=\"dialog-description\"></p>\n    <div class=\"code-toolbar\" role=\"group\" aria-label=\"Code view\"><button id=\"cm-code-formatted\" type=\"button\" aria-pressed=\"true\">Formatted</button><button id=\"cm-code-original\" type=\"button\" aria-pressed=\"false\">Original</button><span id=\"cm-code-view-note\"></span></div>\n    <p id=\"cm-tool-status\" class=\"sr-only\" role=\"status\" aria-atomic=\"true\"></p>\n    <div id=\"cm-tool-code\" class=\"tool-code\" role=\"region\" tabindex=\"0\" aria-label=\"Code content\"></div>\n  </dialog>";
  document.body.append(host);
  const ui = id => host.querySelector('#' + id);
  let ready = false;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./context-menu.css', import.meta.url).href;
  stylesheet.addEventListener('load', () => { host.hidden = false; ready = true; });
  stylesheet.addEventListener('error', () => { ready = false; });
  document.head.append(stylesheet);
  // BEGIN PAGE CLIPBOARD
  function createPageClipboard({ clipboard, notify, busyChanged }) {
    let pending = false;
    async function copy(text, label) {
      if (pending) return;
      pending = true;
      busyChanged(true);
      try {
        await clipboard.writeText(text);
        notify(label + ' copied.');
      } catch {
        notify('Could not copy the ' + label.toLowerCase() + '. Clipboard access was unavailable.', 5500);
      } finally {
        pending = false;
        busyChanged(false);
      }
    }
    return { copy, get pending() { return pending; } };
  }
  // END PAGE CLIPBOARD

  const root = ui('cm-context-menu');
  const submenu = ui('cm-about-submenu');
  const status = ui('cm-status');
  const feedbackAnnouncement = ui('cm-feedback-announcement');
  const dialog = ui('cm-tool-dialog');
  let inspectedTarget = document.body;
  let sourceRequest, dialogReturnFocus;
  const sectionHeaders = [];
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  let context = null;
  let returnFocus = document.body;
  let customEnabled = true;
  let lastPointerType = '';
  let keyboardContextAt = -Infinity;
  let statusTimer, statusFrame, nativeDismissTimer;
  const typeahead = createMenuKeyboard();
  const entries = new Map();
  const panels = new Map([[root, []], [submenu, []]]);
  const icons = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    address: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
    cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 12 12M8 16 20 4"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    paste: '<path d="M8 5H5v16h14V5h-3"/><rect x="8" y="3" width="8" height="4" rx="1"/>',
    delete: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    select: '<path d="M8 3H3v5m0 8v5h5m8 0h5v-5m0-8V3h-5M8 8h8v8H8Z"/>',
    link: '<path d="m10 14 4-4m-5 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
    reload: '<path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5"/>',
    print: '<path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6Zm11-3h1"/>',
    back: '<path d="m12 5-7 7 7 7M5 12h15"/>',
    forward: '<path d="m12 5 7 7-7 7M4 12h15"/>',
    camera: '<path d="M8 6 10 3h4l2 3h5v15H3V6Z"/><circle cx="12" cy="13" r="4"/>',
    code: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/>',
    inspect: '<path d="M3 3h18v18H3Zm0 5h18M8 8v13"/><path d="m12 12 6 3-3 1-1 3Z"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>'
  };
  function svg(name, className = '') {
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.info}</svg>`;
  }
  function announce(message, duration = 7000) {
    clearTimeout(statusTimer);
    cancelAnimationFrame(statusFrame);
    status.textContent = '';
    feedbackAnnouncement.textContent = '';
    statusFrame = requestAnimationFrame(() => {
      status.textContent = message;
      feedbackAnnouncement.textContent = message;
      statusTimer = setTimeout(() => { status.textContent = ''; }, duration);
    });
  }
  function clearStatus() {
    clearTimeout(statusTimer);
    cancelAnimationFrame(statusFrame);
    status.textContent = '';
    feedbackAnnouncement.textContent = '';
  }
  function snapshotSelection() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return { text: '', ranges: [] };
    const ranges = [];
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      if (!host.contains(range.commonAncestorContainer)) ranges.push(range.cloneRange());
    }
    return { text: ranges.length ? selection.toString() : '', ranges };
  }
  function restorePageSelection(saved) {
    if (!saved?.ranges.length) return;
    const ranges = saved.ranges.filter(range => range.startContainer.isConnected && range.endContainer.isConnected);
    if (!ranges.length) return;
    const selection = window.getSelection();
    if (!selection) return;
    try { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); } catch {}
  }
  function focusPage(target = returnFocus) {
    const destination = target?.isConnected ? target : document.body;
    const temporaryTabIndex = destination === document.body && !destination.hasAttribute('tabindex');
    if (temporaryTabIndex) destination.setAttribute('tabindex', '-1');
    destination.focus({ preventScroll: true });
    if (temporaryTabIndex) destination.removeAttribute('tabindex');
  }
  function selectAllPage() {
    // Keep our UI outside the page selection, including after SPA content is appended.
    document.body.append(host);
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.setStart(document.body, 0);
    range.setEndBefore(host);
    selection.removeAllRanges(); selection.addRange(range);
    announce('All page text selected.');
  }
  const commands = createPageClipboard({
    clipboard: { writeText: text => navigator.clipboard.writeText(text) },
    notify: announce, busyChanged: () => updateAvailability()
  });
  const canWrite = () => !!navigator.clipboard?.writeText;
  const selected = saved => !!saved?.text;

  // BEGIN SCREEN CAPTURE ENGINE
  function createScreenCapture({ request, frame, save, notify, busyChanged }) {
    let pending = false;
    async function run() {
      if (pending) return;
      pending = true;
      busyChanged(true);
      let stream;
      try {
        // No await before requesting permission: preserve the user's activation.
        stream = await request();
        const blob = await frame(stream);
        if (!blob) throw new Error('No image was produced.');
        await save(blob);
        notify('Screenshot download started.');
      } catch (error) {
        notify(error?.name === 'NotAllowedError' || error?.name === 'AbortError'
          ? 'Screenshot cancelled or permission was not granted.'
          : 'Could not capture an image. Try your device screenshot controls.', 5000);
      } finally {
        // Stop capture on success, cancellation, encoding failure, and download failure.
        for (const track of stream?.getTracks() || []) { try { track.stop(); } catch {} }
        pending = false;
        busyChanged(false);
      }
    }
    return { run, get pending() { return pending; } };
  }
  // END SCREEN CAPTURE ENGINE

  // BEGIN TEXT COUNTS
  function textCounts(text) {
    const words = typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].filter(s => s.isWordLike).length
      : (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
    const characters = typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length : [...text].length;
    return `${words} ${words === 1 ? 'word' : 'words'} · ${characters} ${characters === 1 ? 'char' : 'chars'}`;
  }
  // END TEXT COUNTS

  function updateSections() {
    for (const { config, separator, name, detail } of sectionHeaders) {
      name.textContent = typeof config.label === 'function' ? config.label(context) : config.label;
      detail.textContent = typeof config.detail === 'function' ? config.detail(context) : config.detail || '';
      separator.setAttribute('aria-label', name.textContent);
      separator.setAttribute('aria-describedby', detail.id);
      separator.title = 'Click to collapse or expand this section';
    }
  }

  async function captureFrame(stream) {
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState === 'ended') throw new Error('Capture ended.');
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    let frameId, timer, onEnded, onError, onLoaded;
    try {
      await new Promise((resolve, reject) => {
        const fail = () => reject(new Error('Capture ended before an image was available.'));
        onEnded = fail; onError = fail;
        timer = setTimeout(fail, 12000);
        track.addEventListener('ended', onEnded, { once: true });
        video.addEventListener('error', onError, { once: true });
        onLoaded = () => {
          if (video.requestVideoFrameCallback) frameId = video.requestVideoFrameCallback(resolve);
          else resolve();
        };
        video.addEventListener('loadeddata', onLoaded, { once: true });
        video.play().catch(reject);
      });
      if (!video.videoWidth || !video.videoHeight || track.readyState === 'ended') throw new Error('No video frame.');
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const painter = canvas.getContext('2d');
      if (!painter) throw new Error('Canvas unavailable.');
      painter.drawImage(video, 0, 0);
      return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed.')), 'image/png'));
    } finally {
      clearTimeout(timer);
      if (frameId != null) video.cancelVideoFrameCallback?.(frameId);
      track.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      video.removeEventListener('loadeddata', onLoaded);
      video.pause(); video.srcObject = null;
    }
  }
  function saveScreenshot(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'casellas-maknikar-screenshot.png';
    link.hidden = true; document.body.append(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  }
  const screenCapture = createScreenCapture({
    request: () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }),
    frame: captureFrame, save: saveScreenshot, notify: announce,
    busyChanged: () => updateAvailability()
  });
  // BEGIN CODE PRESENTATION
  function createCodePresentation() {
    const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
    function markupParts(source) {
      const parts = [];
      let at = 0;
      while (at < source.length) {
        if (source.startsWith('<!--', at)) {
          const end = source.indexOf('-->', at + 4);
          const next = end < 0 ? source.length : end + 3;
          parts.push({ kind: 'comment', text: source.slice(at, next) }); at = next; continue;
        }
        if (source[at] === '<' && /^<\/?[A-Za-z!]/.test(source.slice(at, at + 3))) {
          let end = at + 1, quote = '';
          for (; end < source.length; end++) {
            const char = source[end];
            if (quote) { if (char === quote) quote = ''; }
            else if (char === '"' || char === "'") quote = char;
            else if (char === '>') { end++; break; }
          }
          const text = source.slice(at, end), name = text.match(/^<\/?([\w:-]+)/)?.[1]?.toLowerCase();
          const closing = /^<\//.test(text), standalone = /^<!/.test(text) || /\/>$/.test(text) || voidTags.has(name);
          parts.push({ kind: 'tag', text, name, closing, standalone }); at = end;
          if (!closing && !standalone && ['script', 'style', 'pre', 'textarea'].includes(name)) {
            const close = new RegExp('<\\/' + name + '\\s*>', 'ig'); close.lastIndex = at;
            const match = close.exec(source), next = match ? match.index : source.length;
            parts.push({ kind: 'raw', language: name === 'script' ? 'javascript' : name === 'style' ? 'css' : 'text', text: source.slice(at, next) });
            at = next;
          }
        } else {
          let end = source.indexOf('<', at + 1); if (end < 0) end = source.length;
          parts.push({ kind: 'text', text: source.slice(at, end) }); at = end;
        }
      }
      return parts;
    }
    function lex(text, language) {
      if (language === 'text') return [{ type: '', text }];
      if (language === 'html') return markupParts(text).flatMap(part => {
        if (part.kind === 'raw') return lex(part.text, part.language);
        if (part.kind === 'tag') return lex(part.text, 'tag');
        if (part.kind === 'comment') return [{ type: 'comment', text: part.text }];
        return lex(part.text, 'entities');
      });
      const pattern = language === 'tag'
        ? /(<\/?|\/?>|=)|([\w:-]+)|("[^"]*"|'[^']*')/g
        : language === 'entities' ? /&(?:#x?[\da-f]+|[\w]+);/gi
        : /\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|try|catch|finally|throw|new|async|await|class|extends|switch|case|break|continue|true|false|null|undefined|typeof|instanceof|of|in)\b|#[\da-f]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|ms|s|%)?|[a-zA-Z_$-][\w$-]*(?=\s*[:(])|[{}[\]();,:.=<>+*!?&|/-]/g;
      const tokens = []; let at = 0, firstName = true;
      for (const match of text.matchAll(pattern)) {
        if (match.index > at) tokens.push({ type: '', text: text.slice(at, match.index) });
        const value = match[0]; let type = 'punctuation';
        if (language === 'entities') type = 'entity';
        else if (language === 'tag') {
          if (/^["']/.test(value)) type = 'string';
          else if (/^[\w:]/.test(value)) { type = firstName ? 'tag' : 'attribute'; firstName = false; }
        } else if (/^\/[/\*]/.test(value)) type = 'comment';
        else if (/^["'`]/.test(value)) type = 'string';
        else if (/^(?:#|\d)/.test(value)) type = 'number';
        else if (/^(const|let|var|function|return|if|else|for|while|try|catch|finally|throw|new|async|await|class|extends|switch|case|break|continue|true|false|null|undefined|typeof|instanceof|of|in)$/.test(value)) type = 'keyword';
        else if (/^[\w$-]/.test(value)) type = language === 'css' ? 'property' : 'function';
        tokens.push({ type, text: value }); at = match.index + value.length;
      }
      if (at < text.length) tokens.push({ type: '', text: text.slice(at) });
      return tokens;
    }
    function formatCSS(source) {
      let depth = 0, parentheses = 0, current = '', lines = [];
      const flush = () => { if (current.trim()) lines.push('  '.repeat(depth) + current.trim()); current = ''; };
      // Strings and comments are indivisible: their braces and semicolons are data.
      for (const token of lex(source, 'css')) {
        if (token.type === 'string' || token.type === 'comment') { current += token.text; continue; }
        for (const char of token.text) {
          if (char === '(') parentheses++;
          if (char === ')') parentheses = Math.max(0, parentheses - 1);
          if (!parentheses && char === '{') { current += ' {'; flush(); depth++; }
          else if (!parentheses && char === '}') { flush(); depth = Math.max(0, depth - 1); current = '}'; flush(); }
          else if (!parentheses && char === ';') { current += char; flush(); }
          else if (char === '\n') { current += ' '; }
          else current += char;
        }
      }
      flush(); return lines.join('\n');
    }
    function formatMarkup(source) {
      const lines = []; let depth = 0;
      for (const part of markupParts(source)) {
        if (part.kind === 'raw') {
          if (part.language === 'text') { lines.push(part.text); continue; }
          const content = part.language === 'css' ? formatCSS(part.text) : part.text.trim();
          if (content) lines.push(content.split('\n').map(line => '  '.repeat(depth) + line).join('\n'));
          continue;
        }
        if (part.kind === 'tag' && part.closing) depth = Math.max(0, depth - 1);
        if (part.text.trim()) lines.push('  '.repeat(depth) + part.text.trim());
        if (part.kind === 'tag' && !part.closing && !part.standalone) depth++;
      }
      return lines.join('\n');
    }
    function present(source, language, formatted = true) {
      let text = source;
      if (formatted) {
        // A presentation-only abbreviation; Original always preserves all source bytes as text.
        text = text.replace(/data:[^\s"'<>`)]+/g, value => value.length > 240 ? value.slice(0, value.indexOf(',') + 1) + '…' : value);
        if (language === 'html') text = formatMarkup(text);
        else if (language === 'css') text = formatCSS(text);
      }
      return { text, tokens: lex(text, language) };
    }
    return { present, markupParts };
  }
  // END CODE PRESENTATION

  const codePresentation = createCodePresentation();
  let codeDocuments = [], formattedCode = true;
  function renderToolCode() {
    const host = ui('cm-tool-code');
    host.replaceChildren();
    for (const doc of codeDocuments) {
      const section = document.createElement('section'), heading = document.createElement('h3');
      heading.className = 'code-heading'; heading.textContent = doc.title + ' · ' + doc.language.toUpperCase();
      const pre = document.createElement('pre'), code = document.createElement('code');
      pre.className = 'code-block'; code.className = 'language-' + doc.language;
      const result = codePresentation.present(doc.text, doc.language, formattedCode);
      for (const token of result.tokens) {
        if (!token.type) code.append(document.createTextNode(token.text));
        else { const span = document.createElement('span'); span.className = 'syntax-' + token.type; span.textContent = token.text; code.append(span); }
      }
      pre.append(code); section.append(heading, pre); host.append(section);
    }
    ui('cm-code-formatted').setAttribute('aria-pressed', String(formattedCode));
    ui('cm-code-original').setAttribute('aria-pressed', String(!formattedCode));
    ui('cm-code-view-note').textContent = formattedCode ? 'Formatted · long embedded data URLs abbreviated' : 'Original · complete text, unchanged';
  }
  function setToolCode(documents) { codeDocuments = documents; renderToolCode(); }
  for (const [id, mode] of [['cm-code-formatted', true], ['cm-code-original', false]]) {
    ui(id).addEventListener('click', () => { formattedCode = mode; renderToolCode(); });
  }

  function showTool(title, description, documents) {
    sourceRequest?.abort();
    ui('cm-tool-status').textContent = '';
    ui('cm-tool-code').removeAttribute('aria-busy');
    dialogReturnFocus = document.activeElement;
    ui('cm-tool-title').textContent = title;
    ui('cm-tool-description').textContent = description;
    formattedCode = true;
    setToolCode(Array.isArray(documents) ? documents : [{ title: 'Source', language: 'text', text: documents }]);
    dialog.showModal();
    ui('cm-tool-code').scrollTop = 0;
    ui('cm-tool-close').focus();
  }
  ui('cm-tool-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const stops = [...dialog.querySelectorAll('button:not([disabled]), [tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = stops[0], last = stops[stops.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener('close', () => {
    sourceRequest?.abort();
    focusPage(dialogReturnFocus);
  });
  async function viewSource() {
    const shortcut = mac ? '⌘⌥U in Chrome/Firefox' : 'Ctrl+U';
    showTool('View source', `Loading this page’s HTML. For the browser’s own source viewer, use ${shortcut}.`, 'Loading…');
    if (!/^https?:$/.test(location.protocol)) {
      ui('cm-tool-description').textContent = `Initial page markup (local-file fallback), captured when the context menu initialized. For the browser’s source viewer, use ${shortcut}.`;
      setToolCode([{ title: 'Initial markup', language: 'html', text: initialMarkup }]);
      return;
    }
    ui('cm-tool-code').setAttribute('aria-busy', 'true');
    const request = new AbortController();
    sourceRequest = request;
    const timeout = setTimeout(() => request.abort('timeout'), 10000);
    try {
      const response = await fetch(location.href, { signal: request.signal });
      if (!response.ok) throw new Error('Source unavailable.');
      const text = await response.text();
      if (!dialog.open || request.signal.aborted) return;
      ui('cm-tool-description').textContent = `HTML returned by this page’s URL. For the browser’s own source viewer, use ${shortcut}.`;
      setToolCode([{ title: 'Page source', language: 'html', text }]);
      ui('cm-tool-code').removeAttribute('aria-busy');
      ui('cm-tool-status').textContent = 'Page source loaded.';
    } catch {
      if (!dialog.open || (request.signal.aborted && request.signal.reason !== 'timeout')) return;
      ui('cm-tool-description').textContent = `Could not retrieve the source. Showing initial page markup captured when the context menu initialized. Browser source shortcut: ${shortcut}.`;
      setToolCode([{ title: 'Initial markup', language: 'html', text: initialMarkup }]);
      ui('cm-tool-code').removeAttribute('aria-busy');
      ui('cm-tool-status').textContent = 'Source request failed. Initial markup is available.';
    } finally {
      clearTimeout(timeout);
    }
  }
  function inspectElement() {
    const target = inspectedTarget?.isConnected ? inspectedTarget : document.body;
    const box = target.getBoundingClientRect(), style = getComputedStyle(target);
    const markup = target.outerHTML;
    const selector = target.tagName.toLowerCase() + (target.id ? '#' + CSS.escape(target.id) : '');
    const metadata = { element: target.tagName.toLowerCase(), attributes: Object.fromEntries([...target.attributes].map(a => [a.name, a.value])), layout: { width: Math.round(box.width), height: Math.round(box.height), x: Math.round(box.x), y: Math.round(box.y) } };
    const css = `${selector} {\n  font-family: ${style.fontFamily};\n  font-size: ${style.fontSize};\n  font-weight: ${style.fontWeight};\n  color: ${style.color};\n  background-color: ${style.backgroundColor};\n  display: ${style.display};\n}`;
    showTool('Inspect · element details', `Details of the element you opened the menu on. To use the browser’s full inspector, press ${mac ? '⌘⌥C' : 'Ctrl+Shift+C'}, then select the element.`, [
      { title: 'Element markup' + (markup.length > 16000 ? ' (first 16,000 characters)' : ''), language: 'html', text: markup.slice(0, 16000) },
      { title: 'Computed appearance', language: 'css', text: css },
      { title: 'Attributes and layout (CSS pixels)', language: 'json', text: JSON.stringify(metadata, null, 2) }
    ]);
  }

  // BEGIN MENU KEYBOARD
  function shortcutInfo(shortcut, isMac) {
    const parts = shortcut.split('+').map(p => p === 'Primary' ? (isMac ? 'Meta' : 'Control') : p);
    const key = parts.pop();
    const labels = { Control: 'Ctrl', Meta: '⌘', Alt: isMac ? '⌥' : 'Alt', Shift: isMac ? '⇧' : 'Shift', ArrowLeft: '←', ArrowRight: '→', Delete: 'Del' };
    const display = key.replace(/^Digit/, '').toUpperCase();
    return { label: [...parts.map(p => labels[p]), labels[key] || display].join(isMac ? '' : '+'), aria: [...parts, key.replace(/^Digit/, '').length === 1 ? key.replace(/^Digit/, '').toUpperCase() : key].join('+') };
  }
  function matchesShortcut(event, shortcut, isMac) {
    const parts = shortcut.split('+').map(p => p === 'Primary' ? (isMac ? 'Meta' : 'Control') : p);
    const key = parts.pop();
    if (event.isComposing || event.repeat || event.getModifierState?.('AltGraph')) return false;
    if (!!event.ctrlKey !== parts.includes('Control') || !!event.metaKey !== parts.includes('Meta') || !!event.altKey !== parts.includes('Alt') || !!event.shiftKey !== parts.includes('Shift')) return false;
    return key.startsWith('Digit') ? event.code === key : event.key.toLowerCase() === key.toLowerCase();
  }
  function createMenuKeyboard() {
    let buffer = '', last = -Infinity;
    return {
      reset() { buffer = ''; last = -Infinity; },
      find(labels, current, key, now) {
        const letter = key.toLocaleLowerCase();
        buffer = now - last > 700 ? letter : buffer + letter;
        last = now;
        const repeated = [...buffer].every(c => c === letter);
        const search = prefix => {
          for (let offset = prefix.length > 1 ? 0 : 1; offset < labels.length + (prefix.length > 1 ? 0 : 1); offset++) {
            const index = (Math.max(current, 0) + offset) % labels.length;
            if (labels[index].trim().toLocaleLowerCase().startsWith(prefix)) return index;
          }
          return -1;
        };
        const found = search(repeated ? letter : buffer);
        if (found >= 0) return found;
        buffer = letter;
        return search(letter);
      }
    };
  }
  // END MENU KEYBOARD

  const contactDetails = {
    email: 'contact@casellas-maknikar.com',
    // Mailing address verified in the official website's Contact section on October 3, 2026.
    mailing: 'Casellas-Maknikar\n971 US Highway 202 N, Suite N\nBranchburg, Somerset County, NJ 08876, US'
  };
  // Edit this list to change labels, shortcuts, children, actions, icons, sections, or availability.
  const menuItems = [
    { id: 'cm-go-back', shortcut: 'Alt+ArrowLeft', section: { label: 'Navigation', detail: 'Tab history' }, label: 'Back', icon: 'back', enabled: () => history.length > 1, action: () => history.back() },
    { id: 'cm-go-forward', shortcut: 'Alt+ArrowRight', label: 'Forward', icon: 'forward', enabled: () => history.length > 1, action: () => history.forward() },
    { id: 'cm-reload', shortcut: 'Primary+r', label: 'Reload', icon: 'reload', action: () => location.reload() },
    { id: 'cm-copy', shortcut: 'Primary+c', label: 'Copy', icon: 'copy', section: { label: 'Text', detail: c => selected(c) ? textCounts(c.text) : 'Page selection' }, enabled: c => selected(c) && canWrite(), unavailableMessage: 'Select page text and allow clipboard access to copy it.', action: c => commands.copy(c.text, 'Text') },
    { id: 'cm-select-all', shortcut: 'Primary+a', label: 'Select all', icon: 'select', action: selectAllPage },
    { id: 'cm-copy-url', shortcut: 'Shift+l', label: 'Copy page URL', icon: 'link', section: { label: 'Page tools', detail: 'Current page' }, enabled: canWrite, action: () => commands.copy(location.href, 'Page URL') },
    { id: 'cm-print', shortcut: 'Primary+p', label: 'Print…', icon: 'print', action: () => window.print() },
    { id: 'cm-screenshot', shortcut: 'Shift+s', label: 'Screenshot…', icon: 'camera', title: 'Choose a tab, window, or screen and save one PNG image', enabled: () => !!navigator.mediaDevices?.getDisplayMedia, action: () => screenCapture.run() },
    { id: 'cm-view-source', shortcut: 'Shift+u', label: 'View source', icon: 'code', title: 'Open the page HTML in a source viewer', action: viewSource },
    { id: 'cm-inspect', shortcut: 'Shift+i', label: 'Inspect', icon: 'inspect', title: 'View details of the element you right-clicked', action: inspectElement },
    { id: 'cm-about', shortcut: 'ArrowRight', section: { label: 'About' }, label: 'About', icon: 'info', children: [
      { id: 'cm-about-email', label: 'Email address', icon: 'mail', title: 'Copy email address', enabled: canWrite, unavailableMessage: 'Copying the email address is unavailable in this browser.', action: () => commands.copy(contactDetails.email, 'Email address') },
      { id: 'cm-about-mailing', label: 'Mailing address', icon: 'address', title: 'Copy mailing address', enabled: canWrite, unavailableMessage: 'Copying the mailing address is unavailable in this browser.', action: () => commands.copy(contactDetails.mailing, 'Mailing address') }
    ] },
    { id: 'cm-restore-native', shortcut: 'Shift+b', label: 'Use browser menu', footer: true, hint: 'Right-click here to open now. Activate, then press Shift+F10 or right-click for the browser menu.', icon: 'browser', action: () => {
      customEnabled = false;
      announce('Press Shift+F10 or right-click once for the browser menu. The next invocation brings back the custom menu.', 7000);
    } }
  ];
  function inMenus(target) { return target instanceof Node && (root.contains(target) || submenu.contains(target)); }
  function panelButtons(panel) {
    const visible = panels.get(panel).filter(button => !button.closest('.section-items[hidden]'));
    return panel === submenu && submenu.classList.contains('stacked')
      ? [ui('cm-submenu-back'), ...visible] : visible;
  }
  function focusItem(panel, index) {
    const items = panelButtons(panel);
    for (const { button } of entries.values()) button.tabIndex = -1;
    if (!items.length) return;
    const button = items[(index + items.length) % items.length];
    button.tabIndex = 0;
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: 'nearest' });
  }
  function updateAvailability() {
    updateSections();
    for (const { item, button } of entries.values()) {
      button.setAttribute('aria-disabled', String(!item.disclosure && (commands.pending || screenCapture.pending || !!item.enabled && !item.enabled(context))));
      if (item.id === 'cm-screenshot') button.title = navigator.mediaDevices?.getDisplayMedia ? item.title : 'Screen capture is unavailable in this browser. Use your device screenshot controls.';
    }
  }
  function closeSubmenu(restoreFocus = false) {
    submenu.hidden = true;
    root.classList.remove('submenu-stacked');
    root.inert = false;
    root.removeAttribute('aria-hidden');
    const trigger = entries.get('cm-about').button;
    trigger.setAttribute('aria-expanded', 'false');
    panels.get(submenu).forEach(button => { button.tabIndex = -1; });
    if (restoreFocus) focusItem(root, panelButtons(root).indexOf(trigger));
  }
  function closeMenu(restoreFocus = true) {
    clearTimeout(nativeDismissTimer);
    if (root.hidden) return;
    const hadFocus = inMenus(document.activeElement);
    root.hidden = true;
    typeahead.reset();
    closeSubmenu();
    for (const { button } of entries.values()) button.tabIndex = -1;
    if (restoreFocus && hadFocus) {
      focusPage();
      restorePageSelection(context);
    }
  }
  const clamp = (value, lower, upper) => Math.max(lower, Math.min(value, upper));
  function placeRoot(x, y) {
    const box = root.getBoundingClientRect();
    root.style.left = `${clamp(x, 8, innerWidth - box.width - 8)}px`;
    root.style.top = `${clamp(y, 8, innerHeight - box.height - 8)}px`;
  }
  function openMenu(x, y, target, focusOrigin) {
    if (!ready || !customEnabled) return;
    typeahead.reset();
    clearTimeout(nativeDismissTimer);
    closeSubmenu();
    // Reopening within a panel retains the original invocation context.
    if (!inMenus(target)) {
      context = snapshotSelection();
      inspectedTarget = target instanceof Element ? target : document.body;
      returnFocus = focusOrigin || (target instanceof Element ? target.closest('[tabindex]') : null) || document.activeElement || document.body;
    }
    clearStatus();
    updateAvailability();
    root.hidden = false;
    root.scrollTop = 0;
    placeRoot(x, y);
    focusItem(root, 0);
  }
  function placeSubmenu() {
    const trigger = entries.get('cm-about').button;
    const parent = root.getBoundingClientRect();
    const row = trigger.getBoundingClientRect();
    const box = submenu.getBoundingClientRect();
    const right = parent.right + 4;
    const left = parent.left - box.width - 4;
    let x = right + box.width <= innerWidth - 8 ? right : left;
    const stacked = x < 8;
    // If two full panels cannot fit, overlay the root; a visible Back row returns to it.
    if (stacked) x = parent.left;
    root.classList.toggle('submenu-stacked', stacked);
    submenu.classList.toggle('stacked', stacked);
    submenu.style.left = `${clamp(x, 8, innerWidth - box.width - 8)}px`;
    submenu.style.top = `${clamp(stacked ? parent.top : row.top - 6, 8, innerHeight - submenu.offsetHeight - 8)}px`;
    return stacked;
  }
  function openSubmenu(moveFocus = false) {
    if (root.hidden || commands.pending || screenCapture.pending || entries.get('cm-about').button.closest('.section-items[hidden]')) return;
    const trigger = entries.get('cm-about').button;
    submenu.hidden = false;
    submenu.scrollTop = 0;
    const stacked = placeSubmenu();
    trigger.setAttribute('aria-expanded', 'true');
    if (moveFocus || stacked) focusItem(submenu, stacked ? 1 : 0);
    root.inert = stacked;
    if (stacked) root.setAttribute('aria-hidden', 'true');
    else root.removeAttribute('aria-hidden');
  }
  function toggleSection(section, expanded = section.body.hidden) {
    closeSubmenu();
    // Move focus out of a disappearing group before its descendants become hidden.
    section.separator.focus({ preventScroll: true });
    section.body.hidden = !expanded;
    section.separator.setAttribute('aria-expanded', String(expanded));
    for (const button of section.body.querySelectorAll('[role="menuitem"]')) button.tabIndex = -1;
    if (!root.hidden) {
      placeRoot(parseFloat(root.style.left), parseFloat(root.style.top));
      focusItem(root, panelButtons(root).indexOf(section.separator));
    }
  }
  function activate(item, button) {
    if (item.disclosure) { toggleSection(item.sectionRef); return; }
    if (commands.pending || screenCapture.pending || button.getAttribute('aria-disabled') === 'true') { announce(item.unavailableMessage || item.label + ' is unavailable for this context.'); return; }
    if (item.back) { closeSubmenu(true); return; }
    if (item.children) { openSubmenu(true); return; }
    const saved = context;
    closeMenu();
    item.action(saved);
  }
  function render(items, panel, container) {
    let sectionBody = container;
    for (const item of items) {
      if (item.section) {
        const separator = document.createElement('button');
        separator.type = 'button'; separator.id = 'cm-section-' + item.id.replace(/^cm-/, '');
        separator.className = 'section-divider'; separator.tabIndex = -1;
        separator.setAttribute('role', 'menuitem'); separator.setAttribute('aria-expanded', 'true');
        separator.innerHTML = svg('chevron', 'section-chevron');
        const name = document.createElement('span'), detail = document.createElement('span'), rule = document.createElement('span');
        name.className = 'section-name'; detail.className = 'section-detail'; detail.id = separator.id + '-detail';
        rule.className = 'section-rule'; rule.setAttribute('aria-hidden', 'true');
        separator.append(name, rule, detail); container.append(separator);
        const body = document.createElement('div'); body.id = separator.id + '-items'; body.className = 'section-items';
        body.setAttribute('role', 'group'); body.setAttribute('aria-labelledby', separator.id);
        separator.setAttribute('aria-controls', body.id); container.append(body); sectionBody = body;
        const section = { config: item.section, separator, name, detail, body };
        sectionHeaders.push(section);
        const disclosure = { id: separator.id, disclosure: true, sectionRef: section };
        entries.set(disclosure.id, { item: disclosure, button: separator }); panels.get(panel).push(separator);
        separator.addEventListener('click', () => toggleSection(section));
      }
      let destination = sectionBody;
      if (item.footer) destination = ui('cm-menu-footer');
      if (item.row) {
        destination = ui(item.row + '-row');
        if (!destination) { destination = document.createElement('div'); destination.id = item.row + '-row'; destination.className = 'navigation-row'; destination.setAttribute('role', 'presentation'); sectionBody.append(destination); }
      }
      const button = document.createElement('button');
      button.id = item.id;
      button.type = 'button';
      button.className = item.footer ? 'menu-item footer-action' : 'menu-item';
      if (item.title || item.footer) button.title = item.title || item.hint;
      button.tabIndex = -1;
      button.setAttribute('role', 'menuitem');
      button.setAttribute('aria-label', item.label);
      button.innerHTML = svg(item.icon);
      const label = document.createElement('span');
      label.className = item.footer ? 'item-label sr-only' : 'item-label';
      label.textContent = item.label;
      if (item.hint) {
        const hint = document.createElement('span');
        hint.id = `${item.id}-hint`;
        hint.className = 'menu-hint';
        hint.textContent = item.hint;
        label.append(hint);
        button.setAttribute('aria-describedby', hint.id);
      }
      button.append(label);
      if (item.shortcut) {
        const info = shortcutInfo(item.shortcut, mac);
        const hint = document.createElement('kbd');
        hint.className = 'item-shortcut'; hint.textContent = info.label; hint.setAttribute('aria-hidden', 'true');
        button.append(hint); button.setAttribute('aria-keyshortcuts', info.aria);
        if (!item.title && !item.hint) button.title = info.label + ' while the menu has focus';
      }
      if (item.children) {
        // The right-arrow shortcut also serves as the submenu affordance.
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', submenu.id);
        render(item.children, submenu, ui('cm-submenu-items'));
      }
      entries.set(item.id, { item, button });
      panels.get(panel).push(button);
      button.addEventListener('click', () => activate(item, button));
      button.addEventListener('pointermove', event => {
        // An explicitly opened submenu retains focus while the pointer crosses its parent.
        if (event.pointerType === 'touch' || (panel === root && !submenu.hidden)) return;
        if (document.activeElement !== button) focusItem(panel, panelButtons(panel).indexOf(button));
      });
      if (item.footer) destination.prepend(button); else destination.append(button);
    }
  }
  render(menuItems, root, ui('cm-menu-items'));
  const backButton = ui('cm-submenu-back');
  const backItem = { id: 'cm-submenu-back', label: 'Back to main menu', back: true };
  backButton.setAttribute('aria-keyshortcuts', 'ArrowLeft Escape');
  entries.set(backItem.id, { item: backItem, button: backButton });
  backButton.addEventListener('click', () => activate(backItem, backButton));
  backButton.addEventListener('pointermove', () => focusItem(submenu, 0));
  function resumeCustomMenu() {
    customEnabled = true;
    clearStatus();
  }
  document.addEventListener('pointerdown', event => {
    keyboardContextAt = -Infinity;
    lastPointerType = event.pointerType;
    if (event.shiftKey && event.button === 2) {
      if (!customEnabled && event.pointerType !== 'touch') resumeCustomMenu();
      closeMenu(false);
      return;
    }
    if (!root.hidden && !inMenus(event.target)) closeMenu();
  });
  document.addEventListener('contextmenu', event => {
    if (!ready || event.defaultPrevented || dialog.open) return;
    const target = event.composedPath().find(node => node instanceof Element) || event.target;
    const keyboardTriggered = performance.now() - keyboardContextAt < 500;
    const touchTriggered = event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents
      || (!keyboardTriggered && !event.pointerType && lastPointerType === 'touch');
    if (touchTriggered) { closeMenu(false); return; }
    if (target instanceof Element && target.closest('#cm-restore-native')) {
      resumeCustomMenu();
      nativeDismissTimer = setTimeout(() => closeMenu(), 0);
      return;
    }
    if (!customEnabled) { resumeCustomMenu(); closeMenu(false); return; }
    if (event.shiftKey && !keyboardTriggered) { closeMenu(false); return; }
    if (!inMenus(target) && usesNativeMenu(target)) { closeMenu(false); return; }
    event.preventDefault();
    const keyboardPosition = keyboardTriggered || (event.clientX === 0 && event.clientY === 0 && event.button !== 2);
    const bounds = target instanceof Element ? target.getBoundingClientRect() : null;
    openMenu(keyboardPosition ? (bounds?.left || 0) + 20 : event.clientX,
      keyboardPosition ? (bounds?.top || 0) + 20 : event.clientY, target);
  });
  document.addEventListener('keydown', event => {
    if (!ready || event.defaultPrevented || dialog.open) return;
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      keyboardContextAt = performance.now();
      const target = event.composedPath().find(node => node instanceof Element) || document.activeElement;
      if (!customEnabled || target?.id === 'cm-restore-native' || (!inMenus(target) && usesNativeMenu(target))) return;
      event.preventDefault();
      const bounds = target?.getBoundingClientRect();
      openMenu(bounds ? bounds.left + 20 : innerWidth / 2, bounds ? bounds.top + 20 : innerHeight / 2, target, document.activeElement);
      return;
    }
    if (root.hidden || !inMenus(document.activeElement)) return;
    const panel = submenu.contains(document.activeElement) ? submenu : root;
    const buttons = panelButtons(panel);
    const current = buttons.indexOf(document.activeElement);
    const entry = entries.get(document.activeElement?.id);
    // Only intercept command shortcuts while this menu owns focus.
    if (!event.isComposing && !event.repeat) {
      const match = buttons.map(b => entries.get(b.id)).find(e => e?.item.shortcut && e.item.shortcut !== 'ArrowRight' && matchesShortcut(event, e.item.shortcut, mac));
      if (match) { event.preventDefault(); typeahead.reset(); activate(match.item, match.button); return; }
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    let next;
    switch (event.key) {
      case 'ArrowDown': next = (current + 1) % buttons.length; break;
      case 'ArrowUp': next = (current - 1 + buttons.length) % buttons.length; break;
      case 'Home': next = 0; break;
      case 'End': next = buttons.length - 1; break;
      case 'ArrowRight': case 'ArrowLeft': {
        event.preventDefault();
        if (entry?.item.disclosure) {
          const section = entry.item.sectionRef;
          toggleSection(section, event.key === 'ArrowRight');
        } else if (entry?.item.row === 'navigation') {
          const peers = buttons.filter(b => entries.get(b.id).item.row === 'navigation');
          const offset = event.key === 'ArrowRight' ? 1 : -1;
          const button = peers[(peers.indexOf(document.activeElement) + offset + peers.length) % peers.length];
          focusItem(panel, buttons.indexOf(button));
        } else if (event.key === 'ArrowRight' && entry?.item.children) openSubmenu(true);
        else if (event.key === 'ArrowLeft' && !submenu.hidden) closeSubmenu(true);
        else if (event.key === 'ArrowLeft' && panel === root) {
          const section = sectionHeaders.find(s => s.body.contains(document.activeElement));
          if (section) toggleSection(section, false);
        }
        return;
      }
      case 'Escape': event.preventDefault(); if (!submenu.hidden) closeSubmenu(true); else closeMenu(); return;
      case 'Tab': closeMenu(); return;
      case 'Enter': case ' ': event.preventDefault(); if (entry) activate(entry.item, entry.button); return;
      default: {
        if (event.key.length !== 1 || event.shiftKey) return;
        const found = typeahead.find(buttons.map(b => entries.get(b.id)?.item.label || b.getAttribute('aria-label') || ''), current, event.key, performance.now());
        event.preventDefault();
        if (found >= 0) { if (panel === root) closeSubmenu(); focusItem(panel, found); }
        return;
      }
    }
    typeahead.reset();
    event.preventDefault();
    if (panel === root && buttons[next] !== entries.get('cm-about').button) closeSubmenu();
    focusItem(panel, next);
  });
  document.addEventListener('scroll', event => {
    // Parent scrolling (including queued focus scrolling) is not a Back action.
    if (event.target === root) { if (!submenu.hidden && !root.inert) placeSubmenu(); }
    else if (event.target !== submenu && !inMenus(event.target)) closeMenu();
  }, true);
  window.addEventListener('resize', () => closeMenu());
  document.addEventListener('focusin', event => {
    if (!root.hidden && !inMenus(event.target)) closeMenu(false);
  });
  window.addEventListener('blur', () => closeMenu());
  window.visualViewport?.addEventListener('resize', () => closeMenu());
  window.addEventListener('beforeprint', () => closeMenu());
  updateAvailability();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installContextMenu, { once: true });
  else installContextMenu();
}
