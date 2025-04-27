import { PLUGIN_SETTINGS, debugLog } from 'src/main';

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
    const response = await fetch(PLUGIN_SETTINGS.morphemeAnalysisAPI, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sentence: context,
            cursor_index: cursorIndex
        })
    });

    if (!response.ok) {
        console.error('HTTP error:', response.status);
        return;
    }

    const data = await response.json();
    // 返回的数据格式： {jishokei: 'かける'}
    debugLog(data);
    const cursorWords = data.jishokei;
    return cursorWords;
}
