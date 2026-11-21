import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const host = '127.0.0.1';
const port = 18427;
const origin = 'http://127.0.0.1:3000';
const cwd = resolve(import.meta.dirname, '..');
const active = new Map();
const uploads = new Map();
let serial = 0;
let pending = new Map();
let current;
let buffer = '';
const toonflowTools = '["getAppState","getCanvas","findCanvasNodes","getCanvasNodes","getCanvasEdges","getNodeTools","listDramaProjects","getDramaProject","listEpisodes","getEpisode","getEpisodeScripts","getEpisodeScenes","getEpisodeShots","getDramaAssets","saveEpisodeDraft","createScriptVersion","confirmScriptVersion","createEpisode","updateEpisode","createScene","updateScene","createShot","updateShot","applyDramaBatch"]';
const maxRequestBytes = 24 * 1024 * 1024;
const appOrigins = new Set(['http://127.0.0.1:3000', 'http://localhost:3000']);
let codexCatalog;
const codex = spawn('codex', [
  'app-server', '--listen', 'stdio://',
  '-c', 'mcp_servers.node_repl.enabled=false',
  '-c', 'mcp_servers.toonflow.enabled=true',
  '-c', 'mcp_servers.toonflow.enabled_tools=' + toonflowTools,
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
      if (item && ['mcpToolCall', 'commandExecution', 'fileChange', 'webSearch', 'imageGeneration'].includes(item.type)) task.item?.(event.method.endsWith('completed') ? 'completed' : 'started', safeItem(item));
    }
    if (event.method === 'item/completed' && event.params?.item?.type === 'agentMessage') task.completeText(event.params.item.text);
    if (event.method === 'turn/completed') task.finish(event.params?.turn?.status === 'completed' ? undefined : publicError(`${event.params?.turn?.error?.code ?? ''} ${event.params?.turn?.error?.message ?? ''}`));
  }
});
await send('initialize', { clientInfo: { name: 'toonflow_local_codex_bridge', title: 'Toonflow Local Codex Bridge', version: '1.0.0' }, capabilities: {} });
notify('initialized', {});

