# 课题研究

围绕课题入口与明确接收目标收集材料，沿用现有类型匹配及路由规则。场景插件负责交互，MNKB 负责唯一的摘录处理。

## 配置与版本

- [main 配置](../../templates/main/research/template.json)：保留已确认基线；原模板 ID 不变。
- [dev 配置](../../templates/dev/research/template.json)：日常修改入口；模板 ID 以 `-dev` 结尾。
- 两个渠道的 `plugins` 运行允许名单和 `pluginConfigs` 独立保留。插件源码不分渠道。

## 使用条件

Research Scene、已接入场景核心的 MNKB、MNUtils；OCR 流程还需对应提供方。

先在卡片菜单执行“登记为课题入口”，再从科研入口开始课题。需要定向接收时，明确选择归类卡或命题卡作为目标。AddTemplate 不自动启用接收；重启、切换场景或退出学习集后需要手动恢复。

构建命令为 `python3 tools/build-channels.py --scene research`；产物位于 `output/main/` 与 `output/dev/`。

MNPinner、MNLiterature 的文件不随包分发。模板保留的依赖入口仍要求设备已有对应插件。新构建包的实机验收状态见[验收记录](../verification.md)。
