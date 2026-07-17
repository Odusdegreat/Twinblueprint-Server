import type { Request, Response } from "express";
import * as companyService from "../services/company.service.ts";

const getId = (req: Request): string => req.params.id as string;

export const createCompany = async (req: Request, res: Response) => {
  const company = await companyService.createCompany(req.body);

  res.status(201).json({
    success: true,
    message: "Company created successfully",
    data: { company },
  });
};

export const getCompanies = async (_req: Request, res: Response) => {
  const companies = await companyService.getCompanies();

  res.status(200).json({
    success: true,
    data: { companies },
  });
};

export const getCompanyById = async (req: Request, res: Response) => {
  const company = await companyService.getCompanyById(getId(req));

  res.status(200).json({
    success: true,
    data: { company },
  });
};

export const updateCompany = async (req: Request, res: Response) => {
  const company = await companyService.updateCompany(getId(req), req.body);

  res.status(200).json({
    success: true,
    message: "Company updated successfully",
    data: { company },
  });
};

export const deleteCompany = async (req: Request, res: Response) => {
  await companyService.deleteCompany(getId(req));

  res.status(200).json({
    success: true,
    message: "Company deleted successfully",
  });
};
