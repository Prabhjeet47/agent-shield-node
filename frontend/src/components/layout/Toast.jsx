import { createContext, useCallback, useContext, useRef, useState } from 'react'
import Icon from '../Icon.jsx'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef()
  const show = useCallback((title, body = '') => {
    clearTimeout(timer.current)
    setToast({ title, body })
    timer.current = setTimeout(() => setToast(null), 3400)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <span className="tic"><Icon name="check" size={14} /></span>
          <div><b>{toast.title}</b><span>{toast.body}</span></div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext)
