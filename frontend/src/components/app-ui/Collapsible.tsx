'use client';
import * as React from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
}

interface CollapsibleTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
  onClick?: () => void;
  className?: string;
}

interface CollapsibleContentProps {
  children: React.ReactNode;
  className?: string;
}

function CollapsibleComponent({ children, defaultOpen = true }: CollapsibleProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <CollapsibleContext.Provider value={{ open, setOpen }}>
      {children}
    </CollapsibleContext.Provider>
  );
}

const CollapsibleContext = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: true,
  setOpen: (_v: boolean) => undefined,
});

function CollapsibleTrigger({ children, className = '' }: CollapsibleTriggerProps) {
  const { open, setOpen } = React.useContext(CollapsibleContext);
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className={`flex w-full items-center justify-between ${className}`}
    >
      {children}
      <ChevronDown
        className="h-4 w-4 transition-transform"
        style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
      />
    </button>
  );
}

function CollapsibleContent({ children, className = '' }: CollapsibleContentProps) {
  const { open } = React.useContext(CollapsibleContext);
  if (!open) return null;
  return <div className={className}>{children}</div>;
}

export const Collapsible = CollapsibleComponent;
export { CollapsibleTrigger, CollapsibleContent };
