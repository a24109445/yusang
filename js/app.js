import {
  MATERIAL_FIELDS,
  calculateRecipe,
  formatWeight,
  isRecipeConfigured,
  parseNonNegativeNumber,
} from "./calculator.js";
import {
  RECIPE_DEFINITIONS,
  downloadBackup,
  loadRecipes,
  parseBackup,
  resetRecipes,
  saveRecipes,
} from "./storage.js";

const MATERIAL_LABELS = Object.freeze({
  tapiocaStarch: "樹薯粉",
  glutinousRiceFlour: "糯米粉",
  potatoStarch: "太白粉",
  sugar: "糖",
});

const { recipes: initialRecipes, recovered } = loadRecipes();
const state = {
  recipes: initialRecipes,
  currentRecipeId: null,
  toastTimer: null,
};

const views = [...document.querySelectorAll("[data-view]")];
const rawWeightInput = document.querySelector("#raw-weight");
const weightMessage = document.querySelector("#weight-message");
const resultsSection = document.querySelector("#results-section");
const unavailableNotice = document.querySelector("#recipe-unavailable");
const calculatorTitle = document.querySelector("#calculator-title");
const settingsList = document.querySelector("#settings-list");
const recipeForm = document.querySelector("#recipe-form");
const editorTitle = document.querySelector("#editor-title");
const formError = document.querySelector("#form-error");
const importFile = document.querySelector("#import-file");
const settingsDialog = document.querySelector("#settings-access-dialog");
const resetDialog = document.querySelector("#reset-dialog");
const toast = document.querySelector("#toast");

