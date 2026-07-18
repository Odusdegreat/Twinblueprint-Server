import type { Request, Response } from "express";
import * as projectService from "../services/project.service.ts";

const getId = (req: Request): string => req.params.id as string;

export const createProject = async (req: Request, res: Response) => {
  const project = await projectService.createProject(req.body);

  res.status(201).json({
    success: true,
    message: "Project created successfully",
    data: { project },
  });
};

export const getProjects = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { projects, total } = await projectService.getProjects(page, limit);

  res.status(200).json({
    success: true,
    data: { projects, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
};

export const getProjectById = async (req: Request, res: Response) => {
  const project = await projectService.getProjectById(getId(req));

  res.status(200).json({
    success: true,
    data: { project },
  });
};

export const updateProject = async (req: Request, res: Response) => {
  const project = await projectService.updateProject(getId(req), req.body);

  res.status(200).json({
    success: true,
    message: "Project updated successfully",
    data: { project },
  });
};

export const deleteProject = async (req: Request, res: Response) => {
  await projectService.deleteProject(getId(req));

  res.status(200).json({
    success: true,
    message: "Project deleted successfully",
  });
};
