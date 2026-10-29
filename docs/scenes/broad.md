# 自由收集

默认 Inbox；明确目标按既有规则接收。完整制卡不自动复习。

## 配置与版本

- [main 配置](../../templates/main/broad/template.json)：保留已确认基线；原模板 ID 不变。
- [dev 配置](../../templates/dev/broad/template.json)：日常修改入口；模板 ID 以 `-dev` 结尾。
- 两个渠道的 `plugins` 运行允许名单和 `pluginConfigs` 独立保留。插件源码不分渠道。

## 使用条件

Reading Scene、已接入场景核心的 MNKB、MNUtils；OCR 流程还需对应提供方。

首次使用时选择实际收集根卡，再通过“设为自由收集 Inbox”确认位置。AddTemplate 只创建模板，接收目标须另行设置。重启或场景切换后，旧目标等待手动恢复。

构建命令为 `python3 tools/build-channels.py --scene broad`；产物位于 `output/main/` 与 `output/dev/`。

MNPinner、MNLiterature 的文件不随包分发。模板保留的依赖入口仍要求设备已有对应插件。新构建包的实机验收状态见[验收记录](../verification.md)。
