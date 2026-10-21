# iOS App（SwiftUI）

記帳網站的原生 iOS 版，直接呼叫既有 FastAPI（經前端同源 `/api/v1`），後端不需改動。

- 登入沿用 HttpOnly cookie（`access_token`），支援 PIN 快速登入
- 第一次開啟輸入伺服器位址（和瀏覽器開的網址相同，需 HTTPS，因 cookie 為 Secure）
- 需求 iOS 17+；專案檔由 [XcodeGen](https://github.com/yonaskolb/XcodeGen) 依 `project.yml` 產生，不進版控

## 建置

手動觸發 `.github/workflows/ios-build.yml`（`gh workflow run ios-build.yml --ref ios-app`），在 macOS runner 產生未簽名 IPA（artifact `ExpenseTracker-unsigned`），再自行簽名安裝。

本機有 Xcode 時：

```bash
cd ios
brew install xcodegen
cp icon-source.png ExpenseTracker/Assets.xcassets/AppIcon.appiconset/AppIcon.png
xcodegen generate && open ExpenseTracker.xcodeproj
```
