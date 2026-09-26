import { Env, AISettings } from './_shared';

async function executeAI(prompt: string, systemPrompt: string, aiSettings: AISettings | undefined, env: Env): Promise<string> {
  const baseUrl = aiSettings?.baseUrl || env.AI_BASE_URL || '';
  const apiKey = aiSettings?.apiKey || env.AI_API_KEY || env.GEMINI_API_KEY || '';
  const model = aiSettings?.model || env.AI_MODEL || 'gemini-2.0-flash';

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
        temperature: 0.1,
      }),
    });
    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '[]';
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  const data: any = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const { docName, totalPages, frontPagesText, aiSettings } = await request.json() as any;

    const prompt = `你是一个专业的 PDF 书籍目录识别专家。请根据以下来自【${docName}】（总页数：${totalPages}）前言及前几页提取的文本，提取或推断出结构化的章节目录列表。
文本内容：
"""
${(frontPagesText || '').slice(0, 4000)}
"""

请直接输出一个符合以下 JSON 格式的数组，不要包含任何额外的 markdown 标签或非 JSON 字符：
[
  { "id": "ch_1", "title": "第 1 章: ...", "startPage": 1, "endPage": 10, "level": 1 }
]`;

    const result = await executeAI(prompt, 'You are a JSON generator. Output valid JSON only.', aiSettings, env);

    const cleanJson = result.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const chapters = JSON.parse(cleanJson);
    return Response.json({ success: true, chapters }, { headers: { 'Access-Control-Allow-Origin': '*' } });
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
