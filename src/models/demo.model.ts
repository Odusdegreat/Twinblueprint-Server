import mongoose, { Schema } from "mongoose";
import type { Document } from "mongoose";

export interface IDemoRequest extends Document {
  fullName: string;
  workEmail: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  industry?: string;
  createdAt: Date;
  updatedAt: Date;
}

const demoSchema = new Schema<IDemoRequest>(
  {
    fullName: { type: String, required: true },
    workEmail: { type: String, required: true, lowercase: true },
    company: String,
    jobTitle: String,
    phone: String,
    industry: String,
  },
  { timestamps: true }
);

export default mongoose.model<IDemoRequest>("DemoRequest", demoSchema);