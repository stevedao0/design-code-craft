import React, { Fragment } from 'react';
type Step = {
  label: string;
  completed: boolean;
};
export function StepIndicator({ steps }: {steps: Step[];}) {
  return (
    <nav aria-label="Progress" className="flex items-center gap-2">
      {steps.map((step, i) =>
      <Fragment key={i}>
          {i > 0 &&
        <div className="h-px w-6 bg-zinc-200 shrink-0" aria-hidden />
        }
          <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ring-1 ring-inset transition-colors ${step.completed ? 'bg-amber-50 text-amber-800 ring-amber-700/15' : 'bg-zinc-100 text-zinc-600 ring-zinc-900/5'}`}>
          
            <span
            className={`h-1.5 w-1.5 rounded-full ${step.completed ? 'bg-amber-600' : 'bg-zinc-400'}`} />
          
            {step.label}
          </div>
        </Fragment>
      )}
    </nav>);

}