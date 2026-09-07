# DSH Regular Chat

[日本語](README.ja.md) · [简体中文](README.zh.md)

Chat in DSH without selecting a project. Each chat created with this plugin gets its own working directory.

## Build and install

Requires Node.js 22.19+ (22.x) or 24+, and pnpm 11.7.0. **DSH needs the included patch**; installing the plugin alone is not enough.

Run from this plugin repository's root directory:

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

## Usage

Start DSH from this plugin repository's root directory:

```sh
(cd .upstream && pnpm dsh web --no-open)
```

1. Open the URL printed by DSH in your browser.
2. Click **Regular Chat** in the center of the page. No project selection is needed.
3. Configure your model in DSH settings if needed, then send a message. Attachments, tools and approvals work as usual.
4. Click **New Regular Chat** in the conversation header to start another chat with a separate working directory.

Chat history and files remain after restarting DSH or uninstalling the plugin.
