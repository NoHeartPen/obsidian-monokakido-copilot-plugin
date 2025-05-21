import { MarkdownView, Notice, Platform } from 'obsidian';
import { debugLog, PLUGIN_SETTINGS } from '../main';
import { openDictUrl, write2ClipBoard } from './open-dict-utils';
import { analyzeCursorWord } from './analyze-word-utils';
import { writeToHistory } from './history-utils';

/**
 * 搜索光标附近的单词
 */
export async function searchWordAtCursor() {
    new Notice('分析中、少々お待ちください。');
    try {
        const cursorWord = await getCursorWord();
        if (!cursorWord) {
            return;
        }
        doSearch(cursorWord);
    } catch (error) {
        console.error('Error getting cursor word:', error);
    }
}


/**
 * 执行搜索动作
 * @param word 推导的辞书形
 */
export async function doSearch(word: string) {
    new Notice(`物書堂で「${word}」を引きました`);
    if (Platform.isMobileApp) {
        // 在移动设备上总是通过 URL 自动打开
        PLUGIN_SETTINGS.searchByOpenUrl = true;
    }

    if (PLUGIN_SETTINGS.searchByOpenUrl === true) {
        openDictUrl(word);
    } else {
        await write2ClipBoard(word);
    }
}


/**
 * 获取光标所在行的上下文和索引，如果当前无有效 Markdown 编辑器视图，则返回 null。
 * @returns {object|null} 返回一个对象，包含以下属性：
 *  - context {string} 当前光标所在行的文本内容
 *  - cursorIndex {number} 当前光标在该行内的字符索引（从0开始）
 */
function getContextAndIndex(): { context: string; cursorIndex: number; } | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
        console.error('No active MarkdownView found.');
        return null;
    }
    const editor = view.editor;
    /**
     * 用户想查单词所在的上下文，用于形态素分析
     */
    let context = "";
    /**
     * 光标在上下文中的位置，用于计算形态素分析结果中最靠近光标的结果
     */
    let cursorIndex = 0;
    const selection = editor.getSelection();
    if (selection === "") {
        // 如果用户没有选中文字，那么获取光标所在行的所有文本作为上下文
        const cursor = editor.getCursor();
        context = editor.getLine(cursor.line);
        cursorIndex = cursor.ch;
    } else {
        context = selection;
        cursorIndex = 0;
    }
    return { context, cursorIndex };
}


/**
 * 通过上下文和光标索引获取光标附近的单词的辞书形
 * 并将上下文和单词保存到历史记录
 */
export async function getCursorWord(): Promise<string | undefined> {
    const result = getContextAndIndex();
    const context = result?.context ?? "";
    const cursorIndex = result?.cursorIndex ?? 0;
    debugLog(`context: ${context}, cursorIndex: ${cursorIndex}`);
    const word = await analyzeCursorWord(context, cursorIndex);
    debugLog(`cursorWord: ${word}`);
    if (word !== undefined) {
        writeToHistory(PLUGIN_SETTINGS.historyFilePath, context, word);
    }
    return word;
}
