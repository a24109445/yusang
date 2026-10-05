import { RECIPE_DEFINITIONS } from "./storage.js";

export const INVENTORY_KEY = "yusang-helper-inventory-v1";
export const FLAVOR_IDS = Object.keys(RECIPE_DEFINITIONS);
export const PACKAGE_DEFINITIONS = Object.freeze({ mixed: "綜合", ...RECIPE_DEFINITIONS });
const PACKAGE_IDS = Object.keys(PACKAGE_DEFINITIONS);

export function emptyWeights() {
  return Object.fromEntries(FLAVOR_IDS.map((id) => [id, 0]));
}

export function createInventory() {
  return {
    version: 1,
    packaging: Object.fromEntries(PACKAGE_IDS.map((id) => [id, emptyWeights()])),
    entries: [],
  };
}

// Keep arithmetic in tenths of a gram so repeated deductions remain exact.
function units(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
      !Number.isSafeInteger(Math.round(value * 10)) || Math.abs(value * 10 - Math.round(value * 10)) > 0.00001) {
    throw new TypeError("重量請填大於或等於 0 的數字，最多一位小數");
  }
  return Math.round(value * 10);
}

function safeUnits(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("重量超出可計算範圍");
  return value;
}

function validateWeights(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("口味重量格式錯誤");
  return Object.fromEntries(FLAVOR_IDS.map((id) => [id, units(input[id]) / 10]));
}

export function validatePackaging(input) {
  if (!input || typeof input !== "object") throw new TypeError("包裝設定格式錯誤");
  return Object.fromEntries(PACKAGE_IDS.map((packageId) => {
    const weights = validateWeights(input[packageId]);
    if (packageId !== "mixed" && FLAVOR_IDS.some((id) => id !== packageId && weights[id] !== 0)) {
      throw new TypeError("單一口味包裝不可包含其他口味");
    }
    safeUnits(FLAVOR_IDS.reduce((sum, id) => sum + units(weights[id]), 0));
    return [packageId, weights];
  }));
}

function validateQuantities(input) {
  if (!input || typeof input !== "object") throw new TypeError("包數格式錯誤");
  return Object.fromEntries(PACKAGE_IDS.map((id) => {
    const quantity = input[id] ?? 0;
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw new TypeError("出貨包數請填大於或等於 0 的整數");
    return [id, quantity];
  }));
}

export function shipmentWeights(packaging, quantities) {
  const settings = validatePackaging(packaging);
  const counts = validateQuantities(quantities);
  const deductions = emptyWeights();
  if (!PACKAGE_IDS.some((id) => counts[id] > 0)) throw new TypeError("請至少填寫一種出貨包數");
  for (const packageId of PACKAGE_IDS) {
    if (!counts[packageId]) continue;
    if (!FLAVOR_IDS.some((id) => settings[packageId][id] > 0)) {
      throw new TypeError(`請先設定${PACKAGE_DEFINITIONS[packageId]}每包重量`);
    }
    for (const id of FLAVOR_IDS) {
      deductions[id] = safeUnits(units(deductions[id]) + units(settings[packageId][id]) * counts[packageId]) / 10;
    }
  }
  return deductions;
}

export function inventoryBalances(data) {
  const balances = emptyWeights();
  for (const entry of data.entries) {
    if (entry.cancelled) continue;
    for (const id of FLAVOR_IDS) {
      const next = units(balances[id]) + units(entry.weights[id]) * (entry.type === "in" ? 1 : -1);
      if (next < 0) throw new RangeError(`${RECIPE_DEFINITIONS[id]}庫存不足，紀錄無法送出`);
      balances[id] = safeUnits(next) / 10;
    }
  }
  return balances;
}

export function validateDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new TypeError("請選擇有效日期");
  }
  return date;
}

