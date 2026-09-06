# Tokyra Chrome extension

Tokyra is a Manifest V3 browser extension for optimizing long AI prompts with the Tokyra Cloudflare Worker. Its inline assistant automatically checks the active editor after you pause typing and surfaces a one-click rewrite beside the field.

## Install unpacked

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this `tokyra-extension` folder.
5. Pin Tokyra from Chrome's extensions menu if desired.

The extension starts with the live worker at `https://tokyra-compressor.tokyracompany.workers.dev`. Open the extension settings to use another Worker URL, change optimization defaults, or pause the inline assistant on selected sites.

## Use

- Focus a text area or editable field and write normally. After a short pause, Tokyra automatically checks the latest text and opens a suggestion beside the field.
- Apply, copy, or dismiss the rewrite without leaving the page. If you continue typing during a check, stale results are ignored and the newest version is analyzed next.
- Click Tokyra in the Chrome toolbar to optimize text manually.
- Right-click in an editable field and choose **Optimize with Tokyra**.
- Use `Alt+Shift+O` on Windows/Linux or `Control+Shift+O` on macOS.

## Privacy

When **Suggest as I write** is enabled, text in the active eligible editor is sent to the configured Worker after the typing pause and minimum-length threshold. Password, payment-code, and one-time-code fields are excluded. Turning off automatic suggestions makes transmission user-initiated only. Preferences are stored with Chrome sync storage. The extension does not include analytics, advertising, or third-party scripts.

## Package for review

Zip the contents of this folder with `manifest.json` at the root. Keep `icon-source.svg` if desired; Chrome uses the generated PNG files referenced by the manifest.
