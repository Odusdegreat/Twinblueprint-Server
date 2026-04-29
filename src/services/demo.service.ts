import DemoRequest from "../models/demo.model";
import type { CreateDemoRequestDTO } from "../types/demo.types";
import { sendDemoEmail } from "./email.service";

export const createDemoService = async (data: CreateDemoRequestDTO) => {
  const existing = await DemoRequest.findOne({ workEmail: data.workEmail });

  if (existing) {
    throw new Error("DUPLICATE_LEAD");
  }

  const newLead = await DemoRequest.create(data);

  // 🔥 send email after saving
  await sendDemoEmail(data);

  return newLead;
};