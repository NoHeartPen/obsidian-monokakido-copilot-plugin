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
        console.error('can not write to clipboard :', err);
    }
}
/**
 * 通过调用 URL Scheme 打开辞书
 * @param word 用于拼接 URL Scheme 的单词
 */
export function openDictUrl(word: string) {
    let dictUrl = "";
    debugLog(`openDictUrl: ${PLUGIN_SETTINGS.dictURL}`);
    if (PLUGIN_SETTINGS.dictURL.includes("<text_to_search>")) {
        // Monokakido URL Scheme is end with "<text_to_search>".
        debugLog(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}, includes <text_to_search>`);
        dictUrl = PLUGIN_SETTINGS.dictURL.replace("<text_to_search>", word);
    } else if (PLUGIN_SETTINGS.dictURL.includes("<文字列>")) {
        debugLog(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}, includes <文字列>`);
        dictUrl = PLUGIN_SETTINGS.dictURL.replace("<文字列>", word);
    } else if (PLUGIN_SETTINGS.dictURL.includes("{w}")) {
        // 通用的网址链接{w}
        debugLog(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}, includes {w}`);
        dictUrl = PLUGIN_SETTINGS.dictURL.replace("{w}", word);
    }
    else {
        // 直接在 URL Scheme 末尾拼接上单词
        debugLog(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}`);
        dictUrl = PLUGIN_SETTINGS.dictURL + word;
    }
    window.open(dictUrl, '_blank');
}
