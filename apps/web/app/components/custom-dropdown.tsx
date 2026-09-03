"use client";

import { useEffect, useRef, useState } from "react";

export type DropdownOption = {
  value: string;
  label: string;
};

export type SearchableOption = {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
};

type SearchableSelectProps = {
  ariaLabel: string;
  value: string;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

type CustomSelectProps = {
  ariaLabel: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

type CustomMultiSelectProps = {
  ariaLabel: string;
  values: string[];
  options: DropdownOption[];
  allLabel: string;
  selectionLabel: (count: number) => string;
  onChange: (values: string[]) => void;
};

function useDropdownDismiss() {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) ref.current.removeAttribute("open");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") ref.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return ref;
}

export function CustomSelect({ ariaLabel, value, options, onChange, disabled = false, className = "" }: CustomSelectProps) {
  const ref = useDropdownDismiss();
  const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "Pilih";

  return (
    <details className={`roster-multiselect roster-single-select${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`} ref={ref}>
      <summary aria-label={ariaLabel} aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }}><strong>{selectedLabel}</strong></summary>
      <div className="roster-multiselect-menu roster-single-select-menu">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              className={selected ? "is-selected" : ""}
              type="button"
              aria-pressed={selected}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                ref.current?.removeAttribute("open");
              }}
            >
              <span aria-hidden="true">{selected ? "✓" : ""}</span>
              {option.label}
            </button>
          );
        })}
      </div>
    </details>
  );
}

export function CustomMultiSelect({ ariaLabel, values, options, allLabel, selectionLabel, onChange }: CustomMultiSelectProps) {
  const ref = useDropdownDismiss();
  const allSelected = options.length > 0 && values.length === options.length;

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  return (
    <details className="roster-multiselect" ref={ref}>
      <summary aria-label={ariaLabel}><strong>{allSelected ? allLabel : selectionLabel(values.length)}</strong></summary>
      <div className="roster-multiselect-menu">
        <label className="roster-multiselect-all">
          <input type="checkbox" checked={allSelected} onChange={(event) => onChange(event.target.checked ? options.map((option) => option.value) : [])} />
          {allLabel}
        </label>
        {options.map((option) => (
          <label key={option.value}>
            <input type="checkbox" checked={values.includes(option.value)} onChange={() => toggle(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </details>
  );
}

export function SearchableSelect({
  ariaLabel,
  value,
  options,
  placeholder = "Pilih opsi...",
  searchPlaceholder = "Ketik untuk mencari...",
  onChange,
  disabled = false,
  className = ""
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearch("");
    }
  }, [isOpen]);

  const filteredOptions = options.filter((opt) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const matchLabel = opt.label.toLowerCase().includes(term);
    const matchSub = opt.subLabel ? opt.subLabel.toLowerCase().includes(term) : false;
    const matchVal = opt.value.toLowerCase().includes(term);
    return matchLabel || matchSub || matchVal;
  });

  return (
    <div
      className={`searchable-select-wrap${disabled ? " is-disabled" : ""}${isOpen ? " is-open" : ""}${className ? ` ${className}` : ""}`}
      ref={containerRef}
    >
      <button
        type="button"
        className="searchable-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
      >
        <div className="searchable-select-label-box">
          {selectedOption ? (
            <div className="searchable-selected-content">
              <strong className="searchable-selected-title">{selectedOption.label}</strong>
              {selectedOption.subLabel ? (
                <span className="searchable-selected-sub">{selectedOption.subLabel}</span>
              ) : null}
            </div>
          ) : (
            <span className="searchable-select-placeholder">{placeholder}</span>
          )}
        </div>
        <span className="searchable-select-chevron" aria-hidden="true">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen ? (
        <div className="searchable-select-dropdown" role="listbox" aria-label={ariaLabel}>
          <div className="searchable-select-searchbox">
            <div className="searchable-search-field">
              <span className="search-icon" aria-hidden="true">🔍</span>
              <input
                ref={searchInputRef}
                type="text"
                className="searchable-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Cari opsi"
              />
              {search ? (
                <button
                  type="button"
                  className="searchable-search-clear"
                  onClick={() => setSearch("")}
                  aria-label="Hapus teks pencarian"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>

          <div className="searchable-select-count">
            <span>{filteredOptions.length} opsi ditemukan</span>
          </div>

          <div className="searchable-select-list">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`searchable-select-item${isSelected ? " is-selected" : ""}`}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      setSearch("");
                    }}
                  >
                    <div className="searchable-item-text">
                      <strong className="searchable-item-label">{opt.label}</strong>
                      {opt.subLabel ? (
                        <span className="searchable-item-sub">{opt.subLabel}</span>
                      ) : null}
                    </div>
                    {isSelected ? (
                      <span className="searchable-item-check" aria-hidden="true">✓</span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="searchable-select-empty">
                <span>Tidak ditemukan opsi yang cocok dengan "<strong>{search}</strong>"</span>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
