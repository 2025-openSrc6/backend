/**
 * UUID 생성 유틸리티
 *
 * 환경에 따라 적절한 UUID 생성 방법을 선택합니다.
 */

/**
 * UUID v4 생성
 *
 * - Cloudflare Workers/최신 Node.js: crypto.randomUUID() 사용
 * - 이전 Node.js: crypto 모듈의 randomUUID 사용
 * - Fallback: RFC4122 준수 UUID v4 생성
 *
 * @returns UUID v4 문자열
 *
 * @example
 * const id = generateUUID();
 * // "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateUUID(): string {
  // 전역 crypto 객체가 있고 randomUUID 메서드가 있으면 사용
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Node.js 환경에서 crypto 모듈 사용
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomUUID } = require('crypto') as typeof import('crypto');
    return randomUUID();
  } catch {
    // Fallback: 간단한 UUID v4 생성 (RFC4122 준수)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
