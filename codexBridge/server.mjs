import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const host = '127.0.0.1';
const port = 18427;
const origin = 'http://127.0.0.1:3000';
const cwd = resolve(import.meta.dirname, '..');
const active = new Map();
let serial = 0;
let pending = new Map();
let current;
let buffer = '';
const toonflowReadTools = '["getAppState","getCanvas","findCanvasNodes","getCanvasNodes","getCanvasEdges","getNodeTools"]';
const codex = spawn('codex', [
  'app-server', '--listen', 'stdio://',
  '-c', 'mcp_servers.node_repl.enabled=false',
  '-c', 'mcp_servers.nodetool.enabled=false',
  '-c', 'mcp_servers.toonflow.enabled=true',
  '-c', 'mcp_servers.toonflow.enabled_tools=' + toonflowReadTools,
], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
codex.stderr.on('data', data => { const line = String(data); if (/error|failed/i.test(line) && !/token|key|authorization/i.test(line)) console.error(line.trim().slice(0, 300)); });
codex.on('exit', () => { for (const item of active.values()) item.fail('Codex 服务已停止'); for (const item of pending.values()) item.reject(new Error('Codex 服务已停止')); pending.clear(); });
function send(method, params) {
  const id = ++serial;
  codex.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); setTimeout(() => { if (pending.delete(id)) reject(new Error('Codex 响应超时')); }, 15000).unref(); });
}
function notify(method, params) { codex.stdin.write(JSON.stringify({ method, params }) + '\n'); }
codex.stdout.on('data', chunk => {
  buffer += String(chunk);
  for (let end; (end = buffer.indexOf('\n')) >= 0;) {
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    let event; try { event = JSON.parse(line); } catch { continue; }
    if (event.id !== undefined) { const item = pending.get(event.id); if (!item) continue; pending.delete(event.id); event.error ? item.reject(new Error(event.error.message ?? 'Codex 请求失败')) : item.resolve(event.result); continue; }
    const task = current;
    if (!task) continue;
    if (event.method === 'turn/started') task.turnId = event.params?.turn?.id;
    if (event.method === 'item/agentMessage/delta' && typeof event.params?.delta === 'string') task.delta(event.params.delta);
    if (event.method === 'item/started' || event.method === 'item/completed') {
      const item = event.params?.item;
      if (item?.type === 'mcpToolCall') console.log('[toonflow-mcp] ' + (event.method.endsWith('completed') ? 'completed ' : 'started ') + (item.server ?? 'toonflow') + ':' + (item.tool ?? item.name ?? 'unknown'));
    }
    if (event.method === 'item/completed' && event.params?.item?.type === 'agentMessage') task.completeText(event.params.item.text);
    if (event.method === 'turn/completed') task.finish(event.params?.turn?.status === 'completed' ? undefined : publicError(`${event.params?.turn?.error?.code ?? ''} ${event.params?.turn?.error?.message ?? ''}`));
  }
});
await send('initialize', { clientInfo: { name: 'toonflow_local_codex_bridge', title: 'Toonflow Local Codex Bridge', version: '1.0.0' }, capabilities: {} });
notify('initialized', {});

