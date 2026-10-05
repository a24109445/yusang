import test from "node:test";
import assert from "node:assert/strict";
import {
  INVENTORY_KEY, FLAVOR_IDS, addIncoming, addShipment, cancelEntry, createInventory,
  createInventoryBackup, inventoryBalances, loadInventory, parseInventoryBackup,
  saveInventory, shipmentWeights, validateInventory,
} from "../js/inventory.js";

const date = "2026-10-05";
function configuredInventory() {
  let data = createInventory();
  for (const id of FLAVOR_IDS) data = addIncoming(data, { flavorId: id, weight: 2300, date });
  data.packaging.sweetPotato.sweetPotato = 300;
  data.packaging.taro.taro = 200;
  data.packaging.mixed = { sweetPotato: 100, purpleSweetPotato: 50, taro: 100, yam: 25, potato: 25 };
  return data;
}

test("2300 g 成品入庫保留日期、口味與總重，重載後不變", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const data = addIncoming(createInventory(), { flavorId: "sweetPotato", weight: 2300, date });
  saveInventory(data, storage);
  const loaded = loadInventory(storage);
  assert.equal(inventoryBalances(loaded).sweetPotato, 2300);
  assert.equal(loaded.entries[0].date, date);
  assert.equal(loaded.entries[0].weights.sweetPotato, 2300);
  assert.deepEqual(loaded, data);
});

test("綜合與單口味同筆出貨，分別扣除五種口味並保留包數", () => {
  const data = addShipment(configuredInventory(), { quantities: { mixed: 2, sweetPotato: 3, taro: 1 }, date });
  assert.deepEqual(inventoryBalances(data), { sweetPotato: 1200, purpleSweetPotato: 2200, taro: 1900, yam: 2250, potato: 2250 });
  const entry = data.entries.at(-1);
  assert.equal(entry.quantities.mixed, 2);
  assert.equal(entry.weights.sweetPotato, 1100);
  assert.equal(entry.weights.taro, 400);
  assert.equal(entry.date, date);
});

test("任一口味不足，整筆交易不變；未設定、非整數、負包數與無效日期都被拒絕", () => {
  const data = configuredInventory();
  const original = structuredClone(data);
  assert.throws(() => addShipment(data, { quantities: { mixed: 24, sweetPotato: 1 }, date }), /庫存不足/);
  assert.deepEqual(data, original);
  for (const quantities of [{ potato: 1 }, { mixed: 0.5 }, { mixed: -1 }, {}, { mixed: Infinity }]) {
    assert.throws(() => addShipment(data, { quantities, date }));
  }
  assert.throws(() => addShipment(data, { quantities: { mixed: 1 }, date: "2026-02-30" }));
  assert.throws(() => addIncoming(data, { flavorId: "sweetPotato", weight: 0, date }));
});

test("包裝設定變更不改舊出貨；作廢出貨返還，作廢已使用入庫被阻止", () => {
  let data = addShipment(configuredInventory(), { quantities: { sweetPotato: 7 }, date });
  data.packaging.sweetPotato.sweetPotato = 500;
  assert.equal(data.entries.at(-1).packaging.sweetPotato.sweetPotato, 300);
  assert.equal(inventoryBalances(validateInventory(data)).sweetPotato, 200);
  assert.throws(() => cancelEntry(data, data.entries[0].id), /庫存不足/);
  data = cancelEntry(data, data.entries.at(-1).id);
  assert.equal(inventoryBalances(data).sweetPotato, 2300);
  assert.equal(data.entries.at(-1).cancelled, true);
  assert.throws(() => cancelEntry(data, data.entries.at(-1).id));
  data = cancelEntry(data, data.entries[0].id);
  assert.equal(inventoryBalances(data).sweetPotato, 0);
});

test("小數重量連續扣除不產生尾數，完全出完後為零", () => {
  let data = addIncoming(createInventory(), { flavorId: "sweetPotato", weight: 1, date });
  data.packaging.sweetPotato.sweetPotato = 0.1;
  for (let count = 0; count < 10; count++) data = addShipment(data, { quantities: { sweetPotato: 1 }, date });
  assert.equal(inventoryBalances(data).sweetPotato, 0);
  assert.throws(() => shipmentWeights({ ...data.packaging, sweetPotato: { ...data.packaging.sweetPotato, sweetPotato: 0.01 } }, { sweetPotato: 1 }), /最多一位小數/);
});

test("庫存備份完整還原，偽造出貨重量和重複紀錄不能匯入", () => {
  const data = addShipment(configuredInventory(), { quantities: { mixed: 1 }, date });
  const backup = createInventoryBackup(data);
  assert.deepEqual(parseInventoryBackup(JSON.stringify(backup)), data);
  const changed = structuredClone(backup);
  changed.inventory.entries.at(-1).weights.taro = 99;
  assert.throws(() => parseInventoryBackup(JSON.stringify(changed)), /出貨重量/);
  const duplicate = structuredClone(backup);
  duplicate.inventory.entries.push(duplicate.inventory.entries[0]);
  assert.throws(() => parseInventoryBackup(JSON.stringify(duplicate)), /紀錄格式/);
  assert.throws(() => parseInventoryBackup('{"version":1,"recipes":{}}'));
});

test("損壞資料保留原文，不會自動清空庫存；儲存失敗不會改變輸入資料", () => {
  let stored = "{broken";
  const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  assert.throws(() => loadInventory(storage), /原資料已保留/);
  assert.equal(stored, "{broken");
  const data = configuredInventory();
  const original = structuredClone(data);
  assert.throws(() => saveInventory(data, { setItem: () => { throw new Error("full"); } }), /full/);
  assert.deepEqual(data, original);
  assert.equal(INVENTORY_KEY, "yusang-helper-inventory-v1");
});
