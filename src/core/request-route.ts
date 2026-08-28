export type RequestNodeKind = 'ALB' | 'APP' | 'DB' | 'CACHE' | 'QUEUE' | 'STORAGE' | 'AI';
export type RequestRequirement = 'REQUIRED' | 'OPTIONAL';

export interface RequestRouteStep {
  readonly node: RequestNodeKind;
  readonly requirement?: RequestRequirement;
}
