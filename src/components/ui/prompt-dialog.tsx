import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PromptOptions {
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;

  destructive?: boolean;

  validate?: (value: string) => string | null;
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  destructive?: boolean;
}

export interface ChoiceOptions<T extends string = string> {
  title: string;
  description?: string;
  options: ChoiceOption<T>[];
}

type Request =
  | {
      kind: "prompt";
      options: PromptOptions;
      resolve: (v: string | null) => void;
    }
  | { kind: "confirm"; options: ConfirmOptions; resolve: (v: boolean) => void }
  | {
      kind: "choice";
      options: ChoiceOptions;
      resolve: (v: string | null) => void;
    };

let request: Request | null = null;
const listeners = new Set<() => void>();

function setRequest(next: Request | null) {
  request = next;
  listeners.forEach((l) => l());
}

export function promptFor(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) =>
    setRequest({ kind: "prompt", options, resolve }),
  );
}

export function confirmThat(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) =>
    setRequest({ kind: "confirm", options, resolve }),
  );
}

export function chooseFrom<T extends string>(
  options: ChoiceOptions<T>,
): Promise<T | null> {
  return new Promise((resolve) =>
    setRequest({
      kind: "choice",
      options: options as ChoiceOptions,
      resolve: resolve as (v: string | null) => void,
    }),
  );
}

export function PromptHost() {
  const [, force] = useState(0);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const current = request;

  useEffect(() => {
    if (current?.kind === "prompt") {
      setValue(current.options.defaultValue ?? "");
      setError(null);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [current]);

  const dismiss = useCallback(() => {
    if (!request) return;
    if (request.kind === "confirm") request.resolve(false);
    else request.resolve(null);
    setRequest(null);
  }, []);

  if (!current) return null;

  const submitPrompt = () => {
    if (current.kind !== "prompt") return;
    const trimmed = value.trim();
    const problem =
      current.options.validate?.(trimmed) ?? (trimmed ? null : "Required");
    if (problem) {
      setError(problem);
      return;
    }
    current.resolve(trimmed);
    setRequest(null);
  };

  const title =
    current.kind === "prompt"
      ? current.options.title
      : current.kind === "confirm"
        ? current.options.title
        : current.options.title;
  const description = current.options.description;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={dismiss}
      onKeyDown={(e) => {
        if (e.key === "Escape") dismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-xl border bg-popover p-4 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {current.kind === "prompt" && (
          <div className="space-y-1.5">
            {current.options.label && (
              <label className="text-xs text-muted-foreground">
                {current.options.label}
              </label>
            )}
            <Input
              ref={inputRef}
              autoFocus
              value={value}
              placeholder={current.options.placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitPrompt();
                }
              }}
              aria-invalid={error ? true : undefined}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        {current.kind === "choice" && (
          <div className="space-y-1">
            {current.options.options.map((option) => (
              <button
                key={option.value}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2 transition-colors hover:bg-accent",
                  option.destructive &&
                    "border-destructive/40 hover:bg-destructive/10",
                )}
                onClick={() => {
                  current.resolve(option.value);
                  setRequest(null);
                }}
              >
                <span
                  className={cn(
                    "block text-xs font-medium",
                    option.destructive && "text-destructive",
                  )}
                >
                  {option.label}
                </span>
                {option.description && (
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    {option.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={dismiss}
          >
            Cancel
          </Button>
          {current.kind === "prompt" && (
            <Button
              size="sm"
              className="h-7 text-xs"
              variant={current.options.destructive ? "destructive" : "default"}
              onClick={submitPrompt}
            >
              {current.options.confirmLabel ?? "OK"}
            </Button>
          )}
          {current.kind === "confirm" && (
            <Button
              size="sm"
              className="h-7 text-xs"
              variant={current.options.destructive ? "destructive" : "default"}
              autoFocus
              onClick={() => {
                current.resolve(true);
                setRequest(null);
              }}
            >
              {current.options.confirmLabel ?? "Confirm"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
