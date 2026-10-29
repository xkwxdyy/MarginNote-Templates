'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pluginRoot = process.env.MN_RESEARCH_TEST_ROOT || path.join(__dirname, '../plugin/src');
const source = fs.readFileSync(path.join(pluginRoot, 'main.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'mnaddon.json'), 'utf8'));
assert.equal(manifest.addonid, 'marginnote.extension.mnresearchscene');
assert.equal(manifest.immersiveOnly, true);
assert.match(manifest.version, /^0\.1\.\d+$/);
assert.equal(manifest.marginnote_version_min, '4.5.0');
assert.ok(fs.readFileSync(path.join(pluginRoot, 'icon.png')).subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
assert.doesNotMatch(source, /ProcessNewExcerpt/);
assert.doesNotMatch(source, /KnowledgeBaseTemplate|KnowledgeBaseNetwork|MNKnowledgeBaseInstance/);
let connectedClass, nowNotebook = 'book-1', allowed = true, sequence = 0, postFailure = false;
const preferences = new Map(), clipboard = {string: ''}, diagnosticConsole = [];
const CLIENT_KEY = 'MNResearchScene_Diagnostics_v1', CORE_KEY = 'MNKB_ResearchDiagnostics_v1';
function clientLogs() { return JSON.parse(preferences.get(CLIENT_KEY) || '[]'); }
const timers = new Map(), posts = [], observers = [], removed = [], hud = [], menus = [], choices = [];
const notes = {'anchor-1': {noteId:'anchor-1', notebookId:'book-1', noteTitle:'课题入口'}, 'other-book': {noteId:'other-book', notebookId:'book-2', noteTitle:'其他学习集'}};
const notification = {
  addObserverSelectorName(owner, selector, name) { observers.push({owner,selector,name}); },
  removeObserverName(owner, name) { removed.push({owner,name}); },
  postNotificationNameObjectUserInfo(name, object, userInfo) { posts.push({name, object, userInfo}); if (postFailure) throw Error('private-native-error-content'); }
};
const app = {studyController() { return {notebookController:{notebookId:nowNotebook, focusNote:notes['anchor-1'],mindmapView:{selViewLst:[]}}}; }, showHUD(message) { hud.push(message); }, checkNotifySenderInWindow(sender, window) { return sender.userInfo.window === window; }};
const context = {
  console: {log(...args) { diagnosticConsole.push(args.join(' ')); }, error: console.error}, Promise,
  NSUserDefaults: {standardUserDefaults() { return {objectForKey(key) { return preferences.get(key); }, setObjectForKey(value, key) { preferences.set(key, value); }}; }},
  UIPasteboard: {generalPasteboard() { return clipboard; }},
  setTimeout(fn, delay) { const id = ++sequence; timers.set(id,{fn,delay}); return id; }, clearTimeout(id) { timers.delete(id); },
  Application: {sharedInstance() { return app; }, immersiveTemplateForAddon(id) { assert.equal(id,manifest.addonid); return {allowed,config:{scene:allowed?'research':'other'}}; }},
  Database:{sharedInstance() { return {getNoteById(id) { return notes[id] || null; }}; }},
  NSNotificationCenter:{defaultCenter() { return notification; }},
  MNUtil:{userSelect(title,detail,actions) { menus.push({title,detail,actions}); return Promise.resolve(choices.shift() || 0); }},
  JSB:{defineClass(name, instance) { assert.equal(name,'MNResearchScene : JSExtension'); function Addon() {} Object.assign(Addon.prototype,instance); connectedClass=Addon; return Addon; }}
};
vm.createContext(context); vm.runInContext(source, context);
const Addon = context.JSB.newAddon('/plugin');
function owner(name) { const o = new Addon(); o.window={name}; o.window.cycle=o.window; context.self=o; o.sceneWillConnect(); return o; }
function invoke(o, method, ...args) { context.self=o; return o[method](...args); }
function result(o, request, resultValue, options={}) { const body={version:1,coreRevision:'1.87.1',requestId:request.requestId,ok:true,result:resultValue,...options}; invoke(o,'onResearchResult',{userInfo:{window:o.window,json:JSON.stringify(body)}}); }
function lastRequest() { const p=posts.at(-1); assert.equal(p.name,'MNKBResearchCommand'); return JSON.parse(p.userInfo.json); }
const state = {projects:[{projectId:'p-1',title:'紧性课题'}],activeProject:'p-1',receiver:{noteId:'properties',title:'紧空间 → 性质',type:'命题',active:true},sceneActive:true};
(async () => {
  const first=owner('first'), second=owner('second');
  assert.equal(observers.filter(x=>x.owner===first).length,2);
  const beforeQuery=posts.length;
  const commands=invoke(first,'queryCardCommandsForNote','anchor-1');
  assert.equal(commands.length,7);assert(commands.some(x=>x.id==='researchCreateRequiredKnowledge')); assert.equal(posts.length,beforeQuery);
  assert.equal(invoke(first,'queryCardCommandsForNote','other-book').length,0);
  const toolbar=invoke(first,'queryAddonCommandStatus'); assert.equal(toolbar.selector,'openResearch:'); assert.equal(typeof Addon.prototype[toolbar.selector.slice(0,-1)],'function');
  for (const action of commands) assert.ok(action.id && action.title);
  const p=first.requestInternal('getState',{}); const request=lastRequest();
  assert.equal(request.version,1); assert.equal(request.clientVersion,'0.1.3'); assert.equal(request.notebookId,'book-1'); assert.equal('window' in request,false); assert.equal(posts.at(-1).userInfo.window,first.window);
  invoke(first,'onResearchResult',{userInfo:{window:second.window,json:JSON.stringify({version:1,requestId:request.requestId,ok:true,result:state})}});
  assert.ok(first.researchPending[request.requestId]);
  invoke(first,'onResearchResult',{userInfo:{window:first.window,json:'invalid-json'}});
  invoke(first,'onResearchResult',{userInfo:{window:first.window,json:JSON.stringify({version:2,requestId:request.requestId,ok:true,result:state})}});
  assert.ok(first.researchPending[request.requestId]);
  result(first,request,state); assert.equal((await p).activeProject,'p-1'); assert.equal(Object.keys(first.researchPending).length,0); assert.equal(timers.size,0);
  assert.ok(clientLogs().some(entry => entry.stage === 'response-rejected' && entry.reason === 'window-mismatch' && entry.requestId === request.requestId && entry.command === 'getState'));
  assert.ok(clientLogs().some(entry => entry.stage === 'response-rejected' && entry.reason === 'invalid-json'));
  assert.ok(clientLogs().some(entry => entry.stage === 'response-rejected' && entry.reason === 'invalid-envelope'));
  assert.ok(clientLogs().some(entry => entry.stage === 'response-accepted' && entry.responseCoreRevision === '1.87.1'));
  const bridged = first.requestInternal('getState', {}); const bridgedRequest = lastRequest();
  const bridgedJSON = JSON.stringify({version:1,coreRevision:'1.87.1',requestId:bridgedRequest.requestId,ok:true,result:state});
  invoke(first,'onResearchResult',{userInfo() { return {objectForKey(key) { return key === 'window' ? first.window : key === 'json' ? {toString() { return bridgedJSON; }} : undefined; }}; }});
  assert.equal((await bridged).activeProject, 'p-1');
  const coreFailure = first.requestInternal('getState', {}); const coreFailureCheck = assert.rejects(coreFailure,/private-core-failure/);
  result(first,lastRequest(),{}, {ok:false,error:'private-core-failure'}); await coreFailureCheck;
  assert.ok(clientLogs().some(entry => entry.stage === 'response-error' && entry.reason === 'core-operation-failed'));
  postFailure = true; await assert.rejects(first.requestInternal('ping',{}), /private-native-error-content/); postFailure = false;
  assert.ok(clientLogs().some(entry => entry.stage === 'send-error' && entry.reason === 'notification-post-failed'));
  assert.equal(Object.keys(first.researchPending).length, 0);
  allowed=false;
  assert.equal(invoke(first,'queryCardCommandsForNote','anchor-1').length,0); assert.equal(invoke(first,'queryAddonCommandStatus'),null);
  const beforeBlocked=posts.length; await assert.rejects(first.requestInternal('makeCard',{noteId:'anchor-1'}),/科研场景/); assert.equal(posts.length,beforeBlocked);
  const readOutside=first.requestInternal('getState',{}); result(first,lastRequest(),state); await readOutside;
  allowed=true;
  const staticGate = context.Application.immersiveTemplateForAddon;
  context.Application.immersiveTemplateForAddon = () => JSON.stringify({allowed:true,config:JSON.stringify({scene:'research'})});
  assert.equal(invoke(first,'queryCardCommandsForNote','anchor-1').length,7);
  delete context.Application.immersiveTemplateForAddon;
  app.immersiveTemplateForAddon = id => { assert.equal(id,manifest.addonid); return {objectForKey(key) { return key==='allowed'?{boolValue(){return true;}}:key==='config'?{objectForKey(name){return name==='scene'?'research':undefined;}}:undefined; }}; };
  assert.equal(invoke(first,'queryCardCommandsForNote','anchor-1').length,7);
  app.immersiveTemplateForAddon = () => ({allowed:{boolValue:false},config:{scene:'research'}});
  assert.equal(invoke(first,'queryCardCommandsForNote','anchor-1').length,0);
  app.immersiveTemplateForAddon = () => ({allowed:{boolValue(){return true;}},config:{scene:'reading'}});
  assert.equal(invoke(first,'queryCardCommandsForNote','anchor-1').length,0);
  app.immersiveTemplateForAddon = () => 'invalid-json';
  assert.equal(invoke(first,'queryCardCommandsForNote','anchor-1').length,0);
  context.Application.immersiveTemplateForAddon = staticGate;
  delete app.immersiveTemplateForAddon;
  assert.equal(invoke(first,'runCardCommandForNote','unknown','anchor-1'),false);
  assert.equal(invoke(first,'runCardCommandForNote','researchMakeCard','other-book'),false);
  assert.equal(invoke(first,'runCardCommandForNote','researchRegister','anchor-1'),true);
  let actionRequest=lastRequest(); assert.equal(actionRequest.command,'registerProject'); assert.deepEqual(actionRequest.payload,{anchorNoteId:'anchor-1',title:'课题入口'}); result(first,actionRequest,{projectId:'p-1'}); await Promise.resolve();
  const requiredWork=invoke(first,'researchCreateRequiredKnowledge','anchor-1');const requiredRequest=lastRequest();assert.equal(requiredRequest.command,'createRequiredKnowledge');assert.equal(requiredRequest.payload.noteId,'anchor-1');result(first,requiredRequest,state);await requiredWork;
  assert.equal(invoke(first,'runCardCommandForNote','researchAddTemplate','anchor-1'),true);
  actionRequest=lastRequest(); assert.deepEqual(actionRequest.payload,{noteId:'anchor-1'}); result(first,actionRequest,{noteId:'new-classification'}); await Promise.resolve();
  const start=first.runCommandInternal('startProject',{projectId:'p-1'}); actionRequest=lastRequest(); assert.deepEqual(actionRequest.payload,{projectId:'p-1'}); assert.equal('receiver' in actionRequest.payload,false); result(first,actionRequest,{}); await start;
  choices.push(0);
  const menu=invoke(first,'openResearch',null); actionRequest=lastRequest(); result(first,actionRequest,state); await menu;
  assert.match(menus.at(-1).detail,/当前课题：紧性课题/); assert.match(menus.at(-1).detail,/手动接收：紧空间 → 性质/);
  choices.push(0);
  const inactiveMenu=invoke(first,'openResearch',null); actionRequest=lastRequest(); result(first,actionRequest,{...state,receiver:{...state.receiver,active:false}}); await inactiveMenu;
  assert.match(menus.at(-1).detail,/手动接收：无/);
  assert.equal(menus.at(-1).actions.some(action=>action.startsWith('结束手动接收：')),false);
  choices.push(0);
  const pausedMenu=invoke(first,'openResearch',null); actionRequest=lastRequest(); result(first,actionRequest,{...state,receiver:{...state.receiver,active:false,available:true}}); await pausedMenu;
  assert.match(menus.at(-1).detail,/手动接收：紧空间 → 性质（等待手动恢复）/);
  assert.ok(menus.at(-1).actions.includes('恢复上次接收目标'));

  const beforeCardHUD = hud.length;
  const pendingCard=first.runCommandInternal('makeCard',{noteId:'anchor-1'}); actionRequest=lastRequest(); result(first,actionRequest,{cardPending:true,addedToReview:false}); await pendingCard;
  assert.equal(hud.length,beforeCardHUD,'pending definition card making must remain silent');
  const finishedCard=first.runCommandInternal('makeCard',{noteId:'anchor-1'}); actionRequest=lastRequest(); result(first,actionRequest,{cardPending:false,addedToReview:false}); await finishedCard;
  assert.equal(hud.length,beforeCardHUD,'successful card making must remain silent');
  const failedCard = invoke(first,'researchMakeCard','anchor-1'); actionRequest=lastRequest(); result(first,actionRequest,{}, {ok:false,error:'fixture-card-making-failed'}); await failedCard;
  assert.equal(hud.length,beforeCardHUD+1); assert.match(hud.at(-1),/fixture-card-making-failed/,'card making errors still show HUD');
  const menuPosts=posts.length; invoke(first,'onResearchNote',{userInfo:{window:first.window,note:notes['anchor-1']}}); assert.equal(posts.length,menuPosts); assert.equal(first.researchSelection,'anchor-1');
  const stale=first.requestInternal('getState',{}); const staleCheck=assert.rejects(stale,/学习集已切换/); actionRequest=lastRequest(); nowNotebook='book-2'; result(first,actionRequest,state); await staleCheck; nowNotebook='book-1';
  const expired=first.requestInternal('ping',{}); const timeoutCheck=assert.rejects(expired,/未在时限/); actionRequest=lastRequest(); const timer=first.researchPending[actionRequest.requestId].timer; timers.get(timer).fn(); timers.delete(timer); await timeoutCheck; assert.equal(Object.keys(first.researchPending).length,0);
  assert.ok(clientLogs().some(entry => entry.stage === 'timeout' && entry.command === 'ping'));
  choices.push(1);
  const offlineMenu = invoke(first, 'openResearch', null); actionRequest = lastRequest();
  const offlineTimer = first.researchPending[actionRequest.requestId].timer;
  timers.get(offlineTimer).fn(); timers.delete(offlineTimer);
  const offlineResult = await offlineMenu;
  assert.equal(offlineResult.ok, false); assert.equal(offlineResult.diagnosticsCopied, true);
  assert.equal(menus.at(-1).title, '科研连接失败'); assert.match(menus.at(-1).detail,/未在时限内返回结果/);
  let copied = JSON.parse(clipboard.string);
  assert.equal(copied.clientVersion, '0.1.3'); assert.equal(copied.core.message,'未发现日志');
  assert.ok(copied.client.entries.some(entry => entry.stage === 'timeout'));
  assert.doesNotMatch(clipboard.string,/anchor-1|课题入口|紧性课题|紧空间|private-core-failure|private-native-error-content/);
  preferences.set(CORE_KEY, JSON.stringify([{at:'2026-10-22T00:00:00.000Z',side:'core',version:'1.87.1',stage:'observer-ready'}]));
  first.copyDiagnosticsInternal(); copied = JSON.parse(clipboard.string);
  assert.equal(copied.core.message,'已读取日志'); assert.equal(copied.core.entries[0].stage,'observer-ready');
  preferences.set(CORE_KEY, 'broken'); first.copyDiagnosticsInternal(); copied = JSON.parse(clipboard.string);
  assert.equal(copied.core.message, '日志无法读取');
  const beforeCopyHUD = hud.length;
  choices.push(7);
  const copyFromSuccess = invoke(first, 'openResearch', null); actionRequest = lastRequest(); result(first,actionRequest,state); await copyFromSuccess;
  assert.equal(menus.at(-1).actions.at(-1), '复制通信日志'); assert.equal(hud.length,beforeCopyHUD,'successful diagnostic copying must remain silent');
  for (let index=0; index<100; index++) invoke(first,'onResearchResult',{});
  assert.equal(clientLogs().length, 80);
  assert.ok(clientLogs().every(entry => entry.version === '0.1.3' && entry.side === 'client'));
  assert.doesNotMatch(JSON.stringify(clientLogs()),/noteId|notebookId|anchor-1|课题入口/);
  assert.ok(diagnosticConsole.some(line => line.startsWith('[MN ResearchScene] ')));
  const pending=first.requestInternal('getState',{}); const disconnectCheck=assert.rejects(pending,/学习集已切换/); invoke(first,'sceneDidDisconnect'); await disconnectCheck; assert.equal(Object.keys(first.researchPending).length,0); assert.equal(timers.size,0); assert.equal(removed.filter(x=>x.owner===first).length,2);
  invoke(second,'sceneDidDisconnect');
  console.log('MN Research plugin checks passed: manifest/icon, native command registration, scene gating, notification window/request isolation, result validation, payloads, no excerpt handler, timeout/disconnect cleanup, bounded redacted diagnostics, native NSDictionary/NSString responses, and clipboard access after connection failure.');
})().catch(error=>{console.error(error);process.exitCode=1;});
