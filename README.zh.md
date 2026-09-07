# DSH 普通聊天

[English](README.md) · [日本語](README.ja.md)

无需选择项目，即可在 DSH 中聊天。通过本插件创建的每个聊天都有独立的工作目录。

## 安装

在 DSH 仓库根目录执行：

```sh
pnpm dsh plugin --profile web add @askdkc/dsh-chat
```

DSH 本体需要先应用[随附补丁](patches/dsh-d347e703-hero-actions.patch)。

## 使用方法

启动或重启 DSH Web：

```sh
pnpm dsh web
```

1. 在浏览器中打开 DSH，点击 **普通聊天**，无需选择项目。
2. 如有需要，先在 DSH 设置中配置模型，然后发送消息。附件、工具和审批功能照常使用。
3. 点击对话标题旁的 **新建普通聊天**，即可创建另一个使用独立工作目录的聊天。

重启 DSH 或卸载插件后，聊天记录和文件仍会保留。
