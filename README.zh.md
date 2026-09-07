# DSH 普通聊天

[English](README.md) · [日本語](README.ja.md)

无需选择项目，即可在 DSH 中聊天。通过本插件创建的每个聊天都有独立的工作目录。

## 安装

需要 Node.js 22.19+（22.x）或 24+，以及 pnpm 11.7.0。**必须先为 DSH 应用随附补丁**，仅安装插件无法使用。

在本插件仓库的根目录执行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git .upstream
git -C .upstream checkout d347e703908d0406b7a7ef80e3a0e594d86b2215
git -C .upstream apply --check ../patches/dsh-d347e703-hero-actions.patch
git -C .upstream apply ../patches/dsh-d347e703-hero-actions.patch
(cd .upstream && pnpm install --frozen-lockfile && pnpm run gen-client-catalog && pnpm run build)
npm ci
npm run build
npm pack
(cd .upstream && pnpm dsh plugin --profile web add ../dsh-regular-chat-0.1.0.tgz)
```

## 使用方法

在本插件仓库的根目录启动 DSH：

```sh
(cd .upstream && pnpm dsh web --no-open)
```

1. 在浏览器中打开 DSH 输出的网址。
2. 点击页面中央的 **普通聊天**，无需选择项目。
3. 如有需要，先在 DSH 设置中配置模型，然后发送消息。附件、工具和审批功能照常使用。
4. 点击对话标题旁的 **新建普通聊天**，即可创建另一个使用独立工作目录的聊天。

重启 DSH 或卸载插件后，聊天记录和文件仍会保留。
