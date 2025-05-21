import { normalizePath, TFile } from 'obsidian';
import { debugLog } from 'src/main';


/**
 * 移除字符串中的常见 Markdown 语法和 Obsidian 高亮标记，
 * 返回去除格式后的纯文本内容。
 * @param text 输入的可能包含 Markdown 格式的文本
 * @returns 去除 Markdown 格式后的纯文本
 */
function removeMarkdownSyntax(text: string): string {
    return text
        // 移除加粗 **text**
        .replace(/\*\*(.*?)\*\*/g, '$1')
        // 移除斜体 *text* or _text_
        .replace(/(\*|_)(.*?)\1/g, '$2')
        // 移除行内 `code`
        .replace(/`([^`]+)`/g, '$1')
        // Obsidian 专用高亮语法 ==text==
        .replace(/==(.+?)==/g, '$1')
        // 块引用 > blockquote
        .replace(/^>\s?/gm, '')
        // 标题 # Headings、 列表 -, +, *
        .replace(/^[#*-]\s?/gm, '')
        .trim();
}

/**
 * 将查词历史记录写入到指定的文件中
 * @param filePath 保存查词历史的文件路径
 * @param context 查词时的上下文
 * @param word 查询的单词
 */
export async function writeToHistory(filePath: string, context: string, word: string): Promise<void> {
    const normalizedFilePath = normalizePath(filePath);

    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile) {
        throw new Error('No active file found. Cannot create back link.');
    }
    /**
     * 添加所查单词的文件作为反向链接
     */
    const backLink = this.app.fileManager.generateMarkdownLink(activeFile, activeFile.path);
    context = removeMarkdownSyntax(context);

    const vault = this.app.vault;
    const file = vault.getAbstractFileByPath(normalizedFilePath);
    const noteContent = `\n> ${context} ${backLink}\n> ${word}\n> メモ：\n`;

    if (file instanceof TFile) {
        await vault.append(file, noteContent);
    } else {
        await vault.create(filePath, noteContent);
    }
    debugLog(`Content written to file: ${filePath}`);
}
