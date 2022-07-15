/**
 * @licstart The following is the entire license notice for the
 * JavaScript code in this page
 *
 * Copyright 2022 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @licend The above is the entire license notice for the
 * JavaScript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KeyboardManager = exports.ColorManager = exports.AnnotationEditorUIManager = void 0;
exports.bindEvents = bindEvents;

var _util = require("../../shared/util.js");

var _display_utils = require("../display_utils.js");

function bindEvents(obj, element, names) {
  for (const name of names) {
    element.addEventListener(name, obj[name].bind(obj));
  }
}

class IdManager {
  #id = 0;

  getId() {
    return `${_util.AnnotationEditorPrefix}${this.#id++}`;
  }

}

class CommandManager {
  #commands = [];
  #maxSize = 100;
  #position = NaN;
  #start = 0;

  add({
    cmd,
    undo,
    mustExec,
    type = NaN,
    overwriteIfSameType = false,
    keepUndo = false
  }) {
    const save = {
      cmd,
      undo,
      type
    };

    if (overwriteIfSameType && !isNaN(this.#position) && this.#commands[this.#position].type === type) {
      if (keepUndo) {
        save.undo = this.#commands[this.#position].undo;
      }

      this.#commands[this.#position] = save;

      if (mustExec) {
        cmd();
      }

      return;
    }

    const next = (this.#position + 1) % this.#maxSize;

    if (next !== this.#start) {
      if (this.#start < next) {
        this.#commands = this.#commands.slice(this.#start, next);
      } else {
        this.#commands = this.#commands.slice(this.#start).concat(this.#commands.slice(0, next));
      }

      this.#start = 0;
      this.#position = this.#commands.length - 1;
    }

    this.#setCommands(save);

    if (mustExec) {
      cmd();
    }
  }

  undo() {
    if (isNaN(this.#position)) {
      return;
    }

    this.#commands[this.#position].undo();

    if (this.#position === this.#start) {
      this.#position = NaN;
    } else {
      this.#position = (this.#maxSize + this.#position - 1) % this.#maxSize;
    }
  }

  redo() {
    if (isNaN(this.#position)) {
      if (this.#start < this.#commands.length) {
        this.#commands[this.#start].cmd();
        this.#position = this.#start;
      }

      return;
    }

    const next = (this.#position + 1) % this.#maxSize;

    if (next !== this.#start && next < this.#commands.length) {
      this.#commands[next].cmd();
      this.#position = next;
    }
  }

  hasSomethingToUndo() {
    return !isNaN(this.#position);
  }

  hasSomethingToRedo() {
    if (isNaN(this.#position) && this.#start < this.#commands.length) {
      return true;
    }

    const next = (this.#position + 1) % this.#maxSize;
    return next !== this.#start && next < this.#commands.length;
  }

  #setCommands(cmds) {
    if (this.#commands.length < this.#maxSize) {
      this.#commands.push(cmds);
      this.#position = isNaN(this.#position) ? 0 : this.#position + 1;
      return;
    }

    if (isNaN(this.#position)) {
      this.#position = this.#start;
    } else {
      this.#position = (this.#position + 1) % this.#maxSize;

      if (this.#position === this.#start) {
        this.#start = (this.#start + 1) % this.#maxSize;
      }
    }

    this.#commands[this.#position] = cmds;
  }

  destroy() {
    this.#commands = null;
  }

}

class KeyboardManager {
  constructor(callbacks) {
    this.buffer = [];
    this.callbacks = new Map();
    this.allKeys = new Set();
    const isMac = KeyboardManager.platform.isMac;

    for (const [keys, callback] of callbacks) {
      for (const key of keys) {
        const isMacKey = key.startsWith("mac+");

        if (isMac && isMacKey) {
          this.callbacks.set(key.slice(4), callback);
          this.allKeys.add(key.split("+").at(-1));
        } else if (!isMac && !isMacKey) {
          this.callbacks.set(key, callback);
          this.allKeys.add(key.split("+").at(-1));
        }
      }
    }
  }

  static get platform() {
    const platform = typeof navigator !== "undefined" ? navigator.platform : "";
    return (0, _util.shadow)(this, "platform", {
      isWin: platform.includes("Win"),
      isMac: platform.includes("Mac")
    });
  }

  #serialize(event) {
    if (event.altKey) {
      this.buffer.push("alt");
    }

    if (event.ctrlKey) {
      this.buffer.push("ctrl");
    }

    if (event.metaKey) {
      this.buffer.push("meta");
    }

    if (event.shiftKey) {
      this.buffer.push("shift");
    }

    this.buffer.push(event.key);
    const str = this.buffer.join("+");
    this.buffer.length = 0;
    return str;
  }

  exec(page, event) {
    if (!this.allKeys.has(event.key)) {
      return;
    }

    const callback = this.callbacks.get(this.#serialize(event));

    if (!callback) {
      return;
    }

    callback.bind(page)();
    event.preventDefault();
  }

}

exports.KeyboardManager = KeyboardManager;

class ClipboardManager {
  constructor() {
    this.element = null;
  }

  copy(element) {
    this.element = element.copy();
  }

  paste() {
    return this.element?.copy() || null;
  }

  isEmpty() {
    return this.element === null;
  }

  destroy() {
    this.element = null;
  }

}

class ColorManager {
  static _colorsMapping = new Map([["CanvasText", [0, 0, 0]], ["Canvas", [255, 255, 255]]]);

  get _colors() {
    if (typeof document === "undefined") {
      return (0, _util.shadow)(this, "_colors", ColorManager._colorsMapping);
    }

    const colors = new Map([["CanvasText", null], ["Canvas", null]]);
    (0, _display_utils.getColorValues)(colors);
    return (0, _util.shadow)(this, "_colors", colors);
  }

  convert(color) {
    const rgb = (0, _display_utils.getRGB)(color);

    if (!window.matchMedia("(forced-colors: active)").matches) {
      return rgb;
    }

    for (const [name, RGB] of this._colors) {
      if (RGB.every((x, i) => x === rgb[i])) {
        return ColorManager._colorsMapping.get(name);
      }
    }

    return rgb;
  }

  getHexCode(name) {
    const rgb = this._colors.get(name);

    if (!rgb) {
      return name;
    }

    return _util.Util.makeHexColor(...rgb);
  }

}

exports.ColorManager = ColorManager;

class AnnotationEditorUIManager {
  #activeEditor = null;
  #allEditors = new Map();
  #allLayers = new Map();
  #allowClick = true;
  #clipboardManager = new ClipboardManager();
  #commandManager = new CommandManager();
  #editorTypes = null;
  #eventBus = null;
  #idManager = new IdManager();
  #isAllSelected = false;
  #isEnabled = false;
  #mode = _util.AnnotationEditorType.NONE;
  #previousActiveEditor = null;
  #boundOnEditingAction = this.onEditingAction.bind(this);
  #previousStates = {
    isEditing: false,
    isEmpty: true,
    hasEmptyClipboard: true,
    hasSomethingToUndo: false,
    hasSomethingToRedo: false,
    hasSelectedEditor: false
  };

  constructor(eventBus) {
    this.#eventBus = eventBus;

    this.#eventBus._on("editingaction", this.#boundOnEditingAction);
  }

  destroy() {
    this.#eventBus._off("editingaction", this.#boundOnEditingAction);

    for (const layer of this.#allLayers.values()) {
      layer.destroy();
    }

    this.#allLayers.clear();
    this.#allEditors.clear();
    this.#activeEditor = null;
    this.#clipboardManager.destroy();
    this.#commandManager.destroy();
  }

  onEditingAction(details) {
    if (["undo", "redo", "cut", "copy", "paste", "delete", "selectAll"].includes(details.name)) {
      this[details.name]();
    }
  }

  #dispatchUpdateStates(details) {
    const hasChanged = Object.entries(details).some(([key, value]) => this.#previousStates[key] !== value);

    if (hasChanged) {
      this.#eventBus.dispatch("annotationeditorstateschanged", {
        source: this,
        details: Object.assign(this.#previousStates, details)
      });
    }
  }

  #dispatchUpdateUI(details) {
    this.#eventBus.dispatch("annotationeditorparamschanged", {
      source: this,
      details
    });
  }

  setEditingState(isEditing) {
    if (isEditing) {
      this.#dispatchUpdateStates({
        isEditing: this.#mode !== _util.AnnotationEditorType.NONE,
        isEmpty: this.#isEmpty(),
        hasSomethingToUndo: this.#commandManager.hasSomethingToUndo(),
        hasSomethingToRedo: this.#commandManager.hasSomethingToRedo(),
        hasSelectedEditor: false,
        hasEmptyClipboard: this.#clipboardManager.isEmpty()
      });
    } else {
      this.#dispatchUpdateStates({
        isEditing: false
      });
    }
  }

  registerEditorTypes(types) {
    this.#editorTypes = types;

    for (const editorType of this.#editorTypes) {
      this.#dispatchUpdateUI(editorType.defaultPropertiesToUpdate);
    }
  }

  getId() {
    return this.#idManager.getId();
  }

  addLayer(layer) {
    this.#allLayers.set(layer.pageIndex, layer);

    if (this.#isEnabled) {
      layer.enable();
    } else {
      layer.disable();
    }
  }

  removeLayer(layer) {
    this.#allLayers.delete(layer.pageIndex);
  }

  updateMode(mode) {
    this.#mode = mode;

    if (mode === _util.AnnotationEditorType.NONE) {
      this.setEditingState(false);
      this.#disableAll();
    } else {
      this.setEditingState(true);
      this.#enableAll();

      for (const layer of this.#allLayers.values()) {
        layer.updateMode(mode);
      }
    }
  }

  updateToolbar(mode) {
    if (mode === this.#mode) {
      return;
    }

    this.#eventBus.dispatch("switchannotationeditormode", {
      source: this,
      mode
    });
  }

  updateParams(type, value) {
    (this.#activeEditor || this.#previousActiveEditor)?.updateParams(type, value);

    for (const editorType of this.#editorTypes) {
      editorType.updateDefaultParams(type, value);
    }
  }

  #enableAll() {
    if (!this.#isEnabled) {
      this.#isEnabled = true;

      for (const layer of this.#allLayers.values()) {
        layer.enable();
      }
    }
  }

  #disableAll() {
    if (this.#isEnabled) {
      this.#isEnabled = false;

      for (const layer of this.#allLayers.values()) {
        layer.disable();
      }
    }
  }

  getEditors(pageIndex) {
    const editors = [];

    for (const editor of this.#allEditors.values()) {
      if (editor.pageIndex === pageIndex) {
        editors.push(editor);
      }
    }

    return editors;
  }

  getEditor(id) {
    return this.#allEditors.get(id);
  }

  addEditor(editor) {
    this.#allEditors.set(editor.id, editor);
  }

  removeEditor(editor) {
    this.#allEditors.delete(editor.id);
  }

  #addEditorToLayer(editor) {
    const layer = this.#allLayers.get(editor.pageIndex);

    if (layer) {
      layer.addOrRebuild(editor);
    } else {
      this.addEditor(editor);
    }
  }

  setActiveEditor(editor) {
    if (this.#activeEditor === editor) {
      return;
    }

    this.#previousActiveEditor = this.#activeEditor;
    this.#activeEditor = editor;

    if (editor) {
      this.#dispatchUpdateUI(editor.propertiesToUpdate);
      this.#dispatchUpdateStates({
        hasSelectedEditor: true
      });
    } else {
      this.#dispatchUpdateStates({
        hasSelectedEditor: false
      });

      if (this.#previousActiveEditor) {
        this.#dispatchUpdateUI(this.#previousActiveEditor.propertiesToUpdate);
      } else {
        for (const editorType of this.#editorTypes) {
          this.#dispatchUpdateUI(editorType.defaultPropertiesToUpdate);
        }
      }
    }
  }

  undo() {
    this.#commandManager.undo();
    this.#dispatchUpdateStates({
      hasSomethingToUndo: this.#commandManager.hasSomethingToUndo(),
      hasSomethingToRedo: true,
      isEmpty: this.#isEmpty()
    });
  }

  redo() {
    this.#commandManager.redo();
    this.#dispatchUpdateStates({
      hasSomethingToUndo: true,
      hasSomethingToRedo: this.#commandManager.hasSomethingToRedo(),
      isEmpty: this.#isEmpty()
    });
  }

  addCommands(params) {
    this.#commandManager.add(params);
    this.#dispatchUpdateStates({
      hasSomethingToUndo: true,
      hasSomethingToRedo: false,
      isEmpty: this.#isEmpty()
    });
  }

  #isEmpty() {
    if (this.#allEditors.size === 0) {
      return true;
    }

    if (this.#allEditors.size === 1) {
      for (const editor of this.#allEditors.values()) {
        return editor.isEmpty();
      }
    }

    return false;
  }

  get allowClick() {
    return this.#allowClick;
  }

  set allowClick(allow) {
    this.#allowClick = allow;
  }

  unselect() {
    if (this.#activeEditor) {
      this.#activeEditor.parent.setActiveEditor(null);
    }

    this.#allowClick = true;
  }

  delete() {
    let cmd, undo;

    if (this.#isAllSelected) {
      const editors = Array.from(this.#allEditors.values());

      cmd = () => {
        for (const editor of editors) {
          if (!editor.isEmpty()) {
            editor.remove();
          }
        }
      };

      undo = () => {
        for (const editor of editors) {
          this.#addEditorToLayer(editor);
        }
      };

      this.addCommands({
        cmd,
        undo,
        mustExec: true
      });
    } else {
      if (!this.#activeEditor) {
        return;
      }

      const editor = this.#activeEditor;

      cmd = () => {
        editor.remove();
      };

      undo = () => {
        this.#addEditorToLayer(editor);
      };
    }

    this.addCommands({
      cmd,
      undo,
      mustExec: true
    });
  }

  copy() {
    if (this.#activeEditor) {
      this.#clipboardManager.copy(this.#activeEditor);
      this.#dispatchUpdateStates({
        hasEmptyClipboard: false
      });
    }
  }

  cut() {
    if (this.#activeEditor) {
      this.#clipboardManager.copy(this.#activeEditor);
      const editor = this.#activeEditor;

      const cmd = () => {
        editor.remove();
      };

      const undo = () => {
        this.#addEditorToLayer(editor);
      };

      this.addCommands({
        cmd,
        undo,
        mustExec: true
      });
    }
  }

  paste() {
    const editor = this.#clipboardManager.paste();

    if (!editor) {
      return;
    }

    const cmd = () => {
      this.#addEditorToLayer(editor);
    };

    const undo = () => {
      editor.remove();
    };

    this.addCommands({
      cmd,
      undo,
      mustExec: true
    });
  }

  selectAll() {
    this.#isAllSelected = true;

    for (const editor of this.#allEditors.values()) {
      editor.select();
    }

    this.#dispatchUpdateStates({
      hasSelectedEditor: true
    });
  }

  unselectAll() {
    this.#isAllSelected = false;

    for (const editor of this.#allEditors.values()) {
      editor.unselect();
    }

    this.#dispatchUpdateStates({
      hasSelectedEditor: this.hasActive()
    });
  }

  isActive(editor) {
    return this.#activeEditor === editor;
  }

  getActive() {
    return this.#activeEditor;
  }

  hasActive() {
    return this.#activeEditor !== null;
  }

  getMode() {
    return this.#mode;
  }

}

exports.AnnotationEditorUIManager = AnnotationEditorUIManager;