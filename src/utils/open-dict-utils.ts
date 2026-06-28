import { debugLog, PLUGIN_SETTINGS } from "src/main";


/**
 * 将要查的单词写入剪贴板
 * @param word 需要要写入剪贴板的单词
 */
export async function write2ClipBoard(word: string) {
    try {
        await navigator.clipboard.writeText(word);
        debugLog(`write 「${word}」 to clipboard successfully`);
    } catch (err) {
        console.error('cannot write to clipboard :', err);
    }
}

/**
 * 根据辞書 URL 模板构建完整的查词 URL
 * @param word 用于拼接 URL 的单词
 * @param urlTemplate 可选的 URL 模板，未指定时使用 PLUGIN_SETTINGS.dictURL
 * @returns 拼接后的完整 URL
 */
export function buildDictUrl(word: string, urlTemplate?: string): string {
    const url = urlTemplate ?? PLUGIN_SETTINGS.dictURL;
    debugLog(`buildDictUrl: ${url}`);
    if (url.includes("<text_to_search>")) {
        // 物书堂词典软件被设置为非日语时，默认的 URL 风格
        debugLog(`url includes <text_to_search>`);
        return url.replace("<text_to_search>", word);
    } else if (url.includes("<文字列>")) {
        debugLog(`url includes <文字列>`);
        return url.replace("<文字列>", word);
    } else if (url.includes("{w}")) {
        // 通用的网址链接{w}
        debugLog(`url includes {w}`);
        return url.replace("{w}", word);
    }
    // 直接在 URL Scheme 末尾拼接上单词
    debugLog(`url: ${url}`);
    return url + word;
}

/**
 * 通过调用 URL Scheme 打开辞书
 * @param word 用于拼接 URL Scheme 的单词
 */
export function openDictUrl(word: string) {
    window.open(buildDictUrl(word), '_blank');
}
