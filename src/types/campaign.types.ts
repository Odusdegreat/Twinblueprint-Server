export type CampaignType = "LinkedIn" | "Email";
export type CampaignStatus = "Completed" | "Active";

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  sent: number;
  opened: number;
  clicked: number;
  status: CampaignStatus;
  campaign_date: string;
  created_at: string;
}

export interface CampaignStats {
  total_sent: number;
  total_opens: number;
  total_clicks: number;
  avg_ctr: number;
}
