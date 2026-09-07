# DSH Regular Chat

[日本語](README.ja.md) · [简体中文](README.zh.md)

Chat in DSH without selecting a project. By default, each chat gets its own working directory under `~/.dsh/`.

## Installation

Run from your DSH repository:

```sh
pnpm dsh plugin --profile web add @askdkc/dsh-chat
```

Version 0.1.1 and later work without modifying DSH itself.

## Usage

Start or restart DSH Web:

```sh
pnpm dsh web
```

1. Open DSH in your browser and click **Regular Chat**. No project selection is needed.
2. Configure your model in DSH settings if needed, then send a message. Attachments, tools and approvals work as usual.
3. Click **New Regular Chat** in the conversation header to start another chat with a separate working directory.

Chats appear together under **Regular Chat** in the sidebar, while their working directories remain separate. Deleting this group removes it from the list; history moves to **Ungrouped**, and files remain.

Chat history and files remain after restarting DSH or uninstalling the plugin.
