import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { getWorkspaceDeletionSummary } from "@/utils/workspace/management";

export default Router().get("/", validateFields({ workspaceId: z.uuid(), directory: z.string().min(1).max(4096) }, "query"), async (req, res) => {
  const summary = await getWorkspaceDeletionSummary(req, req.query.workspaceId as string, req.query.directory as string);
  res.json(success(summary));
});
