import {
  DatabaseId,
  FeatureId,
  FrameworkId,
  FundamentalSkill,
  HostingId,
  LanguageId,
  SkillMap,
  TechId,
} from "./types";

export const SKILL_LABELS: Record<FundamentalSkill, string> = {
  algorithms: "CS / Algorithms",
  systems: "Computer Systems",
  network: "Network & Web",
  database: "Database & Storage",
  design: "Software Design",
  infra: "Infra & Operations",
  security: "Security",
};

export const FOUNDER_PRESETS: Array<{ id: string; name: string; subtitle: string; skills: SkillMap }> = [
  {
    id: "backend",
    name: "Backend Developer",
    subtitle: "DB와 서버 개발에 강하고 운영은 평균적입니다.",
    skills: { algorithms: 3, systems: 3, network: 3, database: 4, design: 4, infra: 2, security: 2 },
  },
  {
    id: "fullstack",
    name: "Full Stack Developer",
    subtitle: "빠른 제품 개발과 설계에 강한 균형형입니다.",
    skills: { algorithms: 3, systems: 2, network: 3, database: 3, design: 4, infra: 2, security: 2 },
  },
  {
    id: "infra",
    name: "Infra Engineer",
    subtitle: "운영 안정성과 네트워크에 강하지만 제품 개발은 느립니다.",
    skills: { algorithms: 2, systems: 4, network: 4, database: 3, design: 2, infra: 4, security: 3 },
  },
];

export const LANGUAGES: Array<{ id: LanguageId; name: string; description: string }> = [
  { id: "java", name: "Java", description: "안정적인 서버 애플리케이션과 풍부한 생태계" },
  { id: "typescript", name: "TypeScript", description: "빠른 제품 개발과 프론트/백엔드 기술 공유" },
  { id: "python", name: "Python", description: "빠른 개발 속도와 AI/Data 생태계" },
  { id: "go", name: "Go", description: "단순한 배포와 높은 자원 효율" },
  { id: "php", name: "PHP", description: "웹 서비스 구축에 강한 성숙한 생태계" },
  { id: "ruby", name: "Ruby", description: "높은 생산성과 빠른 제품 실험" },
  { id: "csharp", name: "C#", description: "강력한 런타임과 엔터프라이즈 생태계" },
];

export const FRAMEWORKS: Record<LanguageId, Array<{ id: FrameworkId; name: string; description: string }>> = {
  java: [
    { id: "spring", name: "Spring Boot", description: "비즈니스 백엔드에 강한 범용 프레임워크" },
    { id: "quarkus", name: "Quarkus", description: "빠른 시작과 클라우드 환경을 지향" },
  ],
  typescript: [
    { id: "nestjs", name: "NestJS", description: "구조적인 TypeScript 서버 애플리케이션" },
    { id: "fastify", name: "Fastify", description: "가볍고 빠른 Node.js API" },
  ],
  python: [
    { id: "django", name: "Django", description: "기능이 풍부하고 CRUD 개발이 빠름" },
    { id: "fastapi", name: "FastAPI", description: "현대적인 API와 빠른 제품 개발" },
  ],
  go: [
    { id: "gin", name: "Gin", description: "가볍고 빠른 Go 웹 프레임워크" },
    { id: "echo", name: "Echo", description: "간결한 API 개발 경험" },
  ],
  php: [
    { id: "laravel", name: "Laravel", description: "높은 생산성과 풍부한 웹 기능" },
    { id: "symfony", name: "Symfony", description: "유연하고 구조적인 PHP 애플리케이션" },
  ],
  ruby: [{ id: "rails", name: "Ruby on Rails", description: "Convention 중심의 빠른 제품 개발" }],
  csharp: [{ id: "aspnet", name: "ASP.NET Core", description: "고성능 범용 서버 프레임워크" }],
};

export const HOSTING: Array<{
  id: HostingId;
  name: string;
  monthlyCost: number;
  capacity: number;
  complexity: number;
  description: string;
}> = [
  { id: "vm", name: "VM 직접 운영", monthlyCost: 90000, capacity: 9000, complexity: 6, description: "저렴하지만 직접 운영해야 합니다." },
  { id: "serverless", name: "Serverless", monthlyCost: 180000, capacity: 22000, complexity: 4, description: "초기 운영이 편하고 자동 확장이 쉽습니다." },
  { id: "container", name: "Managed Container", monthlyCost: 320000, capacity: 30000, complexity: 8, description: "비용은 높지만 성장에 대응하기 쉽습니다." },
];

