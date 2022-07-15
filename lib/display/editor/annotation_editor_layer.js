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
exports.AnnotationEditorLayer = void 0;

var _tools = require("./tools.js");

var _util = require("../../shared/util.js");

var _freetext = require("./freetext.js");

var _ink = require("./ink.js");

class AnnotationEditorLayer {
  #boundClick;
  #editors = new Map();
  #isCleaningUp = false;
  #uiManager;
  static _initialized = false;
  static _keyboardManager = new _tools.KeyboardManager([[["ctrl+a", "mac+meta+a"], AnnotationEditorLayer.prototype.selectAll], [["ctrl+c", "mac+meta+c"], AnnotationEditorLayer.prototype.copy], [["ctrl+v", "mac+meta+v"], AnnotationEditorLayer.prototype.paste], [["ctrl+x", "mac+meta+x"], AnnotationEditorLayer.prototype.cut], [["ctrl+z", "mac+meta+z"], AnnotationEditorLayer.prototype.undo], [["ctrl+y", "ctrl+shift+Z", "mac+meta+shift+Z"], AnnotationEditorLayer.prototype.redo], [["Backspace", "alt+Backspace", "ctrl+Backspace", "shift+Backspace", "mac+Backspace", "mac+alt+Backspace", "mac+ctrl+Backspace", "Delete", "ctrl+Delete", "shift+Delete"], AnnotationEditorLayer.prototype.delete]]);

  constructor(options) {
    if (!AnnotationEditorLayer._initialized) {
      AnnotationEditorLayer._initialized = true;

      _freetext.FreeTextEditor.initialize(options.l10n);

      options.uiManager.registerEditorTypes([_freetext.FreeTextEditor, _ink.InkEditor]);
    }

    this.#uiManager = options.uiManager;
    this.annotationStorage = options.annotationStorage;
    this.pageIndex = options.pageIndex;
    this.div = options.div;
    this.#boundClick = this.click.bind(this);

    for (const editor of this.#uiManager.getEditors(options.pageIndex)) {
      this.add(editor);
    }

    this.#uiManager.addLayer(this);
  }

  updateToolbar(mode) {
    this.#uiManager.updateToolbar(mode);
  }

  updateMode(mode = this.#uiManager.getMode()) {
    this.#cleanup();

    if (mode === _util.AnnotationEditorType.INK) {
      this.addInkEditorIfNeeded(false);
    }

    this.setActiveEditor(null);
  }

