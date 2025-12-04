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

import { BetService } from './bets/service';
import { BetRepository } from './bets/repository';
import { RoundRepository } from './rounds/repository';
import { RoundService } from './rounds/service';
import { UserRepository } from './users/repository';
import { UserService } from './users/service';

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

  // Service 인스턴스
  private _roundService?: RoundService;

  get roundService(): RoundService {
    if (!this._roundService) {
      // 의존성 조립: Repository를 Service에 넣어줌
      this._roundService = new RoundService(this.roundRepository);
    }
    return this._roundService;
  }

  private _betRepository?: BetRepository;
  get betRepository(): BetRepository {
    if (!this._betRepository) {
      this._betRepository = new BetRepository();
    }
    return this._betRepository;
  }

  private _betService?: BetService;
  get betService(): BetService {
    if (!this._betService) {
      // 의존성 조립: BetService는 BetRepository와 RoundRepository가 모두 필요함 (검증용)
      this._betService = new BetService(this.betRepository, this.roundRepository);
    }
    return this._betService;
  }

  private _userRepository?: UserRepository;
  get userRepository(): UserRepository {
    if (!this._userRepository) {
      this._userRepository = new UserRepository();
    }
    return this._userRepository;
  }

  private _userService?: UserService;
  get userService(): UserService {
    if (!this._userService) {
      this._userService = new UserService(this.userRepository);
    }
    return this._userService;
  }

  // 테스트용: Mock으로 교체
  setRoundRepository(repository: RoundRepository): void {
    this._roundRepository = repository;
    this._roundService = undefined; // Repository 변경 시 Service도 재생성
  }

  setRoundService(service: RoundService): void {
    this._roundService = service;
  }

  setBetRepository(repository: BetRepository): void {
    this._betRepository = repository;
    this._betService = undefined;
  }

  setBetService(service: BetService): void {
    this._betService = service;
  }

  // 테스트용: 초기화
  reset(): void {
    this._roundRepository = undefined;
    this._roundService = undefined;
    this._betRepository = undefined;
    this._betService = undefined;
    this._userRepository = undefined;
    this._userService = undefined;
  }
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
