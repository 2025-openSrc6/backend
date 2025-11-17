/**
 * 의존성 조립 파일
 *
 * Service/Repository를 어떻게 조립할지 한 곳에서 정의합니다.
 * "new RoundService(뭐 넣지?)" → 여기서 결정
 *
 * 역할:
 * 1. 의존성 조립: Repository를 Service에 주입
 * 2. 인스턴스 재사용: 첫 호출 시 생성, 이후 재사용
 * 3. 테스트 지원: Mock으로 교체 가능
 */

import { RoundRepository } from './rounds/repository';
import { RoundService } from './rounds/service';

/**
 * 의존성 조립을 담당하는 클래스
 */
class ServiceRegistry {
  // Repository 인스턴스
  private _roundRepository?: RoundRepository;

  get roundRepository(): RoundRepository {
    if (!this._roundRepository) {
      this._roundRepository = new RoundRepository();
    }
    return this._roundRepository;
  }

  // Service 인스턴스 (Repository 주입)
  private _roundService?: RoundService;

  get roundService(): RoundService {
    if (!this._roundService) {
      // ✅ 의존성 조립: Repository를 Service에 넣어줌
      this._roundService = new RoundService(this.roundRepository);
    }
    return this._roundService;
  }

  // 테스트용: Mock으로 교체
  setRoundRepository(repository: RoundRepository): void {
    this._roundRepository = repository;
    this._roundService = undefined; // Repository 변경 시 Service도 재생성
  }

  setRoundService(service: RoundService): void {
    this._roundService = service;
  }

  // 테스트용: 초기화
  reset(): void {
    this._roundRepository = undefined;
    this._roundService = undefined;
  }

  // 향후 확장: Bets, Users 등
  // get betService(): BetService { return new BetService(this.betRepository); }
}

/**
 * 전역 인스턴스 (애플리케이션에서 하나만 사용)
 *
 * @example
 * // Controller에서
 * const result = await registry.roundService.getRounds(params);
 *
 * // 테스트에서
 * registry.setRoundService(mockService);
 * registry.reset();
 */
export const registry = new ServiceRegistry();
