import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { searchWordAtCursor, searchWordAtCursorInDialog, getContextAndIndex } from './utils/cursor-word-utils';

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


/**
 * Dialog モードの辞書カテゴリ
 */
export interface DictCategory {
	/** ボタンに表示するラベル */
	label: string;
	/** URL テンプレート（<text_to_search> / <文字列> / {w} 形式、または直接拼接） */
	url: string;
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
	/**
	 * 搜索模式: 'quick' (快速模式，默认) 或 'dialog' (窗口模式)
	 */
	searchMode: 'quick' | 'dialog';
	/**
	 * コンパクトなダイアログ UI（説明ラベルを非表示にする）
	 * デフォルトは false（説明ラベルを表示）
	 */
	compactDialogUI: boolean;
	/**
	 * 用户反馈表单 URL（留空时不显示反馈按钮）
	 */
	feedbackFormURL: string;
	/**
	 * Dialog モードの辞書カテゴリ一覧
	 * デフォルトの辞書（dictURL）の後に表示される追加カテゴリ
	 */
	dialogDictCategories: DictCategory[];
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
	// 默认搜索模式为快速模式
	searchMode: 'quick',
	// 默认不隐藏ダイアログの説明ラベル
	compactDialogUI: false,
	// 用户反馈表单 URL（留空时不显示反馈按钮）
	feedbackFormURL: '',
	// Dialog モードのデフォルト辞書カテゴリ
	dialogDictCategories: [
		{ label: '国語', url: 'mkdictionaries:///?text=<text_to_search>&category=ja' },
		{ label: '英英', url: 'mkdictionaries:///?text=<text_to_search>&category=en' },
		{ label: '英和', url: 'mkdictionaries:///?text=<text_to_search>&category=en-ja' },
	],
}

export default class MonokakidoCopilotPlugin extends Plugin {
	settings: PluginSettingsInterface;

	private lastKeyupTime = 0;
	private lastKeyWasDouble: boolean

	/** 状态栏模式指示器元素（public: SettingTab 需要访问以更新文本） */
	statusBarItemEl: HTMLElement | null = null;
	/** 上一次搜索的上下文（用于检测"双击两次 → Dialog 模式"） */
	private lastSearchContext: string | null = null;
	/** 上一次搜索的光标位置 */
	private lastSearchCursorIndex: number | null = null;


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
	 * - Quick 模式: 直接搜索光标附近单词
	 * - Dialog 模式: 弹起窗口模式对话框
	 * - Quick 模式 + 同一上下文双击两次: 自动切换到 Dialog 模式
	 * @param event 键盘事件
	 */
	private async searchOnDoublePress(event: KeyboardEvent) {
		const key = event.key;
		if (key !== PLUGIN_SETTINGS.doubleClickedKey) {
			this.lastKeyupTime = 0;
			return;
		}

		if (this.lastKeyWasDouble) {
			this.lastKeyWasDouble = false;
			return;
		}

		if (Date.now() - this.lastKeyupTime >= 500) {
			this.lastKeyupTime = Date.now();
			return;
		}

		// 检测到双击
		this.lastKeyupTime = 0;

		if (this.settings.searchMode === 'dialog') {
			// Dialog 模式: 直接弹起窗口模式对话框
			await searchWordAtCursorInDialog();
			return;
		}

		// Quick 模式: 检测是否为同一上下文的第二次双击
		const current = getContextAndIndex();

		if (current && current.context !== ''
			&& this.lastSearchContext === current.context
			&& this.lastSearchCursorIndex === current.cursorIndex) {
			// 同一上下文双击两次 → 自动切换到 Dialog 模式
			this.lastSearchContext = null;
			this.lastSearchCursorIndex = null;
			await searchWordAtCursorInDialog();
			return;
		}

		// 正常 Quick 模式搜索
		if (current) {
			this.lastSearchContext = current.context;
			this.lastSearchCursorIndex = current.cursorIndex;
		}
		await searchWordAtCursor();
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

		// 添加状态栏模式指示器（桌面端右下角，移动端同样可用）
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.setText(this.settings.searchMode === 'quick' ? 'Quick モード' : 'Dialog モード');
		this.statusBarItemEl.addClass('mod-clickable');
		this.statusBarItemEl.setAttr('aria-label', 'Toggle search mode');
		this.statusBarItemEl.onClickEvent(() => {
			this.settings.searchMode = this.settings.searchMode === 'quick' ? 'dialog' : 'quick';
			PLUGIN_SETTINGS.searchMode = this.settings.searchMode;
			if (this.statusBarItemEl) {
				this.statusBarItemEl.setText(this.settings.searchMode === 'quick' ? 'Quick モード' : 'Dialog モード');
			}
			this.saveSettings();
		});

		this.addSettingTab(new SettingTab(this.app, this));
	}


