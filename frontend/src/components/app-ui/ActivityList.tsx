import React from 'react';
import {
  FilePlusIcon,
  PrinterIcon,
  PencilIcon,
  MailIcon,
  CheckCircle2Icon,
} from 'lucide-react';

type ActivityKind = 'create' | 'print' | 'update' | 'dispatch' | 'approve';

export type ActivityListProps = {
  items: {
    id: string;
    actor: string;
    action: string;
    target: string;
    time: string;
    kind: ActivityKind;
  }[];
};
const iconMap: Record<
  ActivityKind,
  {
    icon: React.ReactNode;
    bg: string;
  }> =
{
  create: {
    icon: <FilePlusIcon className="h-3.5 w-3.5" />,
    bg: 'bg-amber-50 text-amber-700 ring-amber-100'
  },
  print: {
    icon: <PrinterIcon className="h-3.5 w-3.5" />,
    bg: 'bg-amber-50 text-amber-700 ring-amber-100'
  },
  update: {
    icon: <PencilIcon className="h-3.5 w-3.5" />,
    bg: 'bg-amber-50 text-amber-600 ring-amber-100'
  },
  dispatch: {
    icon: <MailIcon className="h-3.5 w-3.5" />,
    bg: 'bg-amber-50 text-amber-700 ring-amber-100'
  },
  approve: {
    icon: <CheckCircle2Icon className="h-3.5 w-3.5" />,
    bg: 'bg-lime-50 text-lime-600 ring-lime-100'
  }
};
export function ActivityList({
  items









}: {items: {id: string;actor: string;action: string;target: string;time: string;kind: ActivityKind;}[];}) {
  return (
    <ul className="relative flex flex-col">
      {items.map((it, i) => {
        const meta = iconMap[it.kind];
        const last = i === items.length - 1;
        return (
          <li key={it.id} className="relative flex gap-3 px-5 py-3.5">
            {!last &&
            <span
              aria-hidden
              className="absolute left-[1.7rem] top-9 bottom-0 w-px bg-gradient-to-b from-zinc-200 to-transparent" />

            }
            <span
              className={`relative z-10 h-7 w-7 rounded-full ring-1 flex items-center justify-center shrink-0 ${meta.bg}`}>
              
              {meta.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-700 leading-snug">
                <span className="font-semibold text-zinc-900">{it.actor}</span>{' '}
                {it.action}{' '}
                <span className="font-mono text-[12px] text-amber-700 font-medium">
                  {it.target}
                </span>
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">{it.time}</p>
            </div>
          </li>);

      })}
    </ul>);

}