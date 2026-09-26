import express, { Request, Response } from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limit for PDF page canvas snapshots (base64 images) and large PDFs
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Lazy initialize Gemini client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not defined in environment.");
    }
    genAIClient = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return genAIClient;
}

const SYSTEM_PROMPT_EXPERT = `# Role: 资深体系结构与芯片固件/驱动专家

## Profile:
你精通 PCIe、ARM AXI/CHI、CXL、USB、RISC-V 等总线协议与芯片控制器内部架构（如 Synopsys DesignWare、Cadence IP 等），擅长将晦涩难懂的硬件规范文档（Spec / Datasheet）翻译并拆解为工程师易懂的工程实践语言。

## Core Philosophy:
拒绝死板的字面机翻！重在讲清“前因后果”、“设计痛点”与“实际工程场景”。站在“老带新”的高级工程师视角进行讲解。

## Structure Requirement:
请严格按照以下4个核心模块逐一深度解读：

### 1. 术语与前置背景扫盲（Background & Prerequisite）
- 提取本页/本段的核心专业术语（如 iATU, TLP, BAR, VALID/READY, HDM 等），用一两句话讲清它们在系统中的真实职责与地位。
- 解释硬件设计者为什么要定义这一节的功能（它解决了什么硬件矛盾、物理限制或协议痛点？如果不做会引发什么后果？）。

### 2. 原文逐段精讲与推导（Line-by-Line Breakdown & Bitfields）
- 按照原文与图表的逻辑顺序拆解核心要点。
- 拒绝纯字面机翻，用通俗、透彻的技术语言指出原文背后的硬件状态机流转、总线信号跳变或逻辑控制行为。
- 如果页面包含寄存器定义、时序图或位域（Bitfields），务必详细讲清每一位在什么工程场景下该写 1 或 0，以及读写的副作用（Write-1-to-Clear 等）。

### 3. 工程实战与驱动场景（Real-world Use Case & Driver Code）
- 结合实际开发场景（如 Linux 内核驱动 drivers/pci/controller/、arm-smmu、DMA 引擎、BIOS/UEFI 初始化、C 语言驱动寄存器配置结构体等），给出一个具体的可落地的代码/配置示例。
- 阐述在什么具体业务场景下，系统工程师或驱动工程师会调用或配置此机制。

### 4. 延伸阅读与避坑指南（Notes & Pitfalls）
- 指出这一特性在实际芯片流片或量产工程中最容易踩的坑（例如：4KB 跨越边界问题、时钟域交叉 CDC 丢失、乱序写后读导致的死锁、硬件 Errata、内存属性与 Cache 一致性等）。
- 提示下一节或相关协议机制的关联点，帮助工程师建立全局体系视角。

## Output Style:
- 结构严谨，排版清晰，善用 Markdown 加粗、列表、表格和代码块（c / bash / text）。
- 语言硬核、严谨、通俗，逻辑环环相扣。`;

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// Helper for unified AI execution (Official Gemini or Custom Relay Gateway)
interface ExecuteAIOptions {
  systemPrompt: string;
  userPrompt: string;
  pageImage?: string;
  aiSettings?: {
    provider?: 'gemini' | 'openai_compatible';
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
}

async function executeAIRequest(options: ExecuteAIOptions): Promise<string> {
  const { systemPrompt, userPrompt, pageImage, aiSettings } = options;

  const provider = aiSettings?.provider || (aiSettings?.baseUrl ? 'openai_compatible' : 'gemini');
  const baseUrl = aiSettings?.baseUrl || process.env.AI_BASE_URL || '';
  const apiKey = aiSettings?.apiKey || process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '';
  const model = aiSettings?.model || process.env.AI_MODEL || (provider === 'gemini' ? 'gemini-3.1-flash-lite' : 'gpt-4o');

  // Case 1: Custom OpenAI-compatible Relay (OneAPI, NewAPI, OpenRouter, FastGPT, vLLM, etc.)
  if (provider === 'openai_compatible' && baseUrl) {
    let cleanBaseUrl = baseUrl.replace(/\/+$/, "");
    if (!cleanBaseUrl.endsWith("/v1") && !cleanBaseUrl.includes("/chat/completions")) {
      cleanBaseUrl += "/v1";
    }
    const endpoint = cleanBaseUrl.endsWith("/chat/completions") 
      ? cleanBaseUrl 
      : `${cleanBaseUrl}/chat/completions`;

    let userContent: any = userPrompt;
    if (pageImage) {
      const fullImageUrl = pageImage.startsWith("data:") 
        ? pageImage 
        : `data:image/png;base64,${pageImage}`;
      userContent = [
        { type: "text", text: userPrompt },
        { type: "image_url", image_url: { url: fullImageUrl } },
      ];
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`中转站响应错误 (${response.status}): ${errorText.slice(0, 300)}`);
    }

    const data: any = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      throw new Error("中转站未返回有效的文本内容");
    }
    return reply;
  }

  // Case 2: Gemini with custom Base URL or default official GenAI SDK
  let ai: GoogleGenAI;
  if (baseUrl) {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        baseUrl,
        headers: { "User-Agent": "aistudio-build" },
      },
    });
  } else {
    ai = getGenAI();
  }

  const parts: any[] = [];
  if (pageImage && typeof pageImage === "string") {
    const cleanBase64 = pageImage.includes(",")
      ? pageImage.split(",")[1]
      : pageImage;
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: cleanBase64,
      },
    });
  }
  parts.push({ text: userPrompt });

  try {
    const result = await ai.models.generateContent({
      model: model || "gemini-3.1-flash-lite",
      contents: parts.length === 1 ? userPrompt : parts,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
      },
    });
    return result.text || "未能生成解读内容。";
  } catch (err: any) {
    if (
      err?.message?.includes("503") || 
      err?.message?.includes("UNAVAILABLE") || 
      err?.message?.includes("high demand") ||
      err?.status === 503
    ) {
      console.warn("Primary model 503 high demand, falling back to gemini-flash-latest...");
      const fallbackResult = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: parts.length === 1 ? userPrompt : parts,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
        },
      });
      return fallbackResult.text || "未能生成解读内容。";
    }
    throw err;
  }
}

