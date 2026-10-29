/* Scene UI only. MNKB Core remains the sole excerpt processor and card writer. */
JSB.newAddon = function () {
  'use strict';
  JSB.require('NativeTextMenu');
  JSB.require('TitleCase');
  var ID = 'marginnote.extension.mnreadingscene', REQUEST = 'MNKBResearchCommand', RESULT = 'MNKBResearchResult';
  var APP = Application.sharedInstance(), DB = Database.sharedInstance();
  function value(object, key) { if (!object) return undefined; try { if (object[key] !== undefined) return typeof object[key] === 'function' ? object[key]() : object[key]; } catch (_) {} try { return object.objectForKey(key); } catch (_) {} }
  function bool(input) { if (input == null || input === false || input === 0 || input === 'false' || input === '0') return false; try { if (typeof input.boolValue === 'function') return !!input.boolValue(); if (input.boolValue !== undefined) return !!input.boolValue; } catch (_) {} return !!input; }
  function scene() { try { var snapshot = typeof Application.immersiveTemplateForAddon === 'function' ? Application.immersiveTemplateForAddon(ID) : APP.immersiveTemplateForAddon(ID); if (typeof snapshot === 'string') snapshot = JSON.parse(snapshot); var config = value(snapshot, 'config'); if (typeof config === 'string') config = JSON.parse(config); var mode = String(value(config, 'scene') || ''); return bool(value(snapshot, 'allowed')) && ['broad', 'intensive'].indexOf(mode) >= 0 ? mode : ''; } catch (_) { return ''; } }
  function nc(owner) { var study = APP.studyController(owner.window); return study && study.notebookController; }
  function book(owner) { return String((nc(owner) || {}).notebookId || ''); }
  function center() { return NSNotificationCenter.defaultCenter(); }
  function later(ms, fn) { return typeof setTimeout === 'function' ? setTimeout(fn, ms) : NSTimer.scheduledTimerWithTimeInterval(ms / 1000, false, fn); }
  function cancel(timer) { if (timer && typeof timer.invalidate === 'function') timer.invalidate(); else if (typeof clearTimeout === 'function') clearTimeout(timer); }
  function fail(owner, error) { try { APP.showHUD(String(error && error.message || error), owner.window, 2); } catch (_) {} }
  function select(heading, detail, items) { return MNUtil.userSelect(heading, detail, items); }
  // The shared Core can otherwise miss a template change until the next write.
  function observeScene(owner) {
    var mode=scene();
    if(mode && owner.readingConnected && owner.readingObservedScene!==mode) {
      owner.readingObservedScene=mode;
      Reading.prototype.requestInternal.call(owner,'getState',{}).catch(function(){});
    }
    return mode;
  }
  function textMenuContext(owner) {
    if(typeof MNUtil==='undefined' || owner.window!==MNUtil.currentWindow || !scene())return {enabled:false};
    var snapshot=typeof Application.immersiveTemplateForAddon==='function'?Application.immersiveTemplateForAddon(ID):APP.immersiveTemplateForAddon(ID);
    if(typeof snapshot==='string')snapshot=JSON.parse(snapshot);
    var config=value(snapshot,'config');if(typeof config==='string')config=JSON.parse(config);
    var options=value(config,'nativeTextMenu');
    return {enabled:!!options && bool(value(options,'enabled')),config:options || {},notebookId:book(owner),documentId:String(MNUtil.currentDocMd5 || '')};
  }
  function commands() {
    var mode = scene(); if (!mode) return [];
    var items = [
      {id:'readingMakeCard', title: mode === 'intensive' ? '制卡（按知识学习规则复习）' : '制卡（不自动复习）', command:'makeCard'},
      {id:'readingAddTemplate', title:'增加模板', command:'addTemplate'},
      {id:'readingOpenKnowledgeBase', title:'打开知识库', command:'openKnowledgeBase'}
    ];
    if (mode === 'intensive') items.splice(2, 0, {id:'readingCreateRequiredKnowledge', title:'增加所需知识', command:'createRequiredKnowledge'});
    items.push({id:'readingSetReceiver',title:mode==='intensive'?'归类收集':'设为接收目标',command:'setReceiver'}, {id:'readingStopReceiver',title:mode==='intensive'?'结束归类收集':'结束接收',command:'stopReceiver'});
    if (mode === 'broad') items.push({id:'readingSetInbox',title:'设为自由收集 Inbox',command:'setInbox'});
    return items;
  }
  function action(owner, command, param) { try { return Promise.resolve(Reading.prototype.actionInternal.call(owner, command, param)).catch(function(e) { fail(owner,e); }); } catch(e) { fail(owner,e); return Promise.resolve(); } }
  var Reading = JSB.defineClass('MNReadingScene : JSExtension', {
    sceneWillConnect:function() { try { Reading.prototype.connectInternal.call(self); } catch(e) { fail(self,e); } },
    sceneDidDisconnect:function() { try { Reading.prototype.clearInternal.call(self); self.readingConnected=false; center().removeObserverName(self,RESULT);center().removeObserverName(self,'PopupMenuOnSelection');center().removeObserverName(self,'ClosePopupMenuOnSelection'); } catch(e) { fail(self,e); } },
    notebookWillOpen:function() { try { Reading.prototype.clearInternal.call(self); } catch(e) { fail(self,e); } },
    notebookWillClose:function() { try { Reading.prototype.clearInternal.call(self); } catch(e) { fail(self,e); } },
    queryAddonCommandStatus:function() { NativeTextMenu.reconcile(self); return observeScene(self) ? {image:'icon.png',object:self,selector:'openReading:',checked:false} : null; },
    queryCardCommandsForNote:function(id) { try { if (!observeScene(self) || !id) return []; Reading.prototype.selectedInternal.call(self,String(id)); return commands().map(function(x) { return {id:x.id,title:x.title}; }); } catch(_) { return []; } },
    runCardCommandForNote:function(id,noteid) { var item=commands().filter(function(x){return x.id===id;})[0]; if (!item || !noteid) return false; try { Reading.prototype.selectedInternal.call(self,String(noteid)); } catch(e) { fail(self,e); return false; } action(self,item.command,String(noteid)); return true; },
    onReadingTextMenuSelection:function(sender) { try { NativeTextMenu.selection(self); } catch(e) { fail(self,e); } },
    onReadingTextMenuClosed:function(sender) { NativeTextMenu.closed(self); },
    readingNativeTextMenuTapped:function(button) { try { return NativeTextMenu.perform(self,button); } catch(e) { fail(self,e); } },
    onReadingResult:function(sender) { try { Reading.prototype.resultInternal.call(self,sender); } catch(e) { fail(self,e); } },
    openReading:function() { var owner=self; return Reading.prototype.menuInternal.call(owner).catch(function(e){fail(owner,e);}); },
    readingMakeCard:function(param) { return action(self,'makeCard',param); },
    readingCreateRequiredKnowledge:function(param) { return action(self,'createRequiredKnowledge',param); },
    readingAddTemplate:function(param) { return action(self,'addTemplate',param); },
    readingSetReceiver:function(param) { return action(self,'setReceiver',param); },
    readingStopReceiver:function() { return action(self,'stopReceiver'); },
    readingSetInbox:function(param) { return action(self,'setInbox',param); },
    readingOpenKnowledgeBase:function() { return action(self,'openKnowledgeBase'); }
  }, {});
  Reading.prototype.connectInternal=function() { var owner=this; if(this.readingConnected)return;this.readingConnected=true;this.readingPending={};this.readingSequence=0;center().addObserverSelectorName(this,'onReadingResult:',RESULT);center().addObserverSelectorName(this,'onReadingTextMenuSelection:','PopupMenuOnSelection');center().addObserverSelectorName(this,'onReadingTextMenuClosed:','ClosePopupMenuOnSelection');NativeTextMenu.attach(this,{selector:'readingNativeTextMenuTapped:',context:function(){return textMenuContext(owner);},text:function(){return MNUtil.selectionText;},delay:function(seconds){return MNUtil.delay(seconds);},error:function(error){fail(owner,error);},execute:function(action,text){if(action!=='titleCaseCopy')throw Error('文本菜单操作未注册');var output=ReadingTitleCase.convert(text);MNUtil.copy(output);APP.showHUD(output,owner.window,2);return output;}}); };
  Reading.prototype.clearInternal=function() { NativeTextMenu.clear(this); var pending=this.readingPending || {}; Object.keys(pending).forEach(function(id){cancel(pending[id].timer);pending[id].reject(Error('学习集或场景已切换，请重新操作'));});this.readingPending={}; };
  Reading.prototype.selectedInternal=function(param) {
    var controller=nc(this), list=controller && controller.mindmapView && controller.mindmapView.selViewLst;
    var id=typeof param==='string' ? param : param && (param.noteId || param.param);
    if (!id && list && list.length>1) throw Error('请选择一张卡片');
    var selected=list && list.length===1 ? list[0].note : controller && controller.focusNote;
    // Mind-map selected views can expose an MNNote wrapper rather than a native model.
    selected=value(selected,'note') || selected;
    if (!id) id=value(selected,'noteId');
    var note=id ? DB.getNoteById(String(id)) : null;
    if (!note || !note.noteId || String(note.notebookId || '')!==book(this)) throw Error('请先在当前学习集中选中一张卡片');
    return note;
  };
  Reading.prototype.requestInternal=function(command,payload) {
    var owner=this, mode=scene(), notebook=book(owner);
    if (!owner.readingConnected || !mode) return Promise.reject(Error('请先切换到自由收集或知识学习场景'));
    if (!notebook) return Promise.reject(Error('请先打开学习集'));
    if (command==='setInbox' && mode!=='broad') return Promise.reject(Error('Inbox 仅适用于自由收集场景'));
    var id='mnreading-'+Date.now()+'-'+(++owner.readingSequence);
    return new Promise(function(resolve,reject){
      var pending={resolve:resolve,reject:reject,book:notebook,scene:mode};
      pending.timer=later(command==='addTemplate'?120000:command==='makeCard'?45000:8000,function(){if(owner.readingPending[id]!==pending)return;delete owner.readingPending[id];reject(Error('MN KnowledgeBase 未在时限内返回结果，请检查核心插件'));});
      owner.readingPending[id]=pending;
      try {center().postNotificationNameObjectUserInfo(REQUEST,null,{window:owner.window,json:JSON.stringify({version:1,clientVersion:'0.1.6',requestId:id,notebookId:notebook,command:command,payload:payload || {}})});}
      catch(e){cancel(pending.timer);delete owner.readingPending[id];reject(e);}
    });
  };
  Reading.prototype.resultInternal=function(sender) {
    var info=value(sender,'userInfo');if(value(info,'window')!==this.window)return;
    var message;try{message=JSON.parse(String(value(info,'json')));}catch(_){return;}
    if (!message || message.version!==1 || typeof message.requestId!=='string')return;
    var pending=(this.readingPending || {})[message.requestId];if(!pending)return;
    cancel(pending.timer);delete this.readingPending[message.requestId];
    if (pending.book!==book(this) || pending.scene!==scene()) {pending.reject(Error('学习集或场景已切换，请重新操作'));return;}
    if (message.ok!==true){pending.reject(Error(String(message.error && (message.error.message || message.error.code) || '阅读操作失败')));return;}
    pending.resolve(message.result || {});
  };
  Reading.prototype.actionInternal=async function(command,param) {
    if (!scene())throw Error('请先切换到自由收集或知识学习场景');
    if(command==='openKnowledgeBase'){center().postNotificationNameObjectUserInfo('AddonBroadcast',null,{window:this.window,message:'mnknowledgebase?action=openSearchWebView'});return;}
    if(command==='stopReceiver')return Reading.prototype.requestInternal.call(this,command,{});
    var note=Reading.prototype.selectedInternal.call(this,param), id=String(note.noteId), notebook=book(this), mode=scene();
    if(command==='setInbox') {
      if(mode!=='broad')throw Error('Inbox 仅适用于自由收集场景');
      var chosen=await select('设为自由收集 Inbox',String(note.noteTitle || note.noteId)+'\n后续无匹配目标的摘录将收集到该位置。原内容不移动。',['确定使用该卡片']);
      if(!chosen)return {cancelled:true};
      if(notebook!==book(this) || mode!==scene())throw Error('学习集或场景已切换，请重新操作');
    }
    return Reading.prototype.requestInternal.call(this,command,{noteId:id});
  };
  Reading.prototype.menuInternal=async function() {
    var mode=scene();if(!mode)throw Error('请先切换到自由收集或知识学习场景');
    var notebook=book(this), state=await Reading.prototype.requestInternal.call(this,'getState',{});
    if(mode!==scene() || notebook!==book(this))throw Error('学习集或场景已切换，请重新操作');
    var items=commands(), receiver=state.receiver, detail=mode==='broad'?'默认收集：固定 Inbox\n完整制卡，不自动加入复习。':'默认原位拆解；明确设置归类后接收匹配摘录，不自动加入复习。\n手动制卡按知识学习规则处理复习。';
    detail+='\n接收目标：'+(receiver && (receiver.active || receiver.available)?String(receiver.title || receiver.noteId)+(receiver.active?'':'（等待手动恢复）'):'无');
    if(receiver && receiver.available && !receiver.active && (mode==='broad' || receiver.kind==='classification'))items.unshift({title:'恢复上次接收目标',command:'restore',noteId:receiver.noteId});
    var chosen=await select(mode==='broad'?'自由收集':'知识学习',detail,items.map(function(x){return x.title;}));if(!chosen)return;
    if(mode!==scene() || notebook!==book(this))throw Error('学习集或场景已切换，请重新操作');
    var item=items[chosen-1];if(!item)return;
    if(item.command==='restore')return Reading.prototype.requestInternal.call(this,'setReceiver',{noteId:item.noteId});
    return Reading.prototype.actionInternal.call(this,item.command);
  };
  return Reading;
};
