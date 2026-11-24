import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { removeManagedWorkspace } from "@/utils/workspace/management";

export default Router().delete("/", validateFields({ workspaceId: z.uuid(), directory: z.string().min(1).max(4096), expectMissing: z.boolean().optional() }), async (req, res) => {
  res.json(success(await removeManagedWorkspace(req, req.body.workspaceId, req.body.directory, req.body.expectMissing === true)));
});
