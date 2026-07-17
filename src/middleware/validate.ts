import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod/v4";

interface ValidateOptions {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export const validate = (schemas: ZodSchema | ValidateOptions) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const schemasObj: ValidateOptions =
      schemas instanceof Object && "body" in schemas
        ? (schemas as ValidateOptions)
        : { body: schemas as ZodSchema };

    if (schemasObj.body) {
      const result = schemasObj.body.safeParse(req.body);
      if (!result.success) {
        const message =
          result.error.issues[0]?.message ?? "Validation failed";
        res.status(400).json({ success: false, message });
        return;
      }
      req.body = result.data;
    }

    if (schemasObj.params) {
      const result = schemasObj.params.safeParse(req.params);
      if (!result.success) {
        const message =
          result.error.issues[0]?.message ?? "Invalid parameters";
        res.status(400).json({ success: false, message });
        return;
      }
    }

    if (schemasObj.query) {
      const result = schemasObj.query.safeParse(req.query);
      if (!result.success) {
        const message =
          result.error.issues[0]?.message ?? "Invalid query parameters";
        res.status(400).json({ success: false, message });
        return;
      }
    }

    next();
  };
};
