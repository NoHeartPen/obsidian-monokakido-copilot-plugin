import { Modal, App, ButtonComponent, TextComponent, Setting, Notice, Platform, MarkdownView, TFile, normalizePath } from 'obsidian';
import { PLUGIN_SETTINGS } from '../main';
import { buildDictUrl } from './open-dict-utils';
import { writeToHistory } from './history-utils';
import { getRawCursorWord, analyzeCursorWord } from './analyze-word-utils';

interface DialogWordData {
	/**
	 * 查词时的上下文文本
	 */
	context: string;
	/**
	 * API 形态素分析结果（辞書形）
	 */
	searchWord: string;
	/**
	 * 光标在上下文文本中的位置索引
	 */
	cursorIndex: number;
	/**
	 * 光标附近的原始文本
	 */
	rawWord: string;
}

export function openDialogMode(app: App, data: DialogWordData) {
	new SearchDialog(app, data).open();
}

class SearchDialog extends Modal {
	data: DialogWordData;
	searchWord: string;
	candidates: (string | null)[];
	private readonly buttonMeasureCanvas: HTMLCanvasElement = document.createElement('canvas');

	/**
	 * 候选词按钮容器，用于动态渲染候选词按钮
	 */
	private candidateContainer!: HTMLElement;
	/**
	 * 搜索词输入框对象，用于监听用户输入
	 */
	private searchWordInput!: TextComponent;
	/**
	 * 辞典按钮容器，用于动态渲染多个辞典按钮
	 */
	private dictButtonContainer!: HTMLElement;
	/**
	 * 上下文文本输入框对象，用于监听光标移动
	 */
	private contextTextArea!: HTMLTextAreaElement;
	/**
	 * メモテキストエリア，用于记录用户输入的笔记
	 */
	private memoTextArea!: HTMLTextAreaElement;

	/**
	 * 记录上一次光标位置，用于判断光标是否移动
	*/
	private lastCursorPos: number = -1;
	/**
	 * 防抖定时器 ID，用于光标移动后延迟分析单词
	 */
	private cursorAnalysisTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(app: App, data: DialogWordData) {
		super(app);
		this.data = data;
		this.searchWord = data.searchWord;  // 默认选择第一个候选词（API 分析结果）
		this.candidates = this.buildCandidates(data);
		this.lastCursorPos = data.cursorIndex;
	}

	/**
	 * 是否显示标签（移动端默认不显示，桌面端显示）
	 * @return {boolean} 如果显示标签返回 true，否则返回 false
	 */
	private showLabels(): boolean {
		return !PLUGIN_SETTINGS.compactDialogUI;
	}

	/**
	 * 判断当前是否为移动端
	 * @returns {boolean} 如果是移动端返回 true，否则返回 false
	 */
	private isMobile(): boolean {
		return Platform.isMobileApp;
	}

	/**
	 * 构建候选词列表（最多5个）
	 */
	private buildCandidates(data: DialogWordData): (string | null)[] {
		const c: (string | null)[] = [null, null, null, null, null];
		// API 分析结果
		if (data.searchWord) {
			c[0] = data.searchWord;
		}
		return c;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.buildContextArea(contentEl);

		// 候选词按钮区域，
		this.buildCandidateButtons(contentEl);

		// 搜索词输入框，允许用户手动修改搜索词
		this.buildSearchWordInput(contentEl);

		// 辞典 URL 按钮区域，允许用户点击按钮直接打开辞典
		this.buildDictButtons(contentEl);

		// メモテキストエリア，用于记录用户输入的笔记
		this.buildMemoArea(contentEl);

		// 操作按钮区域 (添加到笔记 / 取消)
		this.buildActionButtons(contentEl);

		// Dialog 打开后的自动操作
		this.onDialogFirstOpened();
	}

