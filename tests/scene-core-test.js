'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.join(__dirname, '../mnkb-scene-core')
const api = require(path.join(root, 'KnowledgeBaseResearchCore'))
function harness(saved) {
  const calls = [], notes = new Map(), windows = new Map(), categories = new Map()
  const main = { window: {} }, other = { window: {} }
  windows.set(main.window, { notebookId: 'study', active: true })
  windows.set(other.window, { notebookId: 'study', active: true })
  let persisted = saved, ocrHook, makeHook, assertHook, sequence = 0
  function add(id, type = '命题', parent) {
    const note = { noteId: id, notebookId: 'study', noteTitle: id, type, parentNote: parent, childNotes: [], colorIndex: type === '定义' ? 2 : 10 }
    if (parent) parent.childNotes.push(note)
    notes.set(id, note); return note
  }
  const deps = {
    load: () => persisted,
    save: data => { persisted = data },
    notebookId: instance => windows.get(instance.window).notebookId,
    isCurrentWindow: () => true,
    sceneActive: instance => windows.get(instance.window).active,
    getNote: id => notes.get(id),
    noteNotebookId: n => n.notebookId,
    title: n => n.noteTitle,
    isClassification: n => n.type === '归类',
    classificationType: n => n.acceptType,
    cardType: n => n.type,
    groupId: n => n.groupNoteId,
    excerptType: (_, n) => { calls.push(['type', n.noteId]); const type = n.tag || n.type; delete n.tag; return type },
    classification: (anchor, type) => {
      const key = anchor.noteId + ':' + type
      if (!categories.has(key)) { const n = add('cat-' + ++sequence, '归类', anchor); n.acceptType = type; categories.set(key, n); calls.push(['create', anchor.noteId, type]) }
      return categories.get(key)
    },
    move: (n, parent) => { if (n.parentNote) n.parentNote.childNotes = n.parentNote.childNotes.filter(i => i !== n); n.parentNote = parent; parent.childNotes.push(n); calls.push(['move', n.noteId, parent.noteId]) },
    ocr: async (_, n) => { calls.push(['ocr', n.noteId]); if (ocrHook) await ocrHook(n) },
    convert: n => { const converted = { ...n, noteId: n.noteId + '-converted', converted: true }; notes.set(converted.noteId, converted); calls.push(['convert', n.noteId]); return converted },
    syncIndex: (a, b) => calls.push(['index', a.noteId, b.noteId]),
    refresh: n => calls.push(['refresh', n.noteId]),
    makeCard: (n, type, valid) => { if (!valid()) throw Error('context-changed'); calls.push(['make', n.noteId, type]); if (makeHook) return makeHook(n); n.fields = true; return { note: n, pending: false } },
    assertCard: (n, type) => { if (assertHook) assertHook(n, type) },
    addTemplate: async (n, payload) => { const first = add('template-first', '归类', n.parentNote); first.acceptType = '命题'; const last = add('template-last', '归类', first); last.acceptType = '定义'; return last },
    log: error => calls.push(['error', error.message]),
  }
  const service = api.create(deps)
  let request = 0
  const command = (name, payload = {}, instance = main, notebookId = 'study') => service.dispatch(instance, { version: 1, requestId: String(++request), command: name, notebookId, payload })
  return { service, command, add, notes, calls, main, other, windows, deps, saved: () => persisted, ocr: fn => { ocrHook = fn }, make: fn => { makeHook = fn }, assertCard: fn => { assertHook = fn } }
}
async function start(h, id = 'P', instance = h.main) {
  const anchor = h.notes.get(id) || h.add(id)
  await h.command('registerProject', { anchorNoteId: id, title: '课题' + id }, instance)
  await h.command('startProject', { projectId: id }, instance)
  return anchor
}
async function tests() {
  for (const mode of ['research', 'intensive']) {
    const h = harness(), parent = h.add('parent'), receiver = h.add('receiver', '归类');
    receiver.acceptType = '命题'; h.deps.collectionMode = () => mode;
    await h.command('setReceiver', {noteId: receiver.noteId});
    const before = h.service.state(h.main).receiver;
    h.deps.addTemplate = () => { throw Error('shortcut must not prompt for a title') };
    h.deps.createRequiredKnowledge = n => { assert.equal(n, parent); return h.add('required', '归类', n) };
    const result = await h.command('createRequiredKnowledge', {noteId: parent.noteId});
    assert.equal(result.noteId, 'required'); assert.deepEqual(result.receiver, before);
    assert.deepEqual(h.calls, []);
    h.deps.createRequiredKnowledge = () => { throw Error('missing-template') };
    await assert.rejects(h.command('createRequiredKnowledge', {noteId: parent.noteId}), /missing-template/);
    h.deps.createRequiredKnowledge = () => null;
    await assert.rejects(h.command('createRequiredKnowledge', {noteId: parent.noteId}), /classification-create-failed/);
    h.deps.isCurrentWindow = () => false;
    h.deps.createRequiredKnowledge = () => { throw Error('must not write after switching windows') };
    await assert.rejects(h.command('createRequiredKnowledge', {noteId: parent.noteId}), /context-changed|window|research-scene-inactive/);
  }

  {
    const h = harness(), receiver = h.add('proposition', '命题')
    const state = await h.command('setReceiver', { noteId: receiver.noteId })
    assert.equal(state.receiver.kind, 'proposition')
    h.deps.beginDefinition = () => { throw Error('Proposition collection must only OCR and convert') }
    h.assertCard(() => { throw Error('Proposition collection must not need a makeCard template') })
    for (const type of ['命题', '定义', '例子', '反例', '约定', '']) {
      const n = h.add('excerpt-' + (type || 'untyped'), type)
      const result = await h.service.processExcerpt(h.main, n)
      assert.equal(result.route, 'receiver', type)
      assert.equal(result.targetNoteId, receiver.noteId)
      assert.equal(result.madeCard, false); assert.equal(result.cardPending, false)
      assert.equal(result.addedToReview, false)
      assert.equal(h.notes.get(result.noteId).parentNote, receiver)
      assert.deepEqual(h.calls.filter(c => c[1] === n.noteId).map(c => c[0]), ['type', 'move', 'ocr', 'convert', 'index'])
    }
    assert.equal(h.calls.filter(c => c[0] === 'make' || c[0] === 'create').length, 0)
    await start(h, 'other-project')
    assert.equal((await h.service.processExcerpt(h.main, h.add('after-switch'))).targetNoteId, receiver.noteId)
    const restarted = api.create(h.deps)
    assert.equal(restarted.state(h.main).receiver.kind, 'proposition')
    assert.equal(restarted.state(h.main).receiver.active, false)
    await h.command('stopReceiver')
    assert.equal((await h.service.processExcerpt(h.main, h.add('after-stop'))).route, 'project')
    await h.command('setReceiver', { noteId: receiver.noteId }); h.service.close(h.main, 'study')
    assert.equal(h.service.state(h.main).receiver.active, false)
  }
  {
    const h = harness(), receiver = h.add('proposition', '命题')
    await h.command('setReceiver', { noteId: receiver.noteId })
    let finish; h.ocr(() => new Promise(resolve => { finish = resolve }))
    const first = h.service.processExcerpt(h.main, h.add('waiting'))
    const second = h.service.processExcerpt(h.main, h.add('queued'))
    await Promise.resolve(); await Promise.resolve()
    receiver.type = '定义'; finish()
    assert.equal((await first).skipped, 'context-changed')
    assert.equal((await second).skipped, 'context-changed')
    assert.equal(h.service.state(h.main).receiver.active, false)
    assert.equal(h.calls.filter(c => c[0] === 'convert').length, 0)
  }
  assert.equal(api.sceneSnapshot({ allowed: true, config: { scene: 'research' } }), true)
  assert.equal(api.sceneSnapshot({ allowed: false, config: { scene: 'research' } }), false)
  assert.equal(api.sceneSnapshot({ allowed: '0', config: { scene: 'research' } }), false)
  assert.equal(api.sceneSnapshot({ allowed: true, config: { scene: 'reading' } }), false)
  assert.equal(api.sceneSnapshot({ config: { scene: 'research' } }), false)
  assert.equal(api.sceneSnapshot({ allowed: true, config: '{"scene":"research"}' }), true)
  assert.equal(api.sceneSnapshot('broken'), false)
  {
    const h = harness(), anchor = await start(h), first = h.add('E1')
    let result = await h.service.processExcerpt(h.main, first)
    assert.equal(result.route, 'project'); assert.equal(result.noteId, 'E1-converted'); assert.equal(result.madeCard, false)
    assert.equal(h.notes.get(result.noteId).parentNote.parentNote, anchor)
    assert.equal(h.calls.filter(c => c[0] === 'make').length, 0)
    await h.service.processExcerpt(h.main, h.add('E2'))
    assert.equal(h.calls.filter(c => c[0] === 'create').length, 1, 'Reuse existing type category')
    assert.equal(h.service.state(h.main).projects[0].projectId, 'P')
    assert.equal(h.service.state(h.main).activeProject.anchorNoteId, 'P')
    const restarted = api.create(h.deps)
    assert.equal(restarted.state(h.main).projects.length, 1)
    assert.equal(restarted.state(h.main).activeProject, null, 'Restart does not start routing')
  }
  {
    const h = harness(), anchor = await start(h), receiver = h.add('R', '归类', anchor)
    receiver.acceptType = '定义'
    await h.command('setReceiver', { noteId: 'R' })
    await start(h, 'Q')
    const same = await h.service.processExcerpt(h.main, h.add('D', '定义'))
    assert.equal(same.route, 'receiver'); assert.equal(same.targetNoteId, 'R'); assert.equal(same.madeCard, true)
    assert.equal(same.addedToReview, false); assert.equal(h.notes.get(same.noteId).parentNote, receiver)
    const other = await h.service.processExcerpt(h.main, h.add('L', '命题'))
    assert.equal(other.route, 'project'); assert.equal(h.notes.get(other.noteId).parentNote.parentNote.noteId, 'Q')
    assert.equal(h.service.state(h.main).receiver.noteId, 'R'); assert.equal(h.service.state(h.main).receiver.active, true)
    const restarted = api.create(h.deps)
    assert.equal(restarted.state(h.main).receiver.noteId, 'R'); assert.equal(restarted.state(h.main).receiver.active, false)
    await h.command('stopReceiver'); assert.equal(h.service.state(h.main).receiver.active, false)
    await h.command('setReceiver', { noteId: 'R' }); h.service.close(h.main, 'study')
    assert.equal(h.service.state(h.main).receiver.active, false); assert.equal(h.service.state(h.main).activeProject, null)
  }
  {
    const h = harness(), originalParent = h.add('original'), excerpt = h.add('E', '命题', originalParent)
    const result = await h.service.processExcerpt(h.main, excerpt)
    assert.equal(result.route, 'in-place'); assert.equal(h.notes.get(result.noteId).parentNote, originalParent)
    assert.equal(h.calls.filter(c => c[0] === 'ocr').length, 1)
    assert.equal(h.calls.filter(c => c[0] === 'make' || c[0] === 'move').length, 0)
    const r = h.add('R', '归类'); r.acceptType = '命题'
    await h.command('setReceiver', { noteId: 'R' })
    const explicit = await h.service.processExcerpt(h.main, h.add('E2'))
    assert.equal(explicit.route, 'receiver', 'Receiver works with no started project')
  }
  {
    const h = harness(); await start(h)
    h.windows.get(h.main.window).active = false
    assert.equal((await h.service.processExcerpt(h.main, h.add('E'))).handled, false)
    await assert.rejects(h.command('setReceiver', { noteId: 'P' }), /research-scene-inactive/)
    assert.equal((await h.command('getState')).sceneActive, false)
    assert.equal(h.calls.length, 0)
  }
  {
    const h = harness(); await start(h); const n = h.add('E'); n.tag = '约定'
    const result = await h.service.processExcerpt(h.main, n)
    assert.equal(result.noteType, '约定'); assert.equal(h.calls.filter(c => c[0] === 'type').length, 1)
    assert.equal(h.notes.get(result.noteId).parentNote.acceptType, '约定')
    assert.equal((await h.service.processExcerpt(h.main, n)).duplicate, true)
    assert.equal((await h.service.processExcerpt(h.main, h.notes.get(result.noteId))).duplicate, true)
    assert.equal(h.calls.filter(c => c[0] === 'ocr').length, 1)
  }
  {
    const h = harness(); await start(h)
    assert.equal(h.service.state(h.other).activeProject, null, 'State is window scoped')
    await assert.rejects(h.command('startProject', { projectId: 'P' }, h.main, 'different'), /different-notebook/)
    const foreign = h.add('foreign'); foreign.notebookId = 'other'
    await assert.rejects(h.command('registerProject', { anchorNoteId: 'foreign' }), /different-notebook/)
    h.add('unsupported', '定义')
    await assert.rejects(h.command('setReceiver', { noteId: 'unsupported' }), /receiver-must-be-classification-or-proposition/)
    await assert.rejects(h.command('registerProject', { anchorNoteId: '__proto__' }), /invalid-id/)
    assert.equal((await h.service.processExcerpt(h.main, foreign)).skipped, 'different-notebook')
  }
  {
    const h = harness(), anchor = await start(h), r = h.add('R', '归类'); r.acceptType = '命题'
    await h.command('setReceiver', { noteId: 'R' })
    let finish; const waiting = new Promise(resolve => { finish = resolve }); h.ocr(() => waiting)
    const first = h.service.processExcerpt(h.main, h.add('E1')), second = h.service.processExcerpt(h.main, h.add('E2'))
    await Promise.resolve(); await h.command('stopReceiver'); finish();
    assert.equal((await first).skipped, 'context-changed'); assert.equal((await second).skipped, 'context-changed')
    assert.equal(h.calls.filter(c => c[0] === 'convert' || c[0] === 'make').length, 0)
    assert.ok(anchor)
  }
  {
    const h = harness(); await start(h)
    let finish; const waiting = new Promise(resolve => { finish = resolve }); h.ocr(() => waiting)
    const first = h.service.processExcerpt(h.main, h.add('E1')), queued = h.service.processExcerpt(h.main, h.add('E2'))
    await Promise.resolve(); await start(h, 'Q'); finish()
    assert.equal((await first).skipped, 'context-changed'); assert.equal((await queued).skipped, 'context-changed')
    assert.equal(h.calls.filter(c => c[0] === 'create' && c[1] === 'Q').length, 0, 'Queued excerpt must not adopt a later project')
  }
  {
    const h = harness(); await start(h); const r = h.add('R', '归类'); r.acceptType = '命题'; await h.command('setReceiver', { noteId: 'R' })
    let finish; const waiting = new Promise(resolve => { finish = resolve }); h.ocr(() => waiting)
    const first = h.service.processExcerpt(h.main, h.add('E1')); await Promise.resolve(); await start(h, 'Q'); finish()
    assert.equal((await first).route, 'receiver', 'Project switch does not cancel independent receiver')
  }
  {
    const h = harness(); await start(h); let fail = true
    h.ocr(async () => { if (fail) { fail = false; throw Error('offline') } })
    await assert.rejects(h.service.processExcerpt(h.main, h.add('E1')), /offline/)
    assert.equal((await h.service.processExcerpt(h.main, h.add('E2'))).route, 'project')
    const r = h.add('R', '归类'); r.acceptType = '命题'; await h.command('setReceiver', { noteId: 'R' })
    h.assertCard(() => { throw Error('KB_TEMPLATE_MISSING') })
    const e = h.add('E3')
    await assert.rejects(h.service.processExcerpt(h.main, e), /KB_TEMPLATE_MISSING/)
    assert.equal(e.parentNote, undefined, 'No move or conversion after missing-template preflight')
    await assert.rejects(h.command('makeCard', { noteId: 'E3' }), /KB_TEMPLATE_MISSING/)
    assert.equal(h.notes.has('E3-converted'), false)
  }
  {
    const h = harness(); const n = h.add('manual'), parent = h.add('parent'); n.parentNote = parent
    h.make(n => ({ note: n, pending: true }))
    const result = await h.command('makeCard', { noteId: 'manual' })
    assert.equal(result.noteId, 'manual-converted'); assert.equal(result.cardPending, true); assert.equal(result.addedToReview, false)
    assert.equal(h.notes.get(result.noteId).parentNote, parent)
    const template = await h.command('addTemplate', { noteId: 'manual', receive: true })
    assert.equal(template.noteId, 'template-last'); assert.equal(template.receiver, null, 'AddTemplate must never activate receiving, including legacy receive payloads')
  }
  {
    const h = harness(); await start(h); const definition = h.add('D', '定义'); let finished = 0, retargeted = 0
    h.deps.beginDefinition = () => ({ token: 'definition' }); h.deps.finishDefinition = () => { finished++ }
    const previousSync = h.deps.syncIndex; h.deps.syncIndex = (a,b) => { retargeted++; previousSync(a,b) }
    const result = await h.service.processExcerpt(h.main, definition)
    assert.equal(result.route, 'project'); assert.equal(finished, 1); assert.equal(retargeted, 1)
    assert.equal(h.calls.filter(c => c[0] === 'ocr').length, 0, 'Do not repeat synchronous OCR when definition pipeline owns it')
  }
  {
    const h = harness(), original = h.add('cancel-source'), receiver = h.add('keep-receiver', '归类')
    receiver.acceptType = '命题'
    await h.command('setReceiver', { noteId: receiver.noteId })
    const before = JSON.stringify(h.service.state(h.main).receiver)
    h.deps.addTemplate = async () => undefined
    const result = await h.command('addTemplate', { noteId: original.noteId, receive: true })
    assert.equal(result.cancelled, true)
    assert.equal(JSON.stringify(h.service.state(h.main).receiver), before, 'view/cancel keeps the receiver unchanged')
    assert.equal(h.calls.filter(c => c[0] === 'error' || c[0] === 'move' || c[0] === 'make').length, 0)
  }
  // Exercise the native adapter and the actual makeCard body; saved rough policy must not bypass full fields.
  // Exercise the actual notification bridge with dictionary/method wrappers, diagnostics and error replies.
  {
    const records = new Map(), lines = [], responses = [], win = {}, instance = { window: win }
    let sendFails = false
    const context = { module: { exports: {} }, console: { log: line => lines.push(line) },
      NSUserDefaults: { standardUserDefaults: () => ({ objectForKey: k => records.get(k), setObjectForKey: (v,k) => records.set(k,v) }) },
      Application: { sharedInstance: () => ({ studyController: () => ({ notebookController: { notebookId: 'study' } }) }), immersiveTemplateForAddon: () => ({ allowed: true, config: { scene: 'research' } }) },
    }
    vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(root, 'KnowledgeBaseResearchCore.js'), 'utf8'), context)
    const core = context.module.exports, key = core.diagnosticsKey
    const logs = () => JSON.parse(records.get(key))
    assert.equal(key, 'MNKB_ResearchDiagnostics_v1'); assert.equal(core.coreRevision, '1.87.8')
    assert.equal(logs()[0].stage, 'module.loaded'); assert.equal(logs()[0].hasMNUtil, false, 'Module load is visible before MNUtil exists')
    context.MNUtil = { currentWindow: win, currentNotebookId: 'study', log: line => lines.push(line), postNotification: (name, info) => { if (sendFails) throw Error('PRIVATE_BODY_SHOULD_NOT_BE_LOGGED'); responses.push({ name, info, data: JSON.parse(info.json) }) } }
    const dictionary = fields => ({ objectForKey(k) { return fields[k] } })
    const wrappedString = string => ({ toString() { return string } })
    const request = (id, command = 'getState', notebookId = 'study') => ({ version: 1, requestId: id, command, notebookId, clientVersion: '0.1.1' })
    const envelope = (json, window = win) => ({ userInfo() { return dictionary({ window, json }) } })
    await core.handleNotification(instance, envelope(wrappedString(JSON.stringify(request('native-string')))))
    assert.equal(responses.at(-1).data.requestId, 'native-string'); assert.equal(responses.at(-1).data.ok, true)
    assert.equal(responses.at(-1).data.coreRevision, '1.87.8'); assert.equal(responses.at(-1).data.build, '1.87.8')
    assert.equal(responses.at(-1).info.window, win)
    const nativeRequest = dictionary({ ...request('native-dictionary'), version: { integerValue() { return 1 } }, payload: dictionary({ title: 'PRIVATE_CARD_TITLE' }) })
    await core.handleNotification(instance, envelope(nativeRequest))
    assert.equal(responses.at(-1).data.requestId, 'native-dictionary'); assert.equal(responses.at(-1).data.ok, true)
    let count = responses.length
    await core.handleNotification(instance, envelope(JSON.stringify(request('foreign-window')), {}))
    assert.equal(responses.length, count, 'A foreign window receives no state or reply')
    assert.equal(logs().at(-1).stage, 'command.rejected'); assert.equal(logs().at(-1).reason, 'window-mismatch')
    await core.handleNotification(instance, { userInfo: dictionary({ json: JSON.stringify(request('missing-window')) }) })
    assert.equal(responses.length, count); assert.equal(logs().at(-1).reason, 'envelope-window-missing')
    await core.handleNotification(instance, envelope(JSON.stringify({ ...request('bad-protocol'), version: 2 })))
    assert.equal(responses.at(-1).data.requestId, 'bad-protocol'); assert.equal(responses.at(-1).data.ok, false)
    assert.equal(responses.at(-1).data.error.code, 'invalid-request')
    await core.handleNotification(instance, envelope(JSON.stringify(request('wrong-notebook', 'getState', 'other'))))
    assert.equal(responses.at(-1).data.requestId, 'wrong-notebook'); assert.equal(responses.at(-1).data.error.code, 'different-notebook')
    await core.handleNotification(instance, envelope('{broken-json'))
    assert.equal(responses.at(-1).data.error.code, 'invalid-json'); assert.equal(logs().at(-2).reason, 'request-decode-failed')
    await core.handleNotification(instance, envelope(JSON.stringify(request('unknown-command', 'PRIVATE_UNSUPPORTED_COMMAND'))))
    assert.equal(responses.at(-1).data.error.code, 'unknown-command')
    sendFails = true
    await core.handleNotification(instance, envelope(JSON.stringify(request('send-failed'))))
    assert.equal(logs().at(-1).stage, 'result.send-failed')
    assert.equal(logs().at(-1).errorCode, 'result-send-failed')
    core.trace('init.error', { initStage: 'config.init', noteId: 'PRIVATE_NOTE_ID', body: 'PRIVATE_BODY_SHOULD_NOT_BE_LOGGED', requestId: 'trace-test' })
    assert.equal(logs().at(-1).initStage, 'config.init')
    assert.equal(logs().at(-1).noteId, undefined); assert.equal(logs().at(-1).body, undefined)
    assert.ok(lines.some(item => item && item.source === 'MN KnowledgeBase:researchCore' && item.message === 'dispatch.succeeded'))
    const serialized = JSON.stringify(logs()) + JSON.stringify(lines)
    for (const secret of ['PRIVATE_CARD_TITLE', 'PRIVATE_UNSUPPORTED_COMMAND', 'PRIVATE_NOTE_ID', 'PRIVATE_BODY_SHOULD_NOT_BE_LOGGED']) assert.equal(serialized.includes(secret), false, 'Diagnostic output must contain metadata only')
    const dispatchStages = logs().filter(item => item.requestId === 'native-string').map(item => item.stage)
    assert.deepEqual(dispatchStages, ['command.received', 'dispatch.started', 'dispatch.succeeded', 'result.sent'])
    for (let i = 0; i < 85; i++) core.trace('test.bound', { requestId: 'bound-' + i })
    assert.equal(logs().length, 80); assert.equal(logs()[0].requestId, 'bound-5')
    assert.ok(logs().every(item => item.side === 'core' && item.version === '1.87.8' && item.build === '1.87.8' && item.coreRevision === '1.87.8'))
    context.NSUserDefaults.standardUserDefaults = () => { throw Error('unavailable') }
    context.MNUtil.log = () => { throw Error('unavailable') }; context.console.log = () => { throw Error('unavailable') }
    assert.doesNotThrow(() => core.trace('test.no-sinks'))
    const throwingDetails = Object.defineProperty({}, 'requestId', { get() { throw Error('getter-failed') } })
    assert.doesNotThrow(() => core.trace('test.bad-details', throwingDetails))
  }
  // Real pipeline stages reach MNLog through MNUtils, without storing card content or blocking on a log sink.
  {
    const entries = [], h = harness(), records = new Map()
    const context = { module: { exports: {} }, MNUtil: { log: entry => entries.push(entry) },
      NSUserDefaults: { standardUserDefaults: () => ({ objectForKey: k => records.get(k), setObjectForKey: (v, k) => records.set(k, v) }) } }
    vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(root, 'KnowledgeBaseResearchCore.js'), 'utf8'), context)
    const core = context.module.exports, service = core.create(h.deps), writesBefore = records.get(core.diagnosticsKey)
    const source = h.add('PRIVATE_NOTE_ID'); source.noteTitle = 'PRIVATE_CARD_TEXT'
    h.deps.syncIndex = () => ({ success: false, skipped: true, reason: 'empty-content' })
    h.ocr(async () => true)
    await service.processExcerpt(h.main, source)
    const pipeline = entries.filter(item => item.source === 'MN KnowledgeBase:researchPipeline')
    assert.deepEqual(pipeline.map(item => item.message), ['excerpt.queued', 'excerpt.started', 'route.finished', 'ocr.started', 'ocr.finished', 'convert.finished', 'index.finished', 'refresh.finished', 'excerpt.finished'])
    assert.ok(pipeline.every(item => item.detail.traceId === pipeline[0].detail.traceId))
    assert.equal(pipeline.find(item => item.message === 'index.finished').detail.skipped, true)
    assert.equal(pipeline.find(item => item.message === 'index.finished').detail.ok, true)
    assert.equal(pipeline.find(item => item.message === 'index.finished').detail.indexed, false)
    assert.equal(pipeline.at(-1).detail.ok, true)
    assert.equal(records.get(core.diagnosticsKey), writesBefore, 'Pipeline does not rewrite persistent diagnostics per stage')
    h.deps.syncIndex = () => ({ success: false })
    await service.processExcerpt(h.main, h.add('INDEX_FAILURE'))
    assert.equal(entries.filter(item => item.message === 'index.finished').at(-1).detail.ok, false)
    h.ocr(async () => { throw Error('PRIVATE_BODY') })
    await assert.rejects(service.processExcerpt(h.main, h.add('PRIVATE_FAIL_ID')))
    const failed = entries.find(item => item.message === 'excerpt.failed')
    assert.equal(failed.detail.phase, 'ocr'); assert.equal(failed.level, 'ERROR'); assert.equal(failed.detail.reason, 'exception')
    core.pipeline('test.privacy', { traceId: 'safe', body: 'PRIVATE_BODY', noteId: 'PRIVATE_NOTE_ID', durationMs: 1.2 })
    assert.equal(JSON.stringify(entries).includes('PRIVATE_'), false)
    context.MNUtil.log = () => { throw Error('sink-unavailable') }
    h.ocr(async () => true)
    assert.equal((await service.processExcerpt(h.main, h.add('AFTER_LOG_ERROR'))).handled, true)
  }
  // Exercise AddTemplate sibling creation and createTemplateChain against an OCR-only definition.
  // Runtime wiring: the research route is earlier than definition capture and all legacy branches.
  console.log('Public scene core: routing, context isolation, cancellation, diagnostics and mocked notification bridge passed; full MNKB host integration remains separate')
}
module.exports = { harness, start }
if (require.main === module) tests().catch(error => { console.error(error); process.exitCode = 1 })
