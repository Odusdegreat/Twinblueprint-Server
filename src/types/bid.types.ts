export type BidPhase = "RFP Review" | "Technical Eval" | "Shortlist";

export interface Bid {
  id: string;
  project: string;
  client: string;
  phase: BidPhase;
  deadline: string;
  suppliers: string[];
  value: string;
  created_at: string;
}
