import { z } from "zod";
import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";

// --- Schemas ---

export const loginSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).max(255).optional(),
  password: z.string().min(1).max(128).optional(),
  externalToken: z.string().max(2048).optional(),
});

export const setupAdminSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).max(255),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const aiProxySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().max(200_000),
  })).min(1).max(100),
  model: z.string().max(100).optional(),
  apiKey: z.string().max(2048).optional(),
  baseUrl: z.string().url().max(512).optional(),
  providerCode: z.string().max(64).optional(),
}).superRefine((value, ctx) => {
  const total = value.messages.reduce((length, message) => length + message.content.length, 0);
  if (total > 2_000_000) {
    ctx.addIssue({ code: z.ZodIssueCode.too_big, maximum: 2_000_000, origin: "string", inclusive: true, message: "AI message payload is too large", path: ["messages"] });
  }
});

const projectIdField = z.union([z.number(), z.string()]).nullable().optional();

export const createDiagramSchema = z.object({
  name: z.string().min(1).max(255),
  project_id: projectIdField,
  uid: z.string().uuid().optional(),
});

export const createNoteSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().max(10_000_000).optional(),
  project_id: projectIdField,
  uid: z.string().uuid().optional(),
});

export const createDrawingSchema = z.object({
  title: z.string().min(1).max(255),
  data: z.string().max(10_000_000).optional(),
  project_id: projectIdField,
  uid: z.string().uuid().optional(),
});

export const createFlowchartSchema = z.object({
  title: z.string().min(1).max(255),
  data: z.string().max(10_000_000).optional(),
  project_id: projectIdField,
  uid: z.string().uuid().optional(),
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

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).max(255).optional(),
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: z.string().min(6).max(128).optional(),
}).refine(
  (data) => data.name || data.email || data.newPassword,
  { message: "At least one of name, email, or newPassword must be provided" }
);

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
