import { translateError, translateMessage } from "./i18n";
import type { MessageDescriptor } from "@toonflow/i18n";
import { z } from "zod";
export interface ApiResponse<T = unknown> {
  code: number;
  data: T | null;
  message: string;
}

// 成功回调
export function success<T = unknown>(data: T | null = null, message: string | MessageDescriptor = "成功"): ApiResponse<T> {
  return {
    code: 200,
    data,
    message: translateMessage(message),
  };
}

// 错误响应，默认客户端错误
export function error<T = unknown>(message: string | MessageDescriptor = "", data: T | null = null, code: number = 400): ApiResponse<T> {
  return {
    code,
    data,
    message: translateMessage(message),
  };
}

export function errorFromCause(cause: unknown): ApiResponse {
  if (cause instanceof z.ZodError) {
    return error("参数错误", cause.issues.map(issue => ({ ...issue, message: translateMessage(issue.message) })), 400);
  }
  const failure = cause as { status?: number; code?: string; name?: string; message?: string; rawMessage?: string } | null;
  const code = failure?.code;
  const sourceMessage = typeof failure?.message === "string" ? failure.message : String(cause);
  const httpStatus = failure?.status || Number(/\bHTTP\s+(\d{3})\b/i.exec(sourceMessage)?.[1]) || undefined;
  const status = httpStatus || ({ ENOENT: 404, ENOTDIR: 404, EEXIST: 409, ENOTEMPTY: 409, EACCES: 403, EPERM: 403 }[code ?? ""] ?? 500);
  const fileMessages: Record<string, string> = {
    ENOENT: "找不到这个文件或文件夹，可能已被移动、删除，或者位置选错了。",
    ENOTDIR: "你选中的是文件，但这里需要选择文件夹。请重新选择。",
    EEXIST: "这个名称已经被占用了，请换一个名称。原来的内容不会被覆盖。",
    ENOTEMPTY: "这个文件夹里还有内容，不能直接删除。请先清空或移走里面的文件。",
    EACCES: "没有权限访问这个文件或文件夹。请检查权限，或换一个位置重试。",
    EPERM: "系统不允许这次操作。文件可能正在被其他程序使用，请关闭后重试。",
    EISDIR: "你选中的是文件夹，但这里需要的是文件。请重新选择具体文件。",
  };
  const httpMessages: Record<number, string> = {
    401: "HTTP 401：授权失效，请重新连接",
    403: "HTTP 403：访问被拒绝，请检查权限",
    404: "HTTP 404：云端任务或接口不存在",
    500: "HTTP 500：云端服务发生错误",
  };
  const querySuffix = code === "MEDIA_TASK_STATUS_QUERY_FAILED" ? "。云端状态暂时无法确认，请勿重复提交。" : "";
  const message = fileMessages[code ?? ""]
    ?? (code === "MEDIA_TASK_FAILED" ? translateError(cause)
      : httpStatus && httpMessages[httpStatus] ? `${httpMessages[httpStatus]}${querySuffix}`
        : code === "MEDIA_TASK_STATUS_QUERY_FAILED" && /fetch failed/i.test(sourceMessage) ? "网络请求失败，暂时无法获取任务状态。云端状态暂时无法确认，请勿重复提交。"
          : failure?.name === "AbortError" ? `请求已中断${querySuffix}`
            : /NetworkError/i.test(sourceMessage) ? `网络连接异常${querySuffix}`
              : /timeout|timed out|ETIMEDOUT/i.test(`${failure?.name ?? ""} ${sourceMessage}`) ? `请求超时${querySuffix}`
                : code === "MEDIA_TASK_STATUS_QUERY_FAILED" ? "云端状态暂时无法确认，请勿重复提交。"
                  : translateError(cause));
  const data = code === "MEDIA_TASK_STATUS_QUERY_FAILED"
    ? { code, rawMessage: failure?.rawMessage ?? sourceMessage }
    : code ? { code } : null;
  return error(message, data, status);
}
