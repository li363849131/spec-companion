import { SYSTEM_PROMPT_EXPERT, Env, AISettings } from './_shared';

async function executeAI(prompt: string, systemPrompt: string, aiSettings: AISettings | undefined, env: Env): Promise<string> {
  const provider = aiSettings?.provider || (aiSettings?.baseUrl ? 'openai_compatible' : 'gemini');
  const baseUrl = aiSettings?.baseUrl || env.AI_BASE_URL || '';
  const apiKey = aiSettings?.apiKey || env.AI_API_KEY || env.GEMINI_API_KEY || '';
  const model = aiSettings?.model || env.AI_MODEL || (provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o');

  if (baseUrl) {
    let cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    if (!cleanBaseUrl.endsWith('/v1') && !cleanBaseUrl.includes('/chat/completions')) cleanBaseUrl += '/v1';
    const endpoint = cleanBaseUrl.endsWith('/chat/completions') ? cleanBaseUrl : `${cleanBaseUrl}/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });
    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '未能生成回答';
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`;
  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  const data: any = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '未能生成回答';
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const { question, selectedText, pageContext, chapterTitle, docName, aiSettings } = await request.json() as any;

    let prompt = `作为资深芯片体系结构与固件工程师，请解答以下针对【${docName || '硬件文档'}】的具体问题：\n`;
    if (chapterTitle) prompt += `章节：${chapterTitle}\n`;
    if (selectedText) prompt += `工程师在文档中划选的内容：\n"""\n${selectedText}\n"""\n\n`;
    if (pageContext) prompt += `页面背景摘要：\n${pageContext.slice(0, 1000)}\n\n`;
    prompt += `问题：${question}\n\n请直接切中要害，从底层硬件时序、总线协议逻辑、驱动寄存器交互或硬件坑点角度给出硬核而透彻的解释。`;

    const answer = await executeAI(prompt, SYSTEM_PROMPT_EXPERT, aiSettings, env);

    return Response.json({ success: true, answer }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return Response.json({ success: false, error: err?.message }, { status: 500 });
  }
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
