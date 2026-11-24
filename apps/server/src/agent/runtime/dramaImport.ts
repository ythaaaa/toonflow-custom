import { z } from "zod";
import { validateToolCall, type Context, type Tool, type TSchema } from "@earendil-works/pi-ai";
import type { DramaScriptAnalysis } from "@toonflow/drama-workspace";
import type { ThinkingLevel } from "@/lib/modelReasoning";
import { createAgentModel } from "@/agent/runtime/model";

const sourceMaxBytes = 1024 * 1024;
const shortText = z.string().trim().min(1).max(1000);
const longText = z.string().trim().min(1).max(12000);
const keyText = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const shotNumber = z.string().trim().toUpperCase().regex(/^SH\d{3,}$/);
const timecode = z.string().trim().regex(/^\d{2}:\d{2}(?::\d{2})?$/);

export const dramaScriptAnalysisSchema: z.ZodType<DramaScriptAnalysis> = z.strictObject({
  metadata: z.strictObject({
    title: shortText,
    projectName: shortText,
    episodeNumber: z.number().int().min(1).max(100000),
    duration: z.number().positive().max(24 * 60 * 60),
    aspectRatio: z.string().trim().regex(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/),
    narrativePerspective: shortText,
    summary: longText,
  }),
  characters: z.array(z.strictObject({
    key: keyText,
    name: shortText,
    identity: longText,
    appearance: longText,
    outfit: longText,
    visualFeatures: z.array(shortText).min(1).max(30),
    prompt: longText,
  })).min(1).max(100),
  scenes: z.array(z.strictObject({
    key: keyText,
    name: shortText,
    location: shortText,
    time: shortText,
    interiorExterior: z.enum(["内景", "外景"]),
    dayPart: z.enum(["白天", "夜晚", "黄昏", "清晨"]),
    environment: longText,
    color: longText,
    layout: longText,
    prompt: longText,
    characterKeys: z.array(keyText).max(100),
  })).min(1).max(200),
  shots: z.array(z.strictObject({
    number: shotNumber,
    title: shortText,
    startTime: timecode,
    endTime: timecode,
    duration: z.number().positive().max(60 * 60),
    sceneKey: keyText,
    characterKeys: z.array(keyText).max(100),
    size: shortText,
    camera: longText,
    movement: longText,
    action: longText,
    visualDescription: longText,
    sound: longText,
    imagePrompt: longText,
    h3Prompt: longText,
  })).min(1).max(1000),
  referenceAssets: z.array(z.strictObject({
    kind: z.enum(["character", "scene", "prop", "shot"]),
    name: shortText,
    description: longText,
    characterKeys: z.array(keyText).max(100),
    sceneKeys: z.array(keyText).max(200),
    shotNumbers: z.array(shotNumber).max(1000),
  })).max(500),
  continuityConstraints: z.array(z.strictObject({
    category: z.enum(["character", "costume", "prop", "layout", "color", "camera", "sound", "other"]),
    description: longText,
    shotNumbers: z.array(shotNumber).max(1000),
  })).min(1).max(1000),
  pendingQuestions: z.array(z.strictObject({
    id: keyText,
    question: longText,
    options: z.array(shortText).min(2).max(20),
    reason: longText,
  })).max(100),
}).superRefine((analysis, context) => {
  const characterKeys = new Set<string>();
  for (const [index, character] of analysis.characters.entries()) {
    if (characterKeys.has(character.key)) context.addIssue({ code: "custom", path: ["characters", index, "key"], message: "人物标识不能重复" });
    characterKeys.add(character.key);
  }
  const sceneKeys = new Set<string>();
  for (const [index, scene] of analysis.scenes.entries()) {
    if (sceneKeys.has(scene.key)) context.addIssue({ code: "custom", path: ["scenes", index, "key"], message: "场景标识不能重复" });
    for (const characterKey of scene.characterKeys) if (!characterKeys.has(characterKey)) context.addIssue({ code: "custom", path: ["scenes", index, "characterKeys"], message: `人物 ${characterKey} 不存在` });
    sceneKeys.add(scene.key);
  }
  const shotNumbers = new Set<string>();
  let finalTime = 0;
  for (const [index, shot] of analysis.shots.entries()) {
    if (shotNumbers.has(shot.number)) context.addIssue({ code: "custom", path: ["shots", index, "number"], message: "镜头编号不能重复" });
    if (!sceneKeys.has(shot.sceneKey)) context.addIssue({ code: "custom", path: ["shots", index, "sceneKey"], message: `场景 ${shot.sceneKey} 不存在` });
    for (const characterKey of shot.characterKeys) if (!characterKeys.has(characterKey)) context.addIssue({ code: "custom", path: ["shots", index, "characterKeys"], message: `人物 ${characterKey} 不存在` });
    const start = timecodeSeconds(shot.startTime);
    const end = timecodeSeconds(shot.endTime);
    if (start === undefined || end === undefined || end <= start) context.addIssue({ code: "custom", path: ["shots", index], message: "镜头时间码范围无效" });
    else {
      if (Math.abs(end - start - shot.duration) > 0.5) context.addIssue({ code: "custom", path: ["shots", index, "duration"], message: "镜头时长必须与时间码一致" });
      finalTime = Math.max(finalTime, end);
    }
    shotNumbers.add(shot.number);
  }
  if (Math.abs(finalTime - analysis.metadata.duration) > 1) context.addIssue({ code: "custom", path: ["metadata", "duration"], message: "成片时长必须与最后一个镜头时间码一致" });
  for (const [index, asset] of analysis.referenceAssets.entries()) {
    for (const key of asset.characterKeys) if (!characterKeys.has(key)) context.addIssue({ code: "custom", path: ["referenceAssets", index, "characterKeys"], message: `人物 ${key} 不存在` });
    for (const key of asset.sceneKeys) if (!sceneKeys.has(key)) context.addIssue({ code: "custom", path: ["referenceAssets", index, "sceneKeys"], message: `场景 ${key} 不存在` });
    for (const number of asset.shotNumbers) if (!shotNumbers.has(number)) context.addIssue({ code: "custom", path: ["referenceAssets", index, "shotNumbers"], message: `镜头 ${number} 不存在` });
  }
  for (const [index, constraint] of analysis.continuityConstraints.entries()) {
    for (const number of constraint.shotNumbers) if (!shotNumbers.has(number)) context.addIssue({ code: "custom", path: ["continuityConstraints", index, "shotNumbers"], message: `镜头 ${number} 不存在` });
  }
  const questionIds = new Set<string>();
  for (const [index, question] of analysis.pendingQuestions.entries()) {
    if (questionIds.has(question.id)) context.addIssue({ code: "custom", path: ["pendingQuestions", index, "id"], message: "待确认事项标识不能重复" });
    questionIds.add(question.id);
  }
});