	/**
	 *  上下文区域，记录查词时的上下文
	 */
	private buildContextArea(container: HTMLElement) {
		const lines = this.data.context.split('\n').length;
		// 控制 TextArea 的行数：移动端最多 4 行，桌面端最多 10 行，最少 4 行
		const maxRows = this.isMobile() ? 4 : 10;
		const rows = Math.min(Math.max(lines, 4), maxRows);

		const setting = new Setting(container)
			.addTextArea(ta => {
				ta.setValue(this.data.context)
					.setPlaceholder('何か入力してみましょう');
				ta.inputEl.readOnly = false;
				ta.inputEl.rows = rows;
				ta.inputEl.style.width = '100%';
				ta.inputEl.style.boxSizing = 'border-box';
				ta.inputEl.style.padding = this.isMobile() ? '6px 8px' : '8px';
				this.contextTextArea = ta.inputEl;
			});

		// 隐藏空的 infoEl，让 controlEl 填满整行宽度
		setting.infoEl.style.display = 'none';
		setting.controlEl.style.width = '100%';

		// 光标移动监听：点击 或 方向键/导航键 → 分析光标处单词
		const handleCursorMove = () => {
			const ta = this.contextTextArea;
			const newPos = ta.selectionStart;
			if (newPos !== this.lastCursorPos) {
				this.lastCursorPos = newPos;
				this.onCursorMove(ta.value, newPos);
			}
		};

		this.contextTextArea.addEventListener('click', handleCursorMove);
		this.contextTextArea.addEventListener('keyup', (e: KeyboardEvent) => {
			// 仅导航键触发，避免每次输入都调用 API
			const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
				'Home', 'End', 'PageUp', 'PageDown'];
			if (navKeys.includes(e.key)) {
				handleCursorMove();
			}
		});
	}

	/**
	 * 光标移动回调：防抖 300ms 后分析光标处的单词并更新候选词列表
	 */
	private onCursorMove(context: string, cursorIndex: number) {
		if (this.cursorAnalysisTimer) {
			globalThis.clearTimeout(this.cursorAnalysisTimer);
		}
		this.cursorAnalysisTimer = globalThis.setTimeout(async () => {
			const rawWord = getRawCursorWord(context, cursorIndex);
			const analyzedWord = await analyzeCursorWord(context, cursorIndex);

			if (!analyzedWord) return;

			// 更新 data（仅刷新内部数据，不自动选中）
			this.data.context = context;
			this.data.cursorIndex = cursorIndex;
			this.data.searchWord = analyzedWord;
			this.data.rawWord = rawWord;

			// 仅更新候选词按钮，等用户主动点击后才填入搜索框/更新词典
			this.candidates = this.buildCandidates(this.data);
			this.renderCandidates();
		}, 300);
	}

	/**
	 * 候选词按钮区域
	 */
	private buildCandidateButtons(container: HTMLElement) {
		const setting = new Setting(container)
			.setName(this.showLabels() ? 'もしかして：' : '');
		if (!this.showLabels()) {
			setting.infoEl.style.display = 'none';
		}
		if (this.isMobile()) {
			setting.controlEl.style.width = '100%';
		}
		this.candidateContainer = setting.controlEl.createDiv();
		this.renderCandidates();
	}

	/**
	 * 渲染候选词按钮
	 * 每次候选词变更时重建所有按钮以更新高亮状态
	 */
	private renderCandidates() {
		this.candidateContainer.empty();
		// 移动端使用更紧凑的布局
		this.candidateContainer.style.display = 'flex';
		this.candidateContainer.style.flexWrap = 'wrap';
		this.candidateContainer.style.gap = this.isMobile() ? '4px' : '6px';

		this.candidates.forEach((candidate) => {
			if (candidate === null) return;
			const isActive = candidate === this.searchWord;
			const btn = new ButtonComponent(this.candidateContainer)
				.setButtonText(candidate)
				.onClick(() => {
					this.selectCandidate(candidate);
				});

			if (isActive) {
				btn.setCta();
			}

			// 移动端按钮宽度自适应，且文本居中
			if (this.isMobile()) {
				this.applyMobileButtonContentWidth(btn);
			}
		});
	}

	/**
	 * 移动端按钮按文字内容计算所需宽度，避免同一行按钮被均分撑宽
	 */
	private applyMobileButtonContentWidth(btn: ButtonComponent) {
		const el = btn.buttonEl;
		const computed = globalThis.getComputedStyle(el);
		const context = this.buttonMeasureCanvas.getContext('2d');

		el.style.textAlign = 'center';
		el.style.whiteSpace = 'nowrap';

		if (!context) {
			el.style.flex = '0 0 auto';
			return;
		}

		context.font = computed.font;
		const text = el.textContent ?? '';
		const textWidth = context.measureText(text).width;
		const horizontalPadding = parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight);
		const horizontalBorder = parseFloat(computed.borderLeftWidth) + parseFloat(computed.borderRightWidth);
		const requiredWidth = Math.ceil(textWidth + horizontalPadding + horizontalBorder + 2);

		el.style.flex = `0 0 ${requiredWidth}px`;
		el.style.maxWidth = '100%';
	}

	/**
	 * 搜索词输入框
	 */
	private buildSearchWordInput(container: HTMLElement) {
		const setting = new Setting(container)
			.setName(this.showLabels() ? '検索語：' : '')
			.addText(tc => {

				this.searchWordInput = tc;
				tc.setValue(this.searchWord)

					.setPlaceholder('検索語を入力してください')
					.onChange(value => {
						this.searchWord = value;
						this.renderDictButtons();
					});
				tc.inputEl.style.width = '100%';

			});
		if (!this.showLabels()) {
			setting.infoEl.style.display = 'none';
		}
		if (this.isMobile()) {
			setting.controlEl.style.width = '100%';
		}
	}

	/**
	 * 辞典 URL 按钮区域
	 */
	private buildDictButtons(container: HTMLElement) {
		const setting = new Setting(container)
			.setName(this.showLabels() ? '辞書を引く：' : '');
		// 移动端按钮换行显示，桌面端按钮在一行显示
		setting.controlEl.style.flexWrap = 'wrap';
		setting.controlEl.style.minWidth = '0';
		if (!this.showLabels()) {
			setting.infoEl.style.display = 'none';
		}
		if (this.isMobile()) {
			setting.controlEl.style.width = '100%';
		}
		this.dictButtonContainer = setting.controlEl.createDiv();
		this.dictButtonContainer.style.width = '100%';
		this.dictButtonContainer.style.minWidth = '0';
		this.renderDictButtons();
	}

	/**
	 * 根据当前 searchWord 渲染辞典按钮
	 * 第一个按钮: デフォルトの辞書（使用 PLUGIN_SETTINGS.dictURL）
	 * 后续按钮: 用户自定义的 dialogDictCategories
	 */
	private renderDictButtons() {
		this.dictButtonContainer.empty();
		this.dictButtonContainer.style.display = 'flex';
		this.dictButtonContainer.style.flexWrap = 'wrap';
		this.dictButtonContainer.style.gap = this.isMobile() ? '4px' : '6px';
		// 辞典按钮统一右对齐，便于移动端单手（右手）操作
		this.dictButtonContainer.style.justifyContent = 'flex-end';

		if (!this.searchWord) {
			this.dictButtonContainer.createEl('span', { text: '検索語がありません' });
			return;
		}

		// 第一个按钮: デフォルトの辞書（使用 dictURL 设置）
		const defaultUrl = buildDictUrl(this.searchWord);
		const defaultBtn = new ButtonComponent(this.dictButtonContainer)
			.setButtonText('デフォルト')
			.setCta()
			.onClick(() => {
				window.open(defaultUrl, '_blank');
			});

		if (this.isMobile()) {
			this.applyMobileButtonContentWidth(defaultBtn);
		} else {
			// 桌面端: 按钮宽度按内容自适应，不撑开
			defaultBtn.buttonEl.style.flex = '0 0 auto';
		}

		// 后续按钮: 用户自定义的辞典
		const categories = PLUGIN_SETTINGS.dialogDictCategories;
		categories.forEach(({ label, url: urlTemplate }) => {
			const url = buildDictUrl(this.searchWord, urlTemplate);
			const btn = new ButtonComponent(this.dictButtonContainer)
				.setButtonText(label)
				.onClick(() => {
					window.open(url, '_blank');
				});

			if (this.isMobile()) {
				this.applyMobileButtonContentWidth(btn);
			} else {
				// 桌面端: 按钮宽度按内容自适应，不撑开
				btn.buttonEl.style.flex = '0 0 auto';
			}
		});
	}

	/**
	 * メモテキストエリア，用于记录用户输入的笔记
	 * 由于 iOS 移动端点击后该控件，输入法弹起会遮挡该控件，
	 * 故在移动端隐藏该控件，同时新增一个「メモ」按钮，
	 * 点击后写入历史记录并在新 tab 打开历史文件并定位到最后一个「メモ：」行
	 */
	private buildMemoArea(container: HTMLElement) {
		if (this.isMobile()) return;
		const setting = new Setting(container)
			.addTextArea(ta => {
				ta.setPlaceholder('ここで何かをメモしましょう');
				ta.inputEl.rows = 3;
				ta.inputEl.style.width = '100%';
				ta.inputEl.style.boxSizing = 'border-box';
				ta.inputEl.style.padding = this.isMobile() ? '6px 8px' : '8px';
				this.memoTextArea = ta.inputEl;
			});

		// 隐藏空的 infoEl，让 controlEl 填满整行宽度
		setting.infoEl.style.display = 'none';
		setting.controlEl.style.width = '100%';
	}

	/**
	 * 操作按钮（添加到笔记 / 取消）
	 * 移动端额外增加「メモ」按钮：写入记录后在新 tab 打开历史文件并定位到 メモ：行
	 */
	private buildActionButtons(container: HTMLElement) {
		const btnContainer = container.createDiv();
		btnContainer.style.display = 'flex';
		btnContainer.style.gap = this.isMobile() ? '6px' : '8px';
		btnContainer.style.justifyContent = 'flex-end';
		btnContainer.style.marginTop = this.isMobile() ? '8px' : '16px';

		// 暂时无法修复输入法遮挡「メモ」文本域的问题，所以
		if (this.isMobile()) {
			new ButtonComponent(btnContainer)
				.setButtonText('メモ')
				.onClick(() => {
					this.addToNotesAndOpenMemo();
				});
		}

		new ButtonComponent(btnContainer)
			.setButtonText('確認')
			.setCta()
			.onClick(() => {
				this.addToNotes();
			});

		new ButtonComponent(btnContainer)
			.setButtonText('キャンセル')
			.onClick(() => {
				this.close();
			});
	}

	/**
	 * 选择一个候选词，更新搜索词输入框和辞典按钮
	 */
	private selectCandidate(word: string) {
		this.searchWord = word;
		// 更新搜索词输入框
		this.searchWordInput.setValue(word);
		// 更新辞典按钮
		this.renderDictButtons();
		// 重新渲染候选词按钮以更新高亮
		this.renderCandidates();
		// 手动点击候选词时自动触发第一个（默认）辞典按钮
		window.open(buildDictUrl(this.searchWord), '_blank');
	}

	/**
	 * 将当前搜索词和メモ写入笔记（桌面端：带 memo textarea；移动端：memo 为空）
	 */
	private async addToNotes() {
		if (!this.searchWord) {
			new Notice('検索語がありません、メモに追加できません');
			return;
		}
		const memo = this.memoTextArea?.value?.trim() ?? '';
		try {
			await writeToHistory(PLUGIN_SETTINGS.historyFilePath, this.data.context, this.searchWord, memo);
			new Notice(`"${this.searchWord}" をメモに追加しました`);
			this.close();
		} catch (e) {
			new Notice(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	/**
	 * 移动端「メモ」按钮：写入历史记录（空 memo）后，在新 tab 打开历史文件并定位到最后一个 メモ：行
	 */
	private async addToNotesAndOpenMemo() {
		if (!this.searchWord) {
			new Notice('検索語がありません');
			return;
		}
		try {
			await writeToHistory(PLUGIN_SETTINGS.historyFilePath, this.data.context, this.searchWord, '');
			this.close();
			await this.openHistoryAtMemoLine();
		} catch (e) {
			new Notice(`エラー: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	/**
	 * 在新 tab 打开历史文件，定位到最后一个「メモ：」行并将光标置于其后
	 */
	private async openHistoryAtMemoLine() {
		const filePath = normalizePath(PLUGIN_SETTINGS.historyFilePath);
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;

		// 在新 tab 打开，不影响用户当前正在查看的内容
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.openFile(file);

		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;

		const editor = view.editor;
		const lines = editor.getValue().split('\n');

		// 从末尾向前找最后一个「メモ：」行
		for (let i = lines.length - 1; i >= 0; i--) {
			const col = lines[i].indexOf('メモ：');
			if (col !== -1) {
				const ch = col + 'メモ：'.length;
				editor.setCursor({ line: i, ch });
				editor.scrollIntoView({ from: { line: i, ch: 0 }, to: { line: i, ch } }, true);
				break;
			}
		}
	}

	/**
	 * Dialog 打开后，自动打开第一个候选词对应的辞典 URL
	 */
	private onDialogFirstOpened() {
		if (this.searchWord) {
			const dictUrl = buildDictUrl(this.searchWord);
			window.open(dictUrl, '_blank');
		}
	}
}
