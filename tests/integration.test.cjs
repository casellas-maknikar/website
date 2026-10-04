const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../src/context-menu.js'), 'utf8')
  .replace(/export (?=function )/g, '')
  .replace(/import\.meta\.url/g, '"https://assets.example.test/src/context-menu.js"');

// This deliberately small DOM supports initialization and event routing, not layout.
// Parsing the actual injected markup catches broken IDs, classes, and ARIA wiring.
function fixture({ readyState = 'complete', loadCSS = true } = {}) {
  let document;
  class EventTarget {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, callback, options) {
      const list = this.listeners.get(type) || [];
      list.push({ callback, once: !!options?.once }); this.listeners.set(type, list);
    }
    emit(type, values = {}) {
      const event = { target: this, key: '', pointerType: '', button: 2, clientX: 40, clientY: 40,
        shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
        composedPath() { const path = []; for (let node = this.target; node; node = node.parentElement) path.push(node); return path; },
        ...values };
      for (const listener of [...this.listeners.get(type) || []]) {
        listener.callback(event);
        if (listener.once) this.listeners.set(type, this.listeners.get(type).filter(value => value !== listener));
      }
      return event;
    }
  }
  class Element extends EventTarget {
    constructor(tagName) {
      super(); this.tagName = tagName.toUpperCase(); this.children = []; this.attrs = new Map();
      this.style = {}; this.hidden = false; this.inert = false; this.tabIndex = -1;
      this.scrollTop = 0; this.open = false; this.textContent = '';
      this.classList = {
        contains: value => this.className.split(/\s+/).includes(value),
        remove: value => { this.className = this.className.split(/\s+/).filter(name => name !== value).join(' '); },
        toggle: (value, force) => {
          const enable = force ?? !this.classList.contains(value); this.classList.remove(value);
          if (enable) this.className = (this.className + ' ' + value).trim(); return enable;
        },
      };
    }
    get id() { return this.attrs.get('id') || ''; } set id(value) { this.attrs.set('id', value); }
    get className() { return this.attrs.get('class') || ''; } set className(value) { this.attrs.set('class', value); }
    get isConnected() { return !!document?.documentElement.contains(this); }
    get isContentEditable() {
      const own = this.getAttribute('contenteditable');
      return own === null ? !!this.parentElement?.isContentEditable : own !== 'false';
    }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    setAttribute(name, value) { this.attrs.set(name, String(value)); if (name === 'hidden') this.hidden = true; }
    hasAttribute(name) { return name === 'hidden' ? this.hidden : this.attrs.has(name); }
    removeAttribute(name) { this.attrs.delete(name); if (name === 'hidden') this.hidden = false; }
    append(...children) {
      for (const child of children) {
        child.remove(); child.parentElement = this; this.children.push(child);
      }
    }
    prepend(child) { this.append(child); this.children.unshift(this.children.pop()); }
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      this.parentElement = null;
    }
    contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    matches(selector) {
      return selector.split(',').some(part => {
        let value = part.trim();
        let excluded = false;
        value = value.replace(/:not\(([^)]+)\)/g, (_, inner) => { excluded ||= this.matches(inner); return ''; });
        if (excluded) return false;
        const tag = value.match(/^[\w-]+/)?.[0];
        if (tag && tag.toUpperCase() !== this.tagName) return false;
        const id = value.match(/#([\w-]+)/)?.[1]; if (id && this.id !== id) return false;
        for (const [, name] of value.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
        for (const [, name, expected] of value.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
          if (!this.hasAttribute(name) || (expected !== undefined && this.getAttribute(name) !== expected)) return false;
        }
        return true;
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) {
      return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    set innerHTML(markup) {
      for (const child of this.children) child.parentElement = null;
      this.children = []; const stack = [this];
      for (const match of markup.matchAll(/<\/?([\w-]+)\b([^>]*)>/g)) {
        if (match[0].startsWith('</')) { stack.pop(); continue; }
        const node = new Element(match[1]);
        for (const [, name, quoted, single, unquoted] of match[2].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/g))
          node.setAttribute(name, quoted ?? single ?? unquoted ?? '');
        stack.at(-1).append(node);
        if (!match[0].endsWith('/>') && !['INPUT', 'IMG', 'BR', 'HR', 'LINK', 'META'].includes(node.tagName)) stack.push(node);
      }
    }
    get outerHTML() { return `<${this.tagName.toLowerCase()}></${this.tagName.toLowerCase()}>`; }
    focus() {
      for (let node = this; node; node = node.parentElement) if (node.hidden || node.inert) return;
      document.activeElement = this; document.emit('focusin', { target: this });
    }
    scrollIntoView() {}
    getBoundingClientRect() { return { left: 10, top: 10, right: 330, bottom: 510, width: 320, height: 500 }; }
    get offsetHeight() { return 500; }
  }
  document = new EventTarget();
  document.readyState = readyState;
  document.documentElement = new Element('html');
  document.head = new Element('head'); document.body = new Element('body');
  document.documentElement.append(document.head, document.body);
  document.createElement = tag => new Element(tag);
  document.getElementById = id => document.documentElement.querySelector('#' + id);
  document.activeElement = document.body;
  const page = new Element('main'); page.id = 'company-content'; document.body.append(page);
  const window = new EventTarget(); window.visualViewport = new EventTarget();
  window.getSelection = () => ({ rangeCount: 0, isCollapsed: true });
  const timers = new Map(); let nextTimer = 0;
  const env = { document, window, Node: Element, Element, URL,
    navigator: { platform: 'Win32', clipboard: { writeText: async () => {} } },
    history: { length: 1 }, location: { href: 'https://example.test/', protocol: 'https:' },
    performance: { now: () => 1000 }, innerWidth: 1100, innerHeight: 900,
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { timers.set(++nextTimer, fn); return nextTimer; }, cancelAnimationFrame: id => timers.delete(id) };
  const api = vm.runInNewContext(source + ';({installContextMenu, usesNativeMenu})', env);
  const css = () => document.head.children.find(node => node.tagName === 'LINK');
  if (loadCSS) css()?.emit('load');
  return { document, window, api, page, css, Element,
    root: () => document.getElementById('cm-context-menu'), host: () => document.getElementById('cm-menu-host'),
    node(tag, attrs = {}) { const node = new Element(tag); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value)); page.append(node); return node; },
    context(target = page, extra = {}) { return document.emit('contextmenu', { target, ...extra }); },
    key(target = page, extra = {}) { document.activeElement = target; return document.emit('keydown', { target, key: 'ContextMenu', ...extra }); } };
}

