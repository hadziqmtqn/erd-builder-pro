import { useEffect } from 'react'
import { getCurrentWindow, type CloseRequestedEvent } from '@tauri-apps/api/window'
import { LogicalSize, LogicalPosition } from '@tauri-apps/api/dpi'

const STORAGE_KEY = 'window-state'
const DEBUG = true // Remove or set false after debugging

function log(...args: any[]) {
  if (DEBUG) console.log('[WindowState]', ...args)
}

interface WindowState {
  x: number | null
  y: number | null
  width: number
  height: number
}

/**
 * Saves window position/size to localStorage and restores on next startup.
 * Clamps window to screen bounds to prevent overflow.
 */
export function useWindowState() {
  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    const win = getCurrentWindow()

    const restore = async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        log('restore: raw stored value =', raw)
        if (!raw) { log('restore: no stored state, using default'); return }
        const state: WindowState = JSON.parse(raw)
        log('restore: parsed state =', JSON.stringify(state))

        const s = window.screen as any
        const availLeft = s.availLeft ?? 0
        const availTop = s.availTop ?? 0
        const { availWidth, availHeight } = s
        log('restore: screen bounds =', { availLeft, availTop, availWidth, availHeight })

        const maxW = availWidth - 40
        const maxH = availHeight - 60
        const w = Math.min(state.width, maxW)
        const h = Math.min(state.height, maxH)
        log('restore: clamped size =', { w, h, originalW: state.width, originalH: state.height })

        const currentPos = await win.outerPosition()
        const currentSize = await win.outerSize()
        log('restore: current window (before set) =', {
          x: currentPos.x, y: currentPos.y,
          w: currentSize.width, h: currentSize.height,
        })

        await win.setSize(new LogicalSize(w, h))
        log('restore: setSize done')

        if (state.x !== null && state.y !== null) {
          const minX = availLeft
          const minY = availTop
          const maxX = availLeft + availWidth - w
          const maxY = availTop + availHeight - h
          const x = Math.max(minX, Math.min(state.x, maxX))
          const y = Math.max(minY, Math.min(state.y, maxY))
          log('restore: position clamp =', {
            storedX: state.x, storedY: state.y,
            minX, minY, maxX, maxY,
            finalX: x, finalY: y,
          })
          await win.setPosition(new LogicalPosition(x, y))
          log('restore: setPosition done')
        } else {
          log('restore: no position stored, centering')
          await win.center()
        }
      } catch (e) {
        log('restore: error', e)
      }
    }

    const save = async () => {
      try {
        const pos = await win.outerPosition()
        const size = await win.outerSize()
        const state: WindowState = {
          x: pos.x, y: pos.y,
          width: size.width, height: size.height,
        }
        log('save:', JSON.stringify(state))
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch (e) {
        log('save: error (window minimized?)', e)
      }
    }

    const debouncedSave = () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(save, 300)
    }

    // Delay restore to let Tauri init, then show window
    const init = async () => {
      await new Promise(r => setTimeout(r, 100))
      await restore()
      await win.show()
      log('window shown after restore')
    }
    init()

    const unlistenResize = win.onResized(() => debouncedSave())
    const unlistenMove = win.onMoved(() => debouncedSave())

    // Save immediately on close — prevent immediate close, save, then destroy
    const unlistenClose = win.onCloseRequested(async (event: CloseRequestedEvent) => {
      log('onCloseRequested: firing')
      event.preventDefault()
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
      await save()
      log('onCloseRequested: destroy')
      await win.destroy()
    })

    return () => {
      if (saveTimer) clearTimeout(saveTimer)
      unlistenResize.then(fn => fn())
      unlistenMove.then(fn => fn())
      unlistenClose.then(fn => fn())
    }
  }, [])
}
