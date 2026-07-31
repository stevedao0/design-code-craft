import React from 'react';
import { ShieldAlertIcon, ArrowLeftIcon } from 'lucide-react';
import { Button } from './Button';
import { useAuth } from '../../lib/auth';
export function AccessDenied({
  requiredPermission,
  onBack



}: {requiredPermission?: string;onBack: () => void;}) {
  const { currentUser } = useAuth();
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl ring-1 ring-zinc-900/5 shadow-xl p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-rose-50 flex items-center justify-center mb-5 ring-8 ring-rose-50/50">
          <ShieldAlertIcon className="h-7 w-7 text-rose-500" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 mb-2">
          Không có quyền truy cập
        </h2>
        <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
          Tài khoản{' '}
          <span className="font-medium text-zinc-900">
            {currentUser?.email}
          </span>{' '}
          chưa được phân quyền sử dụng chức năng này.
          {requiredPermission &&
          <span className="block mt-2 text-xs font-mono bg-zinc-100 text-zinc-600 py-1 px-2 rounded inline-block">
              Yêu cầu: {requiredPermission}
            </span>
          }
        </p>
        <Button
          variant="primary"
          leftIcon={<ArrowLeftIcon className="h-4 w-4" />}
          onClick={onBack}
          className="w-full justify-center">
          
          Quay về Dashboard
        </Button>
      </div>
    </div>);

}