const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const javascript=fs.readFileSync(require('node:path').join(__dirname,'../src/context-menu.js'),'utf8');
const source=javascript.split('// BEGIN MENU KEYBOARD')[1].split('// END MENU KEYBOARD')[0];
const api=vm.runInNewContext(source+';({shortcutInfo,matchesShortcut,createMenuKeyboard})');
const event=(key,extra={})=>({key,code:'',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...extra});
test('shortcut labels and ARIA distinguish Windows and Mac modifiers',()=>{
  assert.equal(api.shortcutInfo('Primary+c',false).label,'Ctrl+C');
  assert.equal(api.shortcutInfo('Primary+c',false).aria,'Control+C');
  assert.equal(api.shortcutInfo('Primary+c',true).label,'⌘C');
  assert.equal(api.shortcutInfo('Primary+c',true).aria,'Meta+C');
  assert.equal(api.shortcutInfo('Shift+Digit2',false).aria,'Shift+2');
});
test('primary modifier matches only the intended platform and exact combination',()=>{
  assert.equal(api.matchesShortcut(event('c',{ctrlKey:true}),'Primary+c',false),true);
  assert.equal(api.matchesShortcut(event('c',{metaKey:true}),'Primary+c',true),true);
  assert.equal(api.matchesShortcut(event('c',{ctrlKey:true}),'Primary+c',true),false);
  assert.equal(api.matchesShortcut(event('C',{ctrlKey:true,shiftKey:true}),'Primary+c',false),false);
});
test('shifted digit shortcuts use key codes despite punctuation in event.key',()=>{
  assert.equal(api.matchesShortcut(event('@',{code:'Digit2',shiftKey:true}),'Shift+Digit2',false),true);
  assert.equal(api.matchesShortcut(event('2',{code:'Digit2'}),'Shift+Digit2',false),false);
});
test('repeat, composition and AltGraph do not activate commands',()=>{
  for(const extra of [{repeat:true},{isComposing:true},{getModifierState:()=>true}])
    assert.equal(api.matchesShortcut(event('c',{ctrlKey:true,...extra}),'Primary+c',false),false);
});
test('typeahead wraps and repeated letters cycle without activation',()=>{
  const nav=api.createMenuKeyboard(), labels=['Demo','Sample one','Sample two','Cut'];
  assert.equal(nav.find(labels,0,'s',0),1);
  assert.equal(nav.find(labels,1,'s',100),2);
  assert.equal(nav.find(labels,2,'s',200),1);
});
test('multi-letter typeahead narrows within its timeout',()=>{
  const nav=api.createMenuKeyboard(), labels=['Demo','Cut','Copy','Copy page URL'];
  assert.equal(nav.find(labels,0,'c',0),1);
  assert.equal(nav.find(labels,1,'o',100),2);
  assert.equal(nav.find(labels,2,'p',200),2);
  assert.equal(nav.find(labels,2,'d',1000),0);
});
test('typeahead reset and failed prefixes recover cleanly',()=>{
  const nav=api.createMenuKeyboard(), labels=['Demo','Copy','Paste'];
  nav.find(labels,0,'c',0); nav.reset();
  assert.equal(nav.find(labels,1,'p',1),2);
  assert.equal(nav.find(labels,2,'z',2),-1);
  assert.equal(nav.find(labels,2,'d',3),0);
});
test('typeahead searches only supplied visible panel items',()=>{
  const nav=api.createMenuKeyboard();
  assert.equal(nav.find(['Demo actions','Navigation','Page tools'],0,'c',0),-1);
  assert.equal(nav.find([],0,'s',1000),-1);
});