// Test AI Connection Endpoint
app.post("/api/spec/test-ai", async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { provider, baseUrl, apiKey, model } = req.body;
    const testResult = await executeAIRequest({
      systemPrompt: "You are an assistant. Answer concisely in one line.",
      userPrompt: "Ping test: please reply 'OK' followed by your model name.",
      aiSettings: { provider, baseUrl, apiKey, model },
    });
    const latencyMs = Date.now() - startTime;
    res.json({
      success: true,
      model: model || (provider === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o'),
      reply: testResult.slice(0, 100),
      latencyMs,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || "连通性测试失败",
      latencyMs: Date.now() - startTime,
    });
  }
});

// Spec Page Explanation API — Streaming SSE version
app.post("/api/spec/explain/stream", async (req: Request, res: Response) => {
  const {
    pageImage,
    pageText,
    chapterTitle,
    docName,
    pageNum,
    prevPageSummary,
    userFocus,
    aiSettings,
  } = req.body;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let userPromptText = `请对文档【${docName || "硬件规范/Datasheet"}】第 ${pageNum || 1} 页进行深度专家解读。\n`;
    if (chapterTitle) userPromptText += `当前所属章节目录：${chapterTitle}\n`;
    if (prevPageSummary) userPromptText += `【前置上下文滑动窗口（上一页摘要）】：\n${prevPageSummary}\n\n`;
    if (userFocus) userPromptText += `【工程师重点关注/划选部分】：\n${userFocus}\n\n`;
    if (pageText) userPromptText += `【本页提取文本】：\n${pageText}\n\n`;
    userPromptText += `请参考提供的页面截图（若有时序图、寄存器表、架构图，请结合图中细节精准解读）及提取文本，严格按照系统设定的4大板块输出专业、硬核且易懂的分析。`;

    const provider = aiSettings?.provider || (aiSettings?.baseUrl ? 'openai_compatible' : 'gemini');
    const baseUrl = aiSettings?.baseUrl || process.env.AI_BASE_URL || '';
    const apiKey = aiSettings?.apiKey || process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '';
    const model = aiSettings?.model || process.env.AI_MODEL || (provider === 'gemini' ? 'gemini-3.1-flash-lite' : 'gpt-4o');

    if (provider === 'openai_compatible' && baseUrl) {
      // OpenAI-compatible streaming
      let cleanBaseUrl = baseUrl.replace(/\/+$/, "");
      if (!cleanBaseUrl.endsWith("/v1") && !cleanBaseUrl.includes("/chat/completions")) cleanBaseUrl += "/v1";
      const endpoint = cleanBaseUrl.endsWith("/chat/completions") ? cleanBaseUrl : `${cleanBaseUrl}/chat/completions`;

      let userContent: any = userPromptText;
      if (pageImage) {
        const fullImageUrl = pageImage.startsWith("data:") ? pageImage : `data:image/png;base64,${pageImage}`;
        userContent = [{ type: "text", text: userPromptText }, { type: "image_url", image_url: { url: fullImageUrl } }];
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, stream: true,
          messages: [{ role: "system", content: SYSTEM_PROMPT_EXPERT }, { role: "user", content: userContent }],
          temperature: 0.3,
        }),
      });

      if (!response.ok || !response.body) {
        send({ error: `API error: ${response.status}` });
        res.end();
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
              if (chunk) send({ chunk });
            } catch {}
          }
        }
      }
    } else {
      // Gemini streaming
      let ai: GoogleGenAI;
      if (baseUrl) {
        ai = new GoogleGenAI({ apiKey, httpOptions: { baseUrl, headers: { "User-Agent": "aistudio-build" } } });
      } else {
        ai = getGenAI();
      }

      const parts: any[] = [];
      if (pageImage && typeof pageImage === "string") {
        const cleanBase64 = pageImage.includes(",") ? pageImage.split(",")[1] : pageImage;
        parts.push({ inlineData: { mimeType: "image/png", data: cleanBase64 } });
      }
      parts.push({ text: userPromptText });

      const stream = await ai.models.generateContentStream({
        model: model || "gemini-3.1-flash-lite",
        contents: parts.length === 1 ? userPromptText : parts,
        config: { systemInstruction: SYSTEM_PROMPT_EXPERT, temperature: 0.3 },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) send({ chunk: text });
      }
    }

    send({ done: true });
    res.end();
  } catch (err: any) {
    send({ error: err?.message || "流式生成失败" });
    res.end();
  }
});

