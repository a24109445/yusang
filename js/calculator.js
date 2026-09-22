export const MATERIAL_FIELDS = [
  "tapiocaStarch",
  "glutinousRiceFlour",
  "potatoStarch",
  "sugar",
];

export function parseNonNegativeNumber(value) {
  const text = String(value ?? "").trim();
  if (text === "") return { valid: false, empty: true, value: null };
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    return { valid: false, empty: false, value: null };
  }

  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) {
    return { valid: false, empty: false, value: null };
  }

  return { valid: true, empty: false, value: number };
}

export function validateRecipe(recipe) {
  if (!recipe || typeof recipe !== "object") return false;
  if (!Number.isFinite(recipe.baseWeight) || recipe.baseWeight <= 0) return false;
  return MATERIAL_FIELDS.every(
    (field) => Number.isFinite(recipe[field]) && recipe[field] >= 0,
  );
}

export function isRecipeConfigured(recipe) {
  return recipe?.isConfigured === true && validateRecipe(recipe);
}

export function calculateRecipe(recipe, rawWeight) {
  if (!validateRecipe(recipe)) throw new TypeError("配方資料無效");
  if (!Number.isFinite(rawWeight) || rawWeight < 0) {
    throw new TypeError("原料重量必須是大於或等於 0 的數字");
  }

  const ratio = rawWeight / recipe.baseWeight;
  const result = {};
  for (const field of MATERIAL_FIELDS) {
    const value = ratio * recipe[field];
    if (!Number.isFinite(value)) throw new RangeError("計算結果超出可用範圍");
    result[field] = Math.round((value + Number.EPSILON) * 10) / 10;
  }
  return result;
}

export function formatWeight(value) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
