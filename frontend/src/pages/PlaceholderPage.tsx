import React from 'react';
import { ConstructionIcon, ArrowLeftIcon } from 'lucide-react';
import { Page, PageHeader } from '../components/app-ui/Page';
import { Button } from '../components/app-ui/Button';
import { RouteKey } from '../data/routes';
export function PlaceholderPage({
  title,
  description,
  routePath,
  onBack





}: {title: string;description?: string;routePath?: string;onBack: (k: RouteKey) => void;}) {
  return (
    <Page>
      <PageHeader
        title={title}
        description={description}
        breadcrumb={routePath}
        actions={
        <Button
          variant="secondary"
          leftIcon={<ArrowLeftIcon className="h-4 w-4" />}
          onClick={() => onBack('dashboard')}>
          
            Quay về Dashboard
          </Button>
        } />
      

      <div className="relative overflow-hidden rounded-2xl ring-1 ring-zinc-900/5 bg-white shadow-sm shadow-zinc-900/[0.03]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            background:
            'radial-gradient(circle at 20% 0%, rgba(99,102,241,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 100%, rgba(168,85,247,0.06) 0%, transparent 50%)'
          }} />
        
        <div className="relative px-6 py-20 flex flex-col items-center text-center">
          <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-600/25 mb-5">
            <ConstructionIcon className="h-6 w-6 text-white" />
            <span
              aria-hidden
              className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />
            
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 tracking-tight">
            Trang này sẽ được thiết kế ở phase sau
          </h2>
          <p className="text-sm text-zinc-500 mt-2 max-w-md">
            Phase 1 chỉ tập trung vào{' '}
            <span className="font-medium text-zinc-700">App Shell</span> và{' '}
            <span className="font-medium text-zinc-700">Dashboard</span>. Module
            "{title}" sẽ được phát triển ở các phase tiếp theo.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-50 ring-1 ring-zinc-200 text-[11px] font-medium text-zinc-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Đang trong roadmap · Phase 2+
          </div>
        </div>
      </div>
    </Page>);

}