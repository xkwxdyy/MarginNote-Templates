# MNKB 场景核心接入

`mnkb-scene-core/KnowledgeBaseResearchCore.js` 从现有 MNKB 场景实现提取，保留当前运行代码与 `1.87.8` 内部修订号。[MNKnowledgeBase](https://github.com/xkwxdyy/MNKnowledgeBase) 是公开项目，也是核心的唯一维护源。导出快照的来源提交和散列记录在 `source-baselines.json`；来源提交尚未推送时，不能声称公开远程已具备该实现。该修订号不是新插件的发布版本。

## 职责

| 导出 | 用途 | 使用条件 |
| --- | --- | --- |
| `create(deps)` | 依赖注入的场景会话、目标选择、排队、去重、摘录与制卡调度 | 提供存储、窗口、学习集、卡片和写入适配 |
| `getRuntime()` | 连接 MNKB 现有宿主能力的单例适配器 | MNUtils 与 MNKB 能力已加载 |
| `handleNotification(instance, sender)` | 处理场景命令并返回通知结果 | 当前窗口与协议版本匹配 |
| `sceneSnapshot()` | 读取 Research Scene 的模板许可及配置 | 宿主提供 `immersiveTemplateForAddon` |
| `trace`、`pipeline` | 记录有界诊断和阶段日志 | 可用日志存储；不记录笔记正文和真实笔记标识 |
| `commandNotification`、`resultNotification` | 场景通信名 `MNKBResearchCommand`、`MNKBResearchResult` | 请求、响应包含窗口与 `requestId` |

命令包括 `ping`、`getState`、`registerProject`、`startProject`、`stopProject`、`setReceiver`、`stopReceiver`、`setInbox`、`makeCard`、`addTemplate`、`createRequiredKnowledge`。`getState` 同步会话上下文。读取状态不构成自动恢复接收；已保存目标在重连后仍需显式启用。

## MNKB 宿主接入位置

核心须通过 MNKB 的 JSB 加载流程执行 `JSB.require('KnowledgeBaseResearchCore')`，并加入 MNKB 的运行文件清单。不得作为独立 addon 导入。

| MNKB 位置 | 接入动作 |
| --- | --- |
| `sceneWillConnect` | 注册 `onResearchCoreCommand:` 对 `MNKBResearchCommand` 的监听，再调用 `getRuntime().connect(instance)` |
| `onResearchCoreCommand` | 调用并等待 `handleNotification(instance, sender)` |
| `sceneDidDisconnect` | 先注销命令监听，再调用 `getRuntime().disconnect(instance)`；清理异常不能遗留监听 |
| 学习集关闭 | 调用 `getRuntime().close(instance, notebookId)` |
| 学习集或场景切换 | 调用 `getRuntime().state(instance)` 更新上下文并停止旧接收 |
| 唯一的 `onProcessNewExcerpt` | 场景激活时优先等待 `getRuntime().processExcerpt(instance, note)` 并结束旧分支；不得增加第二个摘录监听 |
| 手工编辑完成 | 场景核心激活时跳过旧版自动制卡分支 |

核心不复制完整 MNKB 制卡实现。默认接收目标、类型推断与 OCR 分别依赖 MNKB 实例的 `ensureInboxAutoMoveTargets`、`classInputRootNote`、`getReadingAutoTypeFromNote`、`applyQuickReadingOCRToTitle`、`applyOCRToTitleWithMode` 等现有能力。

`KnowledgeBaseTemplate` 提供场景识别、归类创建、类型与标题解析、模板链、完整制卡、引用转换、索引及局部刷新；`KnowledgeBaseConfig` 提供现有配置与用户明确选择的 Inbox。`MNUtil`、`MNNote`、`Application`、`NSUserDefaults` 提供宿主基础能力。定义概念、知识索引和中间知识索引适配按相应功能启用。当前目标若缺失这些实现，复制核心文件仍不能完成接入。

## 数据与分发

会话状态使用 `NSUserDefaults` 中的 `MNKB_ResearchCore_v1`。笔记目标在运行时由选择产生，源码不附带个人根卡片、模板卡片或笔记 URL。

模板包只附带 Reading Scene 或 Research Scene。MNKB 场景核心通过 MNKB 构建集成，既不冒充完整 MNKB 安装包，也不改变插件标识。该仓库不附带 MNUtils、MNKB、MNOCR、MNPinner、MNLiterature 或 MNToolbar 的完整插件包。

MNKB 继续直接构建自身源码。修改核心后，在该项目提交，再显式执行 `python3 tools/export-mnkb-core.py --source <MNKB检出目录>` 更新模板项目快照；`--check` 只读核对当前快照。模板构建不读取外部 MNKB 目录。公开项目内不得设置指向外部工作区的符号链接。新设备须单独核对 MNKB 安装包是否具有上述协议与接入点，不能仅比较显示版本号。

## 验证

`tests/scene-core-test.js` 从既有 MNKB 回归测试提取纯核心与通知适配部分，检查跨窗口／学习集隔离、接收优先级、排队取消、目标冻结、去重、重连状态及日志脱敏。依赖真实 `utils.js` 与 `main.js` 的部分保留在 MNKB 原项目测试中，未复制完整宿主源码。

离线测试通过不证明 MarginNote 通知调度、真实制卡、OCR、数据库写入或设备包安装已经通过。设备验收状态见 [验收记录](verification.md)。
