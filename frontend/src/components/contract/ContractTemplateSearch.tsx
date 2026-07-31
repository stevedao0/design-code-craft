/**
 * PHASE TEMPLATE-CREATE-01: Tạo từ hợp đồng đã có
 *
 * Component cho phép user tìm kiếm và chọn một hợp đồng đã có để lấy dữ liệu làm mẫu.
 *
 * Features:
 * - Tìm kiếm theo số HĐ, tên đơn vị, MST, địa chỉ
 * - Hiển thị kết quả compact
 * - Confirm trước khi dùng làm mẫu
 * - Dirty flag khi user đã sửa form sau khi load mẫu
 * - Đổi mẫu / Xoá mẫu với confirm
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchIcon, XIcon, FileTextIcon, RefreshCwIcon, EyeIcon, CheckIcon, LoaderIcon } from 'lucide-react';
import { Button } from '../app-ui/Button';
import { Input } from '../app-ui/Input';
import type {
  TemplateSearchItem,
  TemplateSearchResponse,
  PrefillSourceResponse,
} from '../../lib/contractsClient';
import { searchContractsForTemplate, getContractPrefillSource } from '../../lib/contractsClient';

const TOKEN_KEY = 'vcpmc_new_app_access_token';

interface ContractTemplateSearchProps {
  /** Callback khi user chọn một hợp đồng làm mẫu */
  onTemplateSelected?: (contractId: number, contractNo: string) => void;
  /** Callback khi user xoá mẫu đã chọn */
  onTemplateCleared?: () => void;
  /** ID của hợp đồng mẫu đang được chọn */
  selectedTemplateId?: number | null;
  /** Số hợp đồng của mẫu đang được chọn */
  selectedTemplateNo?: string | null;
  /** Tên đơn vị của mẫu đang được chọn */
  selectedTemplateName?: string | null;
  /** Callback để populate dữ liệu từ mẫu */
  onPrefillData?: (data: PrefillSourceResponse) => void;
  /** User đã sửa form sau khi load mẫu */
  formEditedAfterPrefill?: boolean;
}

