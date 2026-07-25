import { supabase } from "../config/supabase.ts";
import type { PipelineResponse } from "../types/pipeline.types.ts";

export const getPipeline = async (): Promise<PipelineResponse> => {
  const [bidsResult, projectsResult] = await Promise.all([
    supabase
      .from("bids")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (bidsResult.error) {
    console.error("[PIPELINE] getBids error:", bidsResult.error);
    throw Object.assign(new Error("Failed to fetch pipeline"), {
      statusCode: 500,
    });
  }

  if (projectsResult.error) {
    console.error("[PIPELINE] getProjects error:", projectsResult.error);
    throw Object.assign(new Error("Failed to fetch pipeline"), {
      statusCode: 500,
    });
  }

  const active_bids = bidsResult.data ?? [];
  const inflight_projects = projectsResult.data ?? [];

  const total_bid_value = active_bids.reduce(
    (sum, bid) => sum + (Number(bid.value) || 0),
    0,
  );

  return {
    active_bids,
    inflight_projects,
    summary: {
      total_bids: active_bids.length,
      total_projects: inflight_projects.length,
      total_bid_value,
    },
  };
};
