# Frequently Asked Questions

Q: I see the message “物書堂で引きました”, but nothing happens on the Monokakido side. However, the word history is recorded in Copilot History. Could this be a settings issue? (I'm using a Mac.)

A: On Mac, please make sure that “Clipboard Search” is **enabled** in the Monokakido settings.

![Clipboard Search is enabled](../asset/01.png)

Q: How can I use the dictionaries I've already configured in a new vault?

A: Back up the dictionary configuration in your original vault, then use that backup as a reference to configure the new vault. The plugin currently supports copying and exporting, but does not support importing JSON files directly.

1. Open the plugin settings in your original vault and find “辞書リンクのバックアップ” (Dictionary link backup).
2. Click “コピー” to copy the configuration as JSON text, then paste it into a text editor and save it. Alternatively, click “JSON をエクスポート” to save the configuration as `monokakido-dictionaries.json` in the root of your original vault. If a file with the same name already exists, a numeric suffix is added automatically. Check the success notice for the actual saved path.
3. Install and enable the plugin in your new vault, then open the plugin settings.
4. Use `dictURL` in the backup for the default dictionary URL. Then add the dictionaries in the order listed in `dialogDictCategories`, using each entry's `label` as the button name and `url` as the dictionary URL. Keep the `<text_to_search>`, `<文字列>`, or `{w}` placeholders in the URLs.

**Export succeeded, but you can't find the JSON file?** Obsidian disables “Show all file types” by default, so the exported JSON file may not appear in Obsidian's file list. Go to “Settings → Files and links” and enable this option, or use your system's file manager (such as Finder or File Explorer) to find the file in the root of your original vault.

![Show all file types](../asset/02.png)

Enabling this option only makes the file appear in the list; it does not mean Obsidian can display the JSON contents directly. To view the contents, open the file in a text editor.

Please note that the backup includes the default dictionary URL and the names, URLs, and order of additional dictionaries. It does not include search history or other plugin settings. We recommend keeping a copy of the backup outside the vault.
