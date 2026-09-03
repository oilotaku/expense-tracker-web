'use client'

import { useState, type ReactNode } from 'react'
import { Provider } from 'react-redux'
import { makeStore, setupStoreListeners, type AppStore } from './store'

interface StoreProviderProps {
  children: ReactNode
}

export function StoreProvider({ children }: StoreProviderProps): ReactNode {
  // lazy initializer 每個 request（client mount）只跑一次；不用 useRef：render 期讀 .current 會被 react-hooks/refs 擋
  const [store] = useState<AppStore>(() => {
    const s = makeStore()
    setupStoreListeners(s)
    return s
  })
  return <Provider store={store}>{children}</Provider>
}
