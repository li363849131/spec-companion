// Cloudflare Pages Functions 全局类型定义
declare global {
  type PagesFunction<Env = any> = (context: {
    request: Request;
    env: Env;
    params: Record<string, string>;
    waitUntil: (promise: Promise<any>) => void;
    next: () => Promise<Response>;
    data: Record<string, unknown>;
  }) => Response | Promise<Response>;
}

export {};
