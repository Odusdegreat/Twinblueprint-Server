import type { Bid } from "./bid.types.ts";
import type { Project } from "./project.types.ts";

export interface PipelineResponse {
  active_bids: Bid[];
  inflight_projects: Project[];
  summary: {
    total_bids: number;
    total_projects: number;
    total_bid_value: number;
  };
}
