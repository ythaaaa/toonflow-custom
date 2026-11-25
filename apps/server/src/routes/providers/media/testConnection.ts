import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({
  fileName: u.mediaProvider.mediaProviderFileSchema,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  config: z.record(z.string(), z.json()).default({}),
}), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const message = await u.mediaProvider.testMediaProviderConnection(req.body.fileName, req.body.revision, req.body.config);
  res.set("Cache-Control", "no-store").json(success({ message }));
});
