import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServiceWorkerRegister } from './ServiceWorkerRegister'

function stubServiceWorker(register: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true })
}

describe('ServiceWorkerRegister', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('安全環境（HTTPS）下註冊 /sw.js', () => {
    const register = vi.fn().mockResolvedValue({})
    stubServiceWorker(register)
    vi.stubGlobal('isSecureContext', true)
    render(<ServiceWorkerRegister />)
    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  it('用 http://區網IP 開啟（非安全環境）時不註冊', () => {
    const register = vi.fn()
    stubServiceWorker(register)
    vi.stubGlobal('isSecureContext', false)
    render(<ServiceWorkerRegister />)
    expect(register).not.toHaveBeenCalled()
  })

  it('註冊失敗不往外丟', async () => {
    const register = vi.fn().mockRejectedValue(new Error('blocked'))
    stubServiceWorker(register)
    vi.stubGlobal('isSecureContext', true)
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow()
    await Promise.resolve()
  })
})
