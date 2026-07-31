import { apiClient } from "./apiClient";
import { getToken } from "./authClient";

const API_BASE = import.meta.env.VITE_API_URL || "";

export interface ImportResult {
  total_rows: number;
  success_count: number;
  error_count: number;
  errors: Array<{ row: number; errors: string[] }>;
}

export async function importContracts(file: File): Promise<ImportResult> {
  const token = getToken();
  if (!token) {
    throw new Error("Vui lòng đăng nhập lại");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/api/import/contracts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Lỗi upload" }));
    throw new Error(error.detail || "Upload thất bại");
  }

  return response.json();
}

export function getTemplateUrl(): string {
  return `${API_BASE}/templates/contract_import_template.xlsx`;
}
