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
exports.InkEditor = void 0;
Object.defineProperty(exports, "fitCurve", {
  enumerable: true,
  get: function () {
    return _fit_curve.fitCurve;
  }
});

var _util = require("../../shared/util.js");

var _editor = require("./editor.js");

var _fit_curve = require("./fit_curve");

const RESIZER_SIZE = 16;

class InkEditor extends _editor.AnnotationEditor {
  #aspectRatio = 0;
  #baseHeight = 0;
  #baseWidth = 0;
  #boundCanvasMousemove;
  #boundCanvasMouseleave;
  #boundCanvasMouseup;
  #boundCanvasMousedown;
  #disableEditing = false;
  #isCanvasInitialized = false;
  #observer = null;
  #realWidth = 0;
  #realHeight = 0;
  static _defaultColor = null;
  static _defaultThickness = 1;

  constructor(params) {
    super({ ...params,
      name: "inkEditor"
    });
    this.color = params.color || null;
    this.thickness = params.thickness || null;
    this.paths = [];
    this.bezierPath2D = [];
    this.currentPath = [];
    this.scaleFactor = 1;
    this.translationX = this.translationY = 0;
    this.x = 0;
    this.y = 0;
    this.#boundCanvasMousemove = this.canvasMousemove.bind(this);
    this.#boundCanvasMouseleave = this.canvasMouseleave.bind(this);
    this.#boundCanvasMouseup = this.canvasMouseup.bind(this);
    this.#boundCanvasMousedown = this.canvasMousedown.bind(this);
  }

  copy() {
    const editor = new InkEditor({
      parent: this.parent,
      id: this.parent.getNextId()
    });
    editor.x = this.x;
    editor.y = this.y;
    editor.width = this.width;
    editor.height = this.height;
    editor.color = this.color;
    editor.thickness = this.thickness;
    editor.paths = this.paths.slice();
    editor.bezierPath2D = this.bezierPath2D.slice();
    editor.scaleFactor = this.scaleFactor;
    editor.translationX = this.translationX;
    editor.translationY = this.translationY;
    editor.#aspectRatio = this.#aspectRatio;
    editor.#baseWidth = this.#baseWidth;
    editor.#baseHeight = this.#baseHeight;
    editor.#disableEditing = this.#disableEditing;
    editor.#realWidth = this.#realWidth;
    editor.#realHeight = this.#realHeight;
    return editor;
  }

  static updateDefaultParams(type, value) {
    switch (type) {
      case _util.AnnotationEditorParamsType.INK_THICKNESS:
        InkEditor._defaultThickness = value;
        break;

      case _util.AnnotationEditorParamsType.INK_COLOR:
        InkEditor._defaultColor = value;
        break;
    }
  }

  updateParams(type, value) {
    switch (type) {
      case _util.AnnotationEditorParamsType.INK_THICKNESS:
        this.#updateThickness(value);
        break;

      case _util.AnnotationEditorParamsType.INK_COLOR:
        this.#updateColor(value);
        break;
    }
  }

  static get defaultPropertiesToUpdate() {
    return [[_util.AnnotationEditorParamsType.INK_THICKNESS, InkEditor._defaultThickness], [_util.AnnotationEditorParamsType.INK_COLOR, InkEditor._defaultColor || _editor.AnnotationEditor._defaultLineColor]];
  }

  get propertiesToUpdate() {
    return [[_util.AnnotationEditorParamsType.INK_THICKNESS, this.thickness], [_util.AnnotationEditorParamsType.INK_COLOR, this.color]];
  }

