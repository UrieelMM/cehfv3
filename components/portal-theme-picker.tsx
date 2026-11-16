"use client";

import { Check, ChevronDown, Monitor, Moon, Sun, TreePine } from "lucide-react";
import { useId, useRef, useState } from "react";
import { christmasPortalThemes, isChristmasTheme, regularPortalThemes, type PortalTheme } from "@/lib/portal-theme";
import { useOutsidePointerDismiss } from "@/lib/use-outside-pointer-dismiss";

const themeDetails = {
  light: { label: "Claro", icon: Sun },
  dark: { label: "Oscuro", icon: Moon },
  system: { label: "Sistema", icon: Monitor },
  christmas: { label: "Navideño claro", icon: TreePine },
  "christmas-dark": { label: "Navideño oscuro", icon: TreePine },
};

export type PortalThemeSelection = {
  theme: PortalTheme;
  onSelect: (theme: PortalTheme) => void;
};

export function PortalThemeOptions({
  theme,
  onSelect,
  preview = false,
}: PortalThemeSelection & { preview?: boolean }) {
  const availableThemes = isChristmasTheme(theme) ? christmasPortalThemes : regularPortalThemes;
  return (
    <div className={preview ? "portal-theme-previews" : "portal-theme-options"} role="group" aria-label="Tema del portal">
      {availableThemes.map((option) => {
        const { label, icon: Icon } = themeDetails[option];
        const selected = theme === option;
        return (
          <button
            key={option}
            type="button"
            className="portal-theme-option"
            data-option={option}
            aria-pressed={selected}
            onClick={() => onSelect(option)}
          >
            {preview && <span className="portal-theme-swatch" aria-hidden="true" />}
            <span className="portal-theme-label">
              <Icon size={17} aria-hidden="true" />
              {label}
              {selected && <Check size={15} className="portal-theme-check" aria-hidden="true" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function PortalThemePicker({ theme, onSelect }: PortalThemeSelection) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useOutsidePointerDismiss<HTMLDivElement>(open, setOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { label, icon: Icon } = themeDetails[theme];

  function closeAndRestoreFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div
      className="portal-theme-picker"
      ref={containerRef}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          closeAndRestoreFocus();
        }
      }}
    >
      <button
        className="icon-button portal-theme-trigger"
        type="button"
        ref={triggerRef}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Cambiar tema. Tema actual: ${label}`}
        title={`Tema: ${label}`}
        onClick={() => setOpen(!open)}
      >
        <Icon size={18} aria-hidden="true" />
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      <div className="portal-theme-popover" id={panelId} hidden={!open}>
        <PortalThemeOptions
          theme={theme}
          onSelect={(option) => {
            if (option !== theme) onSelect(option);
            closeAndRestoreFocus();
          }}
        />
      </div>
    </div>
  );
}