test('full module mounts one hidden menu shell and retains existing page content', () => {
  const f = fixture();
  assert.equal(f.document.body.children[0], f.page);
  assert.equal(f.host().hidden, false);
  assert.equal(f.root().hidden, true);
  assert.equal(f.css().href, 'https://assets.example.test/src/context-menu.css');
  assert.equal(f.document.getElementById('cm-about-email').getAttribute('aria-label'), 'Email address');
  assert.equal(f.document.getElementById('cm-about-mailing').getAttribute('aria-label'), 'Mailing address');
  assert.equal(f.document.getElementById('cm-copy').getAttribute('aria-disabled'), 'true');
});

test('injected classes, status roles, and ARIA references agree with the stylesheet and shell', () => {
  const f = fixture();
  for (const [id, className] of [['cm-menu-footer', 'menu-footer'], ['cm-status', 'status'], ['cm-tool-dialog', 'tool-dialog'], ['cm-tool-code', 'tool-code']])
    assert.equal(f.document.getElementById(id).className, className);
  assert.equal(f.document.getElementById('cm-feedback-announcement').getAttribute('role'), 'status');
  assert.equal(f.document.getElementById('cm-tool-status').getAttribute('role'), 'status');
  for (const node of [f.host(), ...f.host().querySelectorAll('*')]) {
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls'])
      for (const id of (node.getAttribute(attribute) || '').split(/\s+/).filter(Boolean))
        assert.ok(f.document.getElementById(id), `${node.id} ${attribute} references ${id}`);
  }
});

