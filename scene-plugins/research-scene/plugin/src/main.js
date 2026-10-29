/* MN Research owns explicit native actions; MNKB Core alone processes new excerpts. */
JSB.newAddon = function (mainPath) {
  'use strict';
  var ADDON_ID = 'marginnote.extension.mnresearchscene';
  var REQUEST = 'MNKBResearchCommand', RESULT = 'MNKBResearchResult';
  var CLIENT_VERSION = '0.1.3', DIAGNOSTICS_KEY = 'MNResearchScene_Diagnostics_v1', CORE_DIAGNOSTICS_KEY = 'MNKB_ResearchDiagnostics_v1';
  var recentDiagnostics = [];
  var APP = Application.sharedInstance(), DB = Database.sharedInstance();
  var WRITES = ['registerProject', 'startProject', 'stopProject', 'setReceiver', 'stopReceiver', 'makeCard', 'addTemplate', 'createRequiredKnowledge'];
  function center() { return NSNotificationCenter.defaultCenter(); }
  function later(milliseconds, callback) { return typeof setTimeout === 'function' ? setTimeout(callback, milliseconds) : NSTimer.scheduledTimerWithTimeInterval(milliseconds / 1000, false, callback); }
  function cancelTimer(timer) { if (timer && typeof timer.invalidate === 'function') timer.invalidate(); else if (typeof clearTimeout === 'function') clearTimeout(timer); }
  var CARD_COMMANDS = [
    {id: 'researchRegister', title: '登记为课题入口', command: 'registerProject'},
    {id: 'researchSetReceiver', title: '设为接收目标', command: 'setReceiver'},
    {id: 'researchStopReceiver', title: '结束接收', command: 'stopReceiver'},
    {id: 'researchMakeCard', title: '制卡（不复习）', command: 'makeCard'},
    {id: 'researchCreateRequiredKnowledge', title: '增加所需知识', command: 'createRequiredKnowledge'},
    {id: 'researchAddTemplate', title: '增加模板', command: 'addTemplate'},
    {id: 'researchOpenKnowledgeBase', title: '打开知识库', command: 'openKnowledgeBase'}
  ];
  function study(owner) { return APP.studyController(owner.window); }
  function notebook(owner) { var s = study(owner), n = s && s.notebookController; return String(n && n.notebookId || ''); }
  function noteId(note) { return String(note && note.noteId || ''); }
  function title(note) { return String(note && (note.noteTitle || note.excerptText) || '').split(/[\r\n]/)[0].slice(0, 140) || '未命名卡片'; }
  function say(owner, message) { try { APP.showHUD(String(message), owner.window, 2); } catch (_) { console.log('MN Research: ' + message); } }
  function fail(owner, error) { trace('ui-error', {reason: 'operation-failed'}); say(owner, String(error && error.message || error)); }
  function nativeValue(object, key) {
    if (!object) return undefined;
    try { if (object[key] !== undefined) return typeof object[key] === 'function' ? object[key]() : object[key]; } catch (_) {}
    try { if (typeof object.objectForKey === 'function') return object.objectForKey(key); } catch (_) {}
    return undefined;
  }
  function nativeBool(value) {
    if (value == null || value === false || value === 0 || value === 'false' || value === '0') return false;
    try { if (typeof value.boolValue === 'function') return !!value.boolValue(); } catch (_) {}
    try { if (value.boolValue !== undefined) return !!value.boolValue; } catch (_) {}
    return !!value;
  }
  function sceneAllowed() {
    try {
      var snapshot;
      if (typeof Application.immersiveTemplateForAddon === 'function') snapshot = Application.immersiveTemplateForAddon(ADDON_ID);
      else if (APP && typeof APP.immersiveTemplateForAddon === 'function') snapshot = APP.immersiveTemplateForAddon(ADDON_ID);
      if (typeof snapshot === 'string') snapshot = JSON.parse(snapshot);
      var config = nativeValue(snapshot, 'config');
      if (typeof config === 'string') config = JSON.parse(config);
      return nativeBool(nativeValue(snapshot, 'allowed')) && String(nativeValue(config, 'scene') || '').trim() === 'research';
    } catch (_) { return false; }
  }
  function readDiagnostics(key) {
    try {
      if (typeof NSUserDefaults === 'undefined') return {status: 'unavailable', entries: []};
      var raw = NSUserDefaults.standardUserDefaults().objectForKey(key);
      if (raw == null || String(raw) === '') return {status: 'missing', entries: []};
      var rows = JSON.parse(String(raw));
      return Array.isArray(rows) ? {status: 'available', entries: rows.slice(-80)} : {status: 'invalid', entries: []};
    } catch (_) { return {status: 'invalid', entries: []}; }
  }
  function trace(stage, details) {
    try {
      var row = {at: new Date().toISOString(), side: 'client', version: CLIENT_VERSION, stage: stage};
      details = details || {};
      if (/^mnresearch-\d+-\d+$/.test(String(details.requestId || ''))) row.requestId = String(details.requestId);
      if (WRITES.concat(['ping', 'getState']).indexOf(details.command) >= 0) row.command = details.command;
      if (/^[A-Za-z0-9_.-]{1,60}$/.test(String(details.reason || ''))) row.reason = String(details.reason);
      if (/^[A-Za-z0-9_.-]{1,40}$/.test(String(details.responseCoreRevision || ''))) row.responseCoreRevision = String(details.responseCoreRevision);
      if (typeof details.hasWindow === 'boolean') row.hasWindow = details.hasWindow;
      if (typeof details.windowMatched === 'boolean') row.windowMatched = details.windowMatched;
      if (typeof details.durationMs === 'number') row.durationMs = details.durationMs;
      if (['string', 'object', 'undefined', 'number', 'boolean', 'function'].indexOf(details.inputType) >= 0) row.inputType = details.inputType;
      var stored = readDiagnostics(DIAGNOSTICS_KEY);
      recentDiagnostics = (stored.status === 'available' ? stored.entries : recentDiagnostics).concat([row]).slice(-80);
      try { if (typeof NSUserDefaults !== 'undefined') NSUserDefaults.standardUserDefaults().setObjectForKey(JSON.stringify(recentDiagnostics), DIAGNOSTICS_KEY); } catch (_) {}
      try { if (typeof MNUtil !== 'undefined' && typeof MNUtil.log === 'function') MNUtil.log('[MN ResearchScene] ' + JSON.stringify(row)); else console.log('[MN ResearchScene] ' + JSON.stringify(row)); } catch (_) {}
    } catch (_) {}
  }
  function select(owner, heading, detail, actions) {
    if (typeof MNUtil !== 'undefined' && typeof MNUtil.userSelect === 'function') return MNUtil.userSelect(heading, detail, actions);
    return new Promise(function (resolve, reject) {
      try { UIAlertView.showWithTitleMessageStyleCancelButtonTitleOtherButtonTitlesTapBlock(heading, detail, 0, '取消', actions, function (_, index) { resolve(index); }); }
      catch (error) { reject(error); }
    });
  }
  function projectId(project) { return String(project && (project.projectId || project.id) || ''); }
  function activeTitle(state) {
    var active = state && state.activeProject;
    if (active && typeof active === 'object') return String(active.title || active.name || projectId(active));
    var p = (state && state.projects || []).filter(function (x) { return projectId(x) === String(active || ''); })[0];
    return p ? String(p.title || p.name || projectId(p)) : '尚未开始课题';
  }
  function receiverTitle(state) { var r = state && state.receiver; if (!r || (!r.active && !r.available)) return '无'; return String(r.title || r.noteTitle || r.noteId || '已设置') + (r.active ? '' : '（等待手动恢复）'); }
  var MNResearchScene = JSB.defineClass('MNResearchScene : JSExtension', {
    sceneWillConnect: function () { try { MNResearchScene.prototype.connectInternal.call(self); } catch (error) { fail(self, error); } },
    sceneDidDisconnect: function () { try { MNResearchScene.prototype.disconnectInternal.call(self); } catch (error) { fail(self, error); } },
    notebookWillOpen: function () { try { MNResearchScene.prototype.clearContextInternal.call(self); } catch (error) { fail(self, error); } },
    notebookWillClose: function () { try { MNResearchScene.prototype.clearContextInternal.call(self); } catch (error) { fail(self, error); } },
    queryAddonCommandStatus: function () { return sceneAllowed() ? {image: 'icon.png', object: self, selector: 'openResearch:', checked: !!(self.researchState && self.researchState.activeProject)} : null; },
    queryCardCommandsForNote: function (noteid) { try { return MNResearchScene.prototype.queryCardCommandsInternal.call(self, noteid); } catch (error) { fail(self, error); return []; } },
    runCardCommandForNote: function (commandID, noteid) { try { return MNResearchScene.prototype.runCardCommandInternal.call(self, commandID, noteid); } catch (error) { fail(self, error); return false; } },
    openResearch: function (sender) { try { return MNResearchScene.prototype.showMainMenuInternal.call(self, sender).catch(function (error) { fail(self, error); }); } catch (error) { fail(self, error); } },
    onResearchResult: function (sender) { try { MNResearchScene.prototype.acceptResultInternal.call(self, sender); } catch (error) { fail(self, error); } },
    onResearchNote: function (sender) { try { MNResearchScene.prototype.noteSelectedInternal.call(self, sender); } catch (error) { fail(self, error); } },
    researchCardActions: function (param) { try { return MNResearchScene.prototype.showCardMenuInternal.call(self, param).catch(function (error) { fail(self, error); }); } catch (error) { fail(self, error); } },
    researchRegister: function (param) { try { return MNResearchScene.prototype.cardCommandInternal.call(self, 'registerProject', param).catch(function (error) { fail(self, error); }); } catch (error) { fail(self, error); } },
    researchSetReceiver: function (param) { try { return MNResearchScene.prototype.cardCommandInternal.call(self, 'setReceiver', param).catch(function (error) { fail(self, error); }); } catch (error) { fail(self, error); } },
    researchStopReceiver: function () { try { return MNResearchScene.prototype.runCommandInternal.call(self, 'stopReceiver', {}).catch(function (error) { fail(self, error); }); } catch (error) { fail(self, error); } },
    researchMakeCard: function (param) { try { return MNResearchScene.prototype.cardCommandInternal.call(self, 'makeCard', param).catch(function (error) { fail(self, error); }); } catch (error) { fail(self, error); } },
    researchCreateRequiredKnowledge: function (param) { try { return MNResearchScene.prototype.cardCommandInternal.call(self, 'createRequiredKnowledge', param).catch(function (error) { fail(self, error); }); } catch (error) { fail(self, error); } },
    researchAddTemplate: function (param) { try { return MNResearchScene.prototype.cardCommandInternal.call(self, 'addTemplate', param).catch(function (error) { fail(self, error); }); } catch (error) { fail(self, error); } },
    researchOpenKnowledgeBase: function () { try { MNResearchScene.prototype.openKnowledgeBaseInternal.call(self); } catch (error) { fail(self, error); } }
  }, {});
  MNResearchScene.prototype.connectInternal = function () {
    if (this.researchConnected) return;
    this.researchConnected = true; this.researchPending = {}; this.researchSequence = 0; this.researchState = null; this.researchSelection = '';
    trace('connect', {});
    center().addObserverSelectorName(this, 'onResearchResult:', RESULT);
    center().addObserverSelectorName(this, 'onResearchNote:', 'PopupMenuOnNote');
    trace('observers-ready', {});
  };
  MNResearchScene.prototype.clearContextInternal = function () {
    this.researchSelection = ''; this.researchState = null;
    var owner = this;
    Object.keys(owner.researchPending || {}).forEach(function (key) { var pending = owner.researchPending[key]; cancelTimer(pending.timer); delete owner.researchPending[key]; trace('request-cancelled', {requestId: key, command: pending.command, reason: 'context-cleared'}); pending.reject(Error('学习集已切换，请重新操作')); });
  };
  MNResearchScene.prototype.disconnectInternal = function () {
    this.researchConnected = false; trace('disconnect', {});
    center().removeObserverName(this, RESULT); center().removeObserverName(this, 'PopupMenuOnNote');
    MNResearchScene.prototype.clearContextInternal.call(this);
  };
  MNResearchScene.prototype.requestInternal = function (command, payload) {
    var owner = this;
    if (!owner.researchConnected) { trace('request-rejected', {command: command, reason: 'client-disconnected'}); return Promise.reject(Error('科研插件尚未连接')); }
    if (WRITES.indexOf(command) >= 0 && !sceneAllowed()) { trace('request-rejected', {command: command, reason: 'scene-inactive'}); return Promise.reject(Error('请先切换到科研场景模板')); }
    var current = notebook(owner);
    if (!current && command !== 'ping') { trace('request-rejected', {command: command, reason: 'notebook-unavailable'}); return Promise.reject(Error('请先打开学习集')); }
    var requestId = 'mnresearch-' + Date.now() + '-' + (++owner.researchSequence);
    var request = {version: 1, clientVersion: CLIENT_VERSION, requestId: requestId, command: command, notebookId: current, payload: payload || {}};
    return new Promise(function (resolve, reject) {
      var duration = command === 'addTemplate' ? 120000 : command === 'makeCard' ? 45000 : 8000;
      var pending = {resolve: resolve, reject: reject, notebookId: current, command: command, startedAt: Date.now()};
      pending.timer = later(duration, function () { if (owner.researchPending[requestId] !== pending) return; delete owner.researchPending[requestId]; trace('timeout', {requestId: requestId, command: command, durationMs: Date.now() - pending.startedAt}); reject(Error('MN KnowledgeBase 未在时限内返回结果，请检查核心插件是否已启用')); });
      owner.researchPending[requestId] = pending;
      trace('send', {requestId: requestId, command: command});
      try { center().postNotificationNameObjectUserInfo(REQUEST, null, {window: owner.window, json: JSON.stringify(request)}); trace('posted', {requestId: requestId, command: command}); }
      catch (error) { cancelTimer(pending.timer); delete owner.researchPending[requestId]; trace('send-error', {requestId: requestId, command: command, reason: 'notification-post-failed'}); reject(error); }
    });
  };
  MNResearchScene.prototype.acceptResultInternal = function (sender) {
    var info = nativeValue(sender, 'userInfo'), responseWindow = nativeValue(info, 'window'), raw = nativeValue(info, 'json');
    if (!info) { trace('response-rejected', {reason: 'missing-user-info'}); return; }
    if (responseWindow !== this.window) {
      var rejected = {reason: 'window-mismatch', hasWindow: !!responseWindow, windowMatched: false};
      try { var candidate = JSON.parse(typeof raw === 'string' ? raw : String(raw)); rejected.requestId = candidate.requestId; rejected.responseCoreRevision = candidate.coreRevision || candidate.build; var known = this.researchPending && this.researchPending[candidate.requestId]; rejected.command = known && known.command; } catch (_) {}
      trace('response-rejected', rejected); return;
    }
    if (raw == null) { trace('response-rejected', {reason: 'missing-json', windowMatched: true}); return; }
    var message; try { message = JSON.parse(typeof raw === 'string' ? raw : String(raw)); } catch (_) { trace('response-rejected', {reason: 'invalid-json', inputType: typeof raw, windowMatched: true}); return; }
    if (!message || message.version !== 1 || typeof message.requestId !== 'string') { trace('response-rejected', {reason: 'invalid-envelope', requestId: message && message.requestId}); return; }
    var pending = this.researchPending && this.researchPending[message.requestId];
    var diagnostic = {requestId: message.requestId, command: pending && pending.command, responseCoreRevision: message.coreRevision || message.build, windowMatched: true};
    if (!pending) { diagnostic.reason = 'unknown-request'; trace('response-rejected', diagnostic); return; }
    cancelTimer(pending.timer); delete this.researchPending[message.requestId];
    diagnostic.durationMs = Date.now() - pending.startedAt;
    if (pending.notebookId !== notebook(this)) { diagnostic.reason = 'notebook-changed'; trace('response-rejected', diagnostic); pending.reject(Error('学习集已切换，请重新操作')); return; }
    if (message.ok !== true) { diagnostic.reason = 'core-operation-failed'; trace('response-error', diagnostic); pending.reject(Error(String(message.error && (message.error.message || message.error) || '核心操作未完成'))); return; }
    trace('response-accepted', diagnostic);
    var result = message.result || {}, state = result.state || result;
    if (Array.isArray(state.projects)) this.researchState = state;
    pending.resolve(result);
  };
  MNResearchScene.prototype.noteSelectedInternal = function (sender) {
    if (!sceneAllowed()) return;
    if (!APP.checkNotifySenderInWindow(sender, this.window)) return;
    var u = sender && sender.userInfo || {}, selected = u.note || DB.getNoteById(String(u.noteid || u.noteId || ''));
    if (!selected || String(selected.notebookId || '') !== notebook(this)) return;
    this.researchSelection = noteId(selected);
  };
  MNResearchScene.prototype.selectedNoteInternal = function (param) {
    var requested = typeof param === 'string' ? param : param && (param.noteId || param.param);
    var s = study(this), nc = s && s.notebookController, list = nc && nc.mindmapView && nc.mindmapView.selViewLst;
    if (!requested && list && list.length > 1) throw Error('请选择一张卡片');
    var n = requested ? DB.getNoteById(String(requested)) : list && list.length === 1 ? list[0].note : nc && (nc.focusNote || nc.visibleFocusNote) || DB.getNoteById(this.researchSelection);
    if (!n || !noteId(n) || String(n.notebookId || '') !== notebook(this)) throw Error('请先在当前学习集中选中一张卡片');
    return n;
  };
  MNResearchScene.prototype.runCommandInternal = async function (command, payload) {
    var result = await MNResearchScene.prototype.requestInternal.call(this, command, payload);
    if (result.cancelled) return result;
    this.researchState = null;
    return result;
  };
  MNResearchScene.prototype.cardCommandInternal = function (command, param) {
    var n = MNResearchScene.prototype.selectedNoteInternal.call(this, param), payload = {noteId: noteId(n)};
    if (command === 'registerProject') payload = {anchorNoteId: noteId(n), title: title(n)};
    return MNResearchScene.prototype.runCommandInternal.call(this, command, payload);
  };
  MNResearchScene.prototype.copyDiagnosticsInternal = function () {
    trace('diagnostics-copy', {});
    var client = readDiagnostics(DIAGNOSTICS_KEY), core = readDiagnostics(CORE_DIAGNOSTICS_KEY);
    if (client.status !== 'available' && recentDiagnostics.length) client = {status: 'available', entries: recentDiagnostics.slice(-80)};
    function section(key, log) { return {key: key, status: log.status, message: log.status === 'available' && log.entries.length ? '已读取日志' : log.status === 'invalid' || log.status === 'unavailable' ? '日志无法读取' : '未发现日志', entries: log.entries}; }
    var content = JSON.stringify({diagnosticsVersion: 1, copiedAt: new Date().toISOString(), clientVersion: CLIENT_VERSION, client: section(DIAGNOSTICS_KEY, client), core: section(CORE_DIAGNOSTICS_KEY, core)}, null, 2);
    try {
      if (typeof UIPasteboard !== 'undefined' && typeof UIPasteboard.generalPasteboard === 'function') UIPasteboard.generalPasteboard().string = content;
      else if (typeof MNUtil !== 'undefined' && typeof MNUtil.copy === 'function') MNUtil.copy(content);
      else throw Error('当前环境无法访问系统剪贴板');
    } catch (error) { trace('diagnostics-copy-error', {reason: 'clipboard-write-failed'}); throw error; }
    return {copied: true};
  };
  MNResearchScene.prototype.showConnectionFailureInternal = async function (error) {
    var choice = await select(this, '科研连接失败', String(error && error.message || error) + '\n可复制通信日志，核对两侧插件的实际接收情况。', ['复制通信日志', '重试连接']);
    if (choice === 1) { MNResearchScene.prototype.copyDiagnosticsInternal.call(this); return {ok: false, diagnosticsCopied: true}; }
    if (choice === 2) return MNResearchScene.prototype.showMainMenuInternal.call(this);
    return {ok: false};
  };
  MNResearchScene.prototype.showMainMenuInternal = async function () {
    var state;
    try { state = await MNResearchScene.prototype.requestInternal.call(this, 'getState', {}); }
    catch (error) { return MNResearchScene.prototype.showConnectionFailureInternal.call(this, error); }
    state = state.state || state;
    var actions = ['开始课题…', '将选中卡片登记为课题入口', '选中卡片的科研操作…', '打开知识库'];
    if (state.activeProject) actions.push('结束当前课题');
    if (state.receiver && state.receiver.active === true) actions.push('结束手动接收：' + receiverTitle(state));
    if (state.receiver && state.receiver.available && !state.receiver.active) actions.push('恢复上次接收目标');
    actions.push('复制通信日志');
    var context = notebook(this), choice = await select(this, 'MN Research Scene · 课题研究', '当前课题：' + activeTitle(state) + '\n手动接收：' + receiverTitle(state) + '\n科研制卡不自动加入复习', actions);
    if (!choice) return; if (context !== notebook(this)) throw Error('学习集已切换，请重新操作');
    var action = actions[choice - 1];
    if (action === '恢复上次接收目标') return MNResearchScene.prototype.runCommandInternal.call(this, 'setReceiver', {noteId: state.receiver.noteId});
    if (action === '复制通信日志') return MNResearchScene.prototype.copyDiagnosticsInternal.call(this);
    if (action === '开始课题…') return MNResearchScene.prototype.showProjectsInternal.call(this, state);
    if (action === '将选中卡片登记为课题入口') return MNResearchScene.prototype.cardCommandInternal.call(this, 'registerProject');
    if (action === '选中卡片的科研操作…') return MNResearchScene.prototype.showCardMenuInternal.call(this);
    if (action === '打开知识库') return MNResearchScene.prototype.openKnowledgeBaseInternal.call(this);
    if (action === '结束当前课题') return MNResearchScene.prototype.runCommandInternal.call(this, 'stopProject', {});
    if (action && action.indexOf('结束手动接收：') === 0) return MNResearchScene.prototype.runCommandInternal.call(this, 'stopReceiver', {});
  };
  MNResearchScene.prototype.showProjectsInternal = async function (state) {
    var projects = state.projects || [];
    if (!projects.length) { say(this, '尚未登记课题，请选中课题入口卡后登记'); return; }
    var context = notebook(this), choice = await select(this, '开始课题', '切换课题只改变默认归类锚点，手动接收继续生效。', projects.map(function (p) { return String(p.title || p.name || projectId(p)); }));
    if (!choice) return; if (context !== notebook(this)) throw Error('学习集已切换，请重新操作');
    var chosen = projects[choice - 1]; if (chosen) return MNResearchScene.prototype.runCommandInternal.call(this, 'startProject', {projectId: projectId(chosen)});
  };
  MNResearchScene.prototype.showCardMenuInternal = async function (param) {
    var n = MNResearchScene.prototype.selectedNoteInternal.call(this, param), frozenId = noteId(n), context = notebook(this);
    var actions = ['设为接收目标', '制卡（不复习）', 'AddTemplate 增加模板', '登记为课题入口', '结束接收', '打开知识库'];
    var choice = await select(this, '卡片科研操作', title(n), actions); if (!choice) return;
    if (context !== notebook(this)) throw Error('学习集已切换，请重新操作');
    var command = ['setReceiver', 'makeCard', 'addTemplate', 'registerProject', 'stopReceiver'][choice - 1];
    if (command === 'stopReceiver') return MNResearchScene.prototype.runCommandInternal.call(this, command, {});
    if (command) return MNResearchScene.prototype.cardCommandInternal.call(this, command, frozenId);
    if (choice === 6) return MNResearchScene.prototype.openKnowledgeBaseInternal.call(this);
  };
  MNResearchScene.prototype.queryCardCommandsInternal = function (selectedId) {
    if (!sceneAllowed()) return [];
    if (selectedId) { var n = DB.getNoteById(String(selectedId)); if (!n || String(n.notebookId || '') !== notebook(this)) return []; }
    return CARD_COMMANDS.map(function (x) { return {id: x.id, title: x.title}; });
  };
  MNResearchScene.prototype.runCardCommandInternal = function (commandID, selectedId) {
    if (!sceneAllowed() || !selectedId) return false;
    var action = CARD_COMMANDS.filter(function (x) { return x.id === commandID; })[0]; if (!action) return false;
    MNResearchScene.prototype.selectedNoteInternal.call(this, String(selectedId));
    var owner = this, result;
    if (action.command === 'openKnowledgeBase') { MNResearchScene.prototype.openKnowledgeBaseInternal.call(owner); return true; }
    if (action.command === 'stopReceiver') result = MNResearchScene.prototype.runCommandInternal.call(owner, action.command, {});
    else result = MNResearchScene.prototype.cardCommandInternal.call(owner, action.command, String(selectedId));
    Promise.resolve(result).catch(function (error) { fail(owner, error); }); return true;
  };
  MNResearchScene.prototype.openKnowledgeBaseInternal = function () {
    center().postNotificationNameObjectUserInfo('AddonBroadcast', null, {window: this.window, message: 'mnknowledgebase?action=openSearchWebView'});
  };
  return MNResearchScene;
};
