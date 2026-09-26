import { streamAIResponse, SYSTEM_PROMPT_EXPERT, Env } from '../_shared';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const {
    pageImage, pageText, chapterTitle, docName, pageNum, prevPageSummary, userFocus, aiSettings,
  } = await request.json() as any;

  let prompt = `请对文档【${docName || '硬件规范/Datasheet'}】第 ${pageNum || 1} 页进行深度专家解读。\n`;
  if (chapterTitle) prompt += `当前所属章节目录：${chapterTitle}\n`;
  if (prevPageSummary) prompt += `【前置上下文滑动窗口（上一页摘要）】：\n${prevPageSummary}\n\n`;
  if (userFocus) prompt += `【工程师重点关注/划选部分】：\n${userFocus}\n\n`;
  if (pageText) prompt += `【本页提取文本】：\n${pageText}\n\n`;
  prompt += `请参考提供的页面截图（若有时序图、寄存器表、架构图，请结合图中细节精准解读）及提取文本，严格按照系统设定的4大板块输出专业、硬核且易懂的分析。`;

  const stream = await streamAIResponse(prompt, SYSTEM_PROMPT_EXPERT, aiSettings, env, pageImage);

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
