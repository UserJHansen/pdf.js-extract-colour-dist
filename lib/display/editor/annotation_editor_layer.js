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
  #boundMouseover;
  #editors = new Map();
  #uiManager;
  static _initialized = false;
  static _keyboardManager = new _tools.KeyboardManager([[["ctrl+a", "mac+meta+a"], AnnotationEditorLayer.prototype.selectAll], [["ctrl+c", "mac+meta+c"], AnnotationEditorLayer.prototype.copy], [["ctrl+v", "mac+meta+v"], AnnotationEditorLayer.prototype.paste], [["ctrl+x", "mac+meta+x"], AnnotationEditorLayer.prototype.cut], [["ctrl+z", "mac+meta+z"], AnnotationEditorLayer.prototype.undo], [["ctrl+y", "ctrl+shift+Z", "mac+meta+shift+Z"], AnnotationEditorLayer.prototype.redo], [["ctrl+Backspace", "mac+Backspace", "mac+ctrl+Backspace", "mac+alt+Backspace"], AnnotationEditorLayer.prototype.suppress]]);

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
    this.#boundMouseover = this.mouseover.bind(this);

    for (const editor of this.#uiManager.getEditors(options.pageIndex)) {
      this.add(editor);
    }

    this.#uiManager.addLayer(this);
  }

  updateToolbar(mode) {
    this.#uiManager.updateToolbar(mode);
  }

  updateMode(mode) {
    switch (mode) {
      case _util.AnnotationEditorType.INK:
        this.div.addEventListener("mouseover", this.#boundMouseover);
        this.div.removeEventListener("click", this.#boundClick);
        break;

      case _util.AnnotationEditorType.FREETEXT:
        this.div.removeEventListener("mouseover", this.#boundMouseover);
        this.div.addEventListener("click", this.#boundClick);
        break;

      default:
        this.div.removeEventListener("mouseover", this.#boundMouseover);
        this.div.removeEventListener("click", this.#boundClick);
    }

    this.setActiveEditor(null);
  }

  mouseover(event) {
    if (event.target === this.div && event.buttons === 0 && !this.#uiManager.hasActive()) {
      const editor = this.#createAndAddNewEditor(event);
      editor.setInBackground();
    }
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

  suppress() {
    this.#uiManager.suppress();
  }

  copy() {
    this.#uiManager.copy();
  }

  cut() {
    this.#uiManager.cut(this);
  }

  paste() {
    this.#uiManager.paste(this);
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

    if (editor) {
      this.unselectAll();
      this.div.removeEventListener("click", this.#boundClick);
    } else {
      this.#uiManager.allowClick = this.#uiManager.getMode() === _util.AnnotationEditorType.INK;
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

  render(parameters) {
    this.viewport = parameters.viewport;
    (0, _tools.bindEvents)(this, this.div, ["dragover", "drop", "keydown"]);
    this.div.addEventListener("click", this.#boundClick);
    this.setDimensions();
  }

  update(parameters) {
    this.setActiveEditor(null);
    this.viewport = parameters.viewport;
    this.setDimensions();
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