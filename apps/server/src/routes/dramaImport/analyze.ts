import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { thinkingLevels } from "@/lib/modelReasoning";
import u from "@/utils";
import { analyzeDramaScript } from "@/agent/runtime/dramaImport";
import { codexOAuthTestProviderId } from "@/agent/runtime/codexOAuthTest";

const inputSchema = z.strictObject({
  sourceName: z.string().trim().min(1).max(255),
  sourceText: z.string().min(1).max(1024 * 1024),
  providerId: z.literal(codexOAuthTestProviderId),
  modelId: z.string().trim().min(1).max(200),
  thinkingLevel: z.enum(thinkingLevels).optional(),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const input = inputSchema.parse(req.body);
  const result = await analyzeDramaScript(input, AbortSignal.timeout(300000));
  res.set("Cache-Control", "no-store").json(success(result));
});
