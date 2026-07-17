import type { Request, Response } from "express";
import { createDemoService } from "../services/demo.service.ts";
import type { CreateDemoRequestDTO } from "../types/demo.types.ts";

export const createDemoRequest = async (req: Request, res: Response) => {
  const body: CreateDemoRequestDTO = req.body;

  const newLead = await createDemoService(body);

  res.status(201).json({
    success: true,
    message: "Demo request submitted successfully",
    data: newLead,
  });
};
