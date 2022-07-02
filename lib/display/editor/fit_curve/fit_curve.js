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
exports.fitCurve = fitCurve;

function fitCurve(points, maxError, progressCallback) {
  if (!Array.isArray(points)) {
    throw new TypeError("First argument should be an array");
  }

  points.forEach(point => {
    if (!Array.isArray(point) || point.some(item => typeof item !== "number") || point.length !== points[0].length) {
      throw Error("Each point should be an array of numbers. Each point should have the same amount of numbers.");
    }
  });
  points = points.filter((point, i) => i === 0 || !point.every((val, j) => val === points[i - 1][j]));

  if (points.length < 2) {
    return [];
  }

  const len = points.length;
  const leftTangent = createTangent(points[1], points[0]);
  const rightTangent = createTangent(points[len - 2], points[len - 1]);
  return fitCubic(points, leftTangent, rightTangent, maxError, progressCallback);
}

function fitCubic(points, leftTangent, rightTangent, error, progressCallback) {
  const MaxIterations = 20;
  let bezCurve, uPrime, maxError, prevErr, splitPoint, prevSplit, centerVector, beziers, dist, i;

  if (points.length === 2) {
    dist = maths.vectorLen(maths.subtract(points[0], points[1])) / 3.0;
    bezCurve = [points[0], maths.addArrays(points[0], maths.mulItems(leftTangent, dist)), maths.addArrays(points[1], maths.mulItems(rightTangent, dist)), points[1]];
    return [bezCurve];
  }

  const u = chordLengthParameterize(points);
  [bezCurve, maxError, splitPoint] = generateAndReport(points, u, u, leftTangent, rightTangent, progressCallback);

  if (maxError === 0 || maxError < error) {
    return [bezCurve];
  }

  if (maxError < error * error) {
    uPrime = u;
    prevErr = maxError;
    prevSplit = splitPoint;

    for (i = 0; i < MaxIterations; i++) {
      uPrime = reparameterize(bezCurve, points, uPrime);
      [bezCurve, maxError, splitPoint] = generateAndReport(points, u, uPrime, leftTangent, rightTangent, progressCallback);

      if (maxError < error) {
        return [bezCurve];
      } else if (splitPoint === prevSplit) {
        const errChange = maxError / prevErr;

        if (errChange > 0.9999 && errChange < 1.0001) {
          break;
        }
      }

      prevErr = maxError;
      prevSplit = splitPoint;
    }
  }

  beziers = [];
  centerVector = maths.subtract(points[splitPoint - 1], points[splitPoint + 1]);

  if (centerVector.every(val => val === 0)) {
    centerVector = maths.subtract(points[splitPoint - 1], points[splitPoint]);
    [centerVector[0], centerVector[1]] = [-centerVector[1], centerVector[0]];
  }

  const toCenterTangent = maths.normalize(centerVector);
  const fromCenterTangent = maths.mulItems(toCenterTangent, -1);
  beziers = beziers.concat(fitCubic(points.slice(0, splitPoint + 1), leftTangent, toCenterTangent, error, progressCallback));
  beziers = beziers.concat(fitCubic(points.slice(splitPoint), fromCenterTangent, rightTangent, error, progressCallback));
  return beziers;
}

function generateAndReport(points, paramsOrig, paramsPrime, leftTangent, rightTangent, progressCallback) {
  const bezCurve = generateBezier(points, paramsPrime, leftTangent, rightTangent);
  const [maxError, splitPoint] = computeMaxError(points, bezCurve, paramsOrig);

  if (progressCallback) {
    progressCallback({
      bez: bezCurve,
      points,
      params: paramsOrig,
      maxErr: maxError,
      maxPoint: splitPoint
    });
  }

  return [bezCurve, maxError, splitPoint];
}

