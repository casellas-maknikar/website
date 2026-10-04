const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const javascript = readFileSync(join(__dirname, '../src/context-menu.js'), 'utf8');
const source = javascript.split('// BEGIN CODE PRESENTATION')[1].split('\n').slice(1).join('\n').split('// END CODE PRESENTATION')[0].trim();
const engine = vm.runInNewContext(`(${source})`)();
const samples = {
  html: '<main title="a > b &amp; c"><!-- <script>alert(1)</script> --><img src=x onerror="alert(1)"><p>Test &lt;b&gt;</p></main>',
  javascript: 'const text = `template <tag> ${1 + 2}`; // note\nconst quote = "a\\\"b"; return null;',
  css: '.sample { content: "}; <img>"; color: #fff; width: calc(100% - 2px); /* { ; } */ }',
  json: '{"markup":"<script>alert(1)</script>","count":12,"flag":true}'
};
for (const [language, text] of Object.entries(samples)) test(`Original ${language} tokenization preserves every character`, () => {
  const result = engine.present(text, language, false);
  assert.equal(result.text, text);
  assert.equal(result.tokens.map(t => t.text).join(''), text);
});
test('HTML highlights embedded CSS and JavaScript independently', () => {
  const result = engine.present('<style>p { color: red; }</style><script>const answer = 42;</script>', 'html', false);
  assert.ok(result.tokens.some(t => t.type === 'property' && t.text === 'color'));
  assert.ok(result.tokens.some(t => t.type === 'keyword' && t.text === 'const'));
  assert.ok(result.tokens.some(t => t.type === 'number' && t.text === '42'));
});
test('HTML formatting indents nested elements and preserves raw textarea/pre contents', () => {
  const text = '<div><span>hello</span><textarea> a\n  b < c </textarea><pre>x\n y</pre></div>';
  const result = engine.present(text, 'html');
  assert.match(result.text, /\n  <span>\n    hello\n  <\/span>/);
  const raw = engine.markupParts(result.text).filter(p => p.kind === 'raw');
  assert.ok(raw[0].text.includes(' a\n  b < c '));
  assert.ok(raw[1].text.includes('x\n y'));
});
test('CSS formatting respects punctuation inside strings and parentheses', () => {
  const result = engine.present(samples.css, 'css');
  assert.match(result.text, /content: "}; <img>";/);
  assert.match(result.text, /width: calc\(100% - 2px\);/);
  assert.match(result.text, /\n  color: #fff;/);
});
test('long embedded data is abbreviated only in Formatted view', () => {
  const text = '<style>@font-face { src: url(data:font/ttf;base64,' + 'A'.repeat(1000) + '); }</style>';
  assert.ok(engine.present(text, 'html', true).text.includes('data:font/ttf;base64,…'));
  assert.equal(engine.present(text, 'html', false).text, text);
});
test('empty source and incomplete markup remain safe, lossless token sequences', () => {
  for (const text of ['', '<div title="unfinished', '<!-- missing end', '<script>const x = "<svg>";']) {
    const result = engine.present(text, 'html', false);
    assert.equal(result.tokens.map(t => t.text).join(''), text);
  }
});
