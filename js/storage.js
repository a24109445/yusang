import { MATERIAL_FIELDS, validateRecipe } from "./calculator.js";

export const STORAGE_KEY = "yusang-helper-recipes-v1";
export const BACKUP_VERSION = 1;

export const RECIPE_DEFINITIONS = Object.freeze({
  sweetPotato: "地瓜",
  purpleSweetPotato: "紫心地瓜",
  taro: "芋頭",
  yam: "山藥",
  potato: "馬鈴薯",
});

export function createDefaultRecipes() {
  return Object.fromEntries(
    Object.entries(RECIPE_DEFINITIONS).map(([id, name]) => [
      id,
      {
        name,
        baseWeight: 1000,
        tapiocaStarch: 0,
        glutinousRiceFlour: 0,
        potatoStarch: 0,
        sugar: 0,
        isConfigured: false,
      },
    ]),
  );
}

function sanitizeRecipes(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("配方資料必須是物件");
  }

  const sanitized = {};
  for (const [id, expectedName] of Object.entries(RECIPE_DEFINITIONS)) {
    const candidate = input[id];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new TypeError(`缺少 ${expectedName} 配方`);
    }
    if (candidate.name !== expectedName || !validateRecipe(candidate)) {
      throw new TypeError(`${expectedName} 配方格式錯誤`);
    }

    sanitized[id] = {
      name: expectedName,
      baseWeight: candidate.baseWeight,
      ...Object.fromEntries(MATERIAL_FIELDS.map((field) => [field, candidate[field]])),
      isConfigured: candidate.isConfigured === true,
    };
  }
  return sanitized;
}

export function loadRecipes() {
  const defaults = createDefaultRecipes();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { recipes: defaults, recovered: false };
    return { recipes: sanitizeRecipes(JSON.parse(raw)), recovered: false };
  } catch (error) {
    console.warn("配方資料無法讀取，已恢復預設值。", error);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    } catch (storageError) {
      console.warn("無法寫入預設配方。", storageError);
    }
    return { recipes: defaults, recovered: true };
  }
}

export function saveRecipes(recipes) {
  const sanitized = sanitizeRecipes(recipes);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  return sanitized;
}

export function resetRecipes() {
  return saveRecipes(createDefaultRecipes());
}

export function createBackup(recipes, exportDate = new Date().toISOString()) {
  return {
    version: BACKUP_VERSION,
    exportDate,
    recipes: sanitizeRecipes(recipes),
  };
}

export function downloadBackup(recipes) {
  const backup = createBackup(recipes);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "yusang-recipe-backup.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function parseBackup(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new TypeError("檔案不是有效的 JSON");
  }

  if (!backup || backup.version !== BACKUP_VERSION || typeof backup.exportDate !== "string") {
    throw new TypeError("備份版本或日期格式不正確");
  }
  if (!Number.isFinite(Date.parse(backup.exportDate))) {
    throw new TypeError("備份日期格式不正確");
  }
  return sanitizeRecipes(backup.recipes);
}