	private registerCommands() {
		this.addCommand({
			id: 'open-history',
			name: '単語メモ帳を開く',
			callback: () => {
				this.openHistoryFile();
			},
		});

		this.addCommand({
			id: 'search-cursor-word',
			name: 'カーソルの単語を検索',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				searchWordAtCursor();
			},
		});

		this.addCommand({
			id: 'search-cursor-word-dialog',
			name: 'Dialog モードでカーソルの単語を検索',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				searchWordAtCursorInDialog();
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
		Object.assign(PLUGIN_SETTINGS, this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		Object.assign(PLUGIN_SETTINGS, this.settings);
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
			.setDesc('Dialog モードで「デフォルトの辞書」ボタンとして表示されます。')
			.addText(text => text
				.setPlaceholder(PLUGIN_SETTINGS.dictURL)
				.setValue(this.plugin.settings.dictURL)
				.onChange(async (value) => {
					this.plugin.settings.dictURL = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('モード切替')
			.setDesc('Quick: ダブルプレスで直接検索。Dialog: オプション付きのダイアログを表示。')
			.addDropdown(dropdown =>
				dropdown
					.addOption('quick', 'Quick モード')
					.addOption('dialog', 'Dialog モード')
					.setValue(this.plugin.settings.searchMode)
					.onChange(async (value: 'quick' | 'dialog') => {
						this.plugin.settings.searchMode = value;
						PLUGIN_SETTINGS.searchMode = value;
						if (this.plugin.statusBarItemEl) {
							this.plugin.statusBarItemEl.setText(value === 'quick' ? 'Quick モード' : 'Dialog モード');
						}
						await this.plugin.saveSettings();
					}));

		new Setting(containerEl)
			.setName('コンパクトなダイアログ UI')
			.setDesc('Dialog モードの説明ラベル（「もしかして：」「検索語：」「辞書を引く：」）を非表示にします。モバイル環境で画面を有効活用したい場合に推奨。')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.compactDialogUI)
					.onChange(async (value) => {
						this.plugin.settings.compactDialogUI = value;
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

		// 允许用户自定义 Dialog 模式的辞书按钮
		containerEl.createEl('h3', { text: 'Dialog モードの辞書ボタンを追加' });
		containerEl.createEl('p', {
			text: '「デフォルトの辞書」（上記 dictURL）の後に表示される追加ボタンです。ラベルと URL スキーマを設定してください。',
			cls: 'setting-item-description',
		});

		const categoriesContainer = containerEl.createDiv();

		const renderCategories = () => {
			categoriesContainer.empty();
			const categories = this.plugin.settings.dialogDictCategories;

			categories.forEach((cat, index) => {
				new Setting(categoriesContainer)
					.addText(text => {
						text.setValue(cat.label)
							.setPlaceholder('ラベル（例: 国語）')
							.onChange(async (value) => {
								this.plugin.settings.dialogDictCategories[index].label = value;
								await this.plugin.saveSettings();
							});
					})
					.addText(text => {
						text.setValue(cat.url)
							.setPlaceholder('URL テンプレート（例: mkdictionaries:///?text=<text_to_search>&category=ja）')
							.onChange(async (value) => {
								this.plugin.settings.dialogDictCategories[index].url = value;
								await this.plugin.saveSettings();
							});
						text.inputEl.style.width = '100%';
					})
					.addButton(btn => btn
						.setButtonText('削除')
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.dialogDictCategories.splice(index, 1);
							await this.plugin.saveSettings();
							renderCategories();
						}));
			});

			new Setting(categoriesContainer)
				.addButton(btn => btn
					.setButtonText('URL スキームを追加')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.dialogDictCategories.push({ label: '', url: '' });
						await this.plugin.saveSettings();
						renderCategories();
					}));
		};

		renderCategories();
	}
}
