import { ChapterItem, OutlineItem, SpecDocument } from '../types';

/**
 * Normalizes an outline into structured ChapterItem with [startPage, endPage] bounds.
 */
export function buildChaptersFromOutline(outline: OutlineItem[], totalPages: number): ChapterItem[] {
  if (!outline || outline.length === 0) {
    return generateDefaultChapters(totalPages);
  }

  // Flatten outline
  const flatItems: { id: string; title: string; pageNumber: number; level: number }[] = [];
  function traverse(items: OutlineItem[], currentLevel = 1) {
    for (const item of items) {
      flatItems.push({
        id: item.id || `ch_${item.pageNumber}_${flatItems.length}`,
        title: item.title,
        pageNumber: Math.max(1, Math.min(item.pageNumber, totalPages)),
        level: currentLevel,
      });
      if (item.children && item.children.length > 0) {
        traverse(item.children, currentLevel + 1);
      }
    }
  }
  traverse(outline, 1);

  // If still empty
  if (flatItems.length === 0) {
    return generateDefaultChapters(totalPages);
  }

  // Sort by page number
  flatItems.sort((a, b) => a.pageNumber - b.pageNumber);

  // De-duplicate same page numbers with different sub-levels if needed, or keep primary chapters (level 1-2)
  const primaryChapters = flatItems.filter((item) => item.level <= 2);
  const sourceChapters = primaryChapters.length >= 2 ? primaryChapters : flatItems;

  const result: ChapterItem[] = [];
  for (let i = 0; i < sourceChapters.length; i++) {
    const current = sourceChapters[i];
    const next = sourceChapters[i + 1];
    const startPage = current.pageNumber;
    const endPage = next ? Math.max(startPage, next.pageNumber - 1) : totalPages;

    result.push({
      id: current.id || `ch_${startPage}`,
      title: current.title.trim() || `第 ${startPage} 页对应章节`,
      startPage,
      endPage,
      level: current.level,
    });
  }

  return result;
}

/**
 * Fallback chapter generator for PDFs without embedded outlines.
 */
export function generateDefaultChapters(totalPages: number): ChapterItem[] {
  const safeTotal = Math.max(1, totalPages);
  if (safeTotal <= 5) {
    return [
      {
        id: 'ch_1',
        title: '第 1 章: 核心规范与架构设计概述',
        startPage: 1,
        endPage: safeTotal,
        level: 1,
      },
    ];
  }

  // Create 4 to 8 logical chapter blocks
  const blockSize = Math.max(3, Math.ceil(safeTotal / 6));
  const chapters: ChapterItem[] = [];
  const titles = [
    '第 1 章: 架构背景、术语定义与系统拓扑',
    '第 2 章: 事务层与核心协议报文格式 (TLP/Packets)',
    '第 3 章: 硬件控制器状态机与链路训练 (LTSSM)',
    '第 4 章: 关键寄存器、位域映射与配置空间 (BAR/iATU)',
    '第 5 章: 物理层电气特性、时钟域与编码方案 (PAM4/Flit)',
    '第 6 章: Linux 内核驱动实现、DMA 引擎与工程避坑',
    '第 7 章: 附录与系统验证测试指南',
  ];

  let currentStart = 1;
  let idx = 0;
  while (currentStart <= safeTotal) {
    const currentEnd = Math.min(safeTotal, currentStart + blockSize - 1);
    const title = titles[idx] || `第 ${idx + 1} 章节 (P${currentStart}-P${currentEnd})`;
    chapters.push({
      id: `auto_ch_${idx + 1}`,
      title,
      startPage: currentStart,
      endPage: currentEnd,
      level: 1,
    });
    currentStart = currentEnd + 1;
    idx++;
  }

  return chapters;
}

/**
 * Finds which chapter contains the specified page number.
 */
export function findChapterByPage(chapters: ChapterItem[], pageNum: number): ChapterItem | null {
  if (!chapters || chapters.length === 0) return null;
  const found = chapters.find((ch) => pageNum >= ch.startPage && pageNum <= ch.endPage);
  return found || chapters[0] || null;
}
