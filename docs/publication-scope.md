# 上传范围

项目名确定为 **MarginNote Templates**，拟用仓库名为 **MarginNote-Templates**，所属账号为 `xkwxdyy`。当前不创建远程仓库，不设置远程地址，不上传文件。

## 拟上传内容

`publication-files.json` 逐项列出模板 main／dev 配置、场景插件源码、提取的 MNKB 场景核心、离线测试、构建工具与必要说明。审核回执通过 `python3 tools/check-publication.py --report output/publication-review.json` 生成，记录每项文件的路径、字节数和 SHA-256。清单获准后仍须核对内容散列；文件变化需要重新审阅。

[MNKnowledgeBase](https://github.com/xkwxdyy/MNKnowledgeBase) 本身已经公开，继续独立维护和发布。新模板仓库收录所需场景核心的导出快照与接入说明；完整 MNKB 不重复复制。MNKB 的未发布本地改动、个人配置及新增安装包仍须按对应发布范围审阅。

## 排除内容

- MNPinner、MNLiterature 的源码、安装包及私有材料。
- 旧工作区的 Git 历史、MEMORY、完整官方资料镜像、调试日志、个人笔记绑定及本地路径配置。
- 原始 main 模板附件、私有组合构建器、旧版本产物与迁移备份。
- `addon-workspace.local.json` 等设备专用映射。
- `output/` 中的生成产物。Release 附件须另行确认具体文件，不能随源码上传自动发布。

菜单资料查询页、官方站点归档及待发 Issue 正文继续保存在原知识工作区，本轮不纳入模板发行项目。通过 Issue 联系官方机器人仍需独立确认发送对象与正文。

## main 基线

`source-baselines.json` 记录 main 配置字节的 SHA-256；构建器发现变化即停止。dev 配置与插件源码可以继续开发，不能自动改写 main 配置。

原工作区已有 main 安装包保持原字节。新项目重新构建的 main 安装包补齐模板声明的场景插件，因此包体可以与旧附件不同；模板配置本身必须与本次确认基线一致。

## 上传前确认

提交具体源码清单、文件散列、待发附件及验证范围；核验命令行 GitHub 账号为 `xkwxdyy`，再取得对应上传授权。许可证及对外说明尚未确认。
