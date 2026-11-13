import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../stars.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
class Element {
  constructor() {
    this.hidden = true; this.handlers = new Map(); this.attrs = new Map(); this.children = [];
    this.paused = true; this.controls = false; this.playCalls = 0; this.currentTime = 0; this.ended = false;
    this.dataset = {}; this.style = { setProperty() {} }; this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name), remove: name => this.classes.delete(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name)
    };
  }
  addEventListener(event, callback) { this.handlers.set(event, callback); }
  emit(event) { return this.handlers.get(event)?.({target:this}); }
  setAttribute(key, value) { this.attrs.set(key, value); }
  getAttribute(key) { return this.attrs.get(key) ?? (key==='src' ? this.src : null); }
  removeAttribute(key) { this.attrs.delete(key); if(key==='src') this.src=''; }
  querySelector() { return this.status ??= new Element(); }
  appendChild(element) { this.children.push(element); }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
  pause() { const changed = !this.paused; this.paused = true; if(changed)this.emit('pause'); }
  play() {
    this.playCalls++;
    if(this.playImpl)return this.playImpl();
    this.paused = false; this.ended = false; this.emit('play');
    if(!this.paused)this.emit('playing');
    return Promise.resolve();
  }
  load() { this.paused=true; this.currentTime=0; this.ended=false; }
  focus() { this.focused=true; }
}
function setup(testMode, storageUnavailable = false) {
  const elements = new Map();
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, new Element());
  const dots = Array.from({length:7},()=>new Element());
  const mapNote = new Element();
  const data = new Map([['another-project', 'keep-me'], ['alfir-birthday-gifts-v1', 'old-envelope-progress']]);
  const timers = new Map(); let timerId=0;
  const context = {
    document: {
      getElementById: id => { assert.ok(elements.has(id), 'Missing HTML node '+id); return elements.get(id); },
      createElement: () => new Element(),
      querySelectorAll: () => dots,
      querySelector: selector => { assert.equal(selector,'.map-note'); return mapNote; },
      body:new Element()
    },
    localStorage: {
      getItem:key=>{if(storageUnavailable)throw Error('Storage unavailable');return data.get(key)||null;},
      setItem:(key,value)=>{if(storageUnavailable)throw Error('Storage unavailable');data.set(key,value);}
    },
    window:{location:{search:testMode?'?test=1':''},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)}, URLSearchParams
  };
  vm.runInNewContext(script,context);
  const get=id=>elements.get(id);
  const cards=get('gift-grid').children;
  return {get,cards,data,timers};
}
async function run(testMode, storageUnavailable = false) {
  const {get,cards,data,timers}=setup(testMode,storageUnavailable);
  const files=['artem','ildar','parents','rinat','marat','natasha','from-wife'];
  assert.equal(cards.length,7);
  assert.equal(get('test-tools').hidden,!testMode);
  assert.ok(!get('birthday-video').src,'No eager video source');
  for(let i=0;i<cards.length;i++) {
    cards[i].emit('click');
    assert.equal(get('birthday-video').src.split('?')[0],`media/${files[i]}.mp4`);
    assert.equal(get('video-dialog').open,true);
    assert.equal(get('birthday-video').controls,false,'Native controls hidden before explicit play');
    assert.equal(get('play-video').hidden,false,'Large play button visible on open');
    assert.equal(get('play-video').focused,true,'Keyboard focus moves to the play button');
    const calls=get('birthday-video').playCalls;
    get('birthday-video').emit('loadedmetadata');
    assert.equal(get('birthday-video').playCalls,calls,'Loading metadata does not start playback');
    assert.equal(get('birthday-video').paused,true);
    await get('play-video').emit('click');
    assert.equal(get('birthday-video').controls,true);
    assert.equal(get('play-video').hidden,true);
    assert.equal(timers.size,0,'Loading timer cleared after playback begins');
    get('birthday-video').ended=true;
    get('birthday-video').paused=true;
    get('birthday-video').emit('ended');
    assert.equal(get('play-video').hidden,false,'Replay button visible after completion');
    assert.equal(get('birthday-video').controls,true,'Native controls remain available at the end, including fullscreen replay');
    if(i===0) {
      await get('birthday-video').play();
      assert.equal(get('birthday-video').paused,false,'Native replay is allowed after the first explicit start');
      assert.equal(get('play-video').hidden,true,'Replay removes the overlay');
      get('birthday-video').ended=true;
      get('birthday-video').paused=true;
      get('birthday-video').emit('ended');
    }
    assert.equal(get('progress-text').textContent,`Зажглось ${i+1} из 7 звёзд`);
    get('close-video').emit('click');
    assert.equal(get('birthday-video').src,'','Closing the dialog unloads the video');
    assert.equal(timers.size,0,'Closing cancels pending timers');
    assert.equal(cards[i].focused,true,'Closing restores focus to its star');
  }
  assert.ok(get('sky-map').classes.has('is-complete'));
  assert.equal(get('all-watched').hidden,false);
  if(testMode) {
    get('reset-gifts').emit('click');
    assert.equal(get('progress-text').textContent,'Зажглось 0 из 7 звёзд');
    assert.ok(!get('sky-map').classes.has('is-complete'));
    assert.equal(get('all-watched').hidden,true);
    for(const card of cards) assert.ok(!card.classes.has('is-watched'));
    if(!storageUnavailable) assert.deepEqual(JSON.parse(data.get('alfir-birthday-stars-v1')),{opened:[],watched:[]});
  }
  assert.equal(data.get('another-project'),'keep-me');
  assert.equal(data.get('alfir-birthday-gifts-v1'),'old-envelope-progress');
}
await run(true); await run(false); await run(true,true);

