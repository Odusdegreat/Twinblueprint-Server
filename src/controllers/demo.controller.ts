import type { Request, Response } from "express";
import { createDemoService } from "../services/demo.service";
import  type { CreateDemoRequestDTO } from "../types/demo.types";

export const createDemoRequest = async (
  req: Request,
  res: Response
) => {
  try {
    const body: CreateDemoRequestDTO = req.body;

    // Basic validation
    if (!body.fullName || !body.workEmail) {
      return res.status(400).json({
        message: "Full name and email are required",
      });
    }

    const newLead = await createDemoService(body);

    return res.status(201).json({
      message: "Demo request submitted successfully",
      data: newLead,
    });

  } catch (error: any) {
    if (error.message === "DUPLICATE_LEAD") {
      return res.status(409).json({
        message: "User already exists",
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};