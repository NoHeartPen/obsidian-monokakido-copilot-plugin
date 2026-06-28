# Dialog Mode — Design Specification

## Overview

Pressing the designated shortcut opens a dialog that queries the word near the cursor. The dialog provides candidate-word buttons, a search-word input, and dictionary URL buttons so the user can jump directly to the corresponding dictionary app.

---

## Trigger Methods

### Automatic Trigger

While in **Quick Mode**, if the cursor position and context have not changed and the user presses the Quick Mode shortcut again (i.e., double-presses Option a second time), the plugin automatically switches to Dialog Mode.

### Manual Trigger (Command / Shortcut Key)

No shortcut key is bound by default. The user can assign a key to the "Open Dialog Mode" command via Obsidian's system hotkey settings.

### Mode Selection Setting

In the plugin settings, the user can choose whether double-pressing Option triggers **Quick Mode** or **Dialog Mode** (default: Quick Mode).

---

## UI Layout (Schematic)

**Desktop**

```
┌──────────────────────────────────────────────────┐
│ Context                                          │
│ ┌──────────────────────────────────────────────┐ │
│ │ There is a test                              │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Suggestions  [be] [is] [there] [a] [test]        │
│                                                  │
│ Search word  [be________________]                │
│                                                  │
│ Open in dict  [Default] [Dict 2] [Dict 3]        │
│                                                  │
│ Notes                                            │
│ ┌──────────────────────────────────────────────┐ │
│ │ There is a note.                             │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│                      [Confirm]  [Cancel]          │
└──────────────────────────────────────────────────┘
```

**Mobile** (Notes textarea hidden; footer becomes a 3-button row)

```
┌──────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────┐ │
│ │ There is a test                              │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [be] [is] [there] [a] [test]                     │
│                                                  │
│ [be________________]                             │
│                                                  │
│ [Default] [Dict 2] [Dict 3]                      │
│                                                  │
│              [Notes]  [Confirm]  [Cancel]         │
└──────────────────────────────────────────────────┘
```

---

## Component Specifications

### Context

| Field | Details |
|---|---|
| UI Type | Textarea |
| Content Source | Context surrounding the cursor at the time Dialog Mode was triggered; uses the same logic as Quick Mode |
| Interaction | When the user edits the text or moves the cursor inside the textarea, the Suggestions buttons update. Dictionary URLs are **not** invoked automatically |
| Size Constraint | Limit height to prevent long text from breaking the layout; especially important on mobile |

### Suggestions (もしかして)

| Field | Details |
|---|---|
| UI Type | Button group |
| Content Source | Dictionary forms (辞書形) returned by the same morpheme-analysis API used in Quick Mode |
| Initial Behavior | On dialog open, the first candidate is immediately written into the Search Word field and the dictionary URL buttons are rendered |
| Click Behavior | Writes the selected candidate into the Search Word field and updates the dictionary URL buttons |
| Max Count | 5 buttons |
| Button Breakdown | Buttons 1–3: API analysis results; Button 4: token boundary word from the browser Segmenter API; Button 5: feedback button (not yet implemented) |
| Display Priority | Phrases and compound words indexed via Elasticsearch take precedence over bare dictionary forms |

> **Not yet implemented:** Button 4 (Segmenter API) and Button 5 (feedback).

### Search Word (検索語)

| Field | Details |
|---|---|
| UI Type | Single-line text input |
| Content Source | Written by Suggestions buttons or entered manually |
| Sync Behavior | Changes automatically update the target word in the dictionary URL buttons |

> **Not yet implemented:** Suggest API assistance while the user types manually.

### Open in Dictionary (辞書を引く)

| Field | Details |
|---|---|
| UI Type | Button group |
| Content Source | Dictionary URL schemes configured in plugin settings (shared with Quick Mode) |
| Initial Behavior | On dialog open, focus is placed on the first button and its URL is **invoked immediately** |
| Click Behavior | Embeds the current Search Word into the URL scheme and opens the corresponding dictionary |

> **Not yet implemented:** Wrapper URLs specifying a 検索カテゴリ (search category), with a quick-add UI in settings.

### Notes (メモ帳)

| Field | Details |
|---|---|
| UI Type | Textarea (desktop); hidden on mobile — replaced by a "Notes" button in the footer |
| Placeholder | `ここで何かをメモしましょう` |
| Save Timing | Saved to the history note file when the user clicks Confirm |
| Mobile Entry Point | A "Notes" button in the footer (to the left of Confirm) opens the notes input flow |

> Auto-focus on iOS is not implemented — the keyboard pop-up event cannot reliably focus this field.

---

## Confirm & Cancel

| Button | Behavior |
|---|---|
| Confirm | Saves notes content to the history note file and closes the dialog |
| Cancel | Discards all unsaved content and closes the dialog |

---

## Mobile Adaptations

- Descriptive label text is **hidden by default** on mobile to conserve screen space.
- **Notes textarea is hidden:** on mobile, the notes area is not shown. Instead, the footer switches to a three-button layout — **[Notes] [Confirm] [Cancel]** — with the Notes button to the left of Confirm.
- Test layout rendering with long context text carefully; ensure the textarea does not overflow the screen.
- Auto-focus for the Notes field on iOS is not implemented (keyboard pop-up limitation).

---

## Implementation Status

| Feature | Status |
|---|---|
| Auto trigger (Quick Mode second press) | Implemented |
| Manual command trigger | Implemented |
| Mode selection setting | Implemented |
| Context textarea | Implemented |
| Suggestion buttons (API top 3) | Implemented |
| Search word input | Implemented |
| Dictionary URL buttons | Implemented |
| Notes textarea (desktop) | Implemented |
| Mobile Notes button in footer | Implemented |
| Mobile UI adaptations | Implemented |
| 4th suggestion (Segmenter API) | Not yet implemented |
| 5th suggestion (feedback button) | Not yet implemented |
| Search word Suggest API | Not yet implemented |
| Dictionary URL quick-add (search category) | Not yet implemented |
| iOS Notes auto-focus | Not yet implemented |
