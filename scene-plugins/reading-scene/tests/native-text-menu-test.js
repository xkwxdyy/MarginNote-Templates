const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../plugin/src/NativeTextMenu.js'),'utf8');
function harness(double=false,sourceID='speechText'){
 let current={enabled:true,notebookId:'book',documentId:'doc',config:{replacements:[{source:sourceID,title:'文本',action:'titleCaseCopy'}]}},text='a course in functional analysis';
 const copies=[],errors=[],timers=[],owner={},native={speechText:0,copyHighlight:0};
 function button(id){return {tag:8,titles:['朗读','朗读'],images:['speaker','speaker'],targets:[{target:native,action:id+':'}],allTargets(){return{allObjects:()=>[...new Set(this.targets.map(v=>v.target))]}},actionsForTargetForControlEvent(target){return this.targets.filter(v=>v.target===target).map(v=>v.action)},removeTargetActionForControlEvents(){this.targets=[]},addTargetActionForControlEvents(target,action){this.targets.push({target,action})},titleForState(i){return this.titles[i]},imageForState(i){return this.images[i]},setTitleForState(value,i){this.titles[i]=value},setImageForState(value,i){this.images[i]=value},tap(){for(const v of [...this.targets]){if(v.target===native)native[v.action.slice(0,-1)]++;else v.target[v.action.slice(0,-1)](this)}}};}
 const buttons=[button('speechText'),button('copyHighlight')],rows=buttons.map(b=>({frame:{height:44},subviews:[b]}));
 let menu={visible:true,frame:{height:double?90:44},items:[{actionString:'speechText:'},{actionString:'copyHighlight:'}],subviews:double?[{frame:{height:44},subviews:[]},...rows]:rows,dismissAnimated(){this.dismissed=true;this.visible=false}};
 const c=vm.createContext({console,PopupMenu:{currentMenu:()=>menu}});vm.runInContext(source,c);const api=c.NativeTextMenu;
 api.attach(owner,{selector:'tap:',context:()=>current,text:()=>text,delay:seconds=>({then(fn){timers.push({seconds,fn})}}),error:e=>errors.push(e),execute:(action,input)=>{assert.equal(action,'titleCaseCopy');copies.push(input);return 'A Course in Functional Analysis'}});owner.tap=b=>api.perform(owner,b);
 const flush=seconds=>{const i=timers.findIndex(v=>v.seconds===seconds);assert(i>=0,'timer exists');timers.splice(i,1)[0].fn()};
 return {api,owner,buttons,copies,errors,timers,native,flush,get menu(){return menu},set text(v){text=v},set context(v){current=v},get context(){return current}};
}
for(const double of [false,true]){
 const h=harness(double);h.api.selection(h.owner);h.flush(.04);assert.equal(h.buttons[0].titles[0],'文本');assert.equal(h.buttons[1].titles[0],'朗读');
 h.text='';h.buttons[0].tap();assert.deepEqual(h.copies,['a course in functional analysis']);assert.equal(h.menu.dismissed,true);assert.equal(h.native.speechText,0);h.flush(.02);assert.equal(h.buttons[0].titles[0],'朗读');assert.equal(h.buttons[0].tag,8);h.buttons[0].tap();assert.equal(h.native.speechText,1);
 const alternative=harness(double,'copyHighlight');alternative.api.selection(alternative.owner);alternative.flush(.04);assert.equal(alternative.buttons[1].titles[0],'文本');assert.equal(alternative.buttons[0].titles[0],'朗读');alternative.buttons[1].tap();assert.equal(alternative.copies.length,1);
}
{
 const h=harness();h.api.selection(h.owner);h.context={enabled:false};h.flush(.04);assert.equal(h.buttons[0].titles[0],'朗读');assert.equal(h.copies.length,0);
}
{
 const h=harness();h.api.selection(h.owner);h.flush(.04);h.context={...h.context,documentId:'changed'};assert.throws(()=>h.buttons[0].tap(),/变化/);assert.equal(h.copies.length,0);h.api.reconcile(h.owner);assert.equal(h.buttons[0].titles[0],'朗读');
}
{
 const h=harness();h.api.selection(h.owner);h.flush(.04);h.text='different selection';assert.throws(()=>h.buttons[0].tap(),/变化/);assert.equal(h.copies.length,0);h.api.clear(h.owner);assert.equal(h.buttons[0].targets[0].target,h.native);
}
{
 const h=harness();h.api.selection(h.owner);h.api.clear(h.owner);h.flush(.04);assert.equal(h.buttons[0].titles[0],'朗读');
}
{
 const h=harness();h.buttons[0].actionsForTargetForControlEvent=undefined;h.api.selection(h.owner);h.flush(.04);assert.equal(h.errors.length,1);assert.equal(h.buttons[0].targets[0].target,h.native);assert.equal(h.copies.length,0);
}
console.log('Native text menu: independent single/double layouts, configurable source, selection snapshot, stale context, late callback and native restoration passed');

{
 const h=harness();h.api.selection(h.owner);h.context={config:{replacements:[{action:'titleCaseCopy',title:'文本',source:'speechText'}]},documentId:'doc',notebookId:'book',enabled:true};h.flush(.04);assert.equal(h.buttons[0].titles[0],'文本');h.api.closed(h.owner);h.flush(.3);assert.equal(h.buttons[0].titles[0],'文本','late close must not reset visible new menu');h.buttons[0].tap();assert.throws(()=>h.buttons[0].tap(),/变化/);assert.equal(h.copies.length,1);h.flush(.02);
}
