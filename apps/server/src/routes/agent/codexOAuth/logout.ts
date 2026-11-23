import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { logoutCodexOAuthTest } from "@/agent/runtime/codexOAuthTest";

export default Router().post("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.set("Cache-Control", "no-store").json(success(await logoutCodexOAuthTest()));
});
