import test from "node:test";
import assert from "node:assert/strict";
import { calculateRecipe, formatWeight, parseNonNegativeNumber } from "../js/calculator.js";

const recipe = {
  name: "芋頭",
  baseWeight: 1000,
  tapiocaStarch: 300,
  glutinousRiceFlour: 100,
  potatoStarch: 50,
  sugar: 80,
  isConfigured: true,
};

test("1000 g、2000 g 與 2350 g 計算正確", () => {
  assert.deepEqual(calculateRecipe(recipe, 1000), {
    tapiocaStarch: 300,
    glutinousRiceFlour: 100,
    potatoStarch: 50,
    sugar: 80,
  });
  assert.deepEqual(calculateRecipe(recipe, 2000), {
    tapiocaStarch: 600,
    glutinousRiceFlour: 200,
    potatoStarch: 100,
    sugar: 160,
  });
  assert.deepEqual(calculateRecipe(recipe, 2350), {
    tapiocaStarch: 705,
    glutinousRiceFlour: 235,
    potatoStarch: 117.5,
    sugar: 188,
  });
});

test("小數、零與大重量不產生 NaN 或 Infinity", () => {
  for (const weight of [0, 999.5, 10000]) {
    for (const value of Object.values(calculateRecipe(recipe, weight))) {
      assert.equal(Number.isFinite(value), true);
    }
  }
  assert.equal(formatWeight(705.000000001), "705");
  assert.equal(formatWeight(117.5), "117.5");
});

test("拒絕空白、負數、英文與特殊符號", () => {
  assert.equal(parseNonNegativeNumber("").empty, true);
  for (const input of ["-1", "abc", "@#$", "1e3", "12,3"]) {
    assert.equal(parseNonNegativeNumber(input).valid, false);
  }
});
