# 文献研读

通过另行安装的 MNLiterature 开始／结束阅读及绑定文献流程处理，不自动选择文献，不改写既有 OCR 或制卡设置。

## 配置与版本

- [main 配置](../../templates/main/literature/template.json)：保留已确认基线；原模板 ID 不变。
- [dev 配置](../../templates/dev/literature/template.json)：日常修改入口；模板 ID 以 `-dev` 结尾。
- 两个渠道的 `plugins` 运行允许名单和 `pluginConfigs` 独立保留。插件源码不分渠道。

## 使用条件

另行安装并启用的 MNLiterature 及实际功能要求的共享插件；相关 Pro 功能继续受既有授权约束。

先核对 MNLiterature 的安装、启用和授权，再选择绑定文献并使用现有阅读入口。模板配置不能替代插件安装或功能授权。该模板没有独立的 Reading Scene 或 Research Scene 安装项。

构建命令为 `python3 tools/build-channels.py --scene literature`；产物位于 `output/main/` 与 `output/dev/`。

MNPinner、MNLiterature 的文件不随包分发。模板保留的依赖入口仍要求设备已有对应插件。新构建包的实机验收状态见[验收记录](../verification.md)。