export function validateInventory(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.entries)) throw new TypeError("庫存資料版本或格式錯誤");
  const ids = new Set();
  const data = {
    version: 1,
    packaging: validatePackaging(input.packaging),
    entries: input.entries.map((entry) => {
      if (!entry || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) ||
          !["in", "out"].includes(entry.type) || typeof entry.createdAt !== "string" ||
          !Number.isFinite(Date.parse(entry.createdAt)) || typeof entry.cancelled !== "boolean") {
        throw new TypeError("進出貨紀錄格式錯誤");
      }
      ids.add(entry.id);
      const weights = validateWeights(entry.weights);
      if (!FLAVOR_IDS.some((id) => weights[id] > 0)) throw new TypeError("紀錄重量必須大於 0");
      const clean = { id: entry.id, type: entry.type, date: validateDate(entry.date), createdAt: entry.createdAt, weights, cancelled: entry.cancelled };
      if (entry.type === "in") {
        if (FLAVOR_IDS.filter((id) => weights[id] > 0).length !== 1) throw new TypeError("每筆入庫限一種口味");
      } else {
        clean.quantities = validateQuantities(entry.quantities);
        clean.packaging = validatePackaging(entry.packaging);
        const expected = shipmentWeights(clean.packaging, clean.quantities);
        if (FLAVOR_IDS.some((id) => expected[id] !== weights[id])) throw new TypeError("出貨重量與包裝紀錄不符");
      }
      return clean;
    }),
  };
  inventoryBalances(data);
  return data;
}

export function loadInventory(storage = localStorage) {
  const raw = storage.getItem(INVENTORY_KEY);
  if (!raw) return createInventory();
  try {
    return validateInventory(JSON.parse(raw));
  } catch {
    throw new Error("庫存資料無法讀取，原資料已保留。請匯入有效庫存備份後再操作。");
  }
}

export function saveInventory(data, storage = localStorage) {
  const validated = validateInventory(data);
  storage.setItem(INVENTORY_KEY, JSON.stringify(validated));
  return validated;
}

function newEntry(type, date, weights) {
  return {
    id: globalThis.crypto.randomUUID(),
    type,
    date: validateDate(date),
    createdAt: new Date().toISOString(),
    weights,
    cancelled: false,
  };
}

export function addIncoming(data, { flavorId, weight, date }) {
  if (!FLAVOR_IDS.includes(flavorId) || units(weight) <= 0) throw new TypeError("請選擇口味並填寫大於 0 的總重");
  const entry = newEntry("in", date, { ...emptyWeights(), [flavorId]: weight });
  return validateInventory({ ...data, entries: [...data.entries, entry] });
}

export function addShipment(data, { quantities, date }) {
  const weights = shipmentWeights(data.packaging, quantities);
  const balances = inventoryBalances(data);
  const shortages = FLAVOR_IDS.filter((id) => weights[id] > balances[id]);
  if (shortages.length) {
    throw new RangeError(shortages.map((id) => `${RECIPE_DEFINITIONS[id]}庫存不足（缺 ${(units(weights[id]) - units(balances[id])) / 10} g）`).join("、"));
  }
  const entry = { ...newEntry("out", date, weights), quantities: validateQuantities(quantities), packaging: validatePackaging(data.packaging) };
  return validateInventory({ ...data, entries: [...data.entries, entry] });
}

export function cancelEntry(data, entryId) {
  const entry = data.entries.find((item) => item.id === entryId);
  if (!entry || entry.cancelled) throw new Error("此紀錄已作廢或不存在");
  return validateInventory({ ...data, entries: data.entries.map((item) => item.id === entryId ? { ...item, cancelled: true } : item) });
}

export function createInventoryBackup(data) {
  return { kind: "yusang-inventory", version: 1, exportDate: new Date().toISOString(), inventory: validateInventory(data) };
}

export function parseInventoryBackup(text) {
  let backup;
  try { backup = JSON.parse(text); } catch { throw new TypeError("檔案不是有效的 JSON"); }
  if (backup?.kind !== "yusang-inventory" || backup.version !== 1 || typeof backup.exportDate !== "string" || !Number.isFinite(Date.parse(backup.exportDate))) {
    throw new TypeError("請選擇有效的庫存備份檔");
  }
  return validateInventory(backup.inventory);
}
