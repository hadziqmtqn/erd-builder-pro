import { prisma } from "../../lib/prisma.js";

const VALID_VIEW_TYPES = ["erd", "notes", "flowchart"];

const DEFAULT_RULES: Record<string, string> = {
  erd:
    "- Setiap tabel harus memiliki kolom created_at dan updated_at dengan tipe TIMESTAMP.\n" +
    "- Gunakan snake_case untuk semua penamaan tabel dan kolom.\n" +
    "- Setiap tabel harus memiliki PRIMARY KEY bernama id dengan tipe BIGSERIAL.\n" +
    "- Gunakan FOREIGN KEY yang konsisten dengan nama kolom berakhiran _id.\n" +
    "- Hindari ENUM — gunakan VARCHAR dengan CHECK constraint.\n" +
    "- Tambahkan kolom deleted_at untuk soft delete pada tabel master.",
  notes:
    "- Gunakan bahasa Indonesia untuk isi catatan.\n" +
    "- Struktur: gunakan heading, bullet points, dan code block.\n" +
    "- Setiap catatan harus memiliki summary di awal.\n" +
    "- Gunakan bahasa formal dan hindari slang.",
  flowchart:
    "- Gunakan label singkat dan jelas (maks 3 kata per simbol).\n" +
    "- Setiap diagram harus memiliki minimal satu Start dan satu End node.\n" +
    "- Beri nama yang deskriptif pada setiap cabang (decision label).",
};

export function isValidViewType(viewType: string): boolean {
  return VALID_VIEW_TYPES.includes(viewType);
}

export function getValidViewTypes(): string[] {
  return [...VALID_VIEW_TYPES];
}

export async function findRule(userId: string, viewType: string) {
  const existing = await prisma?.userAiRule.findFirst({
    where: { userId, viewType },
    select: { id: true, viewType: true, content: true, isEnabled: true, updatedAt: true },
  });

  if (existing) return existing;

  // Auto-seed default rules on first access
  if (prisma) {
    return await prisma.userAiRule.create({
      data: { userId, viewType, content: DEFAULT_RULES[viewType] ?? "", isEnabled: true },
      select: { id: true, viewType: true, content: true, isEnabled: true, updatedAt: true },
    });
  }

  return null;
}

export async function upsertRule(
  userId: string,
  viewType: string,
  content: string,
  isEnabled?: boolean
) {
  const existing = await prisma?.userAiRule.findFirst({
    where: { userId, viewType },
    select: { id: true },
  });

  if (existing) {
    return prisma?.userAiRule.update({
      where: { id: existing.id },
      data: { content, isEnabled: isEnabled ?? true, updatedAt: new Date() },
    });
  }

  return prisma?.userAiRule.create({
    data: { userId, viewType, content, isEnabled: isEnabled ?? true },
  });
}
