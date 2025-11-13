// Cloudflare D1 데이터베이스 타입
export type D1Database = any;

// Cloudflare Workers 환경 타입
export type CloudflareEnv = {
  DB: D1Database;
};

// Next.js API 요청 컨텍스트
export type NextContext = {
  params: Promise<Record<string, string>>;
  cloudflare?: {
    env: CloudflareEnv;
  };
};
