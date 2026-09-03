// vitest 共用 setup：註冊 @testing-library/jest-dom matcher（toBeInTheDocument 等）
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// globals: false 時 RTL 不會自動 cleanup，需手動在每個測試後卸載，否則上一個 render 會殘留到下一個測試
afterEach(() => {
  cleanup()
})
