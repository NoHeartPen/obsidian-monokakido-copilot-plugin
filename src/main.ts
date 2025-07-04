import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { searchWordAtCursor } from './utils/cursor-word-utils';

/**
 * 调试模式开关
 */
const isDebug = false;

/**
 * 调试日志
 */
export function debugLog(...args: string[]) {
	if (isDebug) {
		console.log(...args);
	}
}


interface PluginSettingsInterface {
	/**
	 * 调用辞書的 URL
	 */
	dictURL: string;
	/**
	 * 是否调用 URL Scheme 查询
	 */
	searchByOpenUrl: boolean;
	/**
	 * 形态素分析 API
	 */
	morphemeAnalysisAPI: string;
	/**
	 * 双击指定的按键触发搜索
	 */
	doubleClickedKey: string;
	/**
	 * 查词历史记录文件路径
	 */
	historyFilePath: string;
	/**
	 * 是否启用双击指定按键触发搜索
	 */
	enableDoubleClickSearch: boolean;
}

export const PLUGIN_SETTINGS: PluginSettingsInterface = {
	// 默认使用 物書堂
	dictURL: 'mkdictionaries:///?text=<text_to_search>',
	// 默认不使用剪贴板查询模式
	searchByOpenUrl: false,
	// 如果你使用源码自己在本地部署请修改成 <http://127.0.0.1:8000/>
	// 形态素分析的源码 <https://github.com/NoHeartPen/fast-mikann-api>
	morphemeAnalysisAPI: 'https://www.nonjishokei.org/',
	// 默认按键为 Option 键（在 Windows 上是 Alt 键）
	doubleClickedKey: 'Alt',
	// 查词历史记录文件路径
	historyFilePath: 'MonoKakido Copilot History.md',
	// 默认使用双击指定按键触发搜索
	enableDoubleClickSearch: true,
}

export default class MonokakidoCopilotPlugin extends Plugin {
	settings: PluginSettingsInterface;

	private lastKeyupTime = 0;
	private lastKeyWasDouble: boolean


	/**
	 * 监听键盘按键弹起事件，启用时调用 searchOnDoublePress 处理双击搜索逻辑
	 * @param event 键盘事件
	 */
	private onKeyUpHandler = (event: KeyboardEvent) => {
		if (!this.settings.enableDoubleClickSearch) return;
		this.searchOnDoublePress(event);
	};


	/**
	 * 监听键盘按键按下事件，启用时调用 clearTimerOnDoublePress 清理双击定时器
	 * @param event 键盘事件
	 */
	private onKeyDownHandler = (event: KeyboardEvent) => {
		if (!this.settings.enableDoubleClickSearch) return;
		this.clearTimerOnDoublePress(event);
	};

	/**
	 * 双击监听指定按键时触发搜索
	 * @param event 键盘事件
	 */
	private searchOnDoublePress(event: KeyboardEvent) {
		const key = event.key;
		if (key !== PLUGIN_SETTINGS.doubleClickedKey) {
			this.lastKeyupTime = 0;
			return;
		}

		if (this.lastKeyWasDouble) {
			this.lastKeyWasDouble = false;
			return;
		}

		if (Date.now() - this.lastKeyupTime < 500) {
			this.lastKeyupTime = 0;
			searchWordAtCursor();
		}
		this.lastKeyupTime = Date.now();
	}

	/** 
	 * 双击指定按键后清空计时器
	 * @param event 键盘事件
	 */
	private clearTimerOnDoublePress(event: KeyboardEvent) {
		if (event.key !== PLUGIN_SETTINGS.doubleClickedKey) {
			this.lastKeyWasDouble = true;
		}
	}

	async onload() {
		await this.loadSettings();
		if (this.settings.enableDoubleClickSearch) {
			this.registerDomEvent(window, 'keyup', this.onKeyUpHandler);
			this.registerDomEvent(window, 'keydown', this.onKeyDownHandler);
		}

		this.addRibbonIcon('file-clock', 'Monokakido Copilot history', () => {
			this.openHistoryFile();
		});

		this.registerCommands();

		this.addSettingTab(new SettingTab(this.app, this));
	}


	private registerCommands() {
		this.addCommand({
			id: 'open-history',
			name: 'Open history',
			callback: () => {
				this.openHistoryFile();
			},
		});

		this.addCommand({
			id: 'search-cursor-word',
			name: 'Search cursor word',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				searchWordAtCursor();
			},
		});
	}

	private openHistoryFile() {
		const vault = this.app.vault;
		const filePath = PLUGIN_SETTINGS.historyFilePath;
		const file = vault.getFileByPath(filePath);
		if (file instanceof TFile) {
			this.app.workspace.openLinkText(filePath, '', true);
		} else {
			// FIXME 封装，因为有可能在写入笔记时文件又被删除了
			vault.create(
				filePath,
				'# MonoKakido Copilot history\n\nThis document is used for history.'
			);
			new Notice(`単語メモ帳は: ${filePath}`);
			this.app.workspace.openLinkText(filePath, '', true);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, PLUGIN_SETTINGS, await this.loadData());
		PLUGIN_SETTINGS.dictURL = this.settings.dictURL;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		PLUGIN_SETTINGS.dictURL = this.settings.dictURL;
	}
}


class SettingTab extends PluginSettingTab {
	plugin: MonokakidoCopilotPlugin;

	constructor(app: App, plugin: MonokakidoCopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Custom dictionary URL scheme')
			.setDesc('')
			.addText(text => text
				.setPlaceholder(PLUGIN_SETTINGS.dictURL)
				.setValue(this.plugin.settings.dictURL)
				.onChange(async (value) => {
					this.plugin.settings.dictURL = value;
					PLUGIN_SETTINGS.dictURL = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable double-click search')
			.setDesc('Enable or disable search by double-pressing the alt key')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.enableDoubleClickSearch)
					.onChange(async (value) => {
						this.plugin.settings.enableDoubleClickSearch = value;
						await this.plugin.saveSettings();
					}));
	}
}
