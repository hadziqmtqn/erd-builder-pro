import { prisma } from "../../lib/prisma.js";

const VALID_VIEW_TYPES = ["erd", "notes", "flowchart", "db-client"];

const DEFAULT_RULES: Record<string, string> = {
  erd:
    "- Setiap tabel harus memiliki kolom created_at dan updated_at dengan tipe TIMESTAMP.\n" +
    "- Gunakan snake_case untuk semua penamaan tabel dan kolom.\n" +
    "- Untuk skema ERD, output schema harus menggunakan DBML dalam code block ```dbml kecuali user eksplisit meminta SQL.\n" +
    "- Setiap tabel harus memiliki primary key bernama id dengan tipe BIGINT atau UUID.\n" +
    "- Gunakan Ref DBML untuk foreign key dan nama kolom relasi berakhiran _id.\n" +
    "- Deklarasikan setiap relasi sekali saja sebagai Ref: child.parent_id > parents.id; jangan gunakan [ref: ...] inline atau menghilangkan tanda >.\n" +
    "- Unique satu kolom gunakan [unique]. Unique gabungan gunakan Indexes { (kolom_a, kolom_b) [unique] } di dalam Table; jangan gunakan unique (kolom_a, kolom_b).\n" +
    "- VARCHAR/CHAR wajib memiliki panjang eksplisit; default VARCHAR(255). Nama Enum wajib {table_name}_{column_name}.\n" +
    "- Gunakan Enum DBML hanya jika value benar-benar terbatas dan reusable.\n" +
    "- Tambahkan kolom deleted_at untuk soft delete pada tabel master.",
  notes:
    "- Ikuti bahasa yang digunakan pengguna untuk isi catatan.\n" +
    "- Struktur: gunakan heading, bullet points, dan code block.\n" +
    "- Setiap catatan harus memiliki summary di awal.\n" +
    "- Gunakan bahasa formal dan hindari slang.",
  flowchart:
    "- Gunakan label singkat dan jelas (maks 3 kata per simbol).\n" +
    "- Setiap diagram harus memiliki minimal satu Start dan satu End node.\n" +
    "- Beri nama yang deskriptif pada setiap cabang (decision label).",
  "db-client":
    "- Gunakan hanya tabel dan kolom yang tersedia dalam metadata DB Client.\n" +
    "- Sesuaikan SQL dengan dialect MySQL atau PostgreSQL yang aktif.\n" +
    "- Perlakukan SQL sebagai proposal dan jangan mengklaim query sudah dijalankan.",
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
