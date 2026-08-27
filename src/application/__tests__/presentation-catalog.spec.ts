import { describe, expect, it } from 'vitest';
import { presentationCatalog } from '../presentation-catalog';

describe('presentationCatalog', () => {
  it.each([
    ['COMMUNITY_MVP', '게시글'],
    ['COMMENT', '댓글'],
    ['LIKE', '좋아요'],
    ['IMAGE_UPLOAD', '이미지 업로드'],
    ['SEARCH', '검색'],
    ['NOTIFICATION', '알림'],
    ['AI_RECOMMENDATION', 'AI 개인화 추천'],
    ['POPULAR_POSTS', '인기글'],
    ['FOLLOW_FEED', '팔로우 피드'],
    ['ADS', '광고'],
    ['PREMIUM', 'Premium'],
  ] as const)('labels workload %s as %s', (id, label) => {
    expect(presentationCatalog.label(id)).toBe(label);
  });

  it.each([
    ['SPRING_BOOT', 'Spring Boot'],
    ['NESTJS', 'NestJS'],
    ['GIN', 'Gin'],
    ['FASTAPI', 'FastAPI'],
    ['ASPNET_CORE', 'ASP.NET Core'],
    ['POSTGRESQL', 'PostgreSQL'],
    ['MYSQL', 'MySQL'],
    ['MONGODB', 'MongoDB'],
    ['REDIS', 'Redis'],
    ['SQS', 'SQS'],
    ['RABBITMQ', 'RabbitMQ'],
    ['KAFKA', 'Kafka'],
    ['ALB', 'ALB'],
    ['OBJECT_STORAGE', 'Object Storage'],
  ] as const)('labels platform product %s as %s', (id, label) => {
    expect(presentationCatalog.label(id)).toBe(label);
  });

  it.each([
    ['LOAD_BALANCER', '⎇'],
    ['SERVER_GROUP', '◈'],
    ['DATABASE', '◉'],
    ['CACHE', '◆'],
    ['QUEUE', '⇢'],
    ['OBJECT_STORAGE', '▣'],
    ['WORKER', '◇'],
    ['EXTERNAL_SERVICE', '◎'],
  ] as const)('maps topology kind %s to icon %s', (kind, icon) => {
    expect(presentationCatalog.topologyIcon(kind)).toBe(icon);
  });

  it('keeps deliberate fallbacks for future identifiers', () => {
    expect(presentationCatalog.label('FUTURE_PRODUCT')).toBe('FUTURE_PRODUCT');
    expect(presentationCatalog.icon('FUTURE_SKILL')).toBe('•');
  });

  it('labels legacy request nodes consistently', () => {
    expect(presentationCatalog.requestNodeLabel('CACHE')).toBe('REDIS');
    expect(presentationCatalog.requestNodeLabel('QUEUE')).toBe('MQ');
    expect(presentationCatalog.requestNodeLabel('AI')).toBe('AI');
  });
});