function allowed(req) {
  return req.headers.host === `${host}:${port}` && req.headers.origin === origin && req.headers['x-toonflow-codex-bridge'] === '1';
}
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function publicError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/auth|login|not logged|unauthorized|未登录/i.test(message)) return 'Codex 未登录，请在本机运行 codex login';
  if (/rate.?limit|usage.?limit|quota|额度|限额|429/i.test(message)) return 'Codex 会员额度或速率已受限，请稍后在 Codex 中查看用量';
  return 'Codex 请求失败，请查看本机 Bridge 状态';
}
function cors(res) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Toonflow-Codex-Bridge'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); }
function readBody(req) { return new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => { body += chunk; if (Buffer.byteLength(body) > 16384) { reject(new Error('消息不能超过 16 KB')); req.destroy(); } }); req.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON 格式无效')); } }); req.on('error', reject); }); }
http.createServer(async (req, res) => {
  if (req.headers.origin !== origin || req.headers.host !== `${host}:${port}`) return json(res, 403, { error: '来源不允许' });
  cors(res);
  if (req.method === 'OPTIONS') return req.headers['access-control-request-headers']?.toLowerCase().includes('x-toonflow-codex-bridge') ? res.writeHead(204).end() : json(res, 403, { error: '预检失败' });
  if (!allowed(req) || req.method !== 'POST' || req.headers['content-type']?.split(';')[0] !== 'application/json') return json(res, 403, { error: '请求不允许' });
  let body; try { body = await readBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
  if (req.url === '/cancel') {
    const task = active.get(body.runId);
    if (!task) return json(res, 404, { error: '任务不存在' });
    if (task.turnId) await send('turn/interrupt', { threadId: task.threadId, turnId: task.turnId }).catch(() => {});
    task.finish('已停止生成', false);
    return json(res, 200, { stopped: true });
  }
  if (req.url !== '/chat') return json(res, 404, { error: '接口不存在' });
  if (current) return json(res, 429, { error: '已有 Codex 对话正在运行，请稍后重试' });
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 8000 || body.threadId && !/^[0-9a-f-]{36}$/i.test(body.threadId)) return json(res, 400, { error: '消息或会话 ID 无效' });
  const login = spawnSync('codex', ['login', 'status'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  if (login.status !== 0 || !/Logged in using ChatGPT/.test(`${login.stdout ?? ''}\n${login.stderr ?? ''}`)) return json(res, 401, { error: 'Codex 未登录 ChatGPT，请在本机运行 codex login' });
  const runId = randomUUID();
  let task;
  const push = value => { if (!res.destroyed) res.write(JSON.stringify(value) + '\n'); };
  try {
    const thread = body.threadId
      ? await send('thread/resume', { threadId: body.threadId, cwd, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review' })
      : await send('thread/start', { cwd, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review' });
    const threadId = thread.thread.id;
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    push({ type: 'start', runId, threadId });
    let full = '';
    task = { runId, threadId, turnId: undefined, delta(text) { if (!active.has(runId)) return; full += text; push({ type: 'delta', text }); }, completeText(text) { if (typeof text === 'string' && text.startsWith(full) && text.length > full.length) this.delta(text.slice(full.length)); }, finish(error, release = true) { if (active.get(runId) !== this) { if (release && current === this) current = undefined; return; } active.delete(runId); if (release && current === this) current = undefined; push(error ? { type: 'error', message: error } : { type: 'done', threadId }); res.end(); clearTimeout(timer); }, fail(message) { this.finish(message); } };
    current = task; active.set(runId, task);
    const timer = setTimeout(() => { if (task.turnId) void send('turn/interrupt', { threadId, turnId: task.turnId }).catch(() => {}); task.finish('生成超时（120 秒）'); }, 120000);
    res.on('close', () => { if (active.has(runId)) { if (task.turnId) void send('turn/interrupt', { threadId, turnId: task.turnId }).catch(() => {}); task.finish('连接已关闭', false); } });
    const taskPrompt = "Toonflow 专项规则：只操作当前已打开的 Toonflow 工作区；先从 Toonflow MCP 读取当前连接、画布和节点状态。涉及短剧创作时，先读取仓库内 packages/skills/v118workflow/SKILL.md，再读取当前阶段引用的 references 文件，按流程执行并遵守逐阶段确认要求。当前 MCP 白名单仅提供画布只读查询，不能写画布、安装插件、调用图片或视频生成；不要声称已执行这些操作。将生成文本交还用户确认后再通过短剧工作台保存。\n\n用户请求：\n" + body.prompt.trim();
    await send('turn/start', { threadId, input: [{ type: 'text', text: taskPrompt }], cwd, sandboxPolicy: { type: 'readOnly' }, approvalPolicy: 'on-request', approvalsReviewer: 'auto_review' });
  } catch (error) { if (task) task.finish(publicError(error)); else json(res, 503, { error: publicError(error) }); }
}).listen(port, host, () => console.log(`Codex Bridge listening on http://${host}:${port}`));
