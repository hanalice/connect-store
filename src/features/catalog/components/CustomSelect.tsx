import { useEffect, useRef, useState } from 'react'
import styles from './CustomSelect.module.scss'

interface Option<T> {
  value: T
  label: string
}

interface CustomSelectProps<T> {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  label?: string
  id?: string
  direction?: 'row' | 'column' // row: label左, column: label上
  width?: number | string // 固定宽度，默认自适应最长option
}

export function CustomSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
  id,
  direction = 'row',
  width,
}: CustomSelectProps<T>) {
  // 计算最长label宽度
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const [autoWidth, setAutoWidth] = useState<number | undefined>(undefined)

  // 计算最长label宽度
  useEffect(() => {
    if (width) return
    // 创建隐藏span测量最长label
    const span = document.createElement('span')
    span.style.visibility = 'hidden'
    span.style.position = 'absolute'
    span.style.whiteSpace = 'nowrap'
    span.style.fontSize = '1rem'
    span.style.fontFamily = 'inherit'
    span.style.fontWeight = 'inherit'
    span.innerText = options.reduce((a, b) => a.length > b.label.length ? a : b.label, '')
    document.body.appendChild(span)
    setAutoWidth(span.offsetWidth + 36) // 箭头和内边距
    document.body.removeChild(span)
  }, [options, width])

  function handleToggle() {
    setOpen((v) => !v)
  }

  function handleSelect(val: T) {
    onChange(val)
    setOpen(false)
    buttonRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      setOpen(true)
      setFocusIdx(options.findIndex((o) => o.value === value))
      e.preventDefault()
    } else if (open) {
      if (e.key === 'ArrowDown') {
        setFocusIdx((idx) => idx === null ? 0 : Math.min(idx + 1, options.length - 1))
        e.preventDefault()
      } else if (e.key === 'ArrowUp') {
        setFocusIdx((idx) => idx === null ? options.length - 1 : Math.max(idx - 1, 0))
        e.preventDefault()
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (focusIdx !== null) {
          handleSelect(options[focusIdx].value)
        }
        e.preventDefault()
      } else if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
        e.preventDefault()
      }
    }
  }

  function handleBlur(e: React.FocusEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setOpen(false)
      setFocusIdx(null)
    }
  }

  return (
    <div
      className={[
        styles.customSelect,
        direction === 'row' ? styles.row : styles.column,
      ].join(' ')}
      onBlur={handleBlur}
    >
      {label && (
        <label htmlFor={id} className={styles.label}>{label}</label>
      )}
      <div
        className={styles.selectContainer}
        style={{ width: width ? (typeof width === 'number' ? width + 'px' : width) : autoWidth ? autoWidth + 'px' : undefined }}
      >
      <button
        ref={buttonRef}
        id={id}
        className={styles.button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        style={{ width: '100%' }}
      >
        <span className={styles.buttonText} title={options.find((o) => o.value === value)?.label ?? ''}>
          {options.find((o) => o.value === value)?.label ?? ''}
        </span>
        <span className={styles.arrow} aria-hidden>▼</span>
      </button>
      {open && (
        <ul
          className={styles.list}
          role="listbox"
          tabIndex={-1}
          ref={listRef}
          style={{ width: '100%' }}
        >
          {options.map((opt, idx) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={
                [
                  styles.option,
                  opt.value === value ? styles.selected : '',
                  focusIdx === idx ? styles.focused : '',
                ].join(' ')
              }
              tabIndex={-1}
              onMouseDown={() => handleSelect(opt.value)}
              onMouseEnter={() => setFocusIdx(idx)}
              title={opt.label}
            >
              <span className={styles.optionText}>{opt.label}</span>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  )
}