export const DATABASES: Array<{
  id: DatabaseId;
  name: string;
  monthlyCost: number;
  capacity: number;
  complexity: number;
  communityFit: number;
  description: string;
}> = [
  { id: "postgresql", name: "PostgreSQL", monthlyCost: 140000, capacity: 18000, complexity: 5, communityFit: 1.05, description: "균형 잡힌 관계형 DB. 커뮤니티에도 무난합니다." },
  { id: "mysql", name: "MySQL", monthlyCost: 130000, capacity: 19000, complexity: 4, communityFit: 1.05, description: "웹 서비스에 익숙하고 운영 선택지가 많습니다." },
  { id: "mongodb", name: "MongoDB", monthlyCost: 170000, capacity: 21000, complexity: 6, communityFit: 1.0, description: "유연한 문서 모델이 강점이지만 설계 선택이 중요합니다." },
];

export type TechnologyDefinition = {
  id: TechId;
  name: string;
  category: string;
  setupCost: number;
  monthlyCost: number;
  weeks: number;
  complexity: number;
  capacityMultiplier: number;
  reliabilityBonus?: number;
  devSpeedBonus?: number;
  requiredSkills: Partial<Record<FundamentalSkill, number>>;
  description: string;
  unlockDau: number;
};

export const TECHNOLOGIES: TechnologyDefinition[] = [
  { id: "redis", name: "Redis", category: "Cache", setupCost: 800000, monthlyCost: 160000, weeks: 2, complexity: 8, capacityMultiplier: 1.35, requiredSkills: { database: 2, network: 2 }, description: "반복 조회를 캐시해 DB 부하를 줄입니다.", unlockDau: 3000 },
  { id: "object-storage", name: "Object Storage", category: "Storage", setupCost: 300000, monthlyCost: 90000, weeks: 1, complexity: 3, capacityMultiplier: 1.08, reliabilityBonus: 1, requiredSkills: { infra: 1 }, description: "이미지와 파일을 앱 서버에서 분리합니다.", unlockDau: 500 },
  { id: "cdn", name: "CDN", category: "Network", setupCost: 500000, monthlyCost: 220000, weeks: 2, complexity: 6, capacityMultiplier: 1.22, requiredSkills: { network: 2, infra: 2 }, description: "정적 콘텐츠를 사용자 가까이에서 전달합니다.", unlockDau: 5000 },
  { id: "load-balancer", name: "Load Balancer", category: "Network", setupCost: 900000, monthlyCost: 260000, weeks: 2, complexity: 7, capacityMultiplier: 1.3, reliabilityBonus: 1.5, requiredSkills: { network: 3, infra: 2 }, description: "여러 서버로 요청을 분산할 기반을 만듭니다.", unlockDau: 12000 },
  { id: "autoscaling", name: "Auto Scaling", category: "Compute", setupCost: 1200000, monthlyCost: 480000, weeks: 3, complexity: 11, capacityMultiplier: 1.5, reliabilityBonus: 2, requiredSkills: { infra: 3, systems: 2 }, description: "트래픽 변화에 맞춰 서버 용량을 자동 조절합니다.", unlockDau: 30000 },
  { id: "sqs", name: "Managed Queue", category: "Async", setupCost: 700000, monthlyCost: 140000, weeks: 2, complexity: 7, capacityMultiplier: 1.14, reliabilityBonus: 1, requiredSkills: { systems: 2, design: 2 }, description: "느린 작업을 비동기로 넘겨 요청 처리 부담을 줄입니다.", unlockDau: 10000 },
  { id: "kafka", name: "Kafka", category: "Async", setupCost: 4500000, monthlyCost: 1100000, weeks: 5, complexity: 24, capacityMultiplier: 1.5, reliabilityBonus: 1, requiredSkills: { systems: 3, network: 3, design: 3, infra: 3 }, description: "대규모 이벤트 흐름에 강하지만 작은 팀에는 매우 무겁습니다.", unlockDau: 250000 },
  { id: "cicd", name: "CI/CD", category: "Delivery", setupCost: 350000, monthlyCost: 50000, weeks: 1, complexity: 3, capacityMultiplier: 1, reliabilityBonus: 1.5, devSpeedBonus: 0.08, requiredSkills: { infra: 2, design: 2 }, description: "반복 배포를 자동화해 개발 흐름을 안정화합니다.", unlockDau: 0 },
  { id: "ai-assistant", name: "AI Coding Assistant", category: "Tool", setupCost: 0, monthlyCost: 30000, weeks: 1, complexity: 1, capacityMultiplier: 1, devSpeedBonus: 0.12, requiredSkills: {}, description: "개발 속도를 높이지만 기본 실력이 낮으면 만능 해결책은 아닙니다.", unlockDau: 0 },
];

