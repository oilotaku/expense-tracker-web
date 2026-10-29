import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EntityIcon } from './EntityIcon'

describe('EntityIcon', () => {
  it('內建圖示：彩色圓底 + SVG', () => {
    const { container } = render(<EntityIcon icon="food" color="#8B6ED6" />)
    const box = container.firstElementChild as HTMLElement
    expect(box.style.backgroundColor).toBe('rgb(139, 110, 214)')
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('自訂圖示：直接載入圖片且不套底色', () => {
    const { container } = render(<EntityIcon icon="custom:abc" color="#8B6ED6" />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('http://localhost:8000/api/v1/icons/abc')
    expect((container.firstElementChild as HTMLElement).style.backgroundColor).toBe('')
  })

  it('自訂圖示載入失敗時退回預設圓點', () => {
    const { container } = render(<EntityIcon icon="custom:gone" color="#E8834B" />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg circle')).not.toBeNull()
    expect((container.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(232, 131, 75)')
  })

  it('不認得的內建 key 退回預設圓點', () => {
    const { container } = render(<EntityIcon icon="nope" color="#8B6ED6" />)
    expect(container.querySelector('svg circle')).not.toBeNull()
  })
})
