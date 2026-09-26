import { streamAIResponse, SYSTEM_PROMPT_EXPERT, Env } from '../../_shared';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const {
    docName, chapterId, chapterTitle, startPage, endPage, chapterPagesText, userFocus, aiSettings,
  } = await request.json() as any;

  let prompt = `【任务指令】：请对硬件规范书籍【${docName}】的核心章节【${chapterTitle}】（覆盖页码范围：第 ${startPage} 页 至 第 ${endPage} 页）进行资深架构师级别的**整章系统性深度剖析**。\n\n`;
  if (userFocus) prompt += `【工程师重点关注的知识点/痛点】：\n${userFocus}\n\n`;
  if (chapterPagesText) prompt += `【章节原文文本】：\n${chapterPagesText.slice(0, 6000)}\n\n`;
  prompt += `请严格按照系统设定的4大板块输出：1) 术语前置背景 2) 原文精讲与位域推导 3) 工程实战与驱动代码 4) 延伸阅读与避坑指南`;

  const stream = await streamAIResponse(prompt, SYSTEM_PROMPT_EXPERT, aiSettings, env);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