  #updateThickness(thickness) {
    const savedThickness = this.thickness;
    this.parent.addCommands({
      cmd: () => {
        this.thickness = thickness;
        this.#fitToContent();
      },
      undo: () => {
        this.thickness = savedThickness;
        this.#fitToContent();
      },
      mustExec: true,
      type: _util.AnnotationEditorParamsType.INK_THICKNESS,
      overwriteIfSameType: true,
      keepUndo: true
    });
  }

  #updateColor(color) {
    const savedColor = this.color;
    this.parent.addCommands({
      cmd: () => {
        this.color = color;
        this.#redraw();
      },
      undo: () => {
        this.color = savedColor;
        this.#redraw();
      },
      mustExec: true,
      type: _util.AnnotationEditorParamsType.INK_COLOR,
      overwriteIfSameType: true,
      keepUndo: true
    });
  }

  rebuild() {
    if (this.div === null) {
      return;
    }

    if (!this.canvas) {
      this.#createCanvas();
      this.#createObserver();
    }

    if (!this.isAttachedToDOM) {
      this.parent.add(this);
      this.#setCanvasDims();
    }

    this.#fitToContent();
  }

  remove() {
    if (this.canvas === null) {
      return;
    }

    if (!this.isEmpty()) {
      this.commit();
    }

    this.canvas.width = this.canvas.height = 0;
    this.canvas.remove();
    this.canvas = null;
    this.#observer.disconnect();
    this.#observer = null;
    super.remove();
  }

  enableEditMode() {
    if (this.#disableEditing || this.canvas === null) {
      return;
    }

    super.enableEditMode();
    this.div.draggable = false;
    this.canvas.addEventListener("mousedown", this.#boundCanvasMousedown);
    this.canvas.addEventListener("mouseup", this.#boundCanvasMouseup);
  }

  disableEditMode() {
    if (!this.isInEditMode() || this.canvas === null) {
      return;
    }

    super.disableEditMode();
    this.div.draggable = !this.isEmpty();
    this.div.classList.remove("editing");
    this.canvas.removeEventListener("mousedown", this.#boundCanvasMousedown);
    this.canvas.removeEventListener("mouseup", this.#boundCanvasMouseup);
  }

  onceAdded() {
    this.div.draggable = !this.isEmpty();
  }

  isEmpty() {
    return this.paths.length === 0 || this.paths.length === 1 && this.paths[0].length === 0;
  }

  #getInitialBBox() {
    const {
      width,
      height,
      rotation
    } = this.parent.viewport;

    switch (rotation) {
      case 90:
        return [0, width, width, height];

      case 180:
        return [width, height, width, height];

      case 270:
        return [height, 0, width, height];

      default:
        return [0, 0, width, height];
    }
  }

  #setStroke() {
    this.ctx.lineWidth = this.thickness * this.parent.scaleFactor / this.scaleFactor;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.miterLimit = 10;
    this.ctx.strokeStyle = this.color;
  }

  #startDrawing(x, y) {
    if (!this.#isCanvasInitialized) {
      this.#isCanvasInitialized = true;
      this.#setCanvasDims();
      this.thickness ||= InkEditor._defaultThickness;
      this.color ||= InkEditor._defaultColor || _editor.AnnotationEditor._defaultLineColor;
    }

    this.currentPath.push([x, y]);
    this.#setStroke();
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  #draw(x, y) {
    this.currentPath.push([x, y]);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
  }

  #stopDrawing(x, y) {
    x = Math.min(Math.max(x, 0), this.canvas.width);
    y = Math.min(Math.max(y, 0), this.canvas.height);
    this.currentPath.push([x, y]);
    let bezier;

    if (this.currentPath.length !== 2 || this.currentPath[0][0] !== x || this.currentPath[0][1] !== y) {
      bezier = (0, _fit_curve.fitCurve)(this.currentPath, 30, null);
    } else {
      const xy = [x, y];
      bezier = [[xy, xy.slice(), xy.slice(), xy]];
    }

    const path2D = this.#buildPath2D(bezier);
    this.currentPath.length = 0;

    const cmd = () => {
      this.paths.push(bezier);
      this.bezierPath2D.push(path2D);
      this.rebuild();
    };

    const undo = () => {
      this.paths.pop();
      this.bezierPath2D.pop();

      if (this.paths.length === 0) {
        this.remove();
      } else {
        if (!this.canvas) {
          this.#createCanvas();
          this.#createObserver();
        }

        this.#fitToContent();
      }
    };

    this.parent.addCommands({
      cmd,
      undo,
      mustExec: true
    });
  }

  #redraw() {
    this.#setStroke();

    if (this.isEmpty()) {
      this.#updateTransform();
      return;
    }

    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    const {
      ctx,
      height,
      width
    } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width * parentWidth, height * parentHeight);
    this.#updateTransform();

    for (const path of this.bezierPath2D) {
      ctx.stroke(path);
    }
  }

  commit() {
    if (this.#disableEditing) {
      return;
    }

    this.disableEditMode();
    this.setInForeground();
    this.#disableEditing = true;
    this.div.classList.add("disabled");
    this.#fitToContent();
    this.parent.addInkEditorIfNeeded(true);
  }

  focusin() {
    super.focusin();
    this.enableEditMode();
  }

  canvasMousedown(event) {
    if (event.button !== 0 || !this.isInEditMode() || this.#disableEditing) {
      return;
    }

    this.setInForeground();
    event.stopPropagation();
    this.canvas.addEventListener("mouseleave", this.#boundCanvasMouseleave);
    this.canvas.addEventListener("mousemove", this.#boundCanvasMousemove);
    this.#startDrawing(event.offsetX, event.offsetY);
  }

  canvasMousemove(event) {
    event.stopPropagation();
    this.#draw(event.offsetX, event.offsetY);
  }

  canvasMouseup(event) {
    if (event.button !== 0) {
      return;
    }

    if (this.isInEditMode() && this.currentPath.length !== 0) {
      event.stopPropagation();
      this.#endDrawing(event);
      this.setInBackground();
    }
  }

  canvasMouseleave(event) {
    this.#endDrawing(event);
    this.setInBackground();
  }

  #endDrawing(event) {
    this.#stopDrawing(event.offsetX, event.offsetY);
    this.canvas.removeEventListener("mouseleave", this.#boundCanvasMouseleave);
    this.canvas.removeEventListener("mousemove", this.#boundCanvasMousemove);
  }

  #createCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = 0;
    this.canvas.className = "inkEditorCanvas";
    this.div.append(this.canvas);
    this.ctx = this.canvas.getContext("2d");
  }

  #createObserver() {
    this.#observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;

      if (rect.width && rect.height) {
        this.setDimensions(rect.width, rect.height);
      }
    });
    this.#observer.observe(this.div);
  }

  render() {
    if (this.div) {
      return this.div;
    }

    let baseX, baseY;

    if (this.width) {
      baseX = this.x;
      baseY = this.y;
    }

    super.render();
    const [x, y, w, h] = this.#getInitialBBox();
    this.setAt(x, y, 0, 0);
    this.setDims(w, h);
    this.#createCanvas();

    if (this.width) {
      this.#isCanvasInitialized = true;
      const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
      this.setAt(baseX * parentWidth, baseY * parentHeight, this.width * parentWidth, this.height * parentHeight);
      this.setDims(this.width * parentWidth, this.height * parentHeight);
      this.#setCanvasDims();
      this.#redraw();
      this.div.classList.add("disabled");
    } else {
      this.div.classList.add("editing");
      this.enableEditMode();
    }

    this.#createObserver();
    return this.div;
  }

  #setCanvasDims() {
    if (!this.#isCanvasInitialized) {
      return;
    }

    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    this.canvas.width = this.width * parentWidth;
    this.canvas.height = this.height * parentHeight;
    this.#updateTransform();
  }

  setDimensions(width, height) {
    const roundedWidth = Math.round(width);
    const roundedHeight = Math.round(height);

    if (this.#realWidth === roundedWidth && this.#realHeight === roundedHeight) {
      return;
    }

    this.#realWidth = roundedWidth;
    this.#realHeight = roundedHeight;
    this.canvas.style.visibility = "hidden";

    if (this.#aspectRatio && Math.abs(this.#aspectRatio - width / height) > 1e-2) {
      height = Math.ceil(width / this.#aspectRatio);
      this.setDims(width, height);
    }

    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    this.width = width / parentWidth;
    this.height = height / parentHeight;

    if (this.#disableEditing) {
      const padding = this.#getPadding();
      const scaleFactorW = (width - padding) / this.#baseWidth;
      const scaleFactorH = (height - padding) / this.#baseHeight;
      this.scaleFactor = Math.min(scaleFactorW, scaleFactorH);
    }

    this.#setCanvasDims();
    this.#redraw();
    this.canvas.style.visibility = "visible";
  }

  #updateTransform() {
    const padding = this.#getPadding() / 2;
    this.ctx.setTransform(this.scaleFactor, 0, 0, this.scaleFactor, this.translationX * this.scaleFactor + padding, this.translationY * this.scaleFactor + padding);
  }

  #buildPath2D(bezier) {
    const path2D = new Path2D();

    for (let i = 0, ii = bezier.length; i < ii; i++) {
      const [first, control1, control2, second] = bezier[i];

      if (i === 0) {
        path2D.moveTo(...first);
      }

      path2D.bezierCurveTo(control1[0], control1[1], control2[0], control2[1], second[0], second[1]);
    }

    return path2D;
  }

  #serializePaths(s, tx, ty, h) {
    const NUMBER_OF_POINTS_ON_BEZIER_CURVE = 4;
    const paths = [];
    const padding = this.thickness / 2;
    let buffer, points;

    for (const bezier of this.paths) {
      buffer = [];
      points = [];

      for (let i = 0, ii = bezier.length; i < ii; i++) {
        const [first, control1, control2, second] = bezier[i];
        const p10 = s * (first[0] + tx) + padding;
        const p11 = h - s * (first[1] + ty) - padding;
        const p20 = s * (control1[0] + tx) + padding;
        const p21 = h - s * (control1[1] + ty) - padding;
        const p30 = s * (control2[0] + tx) + padding;
        const p31 = h - s * (control2[1] + ty) - padding;
        const p40 = s * (second[0] + tx) + padding;
        const p41 = h - s * (second[1] + ty) - padding;

        if (i === 0) {
          buffer.push(p10, p11);
          points.push(p10, p11);
        }

        buffer.push(p20, p21, p30, p31, p40, p41);
        this.#extractPointsOnBezier(p10, p11, p20, p21, p30, p31, p40, p41, NUMBER_OF_POINTS_ON_BEZIER_CURVE, points);
      }

      paths.push({
        bezier: buffer,
        points
      });
    }

    return paths;
  }

  #extractPointsOnBezier(p10, p11, p20, p21, p30, p31, p40, p41, n, points) {
    if (this.#isAlmostFlat(p10, p11, p20, p21, p30, p31, p40, p41)) {
      points.push(p40, p41);
      return;
    }

    for (let i = 1; i < n - 1; i++) {
      const t = i / n;
      const mt = 1 - t;
      let q10 = t * p10 + mt * p20;
      let q11 = t * p11 + mt * p21;
      let q20 = t * p20 + mt * p30;
      let q21 = t * p21 + mt * p31;
      const q30 = t * p30 + mt * p40;
      const q31 = t * p31 + mt * p41;
      q10 = t * q10 + mt * q20;
      q11 = t * q11 + mt * q21;
      q20 = t * q20 + mt * q30;
      q21 = t * q21 + mt * q31;
      q10 = t * q10 + mt * q20;
      q11 = t * q11 + mt * q21;
      points.push(q10, q11);
    }

    points.push(p40, p41);
  }

  #isAlmostFlat(p10, p11, p20, p21, p30, p31, p40, p41) {
    const tol = 10;
    const ax = (3 * p20 - 2 * p10 - p40) ** 2;
    const ay = (3 * p21 - 2 * p11 - p41) ** 2;
    const bx = (3 * p30 - p10 - 2 * p40) ** 2;
    const by = (3 * p31 - p11 - 2 * p41) ** 2;
    return Math.max(ax, bx) + Math.max(ay, by) <= tol;
  }

  #getBbox() {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const path of this.paths) {
      for (const [first, control1, control2, second] of path) {
        const bbox = _util.Util.bezierBoundingBox(...first, ...control1, ...control2, ...second);

        xMin = Math.min(xMin, bbox[0]);
        yMin = Math.min(yMin, bbox[1]);
        xMax = Math.max(xMax, bbox[2]);
        yMax = Math.max(yMax, bbox[3]);
      }
    }

    return [xMin, yMin, xMax, yMax];
  }

  #getPadding() {
    return Math.ceil(this.thickness * this.parent.scaleFactor);
  }

  #fitToContent() {
    if (this.isEmpty()) {
      return;
    }

    if (!this.#disableEditing) {
      this.#redraw();
      return;
    }

    const bbox = this.#getBbox();
    const padding = this.#getPadding();
    this.#baseWidth = bbox[2] - bbox[0];
    this.#baseHeight = bbox[3] - bbox[1];
    const width = Math.ceil(padding + this.#baseWidth * this.scaleFactor);
    const height = Math.ceil(padding + this.#baseHeight * this.scaleFactor);
    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    this.width = width / parentWidth;
    this.height = height / parentHeight;
    this.#aspectRatio = width / height;
    const {
      style
    } = this.div;

    if (this.#aspectRatio >= 1) {
      style.minHeight = `${RESIZER_SIZE}px`;
      style.minWidth = `${Math.round(this.#aspectRatio * RESIZER_SIZE)}px`;
    } else {
      style.minWidth = `${RESIZER_SIZE}px`;
      style.minHeight = `${Math.round(RESIZER_SIZE / this.#aspectRatio)}px`;
    }

    const prevTranslationX = this.translationX;
    const prevTranslationY = this.translationY;
    this.translationX = -bbox[0];
    this.translationY = -bbox[1];
    this.#setCanvasDims();
    this.#redraw();
    this.#realWidth = width;
    this.#realHeight = height;
    this.setDims(width, height);
    this.translate(prevTranslationX - this.translationX, prevTranslationY - this.translationY);
  }

  serialize() {
    if (this.isEmpty()) {
      return null;
    }

    const rect = this.getRect(0, 0);
    const height = this.rotation % 180 === 0 ? rect[3] - rect[1] : rect[2] - rect[0];

    const color = _editor.AnnotationEditor._colorManager.convert(this.ctx.strokeStyle);

    return {
      annotationType: _util.AnnotationEditorType.INK,
      color,
      thickness: this.thickness,
      paths: this.#serializePaths(this.scaleFactor / this.parent.scaleFactor, this.translationX, this.translationY, height),
      pageIndex: this.parent.pageIndex,
      rect,
      rotation: this.rotation
    };
  }

}

exports.InkEditor = InkEditor;