{
  const {get,cards}=setup(true);
  cards[0].emit('click');
  await get('birthday-video').play();
  assert.equal(get('birthday-video').paused,true,'Unrequested autoplay is stopped');
  assert.equal(get('play-video').hidden,false);
  assert.equal(get('progress-text').textContent,'Зажглось 0 из 7 звёзд');
  get('birthday-video').emit('ended');
  assert.equal(get('progress-text').textContent,'Зажглось 0 из 7 звёзд','Unrequested end events cannot count a greeting as watched');
}
{
  const {get,cards,timers}=setup(true);
  cards[1].emit('click');
  get('birthday-video').playImpl=()=>Promise.reject(new Error('Unsupported video'));
  await get('play-video').emit('click');
  assert.equal(get('video-error').hidden,false,'Rejected playback displays retry');
  assert.ok(get('direct-video').href.includes('ildar.mp4?v=2'));
  assert.equal(timers.size,0);
  get('birthday-video').playImpl=null;
  get('retry-video').emit('click');
  await Promise.resolve();
  assert.equal(get('video-error').hidden,true,'Retry clears previous error');
  assert.equal(get('birthday-video').paused,false,'Retry starts playback after explicit request');
}
{
  const {get,cards}=setup(true);
  cards[0].emit('click');
  let rejectOld;
  get('birthday-video').playImpl=()=>new Promise((resolve,reject)=>{rejectOld=reject;});
  const pending=get('play-video').emit('click');
  cards[1].emit('click');
  rejectOld(new Error('Old source failed'));
  await pending;
  assert.equal(get('video-error').hidden,true,'Old play rejection cannot replace the new source UI');
  assert.equal(get('play-video').hidden,false);
  assert.equal(get('birthday-video').src,'media/ildar.mp4?v=2');
  get('video-dialog').open=false;
  cards[2].emit('click');
  get('video-dialog').emit('close');
  assert.equal(get('birthday-video').src,'media/parents.mp4','Delayed old close event cannot clear a reopened player');
}
{
  const {get,cards,timers}=setup(true);
  cards[0].emit('click');
  get('birthday-video').playImpl=()=>new Promise(()=>{});
  get('play-video').emit('click');
  assert.equal(timers.size,1);
  [...timers.values()][0]();
  assert.equal(get('video-error').hidden,false,'Stalled startup offers retry rather than loading forever');
  assert.equal(get('birthday-video').paused,true);
  assert.equal(timers.size,0);
  get('close-video').emit('click');
  assert.equal(get('play-video').hidden,true);
}
{
  const {get,cards,timers}=setup(true);
  cards[0].emit('click');
  get('birthday-video').playImpl=()=>new Promise(()=>{});
  get('play-video').emit('click');
  const oldTimeout=[...timers.values()][0];
  get('next-video').emit('click');
  oldTimeout();
  assert.equal(get('video-error').hidden,true,'Old timeout cannot show an error over the next greeting');
  assert.equal(get('play-video').hidden,false);
  assert.equal(get('birthday-video').src,'media/ildar.mp4?v=2');
  get('close-video').emit('click');
  get('birthday-video').error={code:3};
  get('birthday-video').emit('error');
  assert.equal(get('video-error').hidden,true,'Late errors after close cannot reopen the error UI');
}
console.log('PASS: seven video routes, explicit play/replay, autoplay prevention, retry, timeout, source-switch and close races, constellation, reset and storage fallback.');
