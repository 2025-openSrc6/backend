# deltaX Move Package

이 디렉터리는 Sui 체인에서 동작하는 베팅/정산 로직을 Move로 관리하기 위한 뼈대입니다.

## 요구 사항

- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) 설치
- Rust toolchain (Sui CLI가 내부적으로 사용)

## 기본 명령어

```bash
# 의존성 다운로드 및 컴파일
sui move build

# 단위 테스트
sui move test

# 로컬net 실행 후 배포 예시
sui client publish --gas-budget 100000000
```

## 구조

```
contracts/
├── Move.toml         # 패키지 메타데이터 및 Sui 의존성
├── sources/          # 실 구현 모듈 (on-chain 로직)
└── tests/            # Move 유닛 테스트
```

## 다음 단계

1. `sources/` 아래에 라운드/베팅/NFT 관련 모듈을 작성합니다.
2. `tests/`에서 결과 검증 로직을 만든 후 `sui move test`로 반복 확인합니다.
3. 배포가 끝나면 `SUI_PACKAGE_ID`, 필요한 `OBJECT_ID`들을 `.env.local`에 기록해 Next.js 백엔드/프론트에서 사용할 수 있도록 공유합니다.