// Chapter Explanation API — Streaming SSE version
app.post("/api/spec/chapter-explain/stream", async (req: Request, res: Response) => {
  const {
    docName,
    chapterId,
    chapterTitle,
    startPage,
    endPage,
    chapterPagesText,
    userFocus,
    aiSettings,
  } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let prompt = `【任务指令】：请对硬件规范书籍【${docName}】的核心章节【${chapterTitle}】（覆盖页码范围：第 ${startPage} 页 至 第 ${endPage} 页）进行资深架构师级别的**整章系统性深度剖析**。\n\n`;
    if (userFocus) prompt += `【工程师重点关注的知识点/痛点】：\n${userFocus}\n\n`;
    if (chapterPagesText) prompt += `【章节原文文本】：\n${chapterPagesText.slice(0, 6000)}\n\n`;
    prompt += `请严格按照系统设定的4大板块输出：1) 术语前置背景 2) 原文精讲与位域推导 3) 工程实战与驱动代码 4) 延伸阅读与避坑指南`;

    const provider = aiSettings?.provider || (aiSettings?.baseUrl ? 'openai_compatible' : 'gemini');
    const baseUrl = aiSettings?.baseUrl || process.env.AI_BASE_URL || '';
    const apiKey = aiSettings?.apiKey || process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '';
    const model = aiSettings?.model || process.env.AI_MODEL || (provider === 'gemini' ? 'gemini-3.1-flash-lite' : 'gpt-4o');

    if (provider === 'openai_compatible' && baseUrl) {
      let cleanBaseUrl = baseUrl.replace(/\/+$/, "");
      if (!cleanBaseUrl.endsWith("/v1") && !cleanBaseUrl.includes("/chat/completions")) cleanBaseUrl += "/v1";
      const endpoint = cleanBaseUrl.endsWith("/chat/completions") ? cleanBaseUrl : `${cleanBaseUrl}/chat/completions`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, stream: true,
          messages: [{ role: "system", content: SYSTEM_PROMPT_EXPERT }, { role: "user", content: prompt }],
          temperature: 0.3,
        }),
      });

      if (!response.ok || !response.body) { send({ error: `API error: ${response.status}` }); res.end(); return; }

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
              if (chunk) send({ chunk });
            } catch {}
          }
        }
      }
    } else {
      let ai: GoogleGenAI;
      if (baseUrl) {
        ai = new GoogleGenAI({ apiKey, httpOptions: { baseUrl, headers: { "User-Agent": "aistudio-build" } } });
      } else {
        ai = getGenAI();
      }

      const stream = await ai.models.generateContentStream({
        model: model || "gemini-3.1-flash-lite",
        contents: prompt,
        config: { systemInstruction: SYSTEM_PROMPT_EXPERT, temperature: 0.3 },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) send({ chunk: text });
      }
    }

    send({ done: true });
    res.end();
  } catch (err: any) {
    send({ error: err?.message || "章节分析失败" });
    res.end();
  }
});

