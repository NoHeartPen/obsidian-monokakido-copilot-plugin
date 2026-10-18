# Frequently Asked Questions

Q: I see the message “物書堂で引きました”, but nothing happens on the Monokakido side. However, the word history is recorded in Copilot History. Could this be a settings issue? (I'm using a Mac.)

A: On Mac, please make sure that “Clipboard Search” is **enabled** in the Monokakido settings.

![Clipboard Search is enabled](../asset/01.png)

Q: How can I use the dictionaries I've already configured in a new vault?

A: Back up the dictionary configuration in your original vault, then import it into the new vault by pasting the JSON or selecting the backup file.

1. Open the plugin settings in your original vault and find “辞書リンクのバックアップ” (Dictionary link backup).
2. Click “コピー” to copy the configuration as JSON text, then paste it into a text editor and save it. Alternatively, click “JSON をエクスポート” to save the configuration as `monokakido-dictionaries.json` in the root of your original vault. If a file with the same name already exists, a numeric suffix is added automatically. Check the success notice for the actual saved path.
3. Install and enable the plugin in your new vault, then open the plugin settings.
4. Under “辞書リンクのインポート” (Dictionary link import), click “貼り付けてインポート” to paste JSON, or “ファイルからインポート” to select a backup file, then click “インポート” to confirm. Import replaces the default and additional dictionaries in the new vault, preserving their names, URLs, and order. Other plugin settings remain unchanged. Invalid formats and unsupported versions are rejected.

Before importing, you will be asked whether to save the current dictionary configuration. Choosing to back up first saves `monokakido-dictionaries-auto-backup-YYYY-MM-DD-HH-mm.json` in the vault root, using the local date and time of import, to the minute. A numeric suffix is added if the filename already exists. If the backup fails, import does not proceed. You can also import without a backup or cancel.

**Export succeeded, but you can't find the JSON file?** Obsidian disables “Show all file types” by default, so the exported JSON file may not appear in Obsidian's file list. Go to “Settings → Files and links” and enable this option, or use your system's file manager (such as Finder or File Explorer) to find the file in the root of your original vault.

![Show all file types](../asset/02.png)

Enabling this option only makes the file appear in the list; it does not mean Obsidian can display the JSON contents directly. To view the contents, open the file in a text editor.

Please note that the backup includes the default dictionary URL and the names, URLs, and order of additional dictionaries. It does not include search history or other plugin settings. We recommend keeping a copy of the backup outside the vault.
