var SmartMarginNotePrefs = {
	prefsPrefix: "extensions.smartMarginNote.",
	defaults: {
		textColor: "#2ea8e5",
		fontSize: 8,
		replaceExtractionNote: true
	},

	init(event) {
		let doc = event?.target?.ownerDocument || document;
		if (this.doc === doc && this.initialized) {
			return;
		}
		this.doc = doc;
		this.initialized = true;
		this.bindColor("smart-margin-note-text-color", "textColor");
		this.bindNumber("smart-margin-note-font-size", "fontSize", 4, 48);
		this.bindCheckbox("smart-margin-note-replace-extraction-note", "replaceExtractionNote");
	},

	getPref(name) {
		try {
			let value = Zotero.Prefs.get(this.prefsPrefix + name, true);
			return value === undefined || value === null ? this.defaults[name] : value;
		}
		catch (e) {
			Zotero.logError?.(e);
			return this.defaults[name];
		}
	},

	setPref(name, value) {
		try {
			Zotero.Prefs.set(this.prefsPrefix + name, value, true);
		}
		catch (e) {
			Zotero.logError?.(e);
		}
	},

	bindColor(id, prefName) {
		let input = this.doc.getElementById(id);
		if (!input) {
			return;
		}
		input.value = this.normalizeColor(this.getPref(prefName));
		input.addEventListener("input", () => this.setPref(prefName, this.normalizeColor(input.value)));
		input.addEventListener("change", () => this.setPref(prefName, this.normalizeColor(input.value)));
	},

	bindNumber(id, prefName, min, max) {
		let input = this.doc.getElementById(id);
		if (!input) {
			return;
		}
		input.value = this.clampNumber(this.getPref(prefName), min, max, this.defaults[prefName]);
		input.addEventListener("change", () => {
			let value = this.clampNumber(input.value, min, max, this.defaults[prefName]);
			input.value = value;
			this.setPref(prefName, value);
		});
	},

	bindCheckbox(id, prefName) {
		let input = this.doc.getElementById(id);
		if (!input) {
			return;
		}
		let value = this.getPref(prefName);
		input.checked = value === true || value === "true" || value === 1 || value === "1";
		input.addEventListener("change", () => this.setPref(prefName, input.checked));
	},

	normalizeColor(value) {
		value = String(value || "").trim();
		return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : this.defaults.textColor;
	},

	clampNumber(value, min, max, fallback) {
		value = Number.parseFloat(value);
		if (!Number.isFinite(value)) {
			value = fallback;
		}
		return Math.min(max, Math.max(min, value));
	}
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
	let init = () => {
		if (document.getElementById("smart-margin-note-prefs")) {
			SmartMarginNotePrefs.init({ target: document });
		}
	};
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init, { once: true });
	}
	else {
		window.setTimeout(init, 0);
	}
}
