import { z } from "zod";
import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";

// --- Schemas ---

export const loginSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).max(255).optional(),
  password: z.string().min(1).max(128).optional(),
  externalToken: z.string().max(2048).optional(),
});

export const aiProxySchema = z.object({
  messages: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).min(1).max(100),
  model: z.string().max(100).optional(),
  apiKey: z.string().max(2048).optional(),
  baseUrl: z.string().url().max(512).optional(),
});

export const createDiagramSchema = z.object({
  name: z.string().min(1).max(255),
  project_id: z.string().uuid().nullable().optional(),
  uid: z.string().uuid().optional(),
});

export const createNoteSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().max(10_000_000).optional(),
  project_id: z.string().uuid().nullable().optional(),
});

export const createDrawingSchema = z.object({
  title: z.string().min(1).max(255),
  data: z.string().max(10_000_000).optional(),
  project_id: z.string().uuid().nullable().optional(),
});

export const createFlowchartSchema = z.object({
  title: z.string().min(1).max(255),
  data: z.string().max(10_000_000).optional(),
  project_id: z.string().uuid().nullable().optional(),
});

export const uploadSchema = z.object({
  feature: z.string().max(50).optional(),
});

export const deleteUploadSchema = z.object({
  key: z.string().min(1).max(512),
});

export const renameSchema = z.object({
  name: z.string().min(1).max(255),
});

export const projectSchema = z.object({
  name: z.string().min(1).max(255),
});

// --- Middleware helper ---

export function validate(schema: z.ZodSchema) {
  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map(e => e.message).join(", ");
      return res.status(400).json({ error: `Invalid input: ${message}` });
    }
    req.body = result.data;
    next();
  };
}
