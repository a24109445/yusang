import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  clear() { this.data.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const {
  STORAGE_KEY,
  createBackup,
  createDefaultRecipes,
  loadRecipes,
  parseBackup,
  saveRecipes,
} = await import("../js/storage.js");

test("配方儲存後重新載入仍存在", () => {
  const recipes = createDefaultRecipes();
  recipes.taro = {
    ...recipes.taro,
    tapiocaStarch: 300,
    glutinousRiceFlour: 100,
    potatoStarch: 50,
    sugar: 80,
    isConfigured: true,
  };
  saveRecipes(recipes);
  assert.deepEqual(loadRecipes().recipes, recipes);
});

test("損壞的 localStorage 會安全恢復預設設定", () => {
  localStorage.setItem(STORAGE_KEY, "{broken");
  const loaded = loadRecipes();
  assert.equal(loaded.recovered, true);
  assert.equal(loaded.recipes.taro.isConfigured, false);
});

test("匯出後可完整匯入，錯誤備份會被拒絕", () => {
  const recipes = createDefaultRecipes();
  recipes.taro.isConfigured = true;
  const backup = createBackup(recipes, "2026-09-22T00:00:00.000Z");
  assert.deepEqual(parseBackup(JSON.stringify(backup)), recipes);
  assert.throws(() => parseBackup('{"version":1,"recipes":{}}'));
  assert.throws(() => parseBackup("not json"));

  const zeroBase = structuredClone(backup);
  zeroBase.recipes.taro.baseWeight = 0;
  assert.throws(() => parseBackup(JSON.stringify(zeroBase)));

  const negativeMaterial = structuredClone(backup);
  negativeMaterial.recipes.taro.sugar = -1;
  assert.throws(() => parseBackup(JSON.stringify(negativeMaterial)));
});