  addInkEditorIfNeeded(isCommitting) {
    if (!isCommitting && this.#uiManager.getMode() !== _util.AnnotationEditorType.INK) {
      return;
    }

    if (!isCommitting) {
      for (const editor of this.#editors.values()) {
        if (editor.isEmpty()) {
          editor.setInBackground();
          return;
        }
      }
    }

    const editor = this.#createAndAddNewEditor({
      offsetX: 0,
      offsetY: 0
    });
    editor.setInBackground();
  }

  setEditingState(isEditing) {
    this.#uiManager.setEditingState(isEditing);
  }

  addCommands(params) {
    this.#uiManager.addCommands(params);
  }

  undo() {
    this.#uiManager.undo();
  }

  redo() {
    this.#uiManager.redo();
  }

  delete() {
    this.#uiManager.delete();
  }

  copy() {
    this.#uiManager.copy();
  }

  cut() {
    this.#uiManager.cut();
  }

  paste() {
    this.#uiManager.paste();
  }

  selectAll() {
    this.#uiManager.selectAll();
  }

  unselectAll() {
    this.#uiManager.unselectAll();
  }

  enable() {
    this.div.style.pointerEvents = "auto";
  }

  disable() {
    this.div.style.pointerEvents = "none";
  }

  setActiveEditor(editor) {
    const currentActive = this.#uiManager.getActive();

    if (currentActive === editor) {
      return;
    }

    this.#uiManager.setActiveEditor(editor);

    if (currentActive && currentActive !== editor) {
      currentActive.commitOrRemove();
    }

    this.#uiManager.allowClick = this.#uiManager.getMode() === _util.AnnotationEditorType.INK;

    if (editor) {
      this.unselectAll();
      this.div.removeEventListener("click", this.#boundClick);
    } else {
      this.div.addEventListener("click", this.#boundClick);
    }
  }

  attach(editor) {
    this.#editors.set(editor.id, editor);
  }

  detach(editor) {
    this.#editors.delete(editor.id);
  }

  remove(editor) {
    this.#uiManager.removeEditor(editor);
    this.detach(editor);
    this.annotationStorage.removeKey(editor.id);
    editor.div.remove();
    editor.isAttachedToDOM = false;

    if (this.#uiManager.isActive(editor) || this.#editors.size === 0) {
      this.setActiveEditor(null);
      this.#uiManager.allowClick = true;
    }

    if (!this.#isCleaningUp) {
      this.addInkEditorIfNeeded(false);
    }
  }

  #changeParent(editor) {
    if (editor.parent === this) {
      return;
    }

    if (this.#uiManager.isActive(editor)) {
      editor.parent.setActiveEditor(null);
    }

    this.attach(editor);
    editor.pageIndex = this.pageIndex;
    editor.parent.detach(editor);
    editor.parent = this;

    if (editor.div && editor.isAttachedToDOM) {
      editor.div.remove();
      this.div.append(editor.div);
    }
  }

  add(editor) {
    this.#changeParent(editor);
    this.annotationStorage.setValue(editor.id, editor);
    this.#uiManager.addEditor(editor);
    this.attach(editor);

    if (!editor.isAttachedToDOM) {
      const div = editor.render();
      this.div.append(div);
      editor.isAttachedToDOM = true;
    }

    editor.onceAdded();
  }

  addOrRebuild(editor) {
    if (editor.needsToBeRebuilt()) {
      editor.rebuild();
    } else {
      this.add(editor);
    }
  }

  addANewEditor(editor) {
    const cmd = () => {
      this.addOrRebuild(editor);
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

  addUndoableEditor(editor) {
    const cmd = () => {
      this.addOrRebuild(editor);
    };

    const undo = () => {
      editor.remove();
    };

    this.addCommands({
      cmd,
      undo,
      mustExec: false
    });
  }

  getNextId() {
    return this.#uiManager.getId();
  }

  #createNewEditor(params) {
    switch (this.#uiManager.getMode()) {
      case _util.AnnotationEditorType.FREETEXT:
        return new _freetext.FreeTextEditor(params);

      case _util.AnnotationEditorType.INK:
        return new _ink.InkEditor(params);
    }

    return null;
  }

  #createAndAddNewEditor(event) {
    const id = this.getNextId();
    const editor = this.#createNewEditor({
      parent: this,
      id,
      x: event.offsetX,
      y: event.offsetY
    });

    if (editor) {
      this.add(editor);
    }

    return editor;
  }

  click(event) {
    if (!this.#uiManager.allowClick) {
      this.#uiManager.allowClick = true;
      return;
    }

    this.#createAndAddNewEditor(event);
  }

  drop(event) {
    const id = event.dataTransfer.getData("text/plain");
    const editor = this.#uiManager.getEditor(id);

    if (!editor) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    this.#changeParent(editor);
    const rect = this.div.getBoundingClientRect();
    const endX = event.clientX - rect.x;
    const endY = event.clientY - rect.y;
    editor.translate(endX - editor.startX, endY - editor.startY);
  }

  dragover(event) {
    event.preventDefault();
  }

  keydown(event) {
    if (!this.#uiManager.getActive()?.shouldGetKeyboardEvents()) {
      AnnotationEditorLayer._keyboardManager.exec(this, event);
    }
  }

  destroy() {
    for (const editor of this.#editors.values()) {
      editor.isAttachedToDOM = false;
      editor.div.remove();
      editor.parent = null;
      this.div = null;
    }

    this.#editors.clear();
    this.#uiManager.removeLayer(this);
  }

  #cleanup() {
    this.#isCleaningUp = true;

    for (const editor of this.#editors.values()) {
      if (editor.isEmpty()) {
        editor.remove();
      }
    }

    this.#isCleaningUp = false;
  }

  render(parameters) {
    this.viewport = parameters.viewport;
    (0, _tools.bindEvents)(this, this.div, ["dragover", "drop", "keydown"]);
    this.div.addEventListener("click", this.#boundClick);
    this.setDimensions();
    this.updateMode();
  }

  update(parameters) {
    this.setActiveEditor(null);
    this.viewport = parameters.viewport;
    this.setDimensions();
    this.updateMode();
  }

  get scaleFactor() {
    return this.viewport.scale;
  }

  get pageDimensions() {
    const [pageLLx, pageLLy, pageURx, pageURy] = this.viewport.viewBox;
    const width = pageURx - pageLLx;
    const height = pageURy - pageLLy;
    return [width, height];
  }

  get viewportBaseDimensions() {
    const {
      width,
      height,
      rotation
    } = this.viewport;
    return rotation % 180 === 0 ? [width, height] : [height, width];
  }

  setDimensions() {
    const {
      width,
      height,
      rotation
    } = this.viewport;
    const flipOrientation = rotation % 180 !== 0,
          widthStr = Math.floor(width) + "px",
          heightStr = Math.floor(height) + "px";
    this.div.style.width = flipOrientation ? heightStr : widthStr;
    this.div.style.height = flipOrientation ? widthStr : heightStr;
    this.div.setAttribute("data-main-rotation", rotation);
  }

}

exports.AnnotationEditorLayer = AnnotationEditorLayer;