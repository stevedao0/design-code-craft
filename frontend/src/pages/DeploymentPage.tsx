import React, { useState, useEffect, useCallback, useRef } from "react";
import { Page, PageHeader } from "../components/app-ui/Page";
import { ContentCard } from "../components/app-ui/ContentCard";
import { Button } from "../components/app-ui/Button";
import { Input } from "../components/app-ui/Input";
import { StatusBadge } from "../components/app-ui/StatusBadge";
import {
  RefreshCwIcon,
  CopyIcon,
  ExternalLinkIcon,
  PlayIcon,
  SquareIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  InfoIcon,
} from "lucide-react";
import { getStoredToken } from "../lib/authClient";

const LOCAL_APP_URL = "http://127.0.0.1:8000";

type Toast = {
  id: number;
  type: "success" | "error" | "info";
  message: string;
};

type TunnelStatus = "stopped" | "starting" | "running" | "error";

type TunnelInfo = {
  status: TunnelStatus;
  url: string | null;
  pid: number | null;
  started_at: string | null;
  last_error: string | null;
  cloudflared_available: boolean;
};

type HealthData = {
  status: string;
  app: string;
  app_instance: string;
  api: string;
  database: string;
  db_host: string;
  db_mode: string;
};

type ApiError = {
  detail: string;
};

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${path.startsWith("/") ? path : `/${path}`}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  } as RequestInit);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    const err = body as ApiError;
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function _mapTone(status: TunnelStatus): "success" | "danger" | "info" | "neutral" | "warning" {
  switch (status) {
    case "running": return "success";
    case "starting": return "info";
    case "error": return "danger";
    case "stopped": return "neutral";
  }
}

function _statusLabel(status: TunnelStatus): string {
  switch (status) {
    case "running": return "Đang chạy";
    case "starting": return "Đang tạo...";
    case "error": return "Lỗi";
    case "stopped": return "Chưa chạy";
  }
}

