# Smart Margin Note

Smart Margin Note is an experimental Zotero 9 PDF reader plugin for creating margin text annotations that are invisibly bound to the nearest paragraph.

## Features

- `Ctrl + left click` in a PDF page margin creates a Zotero text annotation at the click position.
- Middle click does the same without using the keyboard.
- New smart margin notes use plugin preferences for color and font size. The defaults are Zotero blue and 8 pt.
- The plugin stores the matched paragraph text and paragraph position inside `annotationPosition.smartMarginNote`.
- The library item context-menu command `提取智能旁批到笔记` creates or updates a child note containing the original paragraph, the margin note comment, and a Zotero deep link.

## Requirements

- Zotero 9

## Install

Download the `.xpi` package from a release, then install it from Zotero's Add-ons window.

## Usage

1. Open a PDF in Zotero.
2. Move the pointer to the left or right margin near the paragraph you want to annotate.
3. Press `Ctrl + left click`, or middle click, to create a smart margin note.
4. Enter your margin note text and save it as a normal Zotero text annotation.
5. In Zotero's library view, right-click the parent item or PDF attachment and choose `提取智能旁批到笔记`.

## Development Install

Create a Zotero extension proxy file named `smart-margin-note@example.com` in your Zotero profile `extensions` directory. The file content should be the absolute path to this directory.

Restart Zotero with cache purging enabled while developing.

## Build XPI

From this directory:

```bash
zip -r smart-margin-note.xpi manifest.json bootstrap.js smart-margin-note.js prefs.js prefs-pane.js prefs.xhtml prefs.css locale README.md
```

If `zip` is unavailable:

```bash
bsdtar --format zip -cf smart-margin-note.xpi manifest.json bootstrap.js smart-margin-note.js prefs.js prefs-pane.js prefs.xhtml prefs.css locale README.md
```

Install the generated `.xpi` from Zotero's Add-ons window.

## Status

This is an early MVP. It relies on Zotero reader internals and may need updates as Zotero 9 evolves.
