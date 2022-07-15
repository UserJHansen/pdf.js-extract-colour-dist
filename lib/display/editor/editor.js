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
exports.AnnotationEditor = void 0;

var _util = require("../../shared/util.js");

var _tools = require("./tools.js");

class AnnotationEditor {
  #isInEditMode = false;
  static _colorManager = new _tools.ColorManager();

  constructor(parameters) {
    if (this.constructor === AnnotationEditor) {
      (0, _util.unreachable)("Cannot initialize AnnotationEditor.");
    }

    this.parent = parameters.parent;
    this.id = parameters.id;
    this.width = this.height = null;
    this.pageIndex = parameters.parent.pageIndex;
    this.name = parameters.name;
    this.div = null;
    const [width, height] = this.parent.viewportBaseDimensions;
    this.x = parameters.x / width;
    this.y = parameters.y / height;
    this.rotation = this.parent.viewport.rotation;
    this.isAttachedToDOM = false;
  }

  static get _defaultLineColor() {
    return (0, _util.shadow)(this, "_defaultLineColor", this._colorManager.getHexCode("CanvasText"));
  }

  setInBackground() {
    this.div.classList.add("background");
  }

  setInForeground() {
    this.div.classList.remove("background");
  }

  focusin() {
    this.parent.setActiveEditor(this);
  }

  focusout(event) {
    if (!this.isAttachedToDOM) {
      return;
    }

    const target = event.relatedTarget;

    if (target?.closest(`#${this.id}`)) {
      return;
    }

    event.preventDefault();
    this.commitOrRemove();

    if (!target?.id?.startsWith(_util.AnnotationEditorPrefix)) {
      this.parent.setActiveEditor(null);
    }
  }

  commitOrRemove() {
    if (this.isEmpty()) {
      this.remove();
    } else {
      this.commit();
    }
  }

  dragstart(event) {
    const rect = this.parent.div.getBoundingClientRect();
    this.startX = event.clientX - rect.x;
    this.startY = event.clientY - rect.y;
    event.dataTransfer.setData("text/plain", this.id);
    event.dataTransfer.effectAllowed = "move";
  }

  setAt(x, y, tx, ty) {
    const [width, height] = this.parent.viewportBaseDimensions;
    [tx, ty] = this.screenToPageTranslation(tx, ty);
    this.x = (x + tx) / width;
    this.y = (y + ty) / height;
    this.div.style.left = `${100 * this.x}%`;
    this.div.style.top = `${100 * this.y}%`;
  }

  translate(x, y) {
    const [width, height] = this.parent.viewportBaseDimensions;
    [x, y] = this.screenToPageTranslation(x, y);
    this.x += x / width;
    this.y += y / height;
    this.div.style.left = `${100 * this.x}%`;
    this.div.style.top = `${100 * this.y}%`;
  }

  screenToPageTranslation(x, y) {
    const {
      rotation
    } = this.parent.viewport;

    switch (rotation) {
      case 90:
        return [y, -x];

      case 180:
        return [-x, -y];

      case 270:
        return [-y, x];

      default:
        return [x, y];
    }
  }

  setDims(width, height) {
    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    this.div.style.width = `${100 * width / parentWidth}%`;
    this.div.style.height = `${100 * height / parentHeight}%`;
  }

  getInitialTranslation() {
    return [0, 0];
  }

  render() {
    this.div = document.createElement("div");
    this.div.setAttribute("data-editor-rotation", (360 - this.rotation) % 360);
    this.div.className = this.name;
    this.div.setAttribute("id", this.id);
    this.div.tabIndex = 100;
    const [tx, ty] = this.getInitialTranslation();
    this.translate(tx, ty);
    (0, _tools.bindEvents)(this, this.div, ["dragstart", "focusin", "focusout", "mousedown"]);
    return this.div;
  }

  mousedown(event) {
    if (event.button !== 0) {
      event.preventDefault();
    }
  }

  getRect(tx, ty) {
    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    const [pageWidth, pageHeight] = this.parent.pageDimensions;
    const shiftX = pageWidth * tx / parentWidth;
    const shiftY = pageHeight * ty / parentHeight;
    const x = this.x * pageWidth;
    const y = this.y * pageHeight;
    const width = this.width * pageWidth;
    const height = this.height * pageHeight;

    switch (this.rotation) {
      case 0:
        return [x + shiftX, pageHeight - y - shiftY - height, x + shiftX + width, pageHeight - y - shiftY];

      case 90:
        return [x + shiftY, pageHeight - y + shiftX, x + shiftY + height, pageHeight - y + shiftX + width];

      case 180:
        return [x - shiftX - width, pageHeight - y + shiftY, x - shiftX, pageHeight - y + shiftY + height];

      case 270:
        return [x - shiftY - height, pageHeight - y - shiftX - width, x - shiftY, pageHeight - y - shiftX];

      default:
        throw new Error("Invalid rotation");
    }
  }

  onceAdded() {}

  isEmpty() {
    return false;
  }

  enableEditMode() {
    this.#isInEditMode = true;
  }

  disableEditMode() {
    this.#isInEditMode = false;
  }

  isInEditMode() {
    return this.#isInEditMode;
  }

  shouldGetKeyboardEvents() {
    return false;
  }

  copy() {
    (0, _util.unreachable)("An editor must be copyable");
  }

  needsToBeRebuilt() {
    return this.div && !this.isAttachedToDOM;
  }

  rebuild() {
    (0, _util.unreachable)("An editor must be rebuildable");
  }

  serialize() {
    (0, _util.unreachable)("An editor must be serializable");
  }

  remove() {
    if (!this.isEmpty()) {
      this.commit();
    }

    this.parent.remove(this);
  }

  select() {
    if (this.div) {
      this.div.classList.add("selectedEditor");
    }
  }

  unselect() {
    if (this.div) {
      this.div.classList.remove("selectedEditor");
    }
  }

  updateParams(type, value) {}

  get propertiesToUpdate() {
    return {};
  }

}

exports.AnnotationEditor = AnnotationEditor;