function allowed(req) {
  return req.headers.host === `${host}:${port}` && appOrigins.has(req.headers.origin) && req.headers['x-toonflow-codex-bridge'] === '1';
}
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function publicError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/auth|login|not logged|unauthorized|未登录/i.test(message)) return 'Codex 未登录，请在本机运行 codex login';
  if (/rate.?limit|usage.?limit|quota|额度|限额|429/i.test(message)) return 'Codex 会员额度或速率已受限，请稍后在 Codex 中查看用量';
  return 'Codex 请求失败，请查看本机 Bridge 状态';
}
function cors(res, requestOrigin) { res.setHeader('Access-Control-Allow-Origin', requestOrigin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Toonflow-Codex-Bridge'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); }
function readBody(req, maxBytes = 16384) { return new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => { body += chunk; if (Buffer.byteLength(body) > maxBytes) { reject(new Error('请求内容过大')); req.destroy(); } }); req.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON 格式无效')); } }); req.on('error', reject); }); }
function safeItem(item) {
  if (!item || typeof item !== 'object') return item;
  const output = { type: item.type, id: item.id };
  for (const key of ['server', 'tool', 'name', 'command', 'status', 'exitCode', 'aggregatedOutput', 'text', 'result', 'error']) {
    if (item[key] !== undefined) output[key] = item[key];
  }
  const value = JSON.stringify(output);
  return value.length > 24000 ? { ...output, result: undefined, aggregatedOutput: undefined, text: undefined, error: '工具输出超过界面展示上限' } : output;
}
async function getCatalog() {
  const [models, skills, mcp] = await Promise.allSettled([
    send('model/list', { includeHidden: false }),
    send('skills/list', { cwds: [cwd], forceReload: true }),
    send('mcpServerStatus/list', { detail: 'full' }),
  ]);
  codexCatalog = {
    models: models.status === 'fulfilled' ? (models.value.data ?? []).map(item => ({ slug: item.model ?? item.id, displayName: item.displayName, supportedReasoningEfforts: item.supportedReasoningEfforts ?? [] })) : [],
    skills: skills.status === 'fulfilled' ? (skills.value.data ?? []).flatMap(cwdEntry => (cwdEntry.skills ?? []).filter(skill => skill.enabled !== false).map(skill => ({ name: skill.name, path: skill.path, description: skill.description }))) : [],
    mcp: mcp.status === 'fulfilled' ? (mcp.value.data ?? []).map(server => ({ name: server.name, authStatus: server.authStatus, tools: Object.values(server.tools ?? {}).map(tool => ({ name: tool.name, description: tool.description, readOnly: tool.annotations?.readOnlyHint === true })) })) : [],
    errors: [models, skills, mcp].map((value, index) => value.status === 'rejected' ? ['models', 'skills', 'mcp'][index] : undefined).filter(Boolean),
  };
  return codexCatalog;
}
function findSkill(name) {
  return codexCatalog?.skills.find(skill => skill.name === name || skill.id === name);
}
async function resolveSkill(name) {
  const cached = findSkill(name);
  if (cached) return cached;
  const result = await send('skills/list', { cwds: [cwd], forceReload: true });
  const skills = (result.data ?? []).flatMap(entry => (entry.skills ?? []).filter(skill => skill.enabled !== false).map(skill => ({ name: skill.name, path: skill.path, description: skill.description })));
  codexCatalog = { ...(codexCatalog ?? { models: [], mcp: [], errors: [] }), skills };
  return findSkill(name);
}
http.createServer(async (req, res) => {
  if (!appOrigins.has(req.headers.origin) || req.headers.host !== `${host}:${port}`) return json(res, 403, { error: '来源不允许' });
  cors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return req.headers['access-control-request-headers']?.toLowerCase().includes('x-toonflow-codex-bridge') ? res.writeHead(204).end() : json(res, 403, { error: '预检失败' });
  if (req.method === 'GET' && req.url === '/catalog' && allowed(req)) {
    try { return json(res, 200, await getCatalog()); } catch { return json(res, 503, { error: 'Codex 能力列表暂不可用' }); }
  }
  if (!allowed(req) || req.method !== 'POST' || req.headers['content-type']?.split(';')[0] !== 'application/json') return json(res, 403, { error: '请求不允许' });
  let body; try { body = await readBody(req, req.url === '/upload' ? maxRequestBytes : 1048576); } catch (error) { return json(res, 400, { error: error.message }); }
  if (req.url === '/cancel') {
    const task = active.get(body.runId);
    if (!task) return json(res, 404, { error: '任务不存在' });
    if (task.turnId) await send('turn/interrupt', { threadId: task.threadId, turnId: task.turnId }).catch(() => {});
    task.finish('已停止生成', false);
    return json(res, 200, { stopped: true });
  }
  if (req.url === '/upload') {
    if (typeof body.name !== 'string' || typeof body.mimeType !== 'string' || typeof body.data !== 'string' || !/^data:[\w.+-]+\/[\w.+-]+;base64,/.test(body.data)) return json(res, 400, { error: '附件信息无效' });
    const bytes = Buffer.from(body.data.slice(body.data.indexOf(',') + 1), 'base64');
    if (!bytes.length || bytes.length > 16 * 1024 * 1024) return json(res, 413, { error: '单个附件不能超过 16 MB' });
    const extension = extname(basename(body.name)).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 16);
    const directory = await mkdtemp(join(tmpdir(), 'toonflow-codex-'));
    const path = join(directory, randomUUID() + extension);
    const id = randomUUID();
    await writeFile(path, bytes, { flag: 'wx' });
    const timer = setTimeout(() => { uploads.delete(id); void rm(directory, { recursive: true, force: true }); }, 60 * 60 * 1000).unref();
    uploads.set(id, { path, directory, name: basename(body.name).slice(0, 200), mimeType: body.mimeType.slice(0, 100), timer });
    return json(res, 200, { id, name: basename(body.name).slice(0, 200), mimeType: body.mimeType.slice(0, 100) });
  }
  if (req.url !== '/chat') return json(res, 404, { error: '接口不存在' });
  if (current) return json(res, 429, { error: '已有 Codex 对话正在运行，请稍后重试' });
  if (typeof body.prompt !== 'string' || (!body.prompt.trim() && !body.attachments?.length && !body.skillName) || body.prompt.length > 100000 || body.threadId && !/^[0-9a-f-]{36}$/i.test(body.threadId) || body.attachments && (!Array.isArray(body.attachments) || body.attachments.length > 20) || body.skillName && typeof body.skillName !== 'string') return json(res, 400, { error: '消息、附件或会话 ID 无效' });
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
    task = { runId, threadId, turnId: undefined, delta(text) { if (!active.has(runId)) return; full += text; push({ type: 'delta', text }); }, item(event, item) { if (active.has(runId)) push({ type: 'item', event, item }); }, completeText(text) { if (typeof text === 'string' && text.startsWith(full) && text.length > full.length) this.delta(text.slice(full.length)); }, finish(error, release = true) { if (active.get(runId) !== this) { if (release && current === this) current = undefined; return; } active.delete(runId); if (release && current === this) current = undefined; push(error ? { type: 'error', message: error } : { type: 'done', threadId }); res.end(); clearTimeout(timer); }, fail(message) { this.finish(message); } };
    current = task; active.set(runId, task);
    const timer = setTimeout(() => { if (task.turnId) void send('turn/interrupt', { threadId, turnId: task.turnId }).catch(() => {}); task.finish('生成超时（120 秒）'); }, 120000);
    res.on('close', () => { if (active.has(runId)) { if (task.turnId) void send('turn/interrupt', { threadId, turnId: task.turnId }).catch(() => {}); task.finish('连接已关闭', false); } });
    const taskPrompt = "Toonflow 专项规则：通过官方 Codex App Server 使用当前配置的 Skills 与 MCP 工具。短剧数据工具必须显式传入目标工作区 target.directory 和 projectId/episodeId，禁止根据项目名称跨工作区猜测。短剧写操作必须先向用户说明拟修改的对象和内容并等待用户明确确认；未确认前不得调用写工具，不可声称未执行的工具操作。画布工具必须先读取页面连接并显式指定 connectionId。\n\n用户请求：\n" + body.prompt.trim();
    const input = [{ type: 'text', text: taskPrompt }];
    if (body.skillName) {
      const skill = await resolveSkill(body.skillName);
      if (!skill || typeof skill.path !== 'string') throw new Error('选择的 Skill 已不可用，请刷新技能列表');
      input.push({ type: 'skill', name: skill.name, path: skill.path });
    }
    for (const attachment of body.attachments ?? []) {
      if (!attachment || typeof attachment !== 'object') continue;
      if (typeof attachment.id === 'string') {
        const uploaded = uploads.get(attachment.id);
        if (!uploaded) throw new Error('附件暂存已过期，请重新添加附件');
        if (uploaded.mimeType.startsWith('image/')) input.push({ type: 'localImage', path: uploaded.path, detail: 'auto' });
        else if (/^(?:text\/|application\/(?:json|xml|yaml|toml|x-ndjson))/.test(uploaded.mimeType)) {
          const content = await readFile(uploaded.path, 'utf8');
          input.push({ type: 'text', text: `\n\n<附件名称=${uploaded.name}>\n${content.slice(0, 400000)}\n</附件>` });
        } else input.push({ type: 'text', text: `\n\n附件“${uploaded.name}”已暂存于本机：${uploaded.path}。请使用可用的只读工具读取该文件后再回答。` });
      } else if (typeof attachment.data === 'string' && /^data:image\/[\w.+-]+;base64,/.test(attachment.data) && attachment.data.length < 22 * 1024 * 1024) {
        input.push({ type: 'image', url: attachment.data, detail: 'auto' });
      }
    }
    const turnConfig = { threadId, input, cwd, sandboxPolicy: { type: 'readOnly' }, approvalPolicy: 'on-request', approvalsReviewer: 'auto_review', ...(typeof body.model === 'string' && body.model ? { model: body.model } : {}), ...(typeof body.reasoningEffort === 'string' && body.reasoningEffort ? { effort: body.reasoningEffort } : {}) };
    await send('turn/start', turnConfig);
    console.log(`[codex-turn-config] accepted model=${turnConfig.model ?? 'default'} effort=${turnConfig.effort ?? 'default'} skill=${body.skillName ?? 'none'} attachments=${body.attachments?.length ?? 0}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!/token|key|authorization/i.test(detail)) console.error(`[codex-turn-error] ${detail.slice(0, 500)}`);
    if (task) task.finish(publicError(error)); else json(res, 503, { error: publicError(error) });
  }
}).listen(port, host, () => console.log(`Codex Bridge listening on http://${host}:${port}`));