function timecodeSeconds(value: string) {
  const parts = value.split(":").map(Number);
  if (parts.some(part => !Number.isInteger(part) || part < 0) || parts.length < 2 || parts.length > 3 || parts.at(-1)! >= 60 || parts.length === 3 && parts[1]! >= 60) return;
  return parts.length === 2 ? parts[0]! * 60 + parts[1]! : parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

export async function fingerprintDramaScript(sourceText: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceText));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function validateDramaScriptSource(sourceName: string, sourceText: string, sourceFingerprint = "") {
  if (!/\.(txt|md)$/i.test(sourceName)) throw Object.assign(new Error("仅支持 TXT、MD 剧本文件"), { status: 400 });
  const bytes = new TextEncoder().encode(sourceText).byteLength;
  if (!sourceText.trim() || bytes > sourceMaxBytes) throw Object.assign(new Error("剧本原文必须为 1 MiB 以内的非空文本"), { status: 400 });
  const fingerprint = await fingerprintDramaScript(sourceText);
  if (sourceFingerprint && sourceFingerprint !== fingerprint) throw Object.assign(new Error("剧本原文已变化，请重新运行 AI 分析"), { status: 409 });
  return { sourceName, sourceText, sourceFingerprint: fingerprint };
}

export async function validateDramaScriptImport(sourceName: string, sourceText: string, sourceFingerprint: string, analysis: unknown) {
  return { ...await validateDramaScriptSource(sourceName, sourceText, sourceFingerprint), analysis: dramaScriptAnalysisSchema.parse(analysis) };
}

