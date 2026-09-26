// Shared AI execution logic for Cloudflare Pages Functions

export const SYSTEM_PROMPT_EXPERT = `# Role: 资深体系结构与芯片固件/驱动专家

## Profile:
你精通 PCIe、ARM AXI/CHI、CXL、USB、RISC-V 等总线协议与芯片控制器内部架构，擅长将晦涩难懂的硬件规范文档翻译并拆解为工程师易懂的工程实践语言。

## Structure Requirement:
请严格按照以下4个核心模块逐一深度解读：

### 1. 术语与前置背景扫盲（Background & Prerequisite）
### 2. 原文逐段精讲与推导（Line-by-Line Breakdown & Bitfields）
### 3. 工程实战与驱动场景（Real-world Use Case & Driver Code）
### 4. 延伸阅读与避坑指南（Notes & Pitfalls）

## Output Style:
- 结构严谨，排版清晰，善用 Markdown 加粗、列表、表格和代码块。
- 语言硬核、严谨、通俗，逻辑环环相扣。`;

export interface AISettings {
  provider?: 'gemini' | 'openai_compatible';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface Env {
  GEMINI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
}

// Stream AI response as SSE, writing to a TransformStream
export async function streamAIResponse(
  prompt: string,
  systemPrompt: string,
  aiSettings: AISettings | undefined,
  env: Env,
  pageImage?: string
): Promise<ReadableStream> {
  const provider = aiSettings?.provider || (aiSettings?.baseUrl ? 'openai_compatible' : 'gemini');
  const baseUrl = aiSettings?.baseUrl || env.AI_BASE_URL || '';
  const apiKey = aiSettings?.apiKey || env.AI_API_KEY || env.GEMINI_API_KEY || '';
  const model = aiSettings?.model || env.AI_MODEL || (provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o');

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = async (data: object) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  // Run async in background
  (async () => {
    try {
      if (baseUrl) {
        // OpenAI-compatible streaming
        let cleanBaseUrl = baseUrl.replace(/\/+$/, '');
        if (!cleanBaseUrl.endsWith('/v1') && !cleanBaseUrl.includes('/chat/completions')) {
          cleanBaseUrl += '/v1';
        }
        const endpoint = cleanBaseUrl.endsWith('/chat/completions')
          ? cleanBaseUrl
          : `${cleanBaseUrl}/chat/completions`;

        let userContent: any = prompt;
        if (pageImage) {
          const fullImageUrl = pageImage.startsWith('data:') ? pageImage : `data:image/png;base64,${pageImage}`;
          userContent = [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: fullImageUrl } },
          ];
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            stream: true,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
            temperature: 0.3,
          }),
        });

        if (!response.ok || !response.body) {
          await send({ error: `API error: ${response.status}` });
          await writer.close();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                const chunk = parsed.choices?.[0]?.delta?.content;
                if (chunk) await send({ chunk });
              } catch {}
            }
          }
        }
      } else {
        // Gemini native via fetch (no SDK in Workers)
        const geminiModel = model || 'gemini-2.0-flash';
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

        const parts: any[] = [];
        if (pageImage) {
          const cleanBase64 = pageImage.includes(',') ? pageImage.split(',')[1] : pageImage;
          parts.push({ inlineData: { mimeType: 'image/png', data: cleanBase64 } });
        }
        parts.push({ text: prompt });

        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts }],
            generationConfig: { temperature: 0.3 },
          }),
        });

        if (!response.ok || !response.body) {
          await send({ error: `Gemini API error: ${response.status}` });
          await writer.close();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) await send({ chunk: text });
            } catch {}
          }
        }
      }

      await send({ done: true });
      await writer.close();
    } catch (err: any) {
      await send({ error: err?.message || '分析失败' });
      await writer.close();
    }
  })();

  return readable;
}