function generateBezier(points, parameters, leftTangent, rightTangent) {
  let a, tmp, u, ux;
  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  const bezCurve = [firstPoint, null, null, lastPoint];
  const A = maths.zeros_Xx2x2(parameters.length);

  for (let i = 0, len = parameters.length; i < len; i++) {
    u = parameters[i];
    ux = 1 - u;
    a = A[i];
    a[0] = maths.mulItems(leftTangent, 3 * u * (ux * ux));
    a[1] = maths.mulItems(rightTangent, 3 * ux * (u * u));
  }

  const C = [[0, 0], [0, 0]];
  const X = [0, 0];

  for (let i = 0, len = points.length; i < len; i++) {
    u = parameters[i];
    a = A[i];
    C[0][0] += maths.dot(a[0], a[0]);
    C[0][1] += maths.dot(a[0], a[1]);
    C[1][0] += maths.dot(a[0], a[1]);
    C[1][1] += maths.dot(a[1], a[1]);
    tmp = maths.subtract(points[i], bezier.q([firstPoint, firstPoint, lastPoint, lastPoint], u));
    X[0] += maths.dot(a[0], tmp);
    X[1] += maths.dot(a[1], tmp);
  }

  const det_C0_C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const det_C0_X = C[0][0] * X[1] - C[1][0] * X[0];
  const det_X_C1 = X[0] * C[1][1] - X[1] * C[0][1];
  const alpha_l = det_C0_C1 === 0 ? 0 : det_X_C1 / det_C0_C1;
  const alpha_r = det_C0_C1 === 0 ? 0 : det_C0_X / det_C0_C1;
  const segLength = maths.vectorLen(maths.subtract(firstPoint, lastPoint));
  const epsilon = 1.0e-6 * segLength;

  if (alpha_l < epsilon || alpha_r < epsilon) {
    bezCurve[1] = maths.addArrays(firstPoint, maths.mulItems(leftTangent, segLength / 3.0));
    bezCurve[2] = maths.addArrays(lastPoint, maths.mulItems(rightTangent, segLength / 3.0));
  } else {
    bezCurve[1] = maths.addArrays(firstPoint, maths.mulItems(leftTangent, alpha_l));
    bezCurve[2] = maths.addArrays(lastPoint, maths.mulItems(rightTangent, alpha_r));
  }

  return bezCurve;
}

function reparameterize(bezier, points, parameters) {
  return parameters.map((p, i) => newtonRaphsonRootFind(bezier, points[i], p));
}

function newtonRaphsonRootFind(bez, point, u) {
  const d = maths.subtract(bezier.q(bez, u), point),
        qprime = bezier.qprime(bez, u),
        numerator = maths.mulMatrix(d, qprime),
        denominator = maths.sum(maths.squareItems(qprime)) + 2 * maths.mulMatrix(d, bezier.qprimeprime(bez, u));

  if (denominator === 0) {
    return u;
  }

  return u - numerator / denominator;
}

function chordLengthParameterize(points) {
  let u = [],
      currU,
      prevU,
      prevP;
  points.forEach((p, i) => {
    currU = i ? prevU + maths.vectorLen(maths.subtract(p, prevP)) : 0;
    u.push(currU);
    prevU = currU;
    prevP = p;
  });
  u = u.map(x => x / prevU);
  return u;
}

function computeMaxError(points, bez, parameters) {
  let dist, maxDist, splitPoint, v, i, count, point, t;
  maxDist = 0;
  splitPoint = Math.floor(points.length / 2);
  const t_distMap = mapTtoRelativeDistances(bez, 10);

  for (i = 0, count = points.length; i < count; i++) {
    point = points[i];
    t = find_t(bez, parameters[i], t_distMap, 10);
    v = maths.subtract(bezier.q(bez, t), point);
    dist = v[0] * v[0] + v[1] * v[1];

    if (dist > maxDist) {
      maxDist = dist;
      splitPoint = i;
    }
  }

  return [maxDist, splitPoint];
}

