const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const css = readFileSync(join(__dirname, '../src/context-menu.css'), 'utf8');

function luminance(hex) {
  const channels = hex.match(/[a-f0-9]{2}/gi)
    .map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function contrast(a, b) {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

test('light and dark menu text and keyboard focus meet minimum contrast', () => {
  const palettes = [...css.matchAll(/#cm-menu-host\s*\{([^}]+)\}/g)]
    .filter(match => /--surface:/.test(match[1]))
    .map(match => Object.fromEntries([...match[1].matchAll(/--([\w-]+):\s*(#[\da-f]{3,6})/gi)]
      .map(([, name, hex]) => [name, hex.length === 4 ? '#' + [...hex.slice(1)].map(value => value + value).join('') : hex])));
  assert.equal(palettes.length, 2, 'both light and dark palettes must be tested');
  for (const palette of palettes) {
    for (const key of ['surface', 'ink', 'muted', 'hover', 'focus']) {
      assert.match(palette[key], /^#[\da-f]{6}$/i, `palette must define ${key}`);
    }
    for (const background of [palette.surface, palette.hover]) {
      for (const foreground of [palette.ink, palette.muted]) {
        assert.ok(contrast(foreground, background) >= 4.5, `${foreground} text on ${background}`);
      }
      assert.ok(contrast(palette.focus, background) >= 3, `${palette.focus} focus outline on ${background}`);
    }
  }
});
