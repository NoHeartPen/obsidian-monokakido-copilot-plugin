// Minimal runtime boundaries; utility behavior remains in the real source modules.
export const PLUGIN_SETTINGS = {
	dictURL: 'mkdictionaries:///?text=<text_to_search>',
	morphemeAnalysisAPI: 'https://analysis.invalid/',
	searchByOpenUrl: false,
	historyFilePath: 'history.md',
};
export const boundary = {
	notices: [],
	request: async () => { throw new Error('Unexpected network request'); },
};
export function debugLog() {}
export class Notice {
	constructor(message) { boundary.notices.push(message); }
}
export function requestUrl(options) { return boundary.request(options); }
export class TFile {
	constructor(path) { this.path = path; }
}
export function normalizePath(path) {
	return path.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

export class MarkdownView {}
export const Platform = { isMobileApp: false };


export class Modal {
	constructor(app) {
		this.app = app;
		this.modalEl = { ownerDocument: app.workspace.containerEl.ownerDocument, addClass() {} };
	}
	open() { boundary.lastDialog = this; }
}
export class Plugin {
	constructor(app) { this.app = app; }
}
export class PluginSettingTab {}
export class ButtonComponent {}
export class TextComponent {}
export class Setting {}
