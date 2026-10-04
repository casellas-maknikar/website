const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../src/context-menu.js'),'utf8');
const interactions=html.slice(html.indexOf('  function inMenus(target)'),html.indexOf("  window.addEventListener('beforeprint'"));

// Exercise the real menu handlers with deterministic focus, pointer, and scroll events.
// Geometry is supplied by this small fixture; these checks do not replace browser layout QA.
function fixture(width=1100) {
  const nodes=new Map(), timers=new Map(), calls=[];
  let timerId=0;
  const emit=(target,type,extra={})=>{
    const event={target,preventDefault(){},stopPropagation(){},composedPath(){return [this.target];},...extra};
    for(const handler of target.listeners?.get(type)||[]) handler(event);
  };
  const document={listeners:new Map(),activeElement:null,
    addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);},
    getElementById(id){return nodes.get(id);},createElement(tag){return new Element(tag);}};
  class Element {
    constructor(tag='div',id='') {
      this.tagName=tag;this.children=[];this.listeners=new Map();this.attributes=new Map();
      this.style={};this.hidden=false;this.inert=false;this.tabIndex=-1;this.isConnected=true;this.scrollTop=0;
      const classes=new Set();
      this.classList={contains:name=>classes.has(name),remove:name=>classes.delete(name),
        toggle:(name,on)=>{if(on??!classes.has(name)) classes.add(name);else classes.delete(name);}};
      this.id=id;
    }
    set id(value){this._id=value;if(value)nodes.set(value,this);} get id(){return this._id;}
    setAttribute(name,value){this.attributes.set(name,String(value));}
    getAttribute(name){return this.attributes.get(name)??null;}
    removeAttribute(name){this.attributes.delete(name);}
    append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
    prepend(child){child.parent=this;this.children.unshift(child);}
    contains(target){return this===target||this.children.some(child=>child.contains(target));}
    closest(selector){let node=this;while(node){if(selector==='.section-items[hidden]'&&node.className==='section-items'&&node.hidden)return node;node=node.parent;}return null;}
    querySelectorAll(){return this.children.flatMap(child=>[...(child.getAttribute('role')==='menuitem'?[child]:[]),...child.querySelectorAll()]);}
    addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
    focus(){let ancestor=this;while(ancestor){if(ancestor.inert||ancestor.hidden)return;ancestor=ancestor.parent;}document.activeElement=this;emit(document,'focusin',{target:this});}
    scrollIntoView(){}
    getBoundingClientRect(){
      const panelWidth=Math.min(320,width-16);
      const left=parseFloat(this.style.left)||8,top=parseFloat(this.style.top)||8;
      if(this.id==='cm-about'){const parent=nodes.get('cm-context-menu').getBoundingClientRect();return {left:parent.left+6,top:parent.top+300-nodes.get('cm-context-menu').scrollTop,width:panelWidth-12,height:38,right:parent.right-6,bottom:parent.top+338};}
      return {left,top,width:panelWidth,height:this.offsetHeight,right:left+panelWidth,bottom:top+this.offsetHeight};
    }
    get offsetHeight(){return this.id==='cm-context-menu'?500:120;}
  }
  const root=new Element('div','cm-context-menu'),submenu=new Element('div','cm-about-submenu');
  root.hidden=submenu.hidden=true;
  const rootItems=new Element('div','cm-menu-items'),subItems=new Element('div','cm-submenu-items');
  const back=new Element('button','cm-submenu-back'),footer=new Element('div','cm-menu-footer');
  root.append(rootItems,footer);submenu.append(back,subItems);
  const page=new Element('div','page'),opener=new Element('button','menu-opener'),outside=new Element('button','outside');
  const about={id:'cm-about',label:'About',section:{label:'About'},children:[
    {id:'cm-about-email',label:'Email address',action:()=>calls.push('email')},
    {id:'cm-about-mailing',label:'Mailing address',action:()=>calls.push('mailing')}
  ]};
  const window={addEventListener(){},visualViewport:null};
  const env={document,window,Node:Element,Element,root,submenu,
    entries:new Map(),panels:new Map([[root,[]],[submenu,[]]]),sectionHeaders:[],
    menuItems:[{id:'cm-other',label:'Other action',section:{label:'Tools'},action:()=>calls.push('cm-other')},about],
    commands:{pending:false},screenCapture:{pending:false},typeahead:{reset(){},find(){return -1;}},
    svg:()=>'',shortcutInfo:()=>({label:'',aria:''}),mac:false,matchesShortcut:()=>false,
    updateSections(){},clearStatus(){},announce(){},restoreSelection(){},snapshotSelection:()=>({text:'Selected page text',ranges:[]}),restorePageSelection(){},focusPage(target){(target||env.returnFocus||opener).focus();},ready:true,ui:id=>nodes.get(id),usesNativeMenu:()=>false,
    navigator:{},performance:{now:()=>1000},dialog:{open:false},
    innerWidth:width,innerHeight:900,customEnabled:true,context:null,generation:0,returnFocus:opener,
    inspectedTarget:outside,nativeDismissTimer:null,leaveTimer:null,lastPointerType:'',keyboardContextAt:-Infinity,normalLabel:'Menu',
    clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++timerId,fn);return timerId;}};
  const api=vm.runInNewContext(interactions+';({openMenu,closeMenu})',env);
  api.openMenu(20,20,page,opener);
  const click=node=>{emit(document,'pointerdown',{target:node,pointerType:'mouse',button:0});node.focus();emit(node,'click');};
  const key=key=>emit(document,'keydown',{key,target:document.activeElement});
  const hover=node=>{emit(node,'pointerenter',{pointerType:'mouse'});emit(node,'pointermove',{pointerType:'mouse'});};
  return {root,submenu,page,opener,outside,nodes,document,calls,emit,click,key,hover,
    open:()=>click(nodes.get('cm-about')),
    flush:()=>{for(let count=0;timers.size&&count<20;count++){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}}};
}

