import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { getCodexOAuthTestStatus } from "@/agent/runtime/codexOAuthTest";

export default Router().get("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.set("Cache-Control", "no-store").json(success(await getCodexOAuthTestStatus(req.query.refresh === "1")));
});
