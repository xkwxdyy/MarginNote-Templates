# MarginNote Templates

MarginNote 场景模板：[自由收集](docs/scenes/broad.md)、[知识学习](docs/scenes/intensive.md)、[课题研究](docs/scenes/research.md)、[文献研读](docs/scenes/literature.md)。

公开仓库：[xkwxdyy/MarginNote-Templates](https://github.com/xkwxdyy/MarginNote-Templates)。源码已于 2026-10-30 按审阅清单上传。当前提供源码及本地构建方法，安装包尚未发布；许可证尚未指定。

## 目录

| 位置 | 用途 |
| --- | --- |
| `templates/main/` | 已确认的 main 配置，构建时校验基线散列 |
| `templates/dev/` | 日常开发配置，采用独立的 `-dev` 模板身份 |
| `scene-plugins/reading-scene/` | 自由收集与知识学习所需的场景插件 |
| `scene-plugins/research-scene/` | 课题研究所需的场景插件 |
| `mnkb-scene-core/` | MNKB 场景核心的可追溯导出快照，须接入 MNKB 宿主 |
| `dependencies.json` | 场景插件与外部依赖边界 |
| `publication-files.json` | 源码的逐文件允许清单 |
| `output/` | 本地生成的可导入文件与校验记录，不进入源码提交 |

## 构建与检查

需要 Python 3.9 或更新版本及 Node.js 18 或更新版本；本轮使用 Node.js 24 检查。无需安装第三方依赖。

```sh
python3 tools/check.py
python3 tools/build-channels.py --scene-addons
python3 tools/check-publication.py --report output/publication-review.json
```

可通过 `--channel dev --scene intensive` 只构建知识学习 dev。构建器读取当前检出目录内的常规源文件，不读取相邻私有工程、原始模板附件或个人配置，不执行导入或重启。

main 与 dev 分别写入 `output/main/`、`output/dev/`；独立场景插件写入 `output/scene-addons/`。模板声明的 Reading Scene、Research Scene 均随对应 main 与 dev 包附带。模板允许名单和 `pluginConfigs` 原样保留；共享插件文件不随包附带。

本地统一 build 可将 Addon 工作区的 `template_workspace` 登记为该检出目录；路径解析示例见 `addon-workspace.example.json`。设备专用覆盖写入忽略的 `addon-workspace.local.json`。

## 依赖与接入

MNPinner、MNLiterature 的源码、安装包和私有配置均不进入该仓库及构建产物。模板中已有的插件标识与菜单配置继续保留，对应功能依赖设备上另行安装并启用的插件。

[MNKnowledgeBase](https://github.com/xkwxdyy/MNKnowledgeBase) 本身是公开项目，继续作为 MNKB 核心的唯一维护源。该目录保存核心导出快照，不能独立安装或代替完整 MNKB。自由收集、知识学习、课题研究依赖已接入该核心的 MNKB 和 MNUtils。曾核对的公开 main 提交尚未包含该场景协议；公开 Release 安装包的兼容性待核验。接入位置与能力条件见 [MNKB 场景核心接入](docs/mnkb-scene-core.md)。

## 验证范围

离线检查覆盖配置身份、main 基线、允许名单、插件配置、ZIP 完整性、包内源码一致性、重复构建结果、场景路由、取消与跨窗口保护、通知适配及日志脱敏。JavaScript 宿主对象由测试替身提供，不能代替 MarginNote 的设备验收。

目标宿主为 macOS MarginNote 5.0.0（50001）。新项目构建包的导入、真实文档选区、真实 MNKB 制卡及 OCR、iPad 使用均待验证。历史记录不自动作为本次产物的实机证据。

发布边界见 [上传范围](docs/publication-scope.md)，验证项目见 [验收记录](docs/verification.md)。