function mapTtoRelativeDistances(bez, B_parts) {
  let B_t_curr;
  let B_t_dist = [0];
  let B_t_prev = bez[0];
  let sumLen = 0;

  for (let i = 1; i <= B_parts; i++) {
    B_t_curr = bezier.q(bez, i / B_parts);
    sumLen += maths.vectorLen(maths.subtract(B_t_curr, B_t_prev));
    B_t_dist.push(sumLen);
    B_t_prev = B_t_curr;
  }

  B_t_dist = B_t_dist.map(x => x / sumLen);
  return B_t_dist;
}

function find_t(bez, param, t_distMap, B_parts) {
  if (param < 0) {
    return 0;
  }

  if (param > 1) {
    return 1;
  }

  let lenMax, lenMin, tMax, tMin, t;

  for (let i = 1; i <= B_parts; i++) {
    if (param <= t_distMap[i]) {
      tMin = (i - 1) / B_parts;
      tMax = i / B_parts;
      lenMin = t_distMap[i - 1];
      lenMax = t_distMap[i];
      t = (param - lenMin) / (lenMax - lenMin) * (tMax - tMin) + tMin;
      break;
    }
  }

  return t;
}

function createTangent(pointA, pointB) {
  return maths.normalize(maths.subtract(pointA, pointB));
}

class maths {
  static zeros_Xx2x2(x) {
    const zs = [];

    while (x--) {
      zs.push([0, 0]);
    }

    return zs;
  }

  static mulItems(items, multiplier) {
    return items.map(x => x * multiplier);
  }

  static mulMatrix(m1, m2) {
    return m1.reduce((sum, x1, i) => sum + x1 * m2[i], 0);
  }

  static subtract(arr1, arr2) {
    return arr1.map((x1, i) => x1 - arr2[i]);
  }

  static addArrays(arr1, arr2) {
    return arr1.map((x1, i) => x1 + arr2[i]);
  }

  static addItems(items, addition) {
    return items.map(x => x + addition);
  }

  static sum(items) {
    return items.reduce((sum, x) => sum + x);
  }

  static dot(m1, m2) {
    return maths.mulMatrix(m1, m2);
  }

  static vectorLen(v) {
    return Math.hypot(...v);
  }

  static divItems(items, divisor) {
    return items.map(x => x / divisor);
  }

  static squareItems(items) {
    return items.map(x => x * x);
  }

  static normalize(v) {
    return this.divItems(v, this.vectorLen(v));
  }

}

class bezier {
  static q(ctrlPoly, t) {
    const tx = 1.0 - t;
    const pA = maths.mulItems(ctrlPoly[0], tx * tx * tx),
          pB = maths.mulItems(ctrlPoly[1], 3 * tx * tx * t),
          pC = maths.mulItems(ctrlPoly[2], 3 * tx * t * t),
          pD = maths.mulItems(ctrlPoly[3], t * t * t);
    return maths.addArrays(maths.addArrays(pA, pB), maths.addArrays(pC, pD));
  }

  static qprime(ctrlPoly, t) {
    const tx = 1.0 - t;
    const pA = maths.mulItems(maths.subtract(ctrlPoly[1], ctrlPoly[0]), 3 * tx * tx),
          pB = maths.mulItems(maths.subtract(ctrlPoly[2], ctrlPoly[1]), 6 * tx * t),
          pC = maths.mulItems(maths.subtract(ctrlPoly[3], ctrlPoly[2]), 3 * t * t);
    return maths.addArrays(maths.addArrays(pA, pB), pC);
  }

  static qprimeprime(ctrlPoly, t) {
    return maths.addArrays(maths.mulItems(maths.addArrays(maths.subtract(ctrlPoly[2], maths.mulItems(ctrlPoly[1], 2)), ctrlPoly[0]), 6 * (1.0 - t)), maths.mulItems(maths.addArrays(maths.subtract(ctrlPoly[3], maths.mulItems(ctrlPoly[2], 2)), ctrlPoly[1]), 6 * t));
  }

}