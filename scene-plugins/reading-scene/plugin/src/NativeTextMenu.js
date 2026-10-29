/* Reusable native text-selection menu replacement. No MNToolbar dependency. */
var NativeTextMenu = (function () {
  'use strict';
  var EVENT = 1 << 6, serial = 731000;
  function list(value) { return value ? Array.from(value) : []; }
  function signature(config) {return JSON.stringify((config.replacements || []).map(function(r){return [String(r.source || ''),String(r.title || '文本'),String(r.action || '')];}));}
  function state(owner) { return owner.nativeTextMenuState; }
  function record(owner, stage, detail) {
    var s=state(owner); if(!s || !s.diagnostic)return;
    s.log.push({stage:stage,detail:detail || {},at:Date.now()});s.log=s.log.slice(-40);
    try {var prefs=NSUserDefaults.standardUserDefaults();prefs.setObjectForKey(JSON.stringify(s.log),'MNReadingScene_NativeTextMenuTest');prefs.synchronize();}catch(_){}
  }
  function context(owner) {return state(owner).options.context();}
  function valid(owner,binding) {
    var current=context(owner);
    return current && current.enabled && current.notebookId===binding.context.notebookId && current.documentId===binding.context.documentId && signature(current.config)===binding.signature;
  }
  function restore(owner) {
    var s=state(owner);if(!s)return;
    var restored=0;
    s.bindings.forEach(function(b){
      if(b.restored)return;
      try {
        b.button.removeTargetActionForControlEvents(undefined,undefined,EVENT);
        b.targets.forEach(function(t){t.actions.forEach(function(action){b.button.addTargetActionForControlEvents(t.target,action,EVENT);});});
        b.button.tag=b.originalTag;
        [0,1].forEach(function(i){b.button.setTitleForState(b.titles[i] == null ? '' : b.titles[i],i);b.button.setImageForState(b.images[i],i);});
        b.restored=true;restored++;
      }catch(error){record(owner,'restore-error',{message:String(error)});}
    });
    if(restored)record(owner,'restored',{count:restored});
  }
  function clear(owner) {var s=state(owner);if(!s)return;record(owner,'clear',{generation:s.generation});restore(owner);s.generation++;s.bindings=[];}
  function bind(owner,menu,sourceText,captured,generation) {
    var s=state(owner);if(!s || generation!==s.generation)return;
    var current=context(owner);
    if(!current || !current.enabled || current.notebookId!==captured.notebookId || current.documentId!==captured.documentId || signature(current.config)!==signature(captured.config)){record(owner,'context-changed');return;}
    if(PopupMenu.currentMenu()!==menu){record(owner,'menu-changed');return;}
    var items=list(menu.items), rows=list(menu.subviews).filter(function(v){return v.frame.height>40;}), offset=menu.frame.height<=45?0:1;
    record(owner,'layout',{height:menu.frame.height,items:items.map(function(i){return String(i.actionString || '');}),rows:rows.length,offset:offset,sourceLength:sourceText.length});
    var replacements=captured.config.replacements || [];
    replacements.forEach(function(rule){
      if(!rule || typeof rule.source!=='string' || typeof rule.action!=='string')return;
      var index=items.findIndex(function(item){return String(item.actionString || '').replace(/:$/,'')===rule.source.replace(/:$/,'');});
      if(index<0){record(owner,'source-missing',{source:rule.source});return;}
      if(index+offset>=rows.length)throw Error('文本菜单布局无法安全匹配');
      var button=list(rows[index+offset].subviews)[0];
      if(!button || typeof button.actionsForTargetForControlEvent!=='function' || typeof button.setTitleForState!=='function')throw Error('文本菜单按钮接口不可用');
      var targets=list(button.allTargets().allObjects()).map(function(target){return {target:target,actions:list(button.actionsForTargetForControlEvent(target,EVENT)).map(String)};});
      if(!targets.length || !targets.some(function(t){return t.actions.length;}))throw Error('原生按钮缺少可恢复的点击绑定');
      var binding={menu:menu,button:button,tag:++serial,originalTag:button.tag,targets:targets,titles:[button.titleForState(0),button.titleForState(1)],images:[button.imageForState(0),button.imageForState(1)],context:captured,signature:signature(captured.config),text:sourceText,action:rule.action,restored:false};
      s.bindings.push(binding);
      button.tag=binding.tag;
      [0,1].forEach(function(i){button.setImageForState(undefined,i);button.setTitleForState(String(rule.title || '文本'),i);});
      button.removeTargetActionForControlEvents(undefined,undefined,EVENT);
      button.addTargetActionForControlEvents(owner,s.options.selector,EVENT);
      record(owner,'bound',{source:rule.source,action:rule.action,tag:binding.tag});
    });
  }
  function selection(owner) {
    var s=state(owner);if(!s)return;
    clear(owner);
    var captured=context(owner);if(!captured || !captured.enabled)return;
    s.diagnostic=!!captured.config.diagnostics;
    var sourceText=String(s.options.text() || '');if(!sourceText.trim())return;
    var generation=s.generation;
    record(owner,'selection',{length:sourceText.length});
    
    s.options.delay(0.04).then(function(){
      try {
        
        if(generation!==s.generation)return;
        var menu=PopupMenu.currentMenu();if(!menu){record(owner,'no-menu');return;}
        bind(owner,menu,sourceText,captured,generation);
      }catch(error){restore(owner);record(owner,'bind-error',{message:String(error)});s.options.error(error);}
    });
  }

  function closed(owner) {
    var s=state(owner);if(!s)return;record(owner,'closed');var generation=s.generation;
    s.options.delay(0.3).then(function(){if(state(owner)&&generation===s.generation){var menu=PopupMenu.currentMenu();if(menu && menu.visible){record(owner,'close-ignored-visible');return;}clear(owner);}});
  }
  function perform(owner,button) {
    var s=state(owner);if(!s)throw Error('文本菜单尚未初始化');
    var binding=s.bindings.find(function(b){return !b.restored && !b.consumed && b.tag===button.tag;});
    if(!binding || !valid(owner,binding))throw Error('选区或场景已经变化，请重新选择文本');
    var current=String(s.options.text() || '');if(current.trim() && current!==binding.text)throw Error('选区已经变化，请重新选择文本');
    binding.consumed=true;
    var result=s.options.execute(binding.action,binding.text);
    record(owner,'executed',{action:binding.action,inputLength:binding.text.length,result:s.diagnostic?result:undefined});
    binding.menu.dismissAnimated(true);
    var generation=s.generation;s.options.delay(0.02).then(function(){if(state(owner)&&generation===s.generation)restore(owner);});return result;
  }
  function attach(owner,options) {owner.nativeTextMenuState={options:options,generation:0,bindings:[],log:[],diagnostic:false};}
  function reconcile(owner) {var s=state(owner);if(!s || !s.bindings.length)return;if(!valid(owner,s.bindings[0]))clear(owner);}
  return {attach:attach,selection:selection,closed:closed,perform:perform,clear:clear,reconcile:reconcile};
})();
if(typeof module!=='undefined' && module.exports)module.exports=NativeTextMenu;
