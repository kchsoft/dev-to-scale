import type { TrafficSpikeResponse } from '../core/growth';
import type { ServerSize } from '../core/infrastructure';
import type { BuildableTechnologyId } from '../core/technology';
import type { InfrastructureNodeId } from '../core/topology';

export type SimulationAction =
  | { readonly type: 'NO_OP'; readonly reason: string }
  | {
      readonly type: 'RESIZE_NODE';
      readonly nodeId: InfrastructureNodeId;
      readonly size: ServerSize;
      readonly reason: string;
    }
  | {
      readonly type: 'SCALE_OUT_NODE';
      readonly nodeId: InfrastructureNodeId;
      readonly reason: string;
    }
  | {
      readonly type: 'START_TECHNOLOGY_BUILD';
      readonly technologyId: BuildableTechnologyId;
      readonly reason: string;
    }
  | {
      readonly type: 'RESPOND_TRAFFIC_SPIKE';
      readonly response: TrafficSpikeResponse;
      readonly reason: string;
    };

export function simulationActionId(action: SimulationAction): string {
  switch (action.type) {
    case 'NO_OP':
      return 'NO_OP';
    case 'RESIZE_NODE':
      return `RESIZE_NODE:${action.nodeId}:${action.size}`;
    case 'SCALE_OUT_NODE':
      return `SCALE_OUT_NODE:${action.nodeId}`;
    case 'START_TECHNOLOGY_BUILD':
      return `START_TECHNOLOGY_BUILD:${action.technologyId}`;
    case 'RESPOND_TRAFFIC_SPIKE':
      return `RESPOND_TRAFFIC_SPIKE:${action.response}`;
  }
}
