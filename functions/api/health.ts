import { Env } from './spec/_shared';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return Response.json({
    status: 'ok',
    hasApiKey: Boolean(env.GEMINI_API_KEY || env.AI_API_KEY),
    timestamp: new Date().toISOString(),
  }, { headers: { 'Access-Control-Allow-Origin': '*' } });
};
