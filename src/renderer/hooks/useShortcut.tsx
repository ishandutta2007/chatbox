import { getDefaultStore } from 'jotai'
import { useEffect } from 'react'
import { navigateToSettings } from '@/modals/Settings'
import { router } from '@/router'
import { uiStore } from '@/stores/uiStore'
import { getOS } from '../packages/navigator'
import platform from '../platform'
import { currentSessionIdAtom } from '../stores/atoms'
import { createEmpty, startNewThread, switchToIndex, switchToNext } from '../stores/sessionActions'
import * as dom from './dom'
import { useIsSmallScreen } from './useScreenChange'

export default function useShortcut() {
  const isSmallScreen = useIsSmallScreen()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keyboardShortcut(e)
    }
    const cancel = platform.onWindowShow(() => {
      // 大屏幕下，窗口显示时自动聚焦输入框
      if (!isSmallScreen) {
        dom.focusMessageInput()
      }
    })
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      cancel()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSmallScreen])

  function keyboardShortcut(e: KeyboardEvent) {
    // 这里不用 e.key 是因为 alt、 option、shift 都会改变 e.key 的值
    const ctrlOrCmd = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const altOrOption = e.altKey

    const ctrlKey = getOS() === 'Mac' ? e.metaKey : e.ctrlKey

    if (e.key === 'i' && ctrlKey) {
      dom.focusMessageInput()
      return
    }
    if (e.key === 'e' && ctrlKey) {
      dom.focusMessageInput()
      uiStore.setState((state) => ({
        inputBoxWebBrowsingMode: !state.inputBoxWebBrowsingMode,
      }))
      return
    }

    // 创建新会话 CmdOrCtrl + N
    if (e.key === 'n' && ctrlKey && !shift) {
      router.navigate({
        to: '/',
      })
      return
    }
    // 创建新图片会话 CmdOrCtrl + Shift + N
    if (e.key === 'n' && ctrlKey && shift) {
      createEmpty('picture')
      return
    }
    // 归档当前会话的上下文。
    if (e.key === 'r' && ctrlKey) {
      e.preventDefault()
      const sid = getDefaultStore().get(currentSessionIdAtom)
      if (sid) {
        void startNewThread(sid)
      }
      return
    }

    if (e.code === 'Tab' && ctrlKey && !shift) {
      switchToNext()
    }
    if (e.code === 'Tab' && ctrlKey && shift) {
      switchToNext(true)
    }
    for (let i = 1; i <= 9; i++) {
      if (e.code === `Digit${i}` && ctrlKey) {
        switchToIndex(i - 1)
      }
    }

    if (e.key === 'k' && ctrlKey) {
      const openSearchDialog = uiStore.getState().openSearchDialog
      if (openSearchDialog) {
        uiStore.setState({ openSearchDialog: false })
      } else {
        uiStore.setState({ openSearchDialog: true })
      }
    }
    if (e.key === ',' && ctrlKey) {
      e.preventDefault()
      navigateToSettings()
      return
    }
  }
}
