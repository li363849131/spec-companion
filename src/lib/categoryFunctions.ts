// Category management functions for db.ts

export const DEFAULT_CATEGORIES: BookCategory[] = [
  {
    id: 'pcie',
    name: 'PCIe 互连协议',
    description: 'PCI Express 总线协议规范',
    color: 'from-blue-600 to-cyan-600',
    icon: 'Cpu',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'arm',
    name: 'ARM 体系结构',
    description: 'ARM 架构与 AMBA 总线协议',
    color: 'from-emerald-600 to-teal-600',
    icon: 'Layers',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cxl',
    name: 'CXL 内存池化',
    description: 'Compute Express Link 协议',
    color: 'from-purple-600 to-pink-600',
    icon: 'Database',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'usb',
    name: 'USB/外设接口',
    description: 'USB 与其他外设接口协议',
    color: 'from-amber-600 to-orange-600',
    icon: 'Zap',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'custom',
    name: '自定义上传',
    description: '用户上传的文档',
    color: 'from-slate-600 to-gray-600',
    icon: 'Upload',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

// Get all categories for a user
export async function getAllCategories(userId = getActiveUserId()): Promise<BookCategory[]> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'categories')) return DEFAULT_CATEGORIES;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('categories', 'readonly');
        const store = tx.objectStore('categories');
        const request = store.getAll();

        request.onsuccess = () => {
          const userCategories = (request.result || []) as BookCategory[];
          // Merge default categories with user custom ones
          const allCategories = [...DEFAULT_CATEGORIES];
          userCategories.forEach((cat) => {
            const existingIndex = allCategories.findIndex((c) => c.id === cat.id);
            if (existingIndex >= 0) {
              allCategories[existingIndex] = cat;
            } else {
              allCategories.push(cat);
            }
          });
          resolve(allCategories);
        };

        request.onerror = () => resolve(DEFAULT_CATEGORIES);
      } catch {
        resolve(DEFAULT_CATEGORIES);
      }
    });
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

// Save a category
export async function saveCategory(category: BookCategory): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'categories')) return;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('categories', 'readwrite');
        const store = tx.objectStore('categories');
        const request = store.put(category);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (err) {
    console.error('Failed to save category', err);
  }
}

// Delete a category (only custom ones)
export async function deleteCategory(categoryId: string): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'categories')) return;

    // Don't allow deleting built-in categories
    const categories = await getAllCategories();
    const category = categories.find((c) => c.id === categoryId);
    if (category?.isBuiltIn) {
      throw new Error('Cannot delete built-in category');
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('categories', 'readwrite');
        const store = tx.objectStore('categories');
        const request = store.delete(categoryId);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (err) {
    console.error('Failed to delete category', err);
    throw err;
  }
}
