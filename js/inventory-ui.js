import { RECIPE_DEFINITIONS } from "./storage.js";
import { formatWeight, parseNonNegativeNumber } from "./calculator.js";
import {
  FLAVOR_IDS, INVENTORY_KEY, PACKAGE_DEFINITIONS, addIncoming, addShipment, cancelEntry,
  createInventoryBackup, emptyWeights, inventoryBalances, loadInventory, parseInventoryBackup,
  saveInventory, shipmentWeights, validatePackaging,
} from "./inventory.js";

export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const weightText = (weight) => `${formatWeight(weight)} g`;
const sumWeights = (weights) => Math.round(Object.values(weights).reduce((sum, value) => sum + value * 10, 0)) / 10;
const contentsText = (weights) => FLAVOR_IDS.filter((id) => weights[id] > 0).map((id) => `${RECIPE_DEFINITIONS[id]} ${weightText(weights[id])}`).join("、");

export function initInventoryUI({ showView, showToast }) {
  const $ = (selector) => document.querySelector(selector);
  const incomingForm = $("#incoming-form");
  const shipmentForm = $("#shipment-form");
  const packageForm = $("#package-form");
  const confirmDialog = $("#stock-confirm-dialog");
  let currentPackageId = null;
  let pendingConfirmation = null;
  let historyLimit = 30;
  let incomingSubmitted = false;
  let shipmentSubmitted = false;

  function setError(selector, error) {
    const element = $(selector);
    element.textContent = error ? (error.message || String(error)) : "";
    element.hidden = !error;
  }

  function persist(change) {
    // Re-read immediately before each change to include writes from another open tab.
    const current = loadInventory();
    const next = change(current);
    try { return saveInventory(next); } catch (error) {
      if (error?.name === "QuotaExceededError") throw new Error("裝置儲存空間不足，這筆資料未儲存。請先匯出備份並釋放空間。");
      throw error;
    }
  }

  function confirm(title, message, action) {
    $("#stock-confirm-title").textContent = title;
    $("#stock-confirm-message").textContent = message;
    pendingConfirmation = action;
    confirmDialog.showModal();
  }

  function renderHistory(data) {
    const filter = $("#history-filter").value;
    const entries = [...data.entries].reverse().filter((entry) => filter === "all" || entry.type === filter);
    const list = $("#stock-history-list");
    list.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "empty-history";
      empty.textContent = "尚無紀錄。計算完成後按「記錄並入庫」，或用「手動入庫」登記現有庫存。";
      list.append(empty);
    }
    for (const entry of entries.slice(0, historyLimit)) {
      const article = document.createElement("article");
      article.className = `history-entry history-entry--${entry.type}${entry.cancelled ? " history-entry--cancelled" : ""}`;
      const heading = document.createElement("div");
      heading.className = "history-entry__heading";
      const tag = document.createElement("span");
      tag.className = "history-entry__tag";
      tag.textContent = `${entry.type === "in" ? "入庫" : "出貨"}${entry.cancelled ? "・已作廢" : ""}`;
      const time = document.createElement("time");
      time.dateTime = entry.date;
      time.textContent = entry.date;
      heading.append(tag, time);
      article.append(heading);
      if (entry.type === "out") {
        const packs = document.createElement("p");
        packs.textContent = Object.entries(entry.quantities).filter(([, count]) => count > 0).map(([id, count]) => `${PACKAGE_DEFINITIONS[id]} ${count} 包`).join("、");
        article.append(packs);
      }
      const details = document.createElement("p");
      details.textContent = `${entry.type === "in" ? "＋" : "−"} ${contentsText(entry.weights)}`;
      const total = document.createElement("small");
      total.textContent = `總重 ${weightText(sumWeights(entry.weights))}`;
      article.append(details, total);
      if (!entry.cancelled) {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "text-button";
        cancel.textContent = "作廢此筆紀錄";
        cancel.dataset.cancelEntry = entry.id;
        article.append(document.createElement("br"), cancel);
      }
      list.append(article);
    }
    $("#more-history").hidden = entries.length <= historyLimit;
  }

  function renderInventory() {
    setError("#inventory-error", null);
    try {
      const data = loadInventory();
      const balances = inventoryBalances(data);
      $("#stock-grid").replaceChildren(...FLAVOR_IDS.map((id) => {
        const card = document.createElement("article");
        card.className = "stock-card";
        const label = document.createElement("p");
        label.textContent = RECIPE_DEFINITIONS[id];
        const amount = document.createElement("strong");
        amount.textContent = formatWeight(balances[id]);
        const unit = document.createElement("span");
        unit.textContent = "g";
        card.append(label, amount, unit);
        return card;
      }));
      renderHistory(data);
    } catch (error) {
      $("#stock-grid").replaceChildren();
      $("#stock-history-list").replaceChildren();
      $("#more-history").hidden = true;
      setError("#inventory-error", error);
    }
  }

  function openInventory() { historyLimit = 30; renderInventory(); showView("inventory"); }

  function openIncoming() {
    incomingForm.reset();
    incomingForm.elements.date.value = today();
    incomingSubmitted = false;
    setError("#incoming-error", null);
    showView("incoming");
  }

  function numberField({ id, label, value, unit, description = "" }) {
    const field = document.createElement("div");
    field.className = "form-field";
    const labelElement = document.createElement("label");
    labelElement.htmlFor = id;
    labelElement.textContent = label;
    if (description) {
      const detail = document.createElement("small");
      detail.className = "package-contents";
      detail.textContent = description;
      labelElement.append(detail);
    }
    const wrapper = document.createElement("div");
    wrapper.className = "unit-input";
    const input = document.createElement("input");
    input.id = id;
    input.name = id;
    input.type = "text";
    input.inputMode = unit === "包" ? "numeric" : "decimal";
    input.autocomplete = "off";
    input.value = String(value);
    const unitElement = document.createElement("span");
    unitElement.textContent = unit;
    wrapper.append(input, unitElement);
    field.append(labelElement, wrapper);
    return field;
  }

  function readNumber(input, label, allowEmpty = false) {
    if (allowEmpty && input.value.trim() === "") return 0;
    const parsed = parseNonNegativeNumber(input.value);
    if (!parsed.valid) throw new TypeError(`${label}請填大於或等於 0 的數字`);
    return parsed.value;
  }

  function readQuantities() {
    return Object.fromEntries(Object.keys(PACKAGE_DEFINITIONS).map((id) => [id, readNumber(shipmentForm.elements[`quantity-${id}`], `${PACKAGE_DEFINITIONS[id]}包數`, true)]));
  }

  function previewShipment() {
    $("#submit-shipment").disabled = true;
    $("#shipment-preview").replaceChildren();
    setError("#shipment-error", null);
    try {
      const data = loadInventory();
      const quantities = readQuantities();
      if (Object.values(quantities).every((value) => value === 0)) {
        $("#shipment-preview").textContent = "填寫包數後，這裡會顯示各口味扣除重量與剩餘庫存。";
        return;
      }
      const deductions = shipmentWeights(data.packaging, quantities);
      const balances = inventoryBalances(data);
      let sufficient = true;
      for (const id of FLAVOR_IDS) {
        if (!deductions[id]) continue;
        const remaining = Math.round((balances[id] - deductions[id]) * 10) / 10;
        const row = document.createElement("div");
        row.className = `preview-row${remaining < 0 ? " is-short" : ""}`;
        const name = document.createElement("span"); name.textContent = RECIPE_DEFINITIONS[id];
        const amount = document.createElement("strong"); amount.textContent = `− ${weightText(deductions[id])}`;
        const summary = document.createElement("small");
        summary.textContent = remaining < 0 ? `庫存 ${weightText(balances[id])}，不足 ${weightText(-remaining)}` : `庫存 ${weightText(balances[id])} → 剩餘 ${weightText(remaining)}`;
        row.append(name, amount, summary);
        $("#shipment-preview").append(row);
        if (remaining < 0) sufficient = false;
      }
      if (!sufficient) setError("#shipment-error", "庫存不足，整筆出貨不會扣庫存。請減少包數或先入庫。");
      $("#submit-shipment").disabled = !sufficient || shipmentSubmitted;
    } catch (error) { setError("#shipment-error", error); }
  }

  function openShipment() {
    try {
      const data = loadInventory();
      shipmentSubmitted = false;
      shipmentForm.elements.date.value = today();
      $("#shipment-fields").replaceChildren(...Object.entries(PACKAGE_DEFINITIONS).map(([id, name]) => numberField({
        id: `quantity-${id}`, label: name, value: "", unit: "包",
        description: sumWeights(data.packaging[id]) > 0 ? `每包 ${weightText(sumWeights(data.packaging[id]))}${id === "mixed" ? ` · ${contentsText(data.packaging[id])}` : ""}` : "尚未設定每包重量",
      })));
      previewShipment();
      showView("shipment");
    } catch (error) { showToast(error.message); openInventory(); }
  }

  function openPackaging() {
    try {
      const data = loadInventory();
      $("#packaging-list").replaceChildren(...Object.entries(PACKAGE_DEFINITIONS).map(([id, name]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "settings-item";
        button.dataset.editPackage = id;
        const label = document.createElement("span");
        label.className = "settings-item__name"; label.textContent = name;
        const status = document.createElement("span");
        status.className = "settings-item__status";
        const weight = sumWeights(data.packaging[id]);
        status.textContent = weight > 0 ? `每包 ${weightText(weight)}` : "尚未設定";
        if (weight > 0) status.classList.add("is-ready");
        const arrow = document.createElement("span"); arrow.className = "settings-item__arrow"; arrow.textContent = "›";
        button.append(label, status, arrow);
        return button;
      }));
      showView("packaging");
    } catch (error) { showToast(error.message); openInventory(); }
  }

  function readPackageWeights() {
    const weights = emptyWeights();
    const ids = currentPackageId === "mixed" ? FLAVOR_IDS : [currentPackageId];
    for (const id of ids) weights[id] = readNumber(packageForm.elements[`pack-${id}`], RECIPE_DEFINITIONS[id]);
    return weights;
  }

  function previewPackage() {
    try {
      const weights = readPackageWeights();
      $("#package-total").textContent = `每包總重 ${weightText(sumWeights(weights))}`;
    } catch { $("#package-total").textContent = "重量可填到小數第一位；不含的口味填 0。"; }
  }

  function openPackageEditor(id) {
    try {
      const data = loadInventory();
      if (!(id in PACKAGE_DEFINITIONS)) return;
      currentPackageId = id;
      $("#package-editor-title").textContent = `${PACKAGE_DEFINITIONS[id]}包裝`;
      $("#package-editor-description").textContent = id === "mixed" ? "填寫一包綜合內五種口味各自的重量，不含的口味填 0。單位為 g，最多一位小數。" : "填寫一包的總重量。單位為 g，最多一位小數。";
      $("#package-fields").replaceChildren(...(id === "mixed" ? FLAVOR_IDS : [id]).map((flavorId) => numberField({ id: `pack-${flavorId}`, label: RECIPE_DEFINITIONS[flavorId], value: data.packaging[id][flavorId], unit: "g" })));
      setError("#package-error", null);
      previewPackage();
      showView("package-editor");
    } catch (error) { showToast(error.message); }
  }

  incomingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (incomingSubmitted) return;
    try {
      const weight = readNumber(incomingForm.elements.weight, "入庫總重");
      persist((data) => addIncoming(data, { flavorId: incomingForm.elements.flavorId.value, weight, date: incomingForm.elements.date.value }));
      incomingSubmitted = true;
      showToast("已記錄入庫");
      openInventory();
    } catch (error) { setError("#incoming-error", error); }
  });

  shipmentForm.addEventListener("input", previewShipment);
  shipmentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (shipmentSubmitted) return;
    try {
      const quantities = readQuantities();
      persist((data) => addShipment(data, { quantities, date: shipmentForm.elements.date.value }));
      shipmentSubmitted = true;
      $("#submit-shipment").disabled = true;
      showToast("出貨已記錄，庫存已扣除");
      openInventory();
    } catch (error) { previewShipment(); setError("#shipment-error", error); }
  });

  packageForm.addEventListener("input", previewPackage);
  packageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const weights = readPackageWeights();
      if (!Object.values(weights).some((weight) => weight > 0)) throw new TypeError("每包總重必須大於 0");
      persist((data) => ({ ...data, packaging: validatePackaging({ ...data.packaging, [currentPackageId]: weights }) }));
      showToast("每包重量已儲存");
      openPackaging();
    } catch (error) { setError("#package-error", error); }
  });

  $("#history-filter").addEventListener("change", () => { historyLimit = 30; renderInventory(); });
  confirmDialog.addEventListener("close", () => { pendingConfirmation = null; });
  document.addEventListener("click", (event) => {
    const packageButton = event.target.closest("[data-edit-package]");
    if (packageButton) return openPackageEditor(packageButton.dataset.editPackage);
    const cancelButton = event.target.closest("[data-cancel-entry]");
    if (cancelButton) {
      return confirm("作廢此筆紀錄？", "作廢出貨會退回扣除的庫存；作廢入庫會扣回該筆重量。紀錄會保留並標示作廢；若會造成庫存不足，系統會阻止操作。", () => {
        persist((data) => cancelEntry(data, cancelButton.dataset.cancelEntry));
        renderInventory();
        showToast("紀錄已作廢，庫存已更新");
      });
    }
    const action = event.target.closest("[data-stock-action]")?.dataset.stockAction;
    const actions = {
      "open-inventory": openInventory,
      "open-incoming": openIncoming,
      "open-shipment": openShipment,
      "open-packaging": openPackaging,
      "more-history": () => { historyLimit += 30; renderInventory(); },
      "cancel-confirm": () => confirmDialog.close(),
      "confirm-stock": () => {
        const callback = pendingConfirmation;
        pendingConfirmation = null;
        confirmDialog.close();
        try { callback?.(); } catch (error) { showToast(error.message); }
      },
      "export-inventory": () => {
        const blob = new Blob([JSON.stringify(createInventoryBackup(loadInventory()), null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = `yusang-inventory-${today()}.json`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        showToast("庫存備份已匯出");
      },
      "import-inventory": () => $("#inventory-import-file").click(),
    };
    try { actions[action]?.(); } catch (error) { showToast(error.message); }
  });

  $("#inventory-import-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseInventoryBackup(await file.text());
      confirm("匯入庫存備份？", `此備份有 ${imported.entries.length} 筆紀錄，將取代本裝置目前的庫存、包裝設定與進出貨紀錄。請先匯出目前資料以便保留。`, () => {
        saveInventory(imported);
        openInventory();
        showToast("庫存備份已匯入");
      });
    } catch (error) { showToast(`匯入失敗：${error.message}`); }
    finally { event.target.value = ""; }
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== INVENTORY_KEY) return;
    if ($('[data-view="inventory"]').classList.contains("view--active")) renderInventory();
    if ($('[data-view="shipment"]').classList.contains("view--active")) {
      openShipment();
      showToast("另一分頁已更新庫存或包裝設定，請重新填寫出貨包數");
    }
  });

  return {
    recordProduction({ flavorId, weight, date }) {
      persist((data) => addIncoming(data, { flavorId, weight, date }));
      showToast(`${RECIPE_DEFINITIONS[flavorId]} ${weightText(weight)} 已入庫`);
    },
    openInventory,
  };
}
