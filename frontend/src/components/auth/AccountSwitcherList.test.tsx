import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DeviceAccount } from '@/hooks/useDeviceAccounts'
import { AccountSwitcherList } from './AccountSwitcherList'

const ACCOUNT: DeviceAccount = {
  user_uid: '11111111-1111-1111-1111-111111111111',
  maskedEmail: 'j***8@gmail.com',
  displayName: 'j1025178',
  avatarColor: '#8257D6',
}

describe('AccountSwitcherList', () => {
  it('render 出每個帳號的遮罩 email', () => {
    render(
      <AccountSwitcherList accounts={[ACCOUNT]} onSelectAccount={vi.fn()} onUseOtherAccount={vi.fn()} />,
    )
    expect(screen.getByText('j***8@gmail.com')).toBeInTheDocument()
  })

  it('點選帳號觸發 onSelectAccount 並帶入該帳號', () => {
    const onSelectAccount = vi.fn()
    render(
      <AccountSwitcherList accounts={[ACCOUNT]} onSelectAccount={onSelectAccount} onUseOtherAccount={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('j***8@gmail.com'))
    expect(onSelectAccount).toHaveBeenCalledExactlyOnceWith(ACCOUNT)
  })

  it('點選「使用其他帳號登入」觸發 onUseOtherAccount', () => {
    const onUseOtherAccount = vi.fn()
    render(
      <AccountSwitcherList accounts={[ACCOUNT]} onSelectAccount={vi.fn()} onUseOtherAccount={onUseOtherAccount} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ 使用其他帳號登入' }))
    expect(onUseOtherAccount).toHaveBeenCalledOnce()
  })

  it('空清單時仍 render「使用其他帳號登入」按鈕，不崩潰', () => {
    render(<AccountSwitcherList accounts={[]} onSelectAccount={vi.fn()} onUseOtherAccount={vi.fn()} />)
    expect(screen.getByRole('button', { name: '+ 使用其他帳號登入' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /gmail\.com/ })).not.toBeInTheDocument()
  })
})