export function DeploymentPage() {
  // --- Health state ---
  const [healthStatus, setHealthStatus] = useState<"unchecked" | "checking" | "online" | "offline">("unchecked");
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  // --- Tunnel state ---
  const [tunnelInfo, setTunnelInfo] = useState<TunnelInfo | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [stopLoading, setStopLoading] = useState(false);

  // --- Toast ---
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Fetch tunnel status
  const fetchTunnelStatus = useCallback(async () => {
    try {
      const data = await apiFetch<TunnelInfo>("/api/deployment/quick-tunnel/status");
      setTunnelInfo(data);
      setTunnelError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không lấy được trạng thái tunnel";
      setTunnelError(msg);
    }
  }, []);

  // Poll tunnel status when starting/running
  useEffect(() => {
    if (!tunnelInfo) return;
    if (tunnelInfo.status !== "starting" && tunnelInfo.status !== "running") return;

    const poll = setInterval(async () => {
      await fetchTunnelStatus();
    }, 5000);
    return () => clearInterval(poll);
  }, [tunnelInfo?.status, fetchTunnelStatus]);

  // Load initial state
  useEffect(() => {
    fetchTunnelStatus();
  }, [fetchTunnelStatus]);

  // Health check
  const handleCheckHealth = useCallback(async () => {
    setHealthStatus("checking");
    setHealthError(null);
    setHealthData(null);
    try {
      const res = await fetch("/api/health");
      if (!res.ok) {
        setHealthStatus("offline");
        setHealthError(`HTTP ${res.status}`);
        return;
      }
      const data: HealthData = await res.json();
      setHealthData(data);
      setHealthStatus("online");
    } catch (err) {
      setHealthStatus("offline");
      setHealthError(err instanceof Error ? err.message : "Không kết nối được");
    }
  }, []);

  // Start tunnel
  const handleStartTunnel = useCallback(async () => {
    setTunnelLoading(true);
    setTunnelError(null);
    try {
      const data = await apiFetch<TunnelInfo>("/api/deployment/quick-tunnel/start", { method: "POST" });
      setTunnelInfo(data);
      if (data.status === "running" && data.url) {
        showToast("success", "Đã tạo Public URL");
      } else if (data.status === "error") {
        showToast("error", data.last_error || "Tạo tunnel thất bại");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tạo tunnel thất bại";
      setTunnelError(msg);
      showToast("error", msg);
    } finally {
      setTunnelLoading(false);
    }
  }, [showToast]);

  // Stop tunnel
  const handleStopTunnel = useCallback(async () => {
    setStopLoading(true);
    try {
      await apiFetch<TunnelInfo>("/api/deployment/quick-tunnel/stop", { method: "POST" });
      await fetchTunnelStatus();
      showToast("success", "Đã tắt tunnel");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tắt tunnel thất bại";
      showToast("error", msg);
    } finally {
      setStopLoading(false);
    }
  }, [fetchTunnelStatus, showToast]);

  // Copy URL
  const handleCopyUrl = useCallback(async () => {
    const url = tunnelInfo?.url;
    if (!url) {
      showToast("error", "Chưa có URL để copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("success", "Đã copy URL");
    } catch {
      showToast("error", "Trình duyệt chặn clipboard");
    }
  }, [tunnelInfo?.url, showToast]);

  // Open URL
  const handleOpenUrl = useCallback(() => {
    const url = tunnelInfo?.url;
    if (!url) {
      showToast("error", "Chưa có URL để mở");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [tunnelInfo?.url, showToast]);

  const tunnelStatus = tunnelInfo?.status || "stopped";
  const tunnelUrl = tunnelInfo?.url || null;
  const isRunning = tunnelStatus === "running";
  const isStarting = tunnelStatus === "starting";
  const isStopped = tunnelStatus === "stopped";
  const isError = tunnelStatus === "error";

  return (
    <Page>
      <PageHeader
        title="Triển khai"
        description="Tạo và quản lý Public URL tạm thời qua Cloudflare Quick Tunnel."
        breadcrumb="Hệ thống"
      />

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`ds-toast flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium pointer-events-auto ${
              t.type === "success"
                ? "bg-[color:var(--accent-emerald)] text-white"
                : t.type === "error"
                  ? "bg-[color:var(--accent-danger)] text-white"
                  : "bg-[color:var(--accent-info)] text-white"
            }`}
          >
            {t.type === "success" && <CheckCircleIcon className="h-4 w-4 shrink-0" />}
            {t.type === "error" && <XCircleIcon className="h-4 w-4 shrink-0" />}
            {t.type === "info" && <InfoIcon className="h-4 w-4 shrink-0" />}
            {t.message}
          </div>
        ))}
      </div>

      <div className="px-4 sm:px-6 lg:px-10 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* --- Block 1: Trạng thái hệ thống --- */}
        <ContentCard
          title="Trạng thái hệ thống"
          description="Kiểm tra app nội bộ đang chạy"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-fg-muted">App nội bộ:</span>
              <code className="text-xs bg-[color:var(--surface-elevated)] border border-[color:var(--border-default)] rounded px-2 py-1 text-fg-primary font-mono break-all">
                {LOCAL_APP_URL}
              </code>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-fg-muted">Trạng thái:</span>
              <StatusBadge
                tone={
                  healthStatus === "online"
                    ? "success"
                    : healthStatus === "offline"
                      ? "danger"
                      : healthStatus === "checking"
                        ? "info"
                        : "neutral"
                }
                dot
              >
                {healthStatus === "online"
                  ? "Online"
                  : healthStatus === "offline"
                    ? "Offline"
                    : healthStatus === "checking"
                      ? "Đang kiểm tra..."
                      : "Chưa kiểm tra"}
              </StatusBadge>
            </div>

            {healthData && (
              <div className="rounded-xl bg-[color:var(--surface-elevated)] border border-[color:var(--border-subtle)] p-4 flex flex-col gap-1.5">
                {[
                  { label: "App", value: healthData.app },
                  { label: "Instance", value: healthData.app_instance },
                  { label: "Database", value: healthData.database },
                  { label: "DB Host", value: healthData.db_host },
                  { label: "DB Mode", value: healthData.db_mode },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start sm:items-center gap-2 text-xs">
                    <span className="text-fg-muted w-16 sm:w-20 shrink-0">{label}:</span>
                    <span className="text-fg-primary font-medium break-all">{value}</span>
                  </div>
                ))}
              </div>
            )}

            {healthError && (
              <p className="text-xs text-danger">Lỗi: {healthError}</p>
            )}

            <Button
              variant="secondary"
              size="sm"
              leftIcon={
                healthStatus === "checking" ? (
                  <RefreshCwIcon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCwIcon className="h-3.5 w-3.5" />
                )
              }
              onClick={handleCheckHealth}
              disabled={healthStatus === "checking"}
              className="w-full sm:w-auto"
            >
              Kiểm tra kết nối
            </Button>
          </div>
        </ContentCard>

        {/* --- Block 2: Public URL — Cloudflare Quick Tunnel --- */}
        <ContentCard
          title="Public URL"
          description="Cloudflare Quick Tunnel — tự tạo URL public tạm thời"
        >
          <div className="flex flex-col gap-4">

            {/* Status row */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-fg-muted">Tunnel:</span>
              <StatusBadge tone={_mapTone(tunnelStatus)} dot>
                {_statusLabel(tunnelStatus)}
              </StatusBadge>
              {!tunnelInfo?.cloudflared_available && (
                <StatusBadge tone="warning">
                  cloudflared không khả dụng
                </StatusBadge>
              )}
            </div>

            {/* URL display */}
            {tunnelUrl && (
              <div className="flex items-center gap-2 rounded-xl bg-[color:var(--surface-elevated)] border border-[color:var(--border-subtle)] p-3">
                <CheckCircleIcon className="h-3.5 w-3.5 text-[color:var(--accent-emerald)] shrink-0" />
                <code className="text-xs text-fg-primary font-mono break-all flex-1">
                  {tunnelUrl}
                </code>
              </div>
            )}

            {/* Error */}
            {(tunnelError || (isError && tunnelInfo?.last_error)) && (
              <div className="flex items-start gap-2 text-xs text-danger">
                <XCircleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{tunnelError || tunnelInfo?.last_error}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap w-full">
              {/* Start */}
              <Button
                variant="primary"
                size="sm"
                leftIcon={
                  tunnelLoading || isStarting ? (
                    <RefreshCwIcon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlayIcon className="h-3.5 w-3.5" />
                  )
                }
                onClick={handleStartTunnel}
                disabled={tunnelLoading || isStarting || isRunning || !tunnelInfo?.cloudflared_available}
                className="flex-1 sm:flex-none min-w-[120px] justify-center"
              >
                {isStarting ? "Đang tạo..." : "Tạo link public"}
              </Button>

              {/* Copy — only when running */}
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<CopyIcon className="h-3.5 w-3.5" />}
                onClick={handleCopyUrl}
                disabled={!isRunning || !tunnelUrl}
                className="flex-1 sm:flex-none min-w-[80px] justify-center"
              >
                Copy
              </Button>

              {/* Open — only when running */}
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<ExternalLinkIcon className="h-3.5 w-3.5" />}
                onClick={handleOpenUrl}
                disabled={!isRunning || !tunnelUrl}
                className="flex-1 sm:flex-none min-w-[70px] justify-center"
              >
                Mở
              </Button>

              {/* Stop — only when running/starting */}
              <Button
                variant="danger"
                size="sm"
                leftIcon={
                  stopLoading ? (
                    <RefreshCwIcon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <SquareIcon className="h-3.5 w-3.5" />
                  )
                }
                onClick={handleStopTunnel}
                disabled={stopLoading || isStopped || !isRunning}
                className="flex-1 sm:flex-none min-w-[80px] justify-center"
              >
                Tắt link
              </Button>
            </div>

            {/* Info note */}
            {(isRunning || isStarting) && (
              <div className="flex items-start gap-2 text-xs text-fg-muted">
                <InfoIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>URL sẽ mất khi backend/container restart. Bấm Tắt link khi không sử dụng.</span>
              </div>
            )}

            {!tunnelInfo?.cloudflared_available && (
              <div className="flex items-start gap-2 text-xs text-[color:var(--accent-warning)]">
                <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>cloudflared chưa có trong container. Cần rebuild Docker image.</span>
              </div>
            )}
          </div>
        </ContentCard>

        {/* --- Block 3: Lưu ý bảo mật --- */}
        <ContentCard
          title="Lưu ý bảo mật"
          accent
        >
          <div className="flex flex-col gap-2.5">
            {[
              "Link public mở ra internet ngay khi tạo — ai có link đều thấy màn hình đăng nhập.",
              "App đang dùng dữ liệu thật từ database production.",
              "Chỉ chia sẻ link cho người cần thiết.",
              "Bấm \"Tắt link\" khi không sử dụng nữa.",
              "Nếu backend/container restart, link sẽ mất.",
            ].map((note, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-fg-secondary">
                <AlertTriangleIcon className="h-3.5 w-3.5 text-[color:var(--accent-warning)] shrink-0 mt-0.5" />
                <span>{note}</span>
              </div>
            ))}
          </div>
        </ContentCard>

        {/* --- Block 4: Cách tắt nhanh --- */}
        <ContentCard title="Cách tắt nhanh">
          <div className="flex flex-col gap-3 text-sm text-fg-secondary">
            <div className="flex items-start gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[color:var(--accent-primary)] text-white text-xs font-bold shrink-0">
                1
              </span>
              <span>Bấm nút <strong className="text-fg-primary">"Tắt link"</strong> trong trang này.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[color:var(--accent-primary)] text-white text-xs font-bold shrink-0">
                2
              </span>
              <span>Public URL sẽ ngừng hoạt động ngay.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[color:var(--accent-primary)] text-white text-xs font-bold shrink-0">
                3
              </span>
              <span>App nội bộ tại <code className="text-xs bg-[color:var(--surface-elevated)] border border-[color:var(--border-subtle)] rounded px-1 py-0.5 font-mono break-all">{LOCAL_APP_URL}</code> vẫn chạy bình thường.</span>
            </div>
          </div>
        </ContentCard>

      </div>
    </Page>
  );
}
