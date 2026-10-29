'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const plugin=process.env.MN_READING_TEST_ROOT || path.join(__dirname,'../plugin/src');
const source=fs.readFileSync(path.join(plugin,'main.js'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(plugin,'mnaddon.json')));
assert.equal(manifest.addonid,'marginnote.extension.mnreadingscene');assert.equal(manifest.immersiveOnly,true);
assert.doesNotMatch(source,/ProcessNewExcerpt|KnowledgeBaseTemplate|KnowledgeBaseConfig|MNKnowledgeBaseInstance|Dynamic/);
let Type,mode='broad',allowed=true,notebook='book',selected,sequence=0,wrappedSelection=false;
const notes={a:{noteId:'a',notebookId:'book',noteTitle:'目标卡'},b:{noteId:'b',notebookId:'book'},other:{noteId:'other',notebookId:'other-book'}};
selected=notes.a;
const posts=[],menus=[],choices=[],timers=new Map(),huds=[],observers=[],removed=[];
const context={console,Promise,
 Application:{sharedInstance:()=>({studyController:()=>({notebookController:{notebookId:notebook,focusNote:wrappedSelection?undefined:selected,mindmapView:{selViewLst:selected?[{note:wrappedSelection?{note:selected}:selected}]:[]}}}),showHUD:message=>huds.push(message)}),immersiveTemplateForAddon:id=>{assert.equal(id,manifest.addonid);return {allowed,config:{scene:mode}};}},
 Database:{sharedInstance:()=>({getNoteById:id=>notes[id]})},
 NSNotificationCenter:{defaultCenter:()=>({postNotificationNameObjectUserInfo:(name,object,userInfo)=>posts.push({name,userInfo}),addObserverSelectorName:(owner,selector,name)=>observers.push({owner,selector,name}),removeObserverName:(owner,name)=>removed.push({owner,name})})},
 MNUtil:{userSelect:(heading,detail,items)=>{menus.push({heading,detail,items});return Promise.resolve(choices.shift() || 0);}},
 setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
 JSB:{require:name=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../plugin/src',name+'.js'),'utf8'),context),defineClass:(name,methods)=>{assert.equal(name,'MNReadingScene : JSExtension');Type=function(){};Object.assign(Type.prototype,methods);return Type;}}
};
vm.createContext(context);vm.runInContext(source,context);context.JSB.newAddon();
function invoke(owner,method,...args){context.self=owner;return owner[method](...args);}
function owner(){const o=new Type();o.window={};invoke(o,'sceneWillConnect');return o;}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function request(){const p=posts.at(-1);assert.equal(p.name,'MNKBResearchCommand');return JSON.parse(p.userInfo.json);}
function result(o,body={},override={}){const r=request();invoke(o,'onReadingResult',{userInfo:{window:o.window,json:JSON.stringify({version:1,requestId:r.requestId,ok:true,result:body,...override})}});}
(async()=>{
 const o=owner(),other=owner();assert.equal(observers.filter(x=>x.owner===o).length,3);assert.equal(observers[0].selector,'onReadingResult:');
 let commands=invoke(o,'queryCardCommandsForNote','a');assert.equal(commands.length,6);assert.equal(invoke(o,'queryCardCommandsForNote','other').length,0);
 for(const command of commands)assert.equal(typeof o[command.id],'function');
 let status=invoke(o,'queryAddonCommandStatus');assert.equal(status.selector,'openReading:');assert.equal(typeof o.openReading,'function');
 mode='intensive';invoke(o,'queryAddonCommandStatus');assert.equal(request().command,'getState','Changing the visible scene must synchronize Core before another excerpt');result(o);
 mode='broad';invoke(o,'queryAddonCommandStatus');assert.equal(request().command,'getState');result(o);
 const observedPosts=posts.length;invoke(o,'queryAddonCommandStatus');assert.equal(posts.length,observedPosts,'Repeated status queries in the same scene must not flood Core');

 assert.equal(invoke(o,'runCardCommandForNote','missing','a'),false);
 wrappedSelection=true;assert.equal(o.selectedInternal(),notes.a,'Native selected views can wrap the model; resolve the native ID through the database');wrappedSelection=false;

 selected=undefined;let count=posts.length;await invoke(o,'readingMakeCard');assert.equal(posts.length,count);assert.match(huds.at(-1),/先.*选中/);selected=notes.a;
 let work=invoke(o,'readingMakeCard','a');assert.equal(request().command,'makeCard');assert.equal(request().payload.noteId,'a');let pending=request().requestId;
 invoke(o,'onReadingResult',{userInfo:{window:other.window,json:JSON.stringify({version:1,requestId:pending,ok:true,result:{}})}});assert(o.readingPending[pending]);result(o);await work;
 const hudBefore=huds.length;work=invoke(o,'readingAddTemplate','a');assert.equal(request().command,'addTemplate');result(o);await work;assert.equal(huds.length,hudBefore,'Success is silent');
 count=posts.length;choices.push(0);await invoke(o,'readingSetInbox','a');assert.equal(posts.length,count,'Cancelled Inbox setup never writes');
 choices.push(1);work=invoke(o,'readingSetInbox','a');selected=notes.b;await flush();assert.equal(request().command,'setInbox');assert.equal(request().payload.noteId,'a','The confirmation freezes the original card');result(o);await work;
 mode='intensive';commands=invoke(o,'queryCardCommandsForNote','a');result(o);assert.equal(commands.length,6);assert(commands.some(x=>x.id==='readingCreateRequiredKnowledge'));assert(commands.some(x=>x.title==='归类收集'));assert(commands.some(x=>x.title==='结束归类收集'));assert(commands.some(x=>/知识学习/.test(x.title)));
 work=invoke(o,'readingCreateRequiredKnowledge','a');assert.equal(request().command,'createRequiredKnowledge');assert.equal(request().payload.noteId,'a');result(o);await work;assert.equal(huds.length,hudBefore);
 work=invoke(o,'readingSetReceiver','a');assert.equal(request().command,'setReceiver');assert.equal(request().payload.noteId,'a');result(o);await work;
 work=invoke(o,'readingStopReceiver');assert.equal(request().command,'stopReceiver');result(o);await work;
 count=posts.length;await invoke(o,'readingSetInbox','a');assert.equal(posts.length,count);assert.match(huds.at(-1),/Inbox.*自由收集/);
 choices.push(1);work=invoke(o,'openReading');result(o,{receiver:{noteId:'a',title:'命题归类',kind:'classification',available:true,active:false}});await flush();assert.match(menus.at(-1).detail,/等待手动恢复/);assert.equal(request().command,'setReceiver');assert.equal(request().payload.noteId,'a');result(o);await work;
 work=o.requestInternal('makeCard',{noteId:'a'});const rejection=assert.rejects(work,/场景已切换/);mode='broad';result(o);await rejection;
 work=o.requestInternal('getState',{});const stale=assert.rejects(work,/学习集或场景已切换/);notebook='other-book';result(o);await stale;notebook='book';
 work=o.requestInternal('getState',{});const timeout=assert.rejects(work,/未在时限/);pending=request().requestId;const timer=o.readingPending[pending].timer;timers.get(timer).fn();timers.delete(timer);await timeout;
 choices.push(1);work=invoke(o,'openReading');result(o,{receiver:{noteId:'a',title:'旧目标',available:true,active:false}});await flush();assert.match(menus.at(-1).detail,/等待手动恢复/);assert.equal(request().command,'setReceiver');assert.equal(request().payload.noteId,'a');result(o);await work;
 count=posts.length;invoke(o,'readingOpenKnowledgeBase');assert.equal(posts.at(-1).name,'AddonBroadcast');assert.equal(posts.length,count+1);assert.equal(posts.at(-1).userInfo.message,'mnknowledgebase?action=openSearchWebView');
 const copied=[];context.MNUtil.copy=text=>copied.push(text);
 const titleResult=o.nativeTextMenuState.options.execute('titleCaseCopy','1. 2. the basic_properties of operators iii');
 assert.equal(titleResult,'1.2. The Basic Properties of Operators III');assert.deepEqual(copied,[titleResult]);assert.equal(huds.at(-1),titleResult,'HUD must display the exact copied Title Case result');
 work=o.requestInternal('getState',{});const disconnected=assert.rejects(work,/场景已切换/);invoke(o,'sceneDidDisconnect');await disconnected;invoke(other,'sceneDidDisconnect');assert.equal(timers.size,0);assert.equal(removed.length,6);
 allowed=false;assert.equal(invoke(o,'queryAddonCommandStatus'),null);assert.equal(invoke(o,'queryCardCommandsForNote','a').length,0);
 console.log('Reading scene plugin: native selectors, mode commands, focus/window/notebook guards, frozen Inbox confirmation, manual restore, timeout, disconnect and silent success passed');
})().catch(e=>{console.error(e);process.exitCode=1});
