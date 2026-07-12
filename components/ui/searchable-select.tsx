"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { createStaleGuard, moveActiveIndex } from "@/lib/domain/async-search"

export type SearchableSelectOption = { value: string; label: string }

type Status = "idle" | "loading" | "error"

type BaseProps = {
  value: string
  onChange: (value: string, option: SearchableSelectOption) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  loadingLabel?: string
  errorLabel?: string
  disabled?: boolean
  id?: string
  className?: string
  /**
   * Label for the current value when it is not part of the freshly-loaded
   * result set (async mode). The parent resolves it by id so the trigger can
   * always show a name, even for a preselected record outside page one.
   */
  selectedOption?: SearchableSelectOption
}

type SyncProps = BaseProps & {
  options: SearchableSelectOption[]
  loadOptions?: undefined
}

type AsyncProps = BaseProps & {
  /** Server-side search. Called (debounced) on open and on every keystroke. */
  loadOptions: (query: string) => Promise<SearchableSelectOption[]>
  /** Optional seed shown immediately on first open before the first search. */
  options?: SearchableSelectOption[]
}

type Props = SyncProps | AsyncProps

const DEBOUNCE_MS = 250

export function SearchableSelect(props: Props) {
  const {
    value,
    onChange,
    placeholder = "Select…",
    searchPlaceholder = "Search…",
    emptyLabel = "No results",
    loadingLabel = "Loading…",
    errorLabel = "Something went wrong",
    disabled,
    id,
    className,
    selectedOption,
  } = props
  const isAsync = typeof props.loadOptions === "function"

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchableSelectOption[]>(props.options ?? [])
  const [status, setStatus] = useState<Status>("idle")
  const [activeIndex, setActiveIndex] = useState(-1)

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const guardRef = useRef(createStaleGuard())
  // Keep the latest loader without making it an effect dependency — parents pass
  // an inline closure (e.g. one that captures customerId) whose identity changes
  // every render; depending on it would refire the search in a loop.
  const loadRef = useRef(props.loadOptions)
  loadRef.current = props.loadOptions

  const optionsId = useId()

  // Sync mode: client-filter the static option list.
  const syncFiltered = useMemo(() => {
    if (isAsync) return []
    const list = props.options ?? []
    const q = query.trim().toLowerCase()
    return q ? list.filter((o) => o.label.toLowerCase().includes(q)) : list
  }, [isAsync, props.options, query])

  const visible = isAsync ? results : syncFiltered

  // Async mode: debounced, stale-guarded server search while open.
  useEffect(() => {
    if (!open || !isAsync) return
    const load = loadRef.current
    if (!load) return
    const token = guardRef.current.issue()
    setStatus("loading")
    const handle = setTimeout(() => {
      load(query)
        .then((opts) => {
          if (!guardRef.current.isCurrent(token)) return
          setResults(opts)
          setStatus("idle")
        })
        .catch(() => {
          if (!guardRef.current.isCurrent(token)) return
          setResults([])
          setStatus("error")
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [open, query, isAsync])

  // Close on outside click while open.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  // Focus the search box on open; reset transient state on close.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    } else {
      setQuery("")
      setActiveIndex(-1)
    }
  }, [open])

  // Reset highlight whenever the visible list changes.
  useEffect(() => {
    setActiveIndex(-1)
  }, [visible])

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelectorAll<HTMLElement>("[role=option]")[activeIndex]
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const selected =
    visible.find((o) => o.value === value) ??
    (selectedOption && selectedOption.value === value ? selectedOption : undefined)

  function selectValue(option: SearchableSelectOption) {
    onChange(option.value, option)
    setOpen(false)
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => moveActiveIndex(i, e.key as "ArrowDown" | "ArrowUp", visible.length))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const pick = activeIndex >= 0 ? visible[activeIndex] : visible[0]
      if (pick) selectValue(pick)
    } else if (e.key === "Tab") {
      setOpen(false)
    }
  }

  const showEmpty = status === "idle" && visible.length === 0

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? optionsId : undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="truncate text-start">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-expanded={open}
              aria-controls={optionsId}
              aria-activedescendant={
                activeIndex >= 0 ? `${optionsId}-opt-${activeIndex}` : undefined
              }
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {status === "loading" && (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>
          <ul
            ref={listRef}
            role="listbox"
            aria-label={placeholder}
            id={optionsId}
            className="max-h-56 overflow-y-auto p-1"
          >
            {status === "error" ? (
              <li className="px-2.5 py-2 text-sm text-destructive">{errorLabel}</li>
            ) : status === "loading" && visible.length === 0 ? (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">{loadingLabel}</li>
            ) : showEmpty ? (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">{emptyLabel}</li>
            ) : (
              visible.map((o, index) => {
                const isSelected = o.value === value
                const isActive = index === activeIndex
                return (
                  <li
                    key={o.value}
                    id={`${optionsId}-opt-${index}`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectValue(o)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-start text-sm",
                        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent",
                        isSelected && "font-medium"
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {isSelected && <Check className="size-3.5 shrink-0" />}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
