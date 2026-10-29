# 知识学习

摘录默认保持原位；明确设置归类目标后接收类型匹配的摘录，不自动加入复习。手动制卡沿用既有复习规则。

## 配置与版本

- [main 配置](../../templates/main/intensive/template.json)：保留已确认基线；原模板 ID 不变。
- [dev 配置](../../templates/dev/intensive/template.json)：日常修改入口；模板 ID 以 `-dev` 结尾。
- 两个渠道的 `plugins` 运行允许名单和 `pluginConfigs` 独立保留。插件源码不分渠道。

## 使用条件

Reading Scene、已接入场景核心的 MNKB、MNUtils；OCR 流程还需对应提供方。

选中具有明确类型的归类卡，再执行“归类收集”；需要停止时执行“结束归类收集”。场景切换或重启后必须手动恢复。文档选区转换使用 Reading Scene 的独立 NativeTextMenu 与本地 TitleCase 模块，来源按钮及单双行布局分别配置。

构建命令为 `python3 tools/build-channels.py --scene intensive`；产物位于 `output/main/` 与 `output/dev/`。

MNPinner、MNLiterature 的文件不随包分发。模板保留的依赖入口仍要求设备已有对应插件。新构建包的实机验收状态见[验收记录](../verification.md)。