for(const width of [1100,320]) test(`submenu remains open after pointer leaves at width ${width}`,()=>{
  const f=fixture(width);f.open();
  assert.equal(f.document.activeElement.id,'cm-about-email');
  f.emit(f.nodes.get('cm-about'),'pointerleave',{relatedTarget:f.outside});
  f.emit(f.submenu,'pointerleave',{relatedTarget:f.outside});f.flush();
  assert.equal(f.submenu.hidden,false);
  assert.equal(f.document.activeElement.id,'cm-about-email');
  if(width===320){assert.equal(f.root.inert,true);assert.equal(f.root.getAttribute('aria-hidden'),'true');}
});

test('hover cannot open the submenu or steal its focus after explicit opening',()=>{
  const f=fixture();f.hover(f.nodes.get('cm-about'));f.flush();assert.equal(f.submenu.hidden,true);
  f.open();f.hover(f.nodes.get('cm-other'));f.hover(f.nodes.get('cm-section-other'));f.flush();
  assert.equal(f.submenu.hidden,false);assert.equal(f.document.activeElement.id,'cm-about-email');
  f.hover(f.nodes.get('cm-about-mailing'));assert.equal(f.document.activeElement.id,'cm-about-mailing');
});

for(const width of [1100,320]) test(`root scroll keeps the submenu and its current focus at width ${width}`,()=>{
  const f=fixture(width);f.open();f.key('ArrowDown');
  const before=parseFloat(f.submenu.style.top);f.root.scrollTop=20;
  f.emit(f.document,'scroll',{target:f.root});
  assert.equal(f.submenu.hidden,false);assert.equal(f.document.activeElement.id,'cm-about-mailing');
  if(width===1100)assert.equal(parseFloat(f.submenu.style.top),before-20);
  else assert.equal(f.root.inert,true);
});

test('Escape, Left Arrow, and stacked Back deliberately return focus to About',()=>{
  for(const key of ['Escape','ArrowLeft']){const f=fixture();f.open();f.key(key);assert.equal(f.submenu.hidden,true);assert.equal(f.root.hidden,false);assert.equal(f.document.activeElement.id,'cm-about');}
  const f=fixture(320);f.open();f.click(f.nodes.get('cm-submenu-back'));
  assert.equal(f.submenu.hidden,true);assert.equal(f.root.inert,false);assert.equal(f.root.getAttribute('aria-hidden'),null);assert.equal(f.document.activeElement.id,'cm-about');
});

test('contact actions still activate with keyboard and click and restore the opener',()=>{
  for(const key of ['Enter',' ']){const f=fixture();f.open();f.key(key);assert.deepEqual(f.calls,['email']);assert.equal(f.root.hidden,true);assert.equal(f.document.activeElement,f.opener);}
  const f=fixture();f.open();f.click(f.nodes.get('cm-about-mailing'));assert.deepEqual(f.calls,['mailing']);assert.equal(f.root.hidden,true);
});

test('outside click or focus still dismisses both panels',()=>{
  const clicked=fixture();clicked.open();clicked.click(clicked.outside);assert.equal(clicked.root.hidden,true);assert.equal(clicked.submenu.hidden,true);
  const focused=fixture();focused.open();focused.outside.focus();assert.equal(focused.root.hidden,true);assert.equal(focused.submenu.hidden,true);assert.equal(focused.document.activeElement,focused.outside);
});
