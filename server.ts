import express, { Request, Response } from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limit for PDF page canvas snapshots (base64 images)
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

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

// Spec Page Explanation API
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
