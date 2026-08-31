import { DatabaseDefinition, type DatabaseId } from './database';
import { FrameworkDefinition, type FrameworkId } from './feature';
import { TECHNOLOGIES } from './technology';
import type { ResourceCapacity } from './topology';

export enum ServerSize {
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
  XLARGE = 'XLARGE',
}

export const SERVER_SIZE_VALUES: readonly ServerSize[] = Object.freeze([
  ServerSize.SMALL,
  ServerSize.MEDIUM,
  ServerSize.LARGE,
  ServerSize.XLARGE,
]);

export interface NodeSizeProfile {
  readonly capacity: ResourceCapacity;
  readonly monthlyCost: number;
}

const FRAMEWORK_IDS: readonly FrameworkId[] = ['SPRING_BOOT', 'NESTJS', 'GIN', 'FASTAPI', 'ASPNET_CORE'];
const DATABASE_IDS: readonly DatabaseId[] = ['POSTGRESQL', 'MYSQL', 'MONGODB'];

const APP_BASE: Readonly<Record<ServerSize, { readonly capacity: number; readonly cost: number }>> = Object.freeze({
  [ServerSize.SMALL]: { capacity: 100, cost: 100_000 },
  [ServerSize.MEDIUM]: { capacity: 180, cost: 200_000 },
  [ServerSize.LARGE]: { capacity: 320, cost: 400_000 },
  [ServerSize.XLARGE]: { capacity: 520, cost: 800_000 },
});

const DB_BASE: Readonly<Record<ServerSize, { readonly capacity: number; readonly cost: number }>> = Object.freeze({
  [ServerSize.SMALL]: { capacity: 80, cost: 120_000 },
  [ServerSize.MEDIUM]: { capacity: 150, cost: 250_000 },
  [ServerSize.LARGE]: { capacity: 270, cost: 500_000 },
  [ServerSize.XLARGE]: { capacity: 450, cost: 1_000_000 },
});

function throughputProfiles(
  capacities: readonly [number, number, number, number],
  costs: readonly [number, number, number, number],
): Readonly<Record<ServerSize, NodeSizeProfile>> {
  return Object.freeze({
    [ServerSize.SMALL]: Object.freeze({ capacity: Object.freeze({ throughput: capacities[0] }), monthlyCost: costs[0] }),
    [ServerSize.MEDIUM]: Object.freeze({ capacity: Object.freeze({ throughput: capacities[1] }), monthlyCost: costs[1] }),
    [ServerSize.LARGE]: Object.freeze({ capacity: Object.freeze({ throughput: capacities[2] }), monthlyCost: costs[2] }),
    [ServerSize.XLARGE]: Object.freeze({ capacity: Object.freeze({ throughput: capacities[3] }), monthlyCost: costs[3] }),
  });
}

function storageProfiles(
  capacities: readonly [number, number, number, number],
  costs: readonly [number, number, number, number],
): Readonly<Record<ServerSize, NodeSizeProfile>> {
  return Object.freeze({
    [ServerSize.SMALL]: Object.freeze({ capacity: Object.freeze({ storage: capacities[0] }), monthlyCost: costs[0] }),
    [ServerSize.MEDIUM]: Object.freeze({ capacity: Object.freeze({ storage: capacities[1] }), monthlyCost: costs[1] }),
    [ServerSize.LARGE]: Object.freeze({ capacity: Object.freeze({ storage: capacities[2] }), monthlyCost: costs[2] }),
    [ServerSize.XLARGE]: Object.freeze({ capacity: Object.freeze({ storage: capacities[3] }), monthlyCost: costs[3] }),
  });
}

const FIXED_PRODUCT_PROFILES = Object.freeze({
  ALB: throughputProfiles([180, 360, 700, 2_250], [TECHNOLOGIES.ALB.monthlyCost, 180_000, 320_000, 550_000]),
  REDIS: throughputProfiles([160, 320, 600, 1_050], [TECHNOLOGIES.REDIS.monthlyCost, 180_000, 320_000, 560_000]),
  SQS: throughputProfiles([300, 550, 950, 1_500], [TECHNOLOGIES.SQS.monthlyCost, 140_000, 240_000, 400_000]),
  RABBITMQ: throughputProfiles([500, 850, 1_400, 2_200], [TECHNOLOGIES.RABBITMQ.monthlyCost, 260_000, 450_000, 750_000]),
  KAFKA: throughputProfiles([1_000, 1_700, 2_700, 4_000], [TECHNOLOGIES.KAFKA.monthlyCost, 600_000, 950_000, 1_500_000]),
  LOCAL_STORAGE: storageProfiles([100, 180, 320, 500], [0, 20_000, 50_000, 100_000]),
  OBJECT_STORAGE: storageProfiles([1_000, 2_000, 4_000, 8_000], [TECHNOLOGIES.OBJECT_STORAGE.monthlyCost, 140_000, 240_000, 400_000]),
});

function immutableProfile(capacity: ResourceCapacity, monthlyCost: number): NodeSizeProfile {
  return Object.freeze({ capacity: Object.freeze({ ...capacity }), monthlyCost });
}

export function nominalNodeSizeProfile(productId: string, size: ServerSize): NodeSizeProfile {
  if (FRAMEWORK_IDS.includes(productId as FrameworkId)) {
    const framework = FrameworkDefinition.byId(productId as FrameworkId);
    const base = APP_BASE[size];
    return immutableProfile({
      cpu: base.capacity,
      io: base.capacity,
      throughput: base.capacity,
    }, base.cost * framework.costModifier);
  }

  if (DATABASE_IDS.includes(productId as DatabaseId)) {
    const database = DatabaseDefinition.byId(productId as DatabaseId);
    const base = DB_BASE[size];
    return immutableProfile({
      cpu: base.capacity,
      io: base.capacity,
      throughput: base.capacity,
    }, base.cost * database.costModifier);
  }

  const fixed = FIXED_PRODUCT_PROFILES[productId as keyof typeof FIXED_PRODUCT_PROFILES];
  if (fixed) return fixed[size];
  throw new Error(`Unknown infrastructure product: ${productId}`);
}

export function nodeSizeProfile(productId: string, size: ServerSize): NodeSizeProfile {
  if (FRAMEWORK_IDS.includes(productId as FrameworkId)) {
    const framework = FrameworkDefinition.byId(productId as FrameworkId);
    const base = APP_BASE[size];
    return immutableProfile({
      cpu: base.capacity * framework.cpuCapacityModifier,
      io: base.capacity * framework.ioCapacityModifier,
      throughput: base.capacity * framework.capacityModifier,
    }, base.cost * framework.costModifier);
  }

  if (DATABASE_IDS.includes(productId as DatabaseId)) {
    const database = DatabaseDefinition.byId(productId as DatabaseId);
    const base = DB_BASE[size];
    const capacity = base.capacity * database.capacityModifier;
    return immutableProfile({ cpu: capacity, io: capacity, throughput: capacity }, base.cost * database.costModifier);
  }

  const fixed = FIXED_PRODUCT_PROFILES[productId as keyof typeof FIXED_PRODUCT_PROFILES];
  if (fixed) return fixed[size];
  throw new Error(`Unknown infrastructure product: ${productId}`);
}
