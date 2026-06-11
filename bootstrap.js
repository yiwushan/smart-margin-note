var SmartMarginNote;

function log(message) {
	Zotero.debug("Smart Margin Note: " + message);
}

function install() {
	log("Installed");
}

async function startup({ id, version, rootURI }) {
	log("Starting " + version);
	Services.scriptloader.loadSubScript(rootURI + "smart-margin-note.js");
	SmartMarginNote.init({ id, version, rootURI });
	SmartMarginNote.start();
	SmartMarginNote.addToAllWindows();
}

function onMainWindowLoad({ window }) {
	SmartMarginNote?.addToWindow(window);
}

function onMainWindowUnload({ window }) {
	SmartMarginNote?.removeFromWindow(window);
}

function shutdown() {
	log("Shutting down");
	SmartMarginNote?.shutdown();
	SmartMarginNote = undefined;
}

function uninstall() {
	log("Uninstalled");
}
