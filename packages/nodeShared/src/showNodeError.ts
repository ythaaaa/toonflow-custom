import { h } from "vue";
import { ElNotification } from "element-plus";
import nodeError from "./components/nodeError.vue";

export function getUserFacingError(error: unknown, statusQuery = false) {
  const value = error as { name?: unknown; message?: unknown; status?: unknown; code?: unknown; rawMessage?: unknown;
    response?: { status?: unknown; data?: { message?: unknown; data?: { rawMessage?: unknown } } }; cause?: { message?: unknown } } | null;
  const responseData = value?.response?.data;
  const detail = typeof responseData?.data?.rawMessage === "string" ? responseData.data.rawMessage
    : typeof value?.rawMessage === "string" ? value.rawMessage
      : typeof value?.cause?.message === "string" ? value.cause.message
        : typeof responseData?.message === "string" ? responseData.message
          : typeof value?.message === "string" ? value.message
            : typeof error === "string" ? error : "请求失败";
  const status = typeof value?.status === "number" ? value.status : typeof value?.response?.status === "number" ? value.response.status
    : Number(/\bHTTP\s+(\d{3})\b/i.exec(detail)?.[1]) || undefined;
  const httpMessages: Record<number, string> = {
    401: "HTTP 401：授权失效，请重新连接",
    403: "HTTP 403：访问被拒绝，请检查权限",
    404: "HTTP 404：云端任务或接口不存在",
    500: "HTTP 500：云端服务发生错误",
  };
  const suffix = statusQuery ? "。云端状态暂时无法确认，请勿重复提交。" : "";
  const message = status && httpMessages[status] ? `${httpMessages[status]}${suffix}`
    : value?.name === "AbortError" ? `请求已中断${suffix}`
      : /fetch failed/i.test(detail) ? `网络请求失败，暂时无法获取任务状态${suffix}`
        : /NetworkError/i.test(detail) ? `网络连接异常${suffix}`
          : /timeout|timed out|ETIMEDOUT/i.test(`${String(value?.name ?? "")} ${detail}`) ? `请求超时${suffix}`
            : statusQuery ? `状态查询失败：云端状态暂时无法确认，请勿重复提交。`
              : typeof responseData?.message === "string" && responseData.message.trim() ? responseData.message
                : typeof value?.message === "string" && value.message.trim() ? value.message
                  : typeof error === "string" && error.trim() ? error : "请求失败";
  return { message, detail };
}

export function showNodeError(error: unknown, title: string, options?: { references?: string[]; detail?: string }) {
  if (error instanceof Error && error.name === "AbortError") return;
  const friendlyError = getUserFacingError(error);
  const detail = options?.detail || friendlyError.detail;
  const safetyRejected = /request was rejected by the safety system|safety_violations\s*=\s*\[[^\]]+\]/i.test(`${friendlyError.message}\n${detail}`);
  const controller = new AbortController();
  ElNotification({
    title,
    type: "error",
    duration: 0,
    customClass: "nodeErrorNotification",
    message: h(nodeError, { message: friendlyError.message || title, detail, context: title, references: options?.references, safetyRejected, signal: controller.signal }),
    onClose: () => controller.abort(),
  });
}
