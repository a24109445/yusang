# 芋桑小幫手

## 專案介紹

「芋桑小幫手」是製作冷凍芋圓時使用的手機優先配方計算工具。可分別保存地瓜、紫心地瓜、芋頭、山藥與馬鈴薯的配方，輸入處理完成後的原料重量後即時計算樹薯粉、糯米粉、太白粉與糖的用量。

本專案是純 HTML、CSS 與 Vanilla JavaScript PWA，沒有後端、資料庫、分析工具或外部 API。所有配方只儲存在目前瀏覽器的 `localStorage`，不會傳送到網路或其他裝置。

## 本機啟動方式

Service Worker 無法從 `file://` 正常運作，請使用簡單的 HTTP Server。

1. 在終端機進入 `yusang-helper` 資料夾。
2. 執行：

   ```bash
   python3 -m http.server 8000
   ```

   Windows 若使用 `py` 啟動器，也可執行：

   ```powershell
   py -m http.server 8000
   ```

3. 瀏覽 `http://localhost:8000`。

本專案無需安裝套件或建置即可使用。

## 執行測試

若電腦已安裝 Node.js，可在專案資料夾執行：

```bash
npm test
```

測試涵蓋指定的三組計算案例、數字格式、錯誤輸入、localStorage 損壞復原與備份匯入驗證。

## GitHub Pages 部署方式

1. 在 GitHub 建立名為 `yusang-helper` 的 Repository。
2. 將此資料夾內的全部檔案提交並 Push 到 `main` branch。
3. 開啟 Repository 的 **Settings**。
4. 在左側選擇 **Pages**。
5. 在 **Build and deployment** 的 Source 選擇 **Deploy from a branch**。
6. Branch 選擇 `main`，資料夾選擇 `/ (root)`。
7. 點擊 **Save**，等待 GitHub 顯示已發布的 HTTPS 網址。

所有靜態資源都使用相對路徑，可在 `https://USERNAME.github.io/yusang-helper/` 這類子路徑正常運作。Service Worker 需要 HTTPS；GitHub Pages 與 Cloudflare Pages 均會提供 HTTPS。

## iPhone 安裝方式

1. 使用 iPhone 的 Safari 開啟已部署的網站。
2. 點擊 Safari 的分享按鈕。
3. 選擇「加入主畫面」。
4. 確認名稱為「芋桑小幫手」。
5. 點擊「新增」。
6. 從 iPhone 桌面的「芋桑小幫手」圖示開啟。

第一次成功開啟並完成離線快取後，即使暫時沒有網路，仍可開啟 App 並計算配方。

## 設定與修改配方

1. 在首頁點擊右上角「配方設定」。
2. 在確認畫面點擊「繼續」。
3. 選擇要修改的原料。
4. 輸入基準原料重量與四種材料重量。
5. 點擊「儲存配方」。

五種原料的配方互相獨立。初始材料數值不是正式配方；在使用者儲存之前，首頁會顯示「尚未設定」。

## 配方備份

- **匯出：** 進入配方設定，點擊「匯出配方備份」，會下載 `yusang-recipe-backup.json`。
- **匯入：** 點擊「匯入配方備份」並選擇先前匯出的 JSON 檔。系統會先驗證版本、五種原料、必要欄位及數值；格式錯誤時不會覆蓋現有配方。

更換手機、清除 Safari 網站資料或無痕瀏覽前，請先匯出備份。移除主畫面圖示本身通常不會清除 Safari 網站資料，但仍建議定期備份商業配方。

## 檔案職責

- `index.html`：所有畫面、PWA 與 iOS meta 設定。
- `css/style.css`：手機優先版面、品牌樣式與 Safe Area。
- `js/calculator.js`：輸入解析、配方驗證、計算與顯示格式。
- `js/storage.js`：localStorage、預設資料、備份匯出與匯入驗證。
- `js/app.js`：畫面切換、表單、即時計算與提示訊息。
- `js/pwa.js`：Service Worker 註冊與更新檢查。
- `manifest.json`：PWA 名稱、顯示模式、色彩與圖示。
- `service-worker.js`：離線快取與舊版本 Cache 清理。
- `icons/`：PWA 與 Apple Touch 圖示。
- `tools/generate_icons.py`：重新產生三個 placeholder PNG 圖示的輔助工具。
- `tests/`：計算與儲存模組測試。

## 更新 Service Worker

每次修改需要離線快取的程式後，請將 `service-worker.js` 的 `CACHE_NAME` 版本往上調整，例如從 `yusang-helper-v2` 改成 `yusang-helper-v3`。新版啟用時會自動清除舊 Cache。