test('duplicate installation adds neither a host nor event handlers nor stylesheet links', () => {
  const f = fixture();
  const counts = () => [...f.document.listeners].map(([type, list]) => [type, list.length]);
  const before = counts(); f.api.installContextMenu();
  assert.equal(f.document.body.querySelectorAll('#cm-menu-host').length, 1);
  assert.equal(f.document.head.children.length, 1);
  assert.deepEqual(counts(), before);
});

test('loading documents install on DOMContentLoaded without touching the page early', () => {
  const f = fixture({ readyState: 'loading' });
  assert.equal(f.host(), null); assert.equal(f.css(), undefined);
  f.document.emit('DOMContentLoaded');
  assert.ok(f.host()); assert.ok(f.css());
  assert.equal(f.document.listeners.get('DOMContentLoaded').length, 0);
});

test('unloaded or failed CSS leaves native pointer and keyboard menus available', () => {
  const f = fixture({ loadCSS: false });
  for (const state of ['pending', 'error']) {
    if (state === 'error') f.css().emit('error');
    assert.equal(f.context().defaultPrevented, false);
    assert.equal(f.key().defaultPrevented, false);
    assert.equal(f.host().hidden, true);
    assert.equal(f.root().hidden, true);
  }
});

test('ordinary page pointer and keyboard invocations open the custom menu after CSS loads', () => {
  for (const method of ['context', 'key']) {
    const f = fixture(); assert.equal(f[method]().defaultPrevented, true);
    assert.equal(f.root().hidden, false);
    assert.ok(f.root().contains(f.document.activeElement));
  }
});

test('interactive controls, links, media, editable regions, dialogs, and opt-outs retain native menus', () => {
  const f = fixture();
  const cases = [
    ...['input', 'textarea', 'select', 'option', 'button', 'img', 'picture', 'video', 'audio', 'canvas', 'iframe', 'object', 'embed', 'dialog'].map(tag => [tag, {}]),
    ['a', { href: '/contact' }], ['div', { role: 'dialog' }], ['div', { contenteditable: '' }],
    ['div', { contenteditable: 'true' }], ['div', { contenteditable: 'plaintext-only' }], ['div', { 'data-native-context-menu': '' }],
  ];
  for (const [tag, attrs] of cases) {
    const node = f.node(tag, attrs), child = new f.Element('span'); node.append(child);
    for (const target of [node, child]) {
      assert.equal(f.api.usesNativeMenu(target), true, `${tag} should use native menu`);
      assert.equal(f.context(target).defaultPrevented, false, `${tag} pointer menu`);
      assert.equal(f.key(target).defaultPrevented, false, `${tag} keyboard menu`);
      assert.equal(f.root().hidden, true);
    }
  }
  assert.equal(f.api.usesNativeMenu(f.node('div', { contenteditable: 'false' })), false);
  assert.equal(f.api.usesNativeMenu(f.node('a')), false);
});

test('default-prevented events, Shift-right-click, touch, and open dialogs are left alone', () => {
  for (const extra of [{ defaultPrevented: true }, { shiftKey: true }, { pointerType: 'touch' }, { sourceCapabilities: { firesTouchEvents: true } }]) {
    const f = fixture(); const event = f.context(f.page, extra);
    assert.equal(event.defaultPrevented, !!extra.defaultPrevented);
    assert.equal(f.root().hidden, true);
  }
  const f = fixture();
  f.document.emit('pointerdown', { target: f.page, pointerType: 'touch' });
  assert.equal(f.context().defaultPrevented, false);
  f.document.getElementById('cm-tool-dialog').open = true;
  assert.equal(f.context().defaultPrevented, false);
  assert.equal(f.key().defaultPrevented, false);
});

test('keyboard opening works after a touch event while unrelated page shortcuts stay native', () => {
  const f = fixture();
  f.document.emit('pointerdown', { target: f.page, pointerType: 'touch' });
  assert.equal(f.key(f.page, { key: 'c', ctrlKey: true }).defaultPrevented, false);
  assert.equal(f.key(f.page, { key: 'F10', shiftKey: true }).defaultPrevented, true);
  assert.equal(f.root().hidden, false);
});