export async function analyzeDramaScript(input: { sourceName: string; sourceText: string; providerId: string; modelId: string; thinkingLevel?: ThinkingLevel }, signal: AbortSignal) {
  const source = await validateDramaScriptSource(input.sourceName, input.sourceText);
  const configured = await createAgentModel(input.providerId, input.modelId, input.thinkingLevel);
  const parameters = z.toJSONSchema(dramaScriptAnalysisSchema) as TSchema;
  const tools: Tool[] = [{
    name: "submitDramaAnalysis",
    description: "提交完整、可导入 Toonflow 原生画布的剧本结构化分析。必须且只能调用一次；所有字段都必须来自剧本，明确的备选方案必须进入 pendingQuestions。",
    parameters,
    constrainedSampling: { type: "json_schema", strict: "require" },
  }];
  const context: Context = {
    systemPrompt: `你是 Toonflow 的影视剧本结构化分析 Agent。完整阅读用户提供的原始剧本，只通过 submitDramaAnalysis 返回结果，不输出普通文本。

分析规则：
1. 原文是唯一事实来源，不补写原文没有的人物、场景、镜头或资产。
2. 即使主角不露脸或只有第一人称身体局部，也必须建立一个稳定的人物记录，并把所有属于该主观视角的镜头关联到该人物。
3. 合并同一业务场景的别名，但不得把具有不同空间连续性的场景合并。sceneKey、characterKey 使用简短 ASCII 标识，镜头编号统一为 SH001 格式。
4. 每个镜头提取精确起止时间码、时长、场景、人物、景别、机位、运动、动作、画面、声音、静帧提示词和可直接用于 H3 的视频提示词。
5. 人物、场景、静帧与 H3 提示词必须包含原文要求的固定视觉特征、空间位置、色彩、视角、物理动作和负面约束；不得用“同上”省略。
6. referenceAssets 逐项列出需要先制作并审核的参考资产，不把尚未生成的参考资产伪装为已有文件。
7. continuityConstraints 必须覆盖外观、服装、道具、空间布局、色彩、镜头视角、动作或声音的跨镜头约束，并关联适用镜头。
8. 原文出现“或”“可选”“两种方案”等未决定选项时，必须原样保留为 pendingQuestions，提供原文中的选项与需要确认的原因；不得替用户决定。
9. metadata.duration 必须等于最后镜头结束时间；镜头 duration 必须等于起止时间差。独立短片的 episodeNumber 使用 1。`,
    messages: [{
      role: "user",
      content: `文件名：${source.sourceName}\n\n以下是必须完整保留事实的原始剧本：\n\n${source.sourceText}`,
      timestamp: Date.now(),
    }],
    tools,
  };
  const reasoning = configured.effectiveThinkingLevel === "off" ? undefined : configured.effectiveThinkingLevel;
  const response = await configured.runtime.completeSimple(configured.runtimeModel, context, {
    signal,
    toolChoice: "auto",
    reasoning,
    cacheRetention: "none",
    sessionId: crypto.randomUUID(),
    maxTokens: Math.min(configured.runtimeModel.maxTokens, 32000),
  });
  if (response.stopReason === "error" || response.stopReason === "aborted") throw new Error(response.errorMessage || "剧本分析模型请求失败");
  if (response.stopReason === "length") throw new Error("剧本分析输出达到模型长度上限，请缩短剧本后重试");
  const call = response.content.find(part => part.type === "toolCall" && part.name === "submitDramaAnalysis");
  if (!call || call.type !== "toolCall") throw new Error("模型没有返回 Schema 结构化分析，请重试");
  const analysis = dramaScriptAnalysisSchema.parse(validateToolCall(tools, call));
  return {
    sourceFingerprint: source.sourceFingerprint,
    analysis,
    model: { providerId: input.providerId, modelId: input.modelId, label: configured.model.label },
    usage: response.usage,
  };
}
