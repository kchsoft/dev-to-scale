import { FeatureDefinition } from './feature';
import { CommunityFeatureId } from './progression';

export const COMMUNITY_BOOTSTRAP = new FeatureDefinition({
  id: 'COMMUNITY_MVP',
  name: 'Community MVP',
  baseWork: 12,
  complexity: 'NORMAL',
  load: { app: 2, db: 2, async: 0, storage: 0 },
  requestRoute: [{ node: 'APP' }, { node: 'DB' }],
  tags: ['CORE', 'CONTENT'],
  growthBonus: 0,
});

export const COMMUNITY_FEATURES: Record<CommunityFeatureId, FeatureDefinition> = {
  COMMENT: new FeatureDefinition({
    id: 'COMMENT', name: 'Comment', baseWork: 7, complexity: 'SIMPLE',
    load: { app: 1, db: 2, async: 0, storage: 0 },
    requestRoute: [{ node: 'APP' }, { node: 'DB' }],
    tags: ['WRITE_HEAVY'],
  }),
  LIKE: new FeatureDefinition({
    id: 'LIKE', name: 'Like', baseWork: 6, complexity: 'SIMPLE',
    load: { app: 1, db: 2, async: 0, storage: 0 },
    requestRoute: [{ node: 'APP' }, { node: 'DB' }],
    tags: ['READ_HEAVY'],
  }),
  IMAGE_UPLOAD: new FeatureDefinition({
    id: 'IMAGE_UPLOAD', name: 'Image Upload', baseWork: 10, complexity: 'NORMAL',
    load: { app: 1, db: 1, async: 0, storage: 3 },
    requestRoute: [{ node: 'APP' }, { node: 'DB' }, { node: 'STORAGE' }],
    tags: ['STORAGE'],
  }),
  SEARCH: new FeatureDefinition({
    id: 'SEARCH', name: 'Search', baseWork: 12, complexity: 'NORMAL',
    load: { app: 1, db: 3, async: 0, storage: 0 },
    requestRoute: [{ node: 'APP' }, { node: 'DB' }],
    tags: ['READ_HEAVY', 'SEARCH'],
  }),
  NOTIFICATION: new FeatureDefinition({
    id: 'NOTIFICATION', name: 'Notification', baseWork: 14, complexity: 'NORMAL',
    load: { app: 1, db: 1, async: 3, storage: 0 },
    requestRoute: [{ node: 'APP' }, { node: 'DB' }, { node: 'QUEUE', requirement: 'REQUIRED' }],
    tags: ['ASYNC'],
  }),
  AI_RECOMMENDATION: new FeatureDefinition({
    id: 'AI_RECOMMENDATION', name: 'AI Personalized Recommendation', baseWork: 20, complexity: 'COMPLEX',
    load: { app: 2, db: 2, async: 3, storage: 0 },
    requestRoute: [
      { node: 'APP' },
      { node: 'DB' },
      { node: 'AI' },
      { node: 'QUEUE', requirement: 'REQUIRED' },
    ],
    tags: ['AI', 'EVENT_HEAVY', 'READ_HEAVY'], revenueModifier: 0.1,
  }),
  POPULAR_POSTS: new FeatureDefinition({
    id: 'POPULAR_POSTS', name: 'Popular Posts', baseWork: 16, complexity: 'NORMAL',
    load: { app: 1, db: 3, async: 0, storage: 0 },
    requestRoute: [{ node: 'APP' }, { node: 'DB' }],
    tags: ['READ_HEAVY'],
  }),
  FOLLOW_FEED: new FeatureDefinition({
    id: 'FOLLOW_FEED', name: 'Follow Feed', baseWork: 22, complexity: 'COMPLEX',
    load: { app: 2, db: 3, async: 2, storage: 0 },
    requestRoute: [{ node: 'APP' }, { node: 'DB' }, { node: 'QUEUE', requirement: 'REQUIRED' }],
    tags: ['READ_HEAVY', 'EVENT_HEAVY'],
  }),
  ADS: new FeatureDefinition({
    id: 'ADS', name: 'Advertising', baseWork: 10, complexity: 'NORMAL',
    load: { app: 1, db: 1, async: 0, storage: 0 },
    requestRoute: [{ node: 'APP' }, { node: 'DB' }],
    tags: ['MONETIZATION'], revenueModifier: 0.3,
  }),
  PREMIUM: new FeatureDefinition({
    id: 'PREMIUM', name: 'Premium Membership', baseWork: 18, complexity: 'COMPLEX',
    load: { app: 1, db: 2, async: 1, storage: 0 },
    requestRoute: [
      { node: 'APP' },
      { node: 'DB' },
      { node: 'QUEUE', requirement: 'OPTIONAL' },
    ],
    tags: ['TRANSACTIONAL', 'MONETIZATION'], revenueModifier: 0.5,
  }),
};
