# 项目约定

- 该项目只维护场景模板、Reading Scene、Research Scene，以及模板需要的 MNKB 场景核心。不得复制完整私有工作区或历史 Git 数据。
- MNPinner 与 MNLiterature 的源码、包体、许可证材料、个人数据不得进入提交或嵌套模板包；现有模板依赖标识及 `pluginConfigs` 保留。
- 日常配置修改进入 dev；main 基线变更须取得明确授权。main 与 dev 不拆分插件源码。
- MNKB 场景核心继续在现有公开 MNKnowledgeBase 仓库维护。修改完成并提交后，通过 `tools/export-mnkb-core.py --source <MNKB检出目录>` 更新导出快照；不在快照中独立修改运行代码。
- `publication-files.json` 是源码上传允许清单。新增公开文件须更新清单并执行 `python3 tools/check.py`；打包执行 `python3 tools/build-channels.py --scene-addons`。
- `output/` 为可导入产物目录，不进入源码提交。上传源码、发布附件及对外沟通分别在具体文件审阅后执行。
- MNKB 核心的纯逻辑测试、模拟宿主适配、完整 MNKB 集成测试与设备验收分别报告；不得将离线通过写成实机验证。
