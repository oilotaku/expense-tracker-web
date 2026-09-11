import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AccountResponse } from '@/lib/api/accountsApi'
import { AccountCard } from './AccountCard'

const CASH_ACCOUNT: AccountResponse = {
  account_uid: 'a-cash',
  name: '現金',
  balance: '1000.00',
  currency: 'TWD',
  color: '#8B6ED6',
  icon: 'wallet',
}

describe('AccountCard', () => {
  it('render 帳戶名稱、餘額，與依 color 上色的圖示徽章', () => {
    const { container } = render(
      <AccountCard
        account={CASH_ACCOUNT}
        isOnlyAccount={false}
        onNameChange={vi.fn()}
        onBalanceChange={vi.fn()}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('現金')).toBeInTheDocument()
    expect(screen.getByText('1000.00 TWD')).toBeInTheDocument()
    const badge = container.querySelector('span[style]')
    expect(badge).toHaveStyle({ backgroundColor: '#8B6ED6' })
  })

  it('未知 icon key（後端不做 enum 檢查）時退化為通用圖示，不整卡壞掉', () => {
    render(
      <AccountCard
        account={{ ...CASH_ACCOUNT, icon: 'not-a-real-icon' }}
        isOnlyAccount={false}
        onNameChange={vi.fn()}
        onBalanceChange={vi.fn()}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('現金')).toBeInTheDocument()
  })

  it('點擊編輯展開名稱輸入框，修改後 blur 呼叫 onNameChange', () => {
    const onNameChange = vi.fn()
    render(
      <AccountCard
        account={CASH_ACCOUNT}
        isOnlyAccount={false}
        onNameChange={onNameChange}
        onBalanceChange={vi.fn()}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('編輯 現金'))
    const nameInput = screen.getByLabelText('名稱')
    fireEvent.change(nameInput, { target: { value: '皮夾' } })
    fireEvent.blur(nameInput)

    expect(onNameChange).toHaveBeenCalledExactlyOnceWith('a-cash', '皮夾')
  })

  it('名稱輸入框按 Enter 也會提交 onNameChange，空字串不提交', () => {
    const onNameChange = vi.fn()
    render(
      <AccountCard
        account={CASH_ACCOUNT}
        isOnlyAccount={false}
        onNameChange={onNameChange}
        onBalanceChange={vi.fn()}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('編輯 現金'))
    const nameInput = screen.getByLabelText('名稱')
    fireEvent.change(nameInput, { target: { value: '  ' } })
    fireEvent.keyDown(nameInput, { key: 'Enter' })
    expect(onNameChange).not.toHaveBeenCalled()

    fireEvent.change(nameInput, { target: { value: '主帳戶' } })
    fireEvent.keyDown(nameInput, { key: 'Enter' })
    expect(onNameChange).toHaveBeenCalledExactlyOnceWith('a-cash', '主帳戶')
  })

  it('點擊編輯展開餘額輸入框，修改後 blur 呼叫 onBalanceChange（使用者手動對帳/修正誤差用）', () => {
    const onBalanceChange = vi.fn()
    render(
      <AccountCard
        account={CASH_ACCOUNT}
        isOnlyAccount={false}
        onNameChange={vi.fn()}
        onBalanceChange={onBalanceChange}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('編輯 現金'))
    const balanceInput = screen.getByLabelText('餘額')
    fireEvent.change(balanceInput, { target: { value: '850.50' } })
    fireEvent.blur(balanceInput)

    expect(onBalanceChange).toHaveBeenCalledExactlyOnceWith('a-cash', '850.50')
  })

  it('餘額允許改成負數（例如信用卡循環未繳），按 Enter 提交；跟現值相同或格式不合法則不提交', () => {
    const onBalanceChange = vi.fn()
    render(
      <AccountCard
        account={CASH_ACCOUNT}
        isOnlyAccount={false}
        onNameChange={vi.fn()}
        onBalanceChange={onBalanceChange}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('編輯 現金'))
    const balanceInput = screen.getByLabelText('餘額')

    // 跟現值相同：不提交
    fireEvent.change(balanceInput, { target: { value: '1000.00' } })
    fireEvent.keyDown(balanceInput, { key: 'Enter' })
    expect(onBalanceChange).not.toHaveBeenCalled()

    // 負數：允許提交
    fireEvent.change(balanceInput, { target: { value: '-500.00' } })
    fireEvent.keyDown(balanceInput, { key: 'Enter' })
    expect(onBalanceChange).toHaveBeenCalledExactlyOnceWith('a-cash', '-500.00')
  })

  it('展開後選色 / 選圖示即時呼叫 onColorChange / onIconChange', () => {
    const onColorChange = vi.fn()
    const onIconChange = vi.fn()
    render(
      <AccountCard
        account={CASH_ACCOUNT}
        isOnlyAccount={false}
        onNameChange={vi.fn()}
        onBalanceChange={vi.fn()}
        onColorChange={onColorChange}
        onIconChange={onIconChange}
        onRequestDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('編輯 現金'))
    fireEvent.click(screen.getByRole('button', { name: '選擇顏色 #E8834B' }))
    expect(onColorChange).toHaveBeenCalledExactlyOnceWith('a-cash', '#E8834B')

    fireEvent.click(screen.getByRole('button', { name: '銀行' }))
    expect(onIconChange).toHaveBeenCalledExactlyOnceWith('a-cash', 'bank')
  })

  it('點擊刪除按鈕呼叫 onRequestDelete 並帶完整帳戶資料', () => {
    const onRequestDelete = vi.fn()
    render(
      <AccountCard
        account={CASH_ACCOUNT}
        isOnlyAccount={false}
        onNameChange={vi.fn()}
        onBalanceChange={vi.fn()}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={onRequestDelete}
      />,
    )
    fireEvent.click(screen.getByLabelText('刪除 現金'))
    expect(onRequestDelete).toHaveBeenCalledExactlyOnceWith(CASH_ACCOUNT)
  })

  it('只剩最後一個帳戶時（isOnlyAccount）刪除按鈕 disabled 且顯示提示文字（→ A4）', () => {
    const onRequestDelete = vi.fn()
    render(
      <AccountCard
        account={CASH_ACCOUNT}
        isOnlyAccount
        onNameChange={vi.fn()}
        onBalanceChange={vi.fn()}
        onColorChange={vi.fn()}
        onIconChange={vi.fn()}
        onRequestDelete={onRequestDelete}
      />,
    )
    const deleteButton = screen.getByLabelText('刪除 現金')
    expect(deleteButton).toBeDisabled()
    expect(screen.getByText('至少需保留一個帳戶')).toBeInTheDocument()

    fireEvent.click(deleteButton)
    expect(onRequestDelete).not.toHaveBeenCalled()
  })
})
