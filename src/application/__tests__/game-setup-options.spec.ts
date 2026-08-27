import { describe, expect, it } from 'vitest';
import { GAME_DATABASE_OPTIONS, GAME_FRAMEWORK_OPTIONS } from '../game-setup-options';

describe('game setup options', () => {
  it('represents every supported framework exactly once with catalog presentation', () => {
    expect(GAME_FRAMEWORK_OPTIONS.map(({ id }) => id)).toEqual([
      'SPRING_BOOT', 'NESTJS', 'GIN', 'FASTAPI', 'ASPNET_CORE',
    ]);
    expect(GAME_FRAMEWORK_OPTIONS.map(({ name }) => name)).toEqual([
      'Spring Boot', 'NestJS', 'Gin', 'FastAPI', 'ASP.NET Core',
    ]);
    expect(GAME_FRAMEWORK_OPTIONS.map(({ mark }) => mark)).toEqual(['S', 'N', 'G', 'F', '.N']);
  });

  it('represents every supported database exactly once with catalog presentation', () => {
    expect(GAME_DATABASE_OPTIONS.map(({ id }) => id)).toEqual(['POSTGRESQL', 'MYSQL', 'MONGODB']);
    expect(GAME_DATABASE_OPTIONS.map(({ name }) => name)).toEqual(['PostgreSQL', 'MySQL', 'MongoDB']);
    expect(GAME_DATABASE_OPTIONS.map(({ mark }) => mark)).toEqual(['PG', 'MY', 'MO']);
  });
});
