// 自动生成PDF目录的工具函数

import { OutlineItem } from '../types';

/**
 * 为没有目录的PDF生成基于页码的简单目录
 */
export function generateSimpleOutline(totalPages: number): OutlineItem[] {
  const outline: OutlineItem[] = [];

  // 每10页生成一个分组
  const pagesPerSection = 10;
  const sections = Math.ceil(totalPages / pagesPerSection);

  for (let i = 0; i < sections; i++) {
    const startPage = i * pagesPerSection + 1;
    const endPage = Math.min((i + 1) * pagesPerSection, totalPages);

    outline.push({
      id: `section_${i}`,
      title: `第 ${startPage}-${endPage} 页`,
      pageNumber: startPage,
      level: 0,
      children: generatePageItems(startPage, endPage),
    });
  }

  return outline;
}

/**
 * 生成页码列表
 */
function generatePageItems(startPage: number, endPage: number): OutlineItem[] {
  const items: OutlineItem[] = [];

  for (let page = startPage; page <= endPage; page++) {
    items.push({
      id: `page_${page}`,
      title: `第 ${page} 页`,
      pageNumber: page,
      level: 1,
      children: [],
    });
  }

  return items;
}

/**
 * 检查PDF是否有目录
 */
export function hasValidOutline(outline: OutlineItem[]): boolean {
  return outline && outline.length > 0;
}
