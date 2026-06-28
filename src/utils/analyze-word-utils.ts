import { PLUGIN_SETTINGS, debugLog } from 'src/main';

import { Notice, requestUrl } from 'obsidian';

/**
 * 获取光标处附近的英文单词
 * @param context 光标所在的上下文
 * @param cursorIndex 光标位置
 * @returns 光标附近的英文单词，如果没有则返回空字符串
 */
function getCursorEnglishWord(context: string, cursorIndex: number): string {
    let start: number = cursorIndex;
    let end: number = cursorIndex;

    // 向前扫描，找到单词起点
    while (start > 0 && /\S/.test(context[start - 1])) {
        start--;
    }
    // 向后扫描，找到单词终点
    while (end < context.length && /\S/.test(context[end])) {
        end++;
    }

    // 提取并返回光标附近的单词
    return context.substring(start, end).trim();
}


/**
 * FIXME 获取光标附近的原始单词（未经形态素分析处理）
 * - 英文: 以空白字符为边界提取单词
 * - 日文: 以空白/标点符号为边界，最大前后各30字符
 * @param context 光标所在的上下文文本
 * @param cursorIndex 光标在上下文中的位置
 * @returns 提取的原始单词字符串
 */
export function getRawCursorWord(context: string, cursorIndex: number): string {
    if (!context || cursorIndex < 0 || cursorIndex > context.length) {
        return '';
    }

    // 不包含假名 → 英文模式，按空白边界提取
    if (!context.match(/[぀-ゟ゠-ヿ]/)) {
        return getCursorEnglishWord(context, cursorIndex);
    }

    // 日文模式：按空白/标点符号边界提取，最大前后各10 字符
    const maxWindow = 10;
    let start = cursorIndex;
    let end = cursorIndex;

    // 向前扩展
    while (start > 0 && cursorIndex - start < maxWindow) {
        const ch = context[start - 1];
        if (/[\s　-〿＀-￯!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(ch)) {
            break;
        }
        start--;
    }

    // 向后扩展
    while (end < context.length && end - cursorIndex < maxWindow) {
        const ch = context[end];
        if (/[\s　-〿＀-￯!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(ch)) {
            break;
        }
        end++;
    }

    return context.substring(start, end);
}

/**
 * 分析光标附近的单词
 * @param context 光标所在的上下文
 * @param cursorIndex 光标的位置
 * @returns 如果含有假名那么调用 API 分析光标附近单词的辞书形，反之直接借助空格判断
 */
export async function analyzeCursorWord(context: string, cursorIndex: number): Promise<string | undefined> {
    // 如果不包含任何假名，那么直接通过空格推导
    if (!context.match(/[\u3040-\u309F\u30A0-\u30FF]/)) {
        return getCursorEnglishWord(context, cursorIndex);
    }
    try {
        if (!navigator.onLine) {
            // 无网络链接时，不查询非英语单词而是进行提示
            new Notice('あれ？ネットがないみたいだね');
            return;
        }
        const response = await requestUrl({
            url: PLUGIN_SETTINGS.morphemeAnalysisAPI,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sentence: context,
                cursor_index: cursorIndex
            })
        });

        if (response.status !== 200) {
            console.error('HTTP error:', response.status);
            return;
        }

        const data = await response.json;
        // 返回的数据格式： {jishokei: 'かける'}
        debugLog(data);
        const cursorWords = data.jishokei;
        return cursorWords;
    } catch (error) {
        console.error('Request failed:', error);
        return;
    }
}