export function ContractTemplateSearch({
  onTemplateSelected,
  onTemplateCleared,
  selectedTemplateId,
  selectedTemplateNo,
  selectedTemplateName,
  onPrefillData,
  formEditedAfterPrefill,
}: ContractTemplateSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TemplateSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedContract, setSelectedContract] = useState<TemplateSearchItem | null>(null);
  const [isLoadingPrefill, setIsLoadingPrefill] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<PrefillSourceResponse | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  const performSearch = useCallback(async (query: string) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      console.error('[template-search] No token found');
      return;
    }

    setIsSearching(true);
    try {
      const response = await searchContractsForTemplate(token, {
        q: query || undefined,
        page: 1,
        page_size: 10,
      });
      setSearchResults(response.items || []);
    } catch (error) {
      console.error('[template-search] Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle search input change with debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  // Initial search when expanding
  useEffect(() => {
    if (isExpanded && searchResults.length === 0) {
      performSearch('');
    }
  }, [isExpanded]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Handle select contract as template
  const handleSelectTemplate = async (contract: TemplateSearchItem) => {
    // Check if user has edited form after prefilling
    if (formEditedAfterPrefill) {
      const confirmed = confirm(
        'Bạn đã chỉnh sửa dữ liệu sau khi lấy mẫu. Đổi mẫu sẽ ghi đè một số thông tin. Bạn có muốn tiếp tục?'
      );
      if (!confirmed) return;
    }

    // Confirm before using as template
    const confirmed = confirm(
      `Dùng dữ liệu hợp đồng "${contract.contract_no}" làm mẫu cho hợp đồng mới?`
    );
    if (!confirmed) return;

    setSelectedContract(contract);
    setIsLoadingPrefill(true);

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        throw new Error('Không tìm thấy token đăng nhập');
      }

      const prefillData = await getContractPrefillSource(token, contract.id);

      setPreviewData(prefillData);

      // Notify parent about template selection
      onTemplateSelected?.(contract.id, contract.contract_no);

      // Send prefill data to parent - this should update the form
      onPrefillData?.(prefillData);

      // Collapse search
      setIsExpanded(false);
    } catch (error: any) {
      console.error('[template-search] Failed to load prefill data:', error);
      alert(`Không thể tải dữ liệu từ hợp đồng này: ${error?.message || 'Lỗi không xác định'}`);
    } finally {
      setIsLoadingPrefill(false);
    }
  };

  // Handle change template (open search again, then load new template data)
  const handleChangeTemplate = async () => {
    if (formEditedAfterPrefill) {
      const confirmed = confirm(
        'Việc đổi mẫu sẽ ghi đè các thông tin đã lấy từ mẫu trước. Tiếp tục?'
      );
      if (!confirmed) return;
    }

    // Clear current selection to show search
    setSelectedContract(null);
    setPreviewData(null);
    setIsExpanded(true);
    setSearchQuery('');

    // Perform initial search
    await performSearch('');
  };

  // Handle clear template
  const handleClearTemplate = () => {
    const confirmed = confirm(
      'Chỉ xoá thông tin hợp đồng mẫu đang tham chiếu. Dữ liệu đã điền trên form sẽ được giữ lại.'
    );
    if (!confirmed) return;

    setSelectedContract(null);
    setPreviewData(null);
    onTemplateCleared?.();
  };

  // Handle preview
  const handlePreview = async () => {
    if (!selectedTemplateId) return;

    setShowPreview(true);
    if (previewData) return; // Already have preview data

    setIsLoadingPrefill(true);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error('No token');

      const data = await getContractPrefillSource(token, selectedTemplateId);
      setPreviewData(data);
    } catch (error) {
      console.error('[template-search] Preview failed:', error);
    } finally {
      setIsLoadingPrefill(false);
    }
  };

  // If a template is already selected, show the badge
  if (selectedTemplateId && selectedTemplateNo && !isExpanded) {
    return (
      <div className="border border-lime-200 bg-lime-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileTextIcon className="h-4 w-4 text-lime-600" />
            <span className="text-sm font-medium text-lime-800">
              Đang lấy mẫu từ:{' '}
              <span className="font-semibold">{selectedTemplateNo}</span>
              {selectedTemplateName && (
                <span className="text-lime-600 ml-1">- {selectedTemplateName}</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<EyeIcon className="h-3 w-3" />}
              onClick={handlePreview}
              disabled={isLoadingPrefill}
              title="Xem nhanh dữ liệu mẫu"
            >
              Xem mẫu
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RefreshCwIcon className="h-3 w-3" />}
              onClick={handleChangeTemplate}
              title="Đổi hợp đồng mẫu"
            >
              Đổi mẫu
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<XIcon className="h-3 w-3" />}
              onClick={handleClearTemplate}
              title="Xoá mẫu đã chọn"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Xoá mẫu
            </Button>
          </div>
        </div>

        {/* Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
              <div className="shrink-0 bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-zinc-900">
                  Xem nhanh dữ liệu mẫu
                </h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-1 hover:bg-zinc-100 rounded-md"
                >
                  <XIcon className="h-5 w-5 text-zinc-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {isLoadingPrefill ? (
                  <div className="flex items-center justify-center py-8">
                    <LoaderIcon className="h-6 w-6 animate-spin text-lime-600" />
                    <span className="ml-2 text-zinc-500">Đang tải...</span>
                  </div>
                ) : previewData ? (
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-zinc-500">Số HĐ:</span>
                        <span className="ml-2 font-mono font-medium">{previewData.contract_no}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Lĩnh vực:</span>
                        <span className="ml-2">{previewData.domain_display_name || previewData.domain_code}</span>
                      </div>
                    </div>

                    <div className="border-t border-zinc-200 pt-4">
                      <h4 className="font-semibold text-zinc-800 mb-2">Thông tin đơn vị</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-zinc-500">Tên đơn vị:</span>
                          <div className="font-medium">{previewData.legal_name || '-'}</div>
                        </div>
                        <div>
                          <span className="text-zinc-500">Tên bảng hiệu:</span>
                          <div className="font-medium">{previewData.brand_name || '-'}</div>
                        </div>
                        <div>
                          <span className="text-zinc-500">Mã số thuế:</span>
                          <div className="font-mono">{previewData.tax_code || '-'}</div>
                        </div>
                        <div>
                          <span className="text-zinc-500">Điện thoại:</span>
                          <div>{previewData.phone || '-'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-zinc-200 pt-4">
                      <h4 className="font-semibold text-zinc-800 mb-2">Địa chỉ</h4>
                      <div>
                        <span className="text-zinc-500">Địa chỉ pháp lý:</span>
                        <div className="font-medium">{previewData.legal_full_address || '-'}</div>
                      </div>
                      {!previewData.usage_same_as_legal && (
                        <div className="mt-1">
                          <span className="text-zinc-500">Địa chỉ sử dụng:</span>
                          <div className="font-medium">{previewData.usage_full_address || '-'}</div>
                        </div>
                      )}
                    </div>

                    {(previewData.total_rooms || previewData.total_boxes) && (
                      <div className="border-t border-zinc-200 pt-4">
                        <h4 className="font-semibold text-zinc-800 mb-2">Thông tin Karaoke</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-zinc-500">Loại hình:</span>
                            <div className="font-medium">{previewData.karaoke_type || '-'}</div>
                          </div>
                          <div>
                            <span className="text-zinc-500">Số phòng/box:</span>
                            <div className="font-medium">
                              {previewData.total_rooms ? `${previewData.total_rooms} phòng` : ''}
                              {previewData.total_boxes ? `${previewData.total_boxes} box` : ''}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {previewData.royalty_amount_before_vat && (
                      <div className="border-t border-zinc-200 pt-4">
                        <h4 className="font-semibold text-zinc-800 mb-2">Tiền bản quyền</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-zinc-500">Tiền trước thuế:</span>
                            <div className="font-mono font-medium">
                              {(previewData.royalty_amount_before_vat || 0).toLocaleString('vi-VN')} đ
                            </div>
                          </div>
                          <div>
                            <span className="text-zinc-500">Thuế GTGT ({previewData.vat_rate}%):</span>
                            <div className="font-mono">
                              {(previewData.vat_amount || 0).toLocaleString('vi-VN')} đ
                            </div>
                          </div>
                          <div className="col-span-2">
                            <span className="text-zinc-500">Tổng cộng:</span>
                            <div className="font-mono font-bold text-lime-700">
                              {(previewData.royalty_amount_after_vat || 0).toLocaleString('vi-VN')} đ
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {previewData.contract_terms_note && (
                      <div className="border-t border-zinc-200 pt-4">
                        <h4 className="font-semibold text-zinc-800 mb-2">Ghi chú/Điều khoản</h4>
                        <div className="text-zinc-600 whitespace-pre-wrap">{previewData.contract_terms_note}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-zinc-500">
                    Không có dữ liệu để hiển thị
                  </div>
                )}
              </div>
              <div className="shrink-0 bg-zinc-50 border-t border-zinc-200 px-6 py-4 flex justify-end z-10">
                <Button variant="secondary" onClick={() => setShowPreview(false)}>
                  Đóng
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Search UI
  return (
    <div className="border border-zinc-200 rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700">
          Tạo từ hợp đồng đã có
        </h3>
        {!isExpanded && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<SearchIcon className="h-4 w-4" />}
            onClick={() => setIsExpanded(true)}
          >
            Tìm hợp đồng
          </Button>
        )}
        {isExpanded && (
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 hover:bg-zinc-100 rounded-md"
          >
            <XIcon className="h-4 w-4 text-zinc-500" />
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-3">
          {/* Search Input */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Tìm theo số HĐ, tên đơn vị, MST, địa chỉ..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500 focus:border-lime-500"
              autoFocus
            />
            {isSearching && (
              <LoaderIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-lime-600 animate-spin" />
            )}
          </div>

          {/* Search Results */}
          <div className="max-h-64 overflow-y-auto border border-zinc-200 rounded-lg">
            {searchResults.length === 0 && !isSearching && (
              <div className="py-8 text-center text-sm text-zinc-500">
                {searchQuery ? 'Không tìm thấy hợp đồng nào' : 'Nhập từ khoá để tìm kiếm'}
              </div>
            )}
            {searchResults.map((contract) => (
              <div
                key={contract.id}
                className="flex items-center justify-between p-3 hover:bg-lime-50 border-b border-zinc-100 last:border-b-0 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-zinc-800">
                      {contract.contract_no}
                    </span>
                    {contract.domain && (
                      <span className="text-xs px-1.5 py-0.5 bg-zinc-100 text-zinc-600 rounded">
                        {contract.domain}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 truncate mt-0.5">
                    {contract.customer_name || contract.legal_name || '—'}
                    {contract.tax_code && <span className="ml-2">MST: {contract.tax_code}</span>}
                  </div>
                  {contract.legal_full_address && (
                    <div className="text-xs text-zinc-400 truncate">
                      {contract.legal_full_address}
                    </div>
                  )}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<CheckIcon className="h-3 w-3" />}
                  onClick={() => handleSelectTemplate(contract)}
                  className="ml-3 shrink-0"
                >
                  Dùng làm mẫu
                </Button>
              </div>
            ))}
          </div>

          {/* Search hint */}
          <p className="text-xs text-zinc-500">
            Tìm kiếm theo: số hợp đồng, tên đơn vị, tên pháp nhân, mã số thuế, địa chỉ
          </p>
        </div>
      )}
    </div>
  );
}
