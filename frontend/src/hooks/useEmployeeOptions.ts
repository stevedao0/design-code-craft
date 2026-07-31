/**
 * Hook to fetch employee options for the assignee dropdown in contract forms.
 * Returns real user data from the API instead of hardcoded fake data.
 */
import { useState, useEffect, useCallback } from 'react';
import { getEmployeeOptions, type EmployeeOption } from '../lib/reportsClient';
import { TOKEN_KEY } from '../lib/authClient';

export interface UseEmployeeOptionsResult {
  employees: EmployeeOption[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useEmployeeOptions(): UseEmployeeOptionsResult {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setError('Không có token xác thực');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getEmployeeOptions(token);
      setEmployees(response.items || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể tải danh sách nhân viên';
      setError(message);
      console.error('[useEmployeeOptions] Failed to fetch employees:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  return {
    employees,
    loading,
    error,
    refetch: fetchEmployees,
  };
}