export type FeatureDefinition = {
  id: FeatureId;
  name: string;
  weeks: number;
  cost: number;
  growthBonus: number;
  trafficMultiplier: number;
  revenuePerDau: number;
  debt: number;
  requiredSkills: Partial<Record<FundamentalSkill, number>>;
  description: string;
  unlockDau: number;
};

export const FEATURES: FeatureDefinition[] = [
  { id: "images", name: "이미지 업로드", weeks: 2, cost: 250000, growthBonus: 0.008, trafficMultiplier: 1.12, revenuePerDau: 0, debt: 2, requiredSkills: { design: 2, infra: 1 }, description: "게시글 표현력이 좋아지지만 저장소와 네트워크 사용량이 늘어납니다.", unlockDau: 100 },
  { id: "likes", name: "좋아요", weeks: 1, cost: 120000, growthBonus: 0.006, trafficMultiplier: 1.04, revenuePerDau: 0, debt: 1, requiredSkills: { database: 2, design: 2 }, description: "참여도를 높이는 가벼운 소셜 기능입니다.", unlockDau: 300 },
  { id: "search", name: "검색", weeks: 3, cost: 450000, growthBonus: 0.009, trafficMultiplier: 1.12, revenuePerDau: 0, debt: 3, requiredSkills: { algorithms: 3, database: 3 }, description: "콘텐츠 탐색성이 좋아지지만 읽기 부하가 늘어납니다.", unlockDau: 1500 },
  { id: "notifications", name: "알림", weeks: 2, cost: 350000, growthBonus: 0.012, trafficMultiplier: 1.08, revenuePerDau: 0, debt: 2, requiredSkills: { network: 2, design: 2 }, description: "재방문을 늘려 성장에 도움이 됩니다.", unlockDau: 3000 },
  { id: "popular", name: "실시간 인기글", weeks: 3, cost: 600000, growthBonus: 0.015, trafficMultiplier: 1.18, revenuePerDau: 0, debt: 4, requiredSkills: { database: 3, algorithms: 3 }, description: "체류시간을 높이지만 조회 트래픽을 크게 증가시킵니다.", unlockDau: 8000 },
  { id: "recommendations", name: "추천 피드", weeks: 4, cost: 1100000, growthBonus: 0.022, trafficMultiplier: 1.25, revenuePerDau: 0, debt: 5, requiredSkills: { algorithms: 4, design: 3, database: 3 }, description: "성장은 강력하지만 시스템 부담도 큽니다.", unlockDau: 30000 },
  { id: "ads", name: "광고 수익화", weeks: 2, cost: 400000, growthBonus: -0.004, trafficMultiplier: 1.02, revenuePerDau: 150, debt: 2, requiredSkills: { design: 2 }, description: "사용자 경험을 조금 희생하고 안정적인 매출을 만듭니다.", unlockDau: 5000 },
  { id: "premium", name: "Premium 멤버십", weeks: 3, cost: 900000, growthBonus: 0.001, trafficMultiplier: 1.02, revenuePerDau: 55, debt: 3, requiredSkills: { database: 3, security: 3, design: 3 }, description: "유료 전환은 낮지만 사용자당 매출을 높입니다.", unlockDau: 20000 },
];

export const getFrameworkName = (id: FrameworkId) => {
  for (const frameworks of Object.values(FRAMEWORKS)) {
    const framework = frameworks.find((item) => item.id === id);
    if (framework) return framework.name;
  }
  return id;
};

export const getLanguageName = (id: LanguageId) => LANGUAGES.find((item) => item.id === id)?.name ?? id;
export const getHosting = (id: HostingId) => HOSTING.find((item) => item.id === id)!;
export const getDatabase = (id: DatabaseId) => DATABASES.find((item) => item.id === id)!;
export const getTechnology = (id: TechId) => TECHNOLOGIES.find((item) => item.id === id)!;
export const getFeature = (id: FeatureId) => FEATURES.find((item) => item.id === id)!;