// Spec Page Explanation API (non-streaming, kept for compatibility)
app.post("/api/spec/explain", async (req: Request, res: Response) => {
  try {
    const {
      pageImage,
      pageText,
      chapterTitle,
      docName,
      pageNum,
      prevPageSummary,
      userFocus,
      aiSettings,
    } = req.body;

    let userPromptText = `请对文档【${docName || "硬件规范/Datasheet"}】第 ${pageNum || 1} 页进行深度专家解读。\n`;
    if (chapterTitle) {
      userPromptText += `当前所属章节目录：${chapterTitle}\n`;
    }
    if (prevPageSummary) {
      userPromptText += `【前置上下文滑动窗口（上一页摘要）】：\n${prevPageSummary}\n\n`;
    }
    if (userFocus) {
      userPromptText += `【工程师重点关注/划选部分】：\n${userFocus}\n\n`;
    }
    if (pageText) {
      userPromptText += `【本页提取文本】：\n${pageText}\n\n`;
    }

    userPromptText += `请参考提供的页面截图（若有时序图、寄存器表、架构图，请结合图中细节精准解读）及提取文本，严格按照系统设定的4大板块输出专业、硬核且易懂的分析。`;

    const markdownResult = await executeAIRequest({
      systemPrompt: SYSTEM_PROMPT_EXPERT,
      userPrompt: userPromptText,
      pageImage,
      aiSettings,
    });

    res.json({
      success: true,
      markdown: markdownResult,
      pageNum,
      docName,
      chapterTitle,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error generating spec explanation:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "生成解读失败，请检查网络或 API 配置。",
    });
  }
});

// Targeted Q&A / Deep-Dive API for highlighted text or queries
app.post("/api/spec/qa", async (req: Request, res: Response) => {
  try {
    const {
      question,
      selectedText,
      pageContext,
      chapterTitle,
      docName,
      aiSettings,
    } = req.body;

    let prompt = `作为资深芯片体系结构与固件工程师，请解答以下针对【${docName || "硬件文档"}】的具体问题：\n`;
    if (chapterTitle) prompt += `章节：${chapterTitle}\n`;
    if (selectedText) prompt += `工程师在文档中划选的内容：\n"""\n${selectedText}\n"""\n\n`;
    if (pageContext) prompt += `页面背景摘要：\n${pageContext.slice(0, 1000)}\n\n`;
    prompt += `问题：${question}\n\n请直接切中要害，从底层硬件时序、总线协议逻辑、驱动寄存器交互或硬件坑点角度给出硬核而透彻的解释。`;

    const answer = await executeAIRequest({
      systemPrompt: SYSTEM_PROMPT_EXPERT,
      userPrompt: prompt,
      aiSettings,
    });

    res.json({
      success: true,
      answer,
    });
  } catch (error: any) {
    console.error("Error in spec Q&A:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "追问回答失败，请稍后重试。",
    });
  }
});