function showView(name) {
  for (const view of views) view.classList.toggle("view--active", view.dataset.view === name);
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.querySelector(`[data-view="${name}"]`)?.focus({ preventScroll: true });
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function renderHomeStatuses() {
  for (const card of document.querySelectorAll("[data-recipe-id]")) {
    const status = card.querySelector(".ingredient-card__status");
    if (!status) continue;
    const ready = isRecipeConfigured(state.recipes[card.dataset.recipeId]);
    status.textContent = ready ? "✓ 已設定" : "尚未設定";
    status.classList.toggle("is-ready", ready);
  }
}

function renderSettingsList() {
  settingsList.replaceChildren(
    ...Object.entries(RECIPE_DEFINITIONS).map(([id, name]) => {
      const button = document.createElement("button");
      const ready = isRecipeConfigured(state.recipes[id]);
      button.type = "button";
      button.className = "settings-item";
      button.dataset.editRecipeId = id;
      button.innerHTML = `
        <span class="settings-item__name">${name}</span>
        <span class="settings-item__status ${ready ? "is-ready" : ""}">${ready ? "✓ 已設定" : "尚未設定"}</span>
        <span class="settings-item__arrow" aria-hidden="true">›</span>
      `;
      return button;
    }),
  );
}

function clearCalculation() {
  rawWeightInput.value = "";
  resultsSection.hidden = true;
  weightMessage.textContent = "輸入處理完成後的重量";
  weightMessage.classList.remove("is-error");
}

function openCalculator(recipeId) {
  state.currentRecipeId = recipeId;
  const recipe = state.recipes[recipeId];
  calculatorTitle.textContent = `${recipe.name}配方`;
  clearCalculation();
  unavailableNotice.hidden = isRecipeConfigured(recipe);
  rawWeightInput.disabled = !isRecipeConfigured(recipe);
  rawWeightInput.placeholder = isRecipeConfigured(recipe) ? "0" : "—";
  showView("calculator");
  if (isRecipeConfigured(recipe)) rawWeightInput.focus();
}

function updateCalculation() {
  const recipe = state.recipes[state.currentRecipeId];
  resultsSection.hidden = true;
  weightMessage.classList.remove("is-error");

  const parsed = parseNonNegativeNumber(rawWeightInput.value);
  if (parsed.empty) {
    weightMessage.textContent = "輸入處理完成後的重量";
    return;
  }
  if (!parsed.valid) {
    weightMessage.textContent = "請輸入大於或等於 0 的數字";
    weightMessage.classList.add("is-error");
    return;
  }
  if (!isRecipeConfigured(recipe)) return;

  try {
    const result = calculateRecipe(recipe, parsed.value);
    for (const field of MATERIAL_FIELDS) {
      document.querySelector(`[data-result="${field}"]`).textContent = formatWeight(result[field]);
    }
    weightMessage.textContent = `以 ${formatWeight(recipe.baseWeight)} g 基準配方計算`;
    resultsSection.hidden = false;
  } catch {
    weightMessage.textContent = "無法計算，請檢查重量與配方設定";
    weightMessage.classList.add("is-error");
  }
}

function requestSettingsAccess() {
  // 未來加入 PIN 時，可將驗證流程集中替換在這個入口。
  settingsDialog.showModal();
}

function openSettings() {
  renderSettingsList();
  showView("settings");
}

function openEditor(recipeId) {
  state.currentRecipeId = recipeId;
  const recipe = state.recipes[recipeId];
  editorTitle.textContent = `${recipe.name}配方`;
  recipeForm.elements.baseWeight.value = String(recipe.baseWeight);
  for (const field of MATERIAL_FIELDS) {
    recipeForm.elements[field].value = recipe.isConfigured ? String(recipe[field]) : "";
  }
  formError.hidden = true;
  showView("recipe-editor");
}

function readRecipeForm() {
  const values = {};
  const fields = ["baseWeight", ...MATERIAL_FIELDS];
  for (const field of fields) {
    const parsed = parseNonNegativeNumber(recipeForm.elements[field].value);
    if (!parsed.valid) {
      const label = field === "baseWeight" ? "基準原料重量" : MATERIAL_LABELS[field];
      throw new TypeError(`${label}請輸入大於或等於 0 的數字`);
    }
    values[field] = parsed.value;
  }
  if (values.baseWeight === 0) throw new TypeError("基準原料重量不可為 0");
  return values;
}

function saveCurrentRecipe(event) {
  event.preventDefault();
  try {
    const values = readRecipeForm();
    const id = state.currentRecipeId;
    const updated = {
      ...state.recipes,
      [id]: { ...state.recipes[id], ...values, isConfigured: true },
    };
    state.recipes = saveRecipes(updated);
    formError.hidden = true;
    renderHomeStatuses();
    renderSettingsList();
    showToast(`${state.recipes[id].name}配方已儲存`);
    openSettings();
  } catch (error) {
    formError.textContent = error instanceof Error ? error.message : "配方無法儲存";
    formError.hidden = false;
  }
}

async function importRecipes(file) {
  if (!file) return;
  try {
    const imported = parseBackup(await file.text());
    state.recipes = saveRecipes(imported);
    renderHomeStatuses();
    renderSettingsList();
    showToast("配方匯入成功");
  } catch (error) {
    showToast(error instanceof Error ? `匯入失敗：${error.message}` : "匯入失敗，原配方未變更");
  } finally {
    importFile.value = "";
  }
}

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const recipeIdSchema = { type: "string", enum: Object.keys(RECIPE_DEFINITIONS) };

  const safelyRegister = (tool) => {
    try {
      void Promise.resolve(context.registerTool(tool)).catch(() => {});
    } catch {
      // WebMCP 尚在實驗階段，不影響一般瀏覽器操作。
    }
  };

  safelyRegister({
    name: "calculate_recipe",
    title: "計算配方",
    description: "依照目前裝置中已儲存的指定原料配方，計算需要加入的材料重量。",
    inputSchema: {
      type: "object",
      properties: { recipeId: recipeIdSchema, rawWeight: { type: "number", minimum: 0 } },
      required: ["recipeId", "rawWeight"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute({ recipeId, rawWeight }) {
      const recipe = state.recipes[recipeId];
      if (!isRecipeConfigured(recipe)) throw new Error("此原料尚未設定完整配方");
      return { recipe: recipe.name, rawWeight, unit: "g", materials: calculateRecipe(recipe, rawWeight) };
    },
  });

  safelyRegister({
    name: "get_recipe_status",
    title: "查看配方設定狀態",
    description: "查看五種原料是否已在此裝置完成配方設定，不會回傳商業配方數字。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute() {
      return Object.fromEntries(
        Object.entries(state.recipes).map(([id, recipe]) => [id, { name: recipe.name, configured: isRecipeConfigured(recipe) }]),
      );
    },
  });
}

document.addEventListener("click", (event) => {
  const recipeCard = event.target.closest("[data-recipe-id]");
  if (recipeCard) return openCalculator(recipeCard.dataset.recipeId);

  const editorButton = event.target.closest("[data-edit-recipe-id]");
  if (editorButton) return openEditor(editorButton.dataset.editRecipeId);

  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  const actions = {
    "go-home": () => showView("home"),
    "go-settings": openSettings,
    "clear-weight": () => { clearCalculation(); rawWeightInput.focus(); },
    "request-settings": requestSettingsAccess,
    "cancel-settings": () => settingsDialog.close(),
    "confirm-settings": () => { settingsDialog.close(); openSettings(); },
    "export-recipes": () => { downloadBackup(state.recipes); showToast("配方備份已匯出"); },
    "choose-import": () => importFile.click(),
    "request-reset": () => resetDialog.showModal(),
    "cancel-reset": () => resetDialog.close(),
    "confirm-reset": () => {
      state.recipes = resetRecipes();
      resetDialog.close();
      renderHomeStatuses();
      renderSettingsList();
      showToast("已恢復預設設定");
    },
  };
  actions[action]?.();
});

rawWeightInput.addEventListener("input", updateCalculation);
recipeForm.addEventListener("submit", saveCurrentRecipe);
importFile.addEventListener("change", () => importRecipes(importFile.files?.[0]));

renderHomeStatuses();
renderSettingsList();
registerWebMcpTools();
if (recovered) setTimeout(() => showToast("配方資料異常，已恢復預設設定"), 250);
