import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { validateDramaScriptImport } from "@/agent/runtime/dramaImport";

const inputSchema = z.strictObject({
  sourceName: z.string().trim().min(1).max(255),
  sourceText: z.string().min(1).max(1024 * 1024),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  analysis: z.json(),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const input = inputSchema.parse(req.body);
  res.set("Cache-Control", "no-store").json(success(await validateDramaScriptImport(input.sourceName, input.sourceText, input.sourceFingerprint, input.analysis)));
});