// Chapter-level Architectural Deep Dive API (Chapter-First Analysis Engine)
app.post("/api/spec/chapter-explain", async (req: Request, res: Response) => {
  try {
    const {
      docName,
      chapterId,
      chapterTitle,
      startPage,
      endPage,
      chapterText,
      pageImage,
      userFocus,
      aiSettings,
    } = req.body;

    let prompt = `【任务指令】：请对硬件规范书籍【${docName}】的核心章节【${chapterTitle}】（覆盖页码范围：第 ${startPage} 页 至 第 ${endPage} 页）进行资深架构师级别的**整章系统性深度剖析**。\n\n`;

    if (userFocus) {
      prompt += `【工程师重点关注的知识点/痛点】：\n${userFocus}\n\n`;
    }

    if (chapterText) {
      prompt += `【本章节核心文本提取摘要（截取前 4000 字符）】：\n${chapterText.slice(0, 4000)}\n\n`;
    }

    prompt += `请严格遵循 senior chip architect 视角，输出以下 5 个模块的深度研读分析：
1. 🏛️ **章节全局定位与设计初衷（Architectural Motivation）**：为什么该协议必须设立本章这一层级？它解决了硬件拓扑上的什么核心物理矛盾或总线痛点？
2. 🔄 **核心状态机与协议报文格式（State Machine & Frame/Packet Format）**：详细剖析状态迁移条件、握手信号（Valid/Ready、Credit、Ack/Nak）或 Flit/TLP 报文各字段设计。
3. ⚙️ **关键寄存器位域与配置映射（Registers, Bitfields & Side Effects）**：列出核心控制与状态寄存器，说明哪些位是写1清零 (W1C)、哪些位影响硬件总线行为。
4. 🐧 **Linux 内核驱动实战与落地代码（Linux Kernel Drivers & C Snippet）**：给出在 Linux 内核（如 PCI 子系统、DMA 引擎或 ARM SoC 驱动）中的典型驱动初始化或配置代码片段。
5. ⚠️ **流片避坑指南与常见 Errata（Hardware Errata & Pitfalls）**：指出时钟域交叉 (CDC)、跨 4KB 边界、乱序死锁、Cache 一致性等最容易踩坑的硬件工程盲区。`;

    const markdownResult = await executeAIRequest({
      systemPrompt: SYSTEM_PROMPT_EXPERT,
      userPrompt: prompt,
      pageImage,
      aiSettings,
    });

    res.json({
      success: true,
      chapterId,
      chapterTitle,
      startPage,
      endPage,
      markdown: markdownResult,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Error generating chapter explanation:", err);
    res.status(500).json({
      success: false,
      error: err?.message || "章节深度剖析失败",
    });
  }
});

// AI Intelligent TOC / Chapter Scanner API
app.post("/api/spec/scan-toc", async (req: Request, res: Response) => {
  try {
    const { docName, totalPages, frontPagesText, aiSettings } = req.body;

    const prompt = `你是一个专业的 PDF 书籍目录识别专家。请根据以下来自【${docName}】（总页数：${totalPages}）前言及前几页提取的文本，提取或推断出结构化的章节目录列表。
文本内容：
"""
${(frontPagesText || "").slice(0, 4000)}
"""

请直接输出一个符合以下 JSON 格式的数组，不要包含任何额外的 markdown 标签或非 JSON 字符：
[
  { "id": "ch_1", "title": "第 1 章: ...", "startPage": 1, "endPage": 10, "level": 1 },
  { "id": "ch_2", "title": "第 2 章: ...", "startPage": 11, "endPage": 25, "level": 1 }
]`;

    const result = await executeAIRequest({
      systemPrompt: "You are a JSON generator. Output valid JSON only.",
      userPrompt: prompt,
      aiSettings,
    });

    try {
      const cleanJson = result.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const chapters = JSON.parse(cleanJson);
      res.json({ success: true, chapters });
    } catch {
      res.json({ success: false, error: "Failed to parse JSON", raw: result });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "扫描目录失败" });
  }
});

// R2 Upload Proxy - Server-side upload to bypass CORS
app.post("/api/r2/upload", async (req: Request, res: Response) => {
  try {
    const { docId, pdfBase64, config, category = 'uncategorized' } = req.body;

    if (!docId || !pdfBase64 || !config) {
      res.status(400).json({ success: false, error: 'Missing required parameters' });
      return;
    }

    // Decode base64 PDF
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    // Import crypto for AWS Signature V4
    const crypto = await import('crypto');

    const fileName = `${category}/${docId}.pdf`;
    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucketName}/${fileName}`;

    // Calculate SHA256 of PDF
    const payloadHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const path = urlObj.pathname;

    // Build canonical request
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `PUT\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    // String to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    // Calculate signature
    let kDate = crypto.createHmac('sha256', `AWS4${config.secretAccessKey}`).update(dateStamp).digest();
    let kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
    let kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    let kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    // Authorization header
    const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // Upload to R2
    const uploadResponse = await fetch(url, {
      method: 'PUT',
      headers: {
        'Host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Content-Type': 'application/pdf',
        'Authorization': authorization,
      },
      body: pdfBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      res.status(uploadResponse.status).json({ success: false, error: errorText });
      return;
    }

    res.json({ success: true, r2Path: fileName });
  } catch (err: any) {
    console.error('R2 upload proxy error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// R2 Upload JSON (for analysis cache sync)
app.post("/api/r2/upload-json", async (req: Request, res: Response) => {
  try {
    const { fileName, jsonBase64, config } = req.body;

    if (!fileName || !jsonBase64 || !config) {
      res.status(400).json({ success: false, error: 'Missing required parameters' });
      return;
    }

    // Decode base64 JSON
    const jsonBuffer = Buffer.from(jsonBase64, 'base64');

    // Import crypto for AWS Signature V4
    const crypto = await import('crypto');

    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucketName}/${fileName}`;

    // Calculate SHA256
    const payloadHash = crypto.createHash('sha256').update(jsonBuffer).digest('hex');

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const path = urlObj.pathname;

    // Build canonical request
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `PUT\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    // String to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    // Calculate signature
    let kDate = crypto.createHmac('sha256', `AWS4${config.secretAccessKey}`).update(dateStamp).digest();
    let kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
    let kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    let kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    // Authorization header
    const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // Upload to R2
    const uploadResponse = await fetch(url, {
      method: 'PUT',
      headers: {
        'Host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Content-Type': 'application/json',
        'Authorization': authorization,
      },
      body: jsonBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      res.status(uploadResponse.status).json({ success: false, error: errorText });
      return;
    }

    res.json({ success: true, r2Path: fileName });
  } catch (err: any) {
    console.error('R2 JSON upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// R2 List Analysis Files
app.post("/api/r2/list-analysis", async (req: Request, res: Response) => {
  try {
    const { docId, config } = req.body;

    if (!docId || !config) {
      res.status(400).json({ success: false, error: 'Missing required parameters' });
      return;
    }

    const crypto = await import('crypto');

    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const prefix = `analysis/${docId}/`;
    const url = `${endpoint}/${config.bucketName}/?prefix=${encodeURIComponent(prefix)}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const path = urlObj.pathname + urlObj.search;

    const payloadHash = crypto.createHash('sha256').update('').digest('hex');

    // Build canonical request
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `GET\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    // String to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    // Calculate signature
    let kDate = crypto.createHmac('sha256', `AWS4${config.secretAccessKey}`).update(dateStamp).digest();
    let kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
    let kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    let kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    // Authorization header
    const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // List objects in R2
    const listResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Authorization': authorization,
      },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      res.status(listResponse.status).json({ success: false, error: errorText });
      return;
    }

    const xmlText = await listResponse.text();

    // Parse XML to extract keys
    const keyMatches = xmlText.match(/<Key>([^<]+)<\/Key>/g) || [];
    const files = keyMatches.map(m => m.replace(/<Key>|<\/Key>/g, ''));

    res.json({ success: true, files });
  } catch (err: any) {
    console.error('R2 list analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// R2 Download Proxy - Server-side download to bypass CORS
app.post("/api/r2/download", async (req: Request, res: Response) => {
  try {
    console.log('R2 download request received');
    const { r2Path, config } = req.body;

    if (!r2Path || !config) {
      console.error('Missing required parameters:', { r2Path: !!r2Path, config: !!config });
      res.status(400).json({ success: false, error: 'Missing required parameters' });
      return;
    }

    console.log('Downloading from R2:', r2Path);

    const crypto = await import('crypto');

    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucketName}/${r2Path}`;
    console.log('R2 URL:', url);

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const path = urlObj.pathname;

    const payloadHash = crypto.createHash('sha256').update('').digest('hex');

    // Build canonical request
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `GET\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    // String to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    // Calculate signature
    let kDate = crypto.createHmac('sha256', `AWS4${config.secretAccessKey}`).update(dateStamp).digest();
    let kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
    let kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    let kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    // Authorization header
    const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    console.log('Fetching from R2...');

    // Download from R2
    const downloadResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Authorization': authorization,
      },
    });

    console.log('R2 response status:', downloadResponse.status);

    if (!downloadResponse.ok) {
      const errorText = await downloadResponse.text();
      console.error('R2 download failed:', errorText);
      res.status(downloadResponse.status).json({ success: false, error: errorText });
      return;
    }

    const buffer = await downloadResponse.arrayBuffer();
    console.log('Downloaded buffer size:', buffer.byteLength);

    const base64Data = Buffer.from(buffer).toString('base64');
    console.log('Base64 data length:', base64Data.length);

    res.json({ success: true, base64Data });
  } catch (err: any) {
    console.error('R2 download proxy error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// R2 List All Objects - List all objects in bucket (for finding analysis files)
app.post("/api/r2/list-all", async (req: Request, res: Response) => {
  try {
    console.log('R2 list-all request received');
    const { config } = req.body;

    if (!config) {
      res.status(400).json({ success: false, error: 'Missing config' });
      return;
    }

    console.log('R2 config:', { accountId: config.accountId, bucketName: config.bucketName });

    const crypto = await import('crypto');

    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucketName}/`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const path = urlObj.pathname;

    const payloadHash = crypto.createHash('sha256').update('').digest('hex');

    // Build canonical request
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `GET\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    // String to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    // Calculate signature
    let kDate = crypto.createHmac('sha256', `AWS4${config.secretAccessKey}`).update(dateStamp).digest();
    let kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
    let kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    let kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    // Authorization header
    const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // List objects
    const listResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Authorization': authorization,
      },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error('R2 list failed:', errorText);
      res.status(listResponse.status).json({ success: false, error: errorText });
      return;
    }

    const xmlText = await listResponse.text();
    const keys: string[] = [];

    // Parse XML to extract keys
    const keyMatches = xmlText.matchAll(/<Key>(.*?)<\/Key>/g);
    for (const match of keyMatches) {
      keys.push(match[1]);
    }

    console.log('Found', keys.length, 'objects');

    res.json({ success: true, keys });
  } catch (err: any) {
    console.error('R2 list-all error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// R2 List Documents - List all PDF files from R2
app.post("/api/r2/list-documents", async (req: Request, res: Response) => {
  try {
    console.log('R2 list-documents request received');
    const { config } = req.body;

    if (!config) {
      console.error('Missing config in request');
      res.status(400).json({ success: false, error: 'Missing config' });
      return;
    }

    console.log('R2 config:', { accountId: config.accountId, bucketName: config.bucketName });

    const crypto = await import('crypto');

    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucketName}/`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const path = urlObj.pathname;

    const payloadHash = crypto.createHash('sha256').update('').digest('hex');

    // Build canonical request
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `GET\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    // String to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    // Calculate signature
    let kDate = crypto.createHmac('sha256', `AWS4${config.secretAccessKey}`).update(dateStamp).digest();
    let kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
    let kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    let kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    // Authorization header
    const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // List objects in R2
    const listResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Authorization': authorization,
      },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      res.status(listResponse.status).json({ success: false, error: errorText });
      return;
    }

    const xmlText = await listResponse.text();

    // Parse XML to extract PDF files with category info
    const keyMatches = xmlText.match(/<Key>([^<]+\.pdf)<\/Key>/g) || [];
    const sizeMatches = xmlText.match(/<Size>(\d+)<\/Size>/g) || [];
    const modifiedMatches = xmlText.match(/<LastModified>([^<]+)<\/LastModified>/g) || [];

    const documents = keyMatches.map((keyMatch, index) => {
      const key = keyMatch.replace(/<Key>|<\/Key>/g, '');
      const parts = key.split('/');

      // Parse path: category/docId.pdf
      let category = 'uncategorized';
      let fileName = key;

      if (parts.length === 2) {
        category = parts[0];
        fileName = parts[1];
      }

      const docId = fileName.replace('.pdf', '');
      const size = sizeMatches[index] ? parseInt(sizeMatches[index].replace(/<Size>|<\/Size>/g, ''), 10) : 0;
      const lastModified = modifiedMatches[index] ? modifiedMatches[index].replace(/<LastModified>|<\/LastModified>/g, '') : '';

      return {
        docId,
        category,
        fileName,
        r2Path: key,
        size,
        lastModified,
      };
    });

    res.json({ success: true, documents });
  } catch (err: any) {
    console.error('R2 list documents error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upload metadata bundle to R2
app.post("/api/r2/upload-metadata-bundle", async (req: Request, res: Response) => {
  try {
    const { metadata, config } = req.body;

    if (!metadata || !config) {
      res.status(400).json({ success: false, error: 'Missing metadata or config' });
      return;
    }

    const crypto = await import('crypto');
    const metadataJson = JSON.stringify(metadata);
    const metadataBuffer = Buffer.from(metadataJson, 'utf-8');

    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const objectKey = 'metadata/all-documents.json';
    const url = `${endpoint}/${config.bucketName}/${objectKey}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const path = urlObj.pathname;

    const payloadHash = crypto.createHash('sha256').update(metadataBuffer).digest('hex');

    const canonicalRequest = `PUT\n${path}\n\ncontent-length:${metadataBuffer.length}\ncontent-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n\ncontent-length;content-type;host;x-amz-content-sha256;x-amz-date\n${payloadHash}`;

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    let kDate = crypto.createHmac('sha256', `AWS4${config.secretAccessKey}`).update(dateStamp).digest();
    let kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
    let kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    let kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=content-length;content-type;host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Host': host,
        'Content-Type': 'application/json',
        'Content-Length': metadataBuffer.length.toString(),
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Authorization': authorization,
      },
      body: metadataBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('R2 upload metadata bundle failed:', errorText);
      res.status(500).json({ success: false, error: `Upload failed: ${response.statusText}` });
      return;
    }

    console.log('Metadata bundle uploaded successfully to R2');
    res.json({ success: true, r2Path: objectKey });
  } catch (err: any) {
    console.error('Upload metadata bundle error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download metadata bundle from R2
app.post("/api/r2/download-metadata-bundle", async (req: Request, res: Response) => {
  try {
    const { config } = req.body;

    if (!config) {
      res.status(400).json({ success: false, error: 'Missing config' });
      return;
    }

    const crypto = await import('crypto');
    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const objectKey = 'metadata/all-documents.json';
    const url = `${endpoint}/${config.bucketName}/${objectKey}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const path = urlObj.pathname;

    const payloadHash = crypto.createHash('sha256').update('').digest('hex');

    const canonicalRequest = `GET\n${path}\n\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n\nhost;x-amz-content-sha256;x-amz-date\n${payloadHash}`;

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    let kDate = crypto.createHmac('sha256', `AWS4${config.secretAccessKey}`).update(dateStamp).digest();
    let kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
    let kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    let kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Host': host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Authorization': authorization,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('R2 download metadata bundle failed:', errorText);
      res.status(404).json({ success: false, error: 'Metadata bundle not found' });
      return;
    }

    const metadataJson = await response.text();
    const metadata = JSON.parse(metadataJson);

    console.log('Metadata bundle downloaded successfully from R2');
    res.json({ success: true, data: metadata });
  } catch (err: any) {
    console.error('Download metadata bundle error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Vite middleware & Production static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Spec Companion server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
