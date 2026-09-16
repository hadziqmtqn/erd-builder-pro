import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { scryptSync, randomBytes } from 'crypto';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function isSqliteUrl(url: string): boolean {
  return url.startsWith('file:') || url.endsWith('.db');
}

const rawUrl = process.env.DATABASE_URL || 'file:./data.db';

function resolveAdapter(): { adapter: PrismaBetterSqlite3 | PrismaPg; dbType: string } {
  if (isSqliteUrl(rawUrl)) {
    return { adapter: new PrismaBetterSqlite3({ url: rawUrl }), dbType: 'SQLite' };
  }
  return { adapter: new PrismaPg({ connectionString: rawUrl }), dbType: 'PostgreSQL' };
}

const { adapter, dbType } = resolveAdapter();
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`Seeding ${dbType} database...`);

  // SQLite Desktop uses its local bootstrap account. PostgreSQL Self-host
  // creates the first admin through the one-time setup screen instead.
  if (isSqliteUrl(rawUrl)) {
    const adminEmail = 'admin@local.dev';
    const adminPassword = 'admin123';
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { isSuperAdmin: true },
      create: {
        email: adminEmail,
        name: 'Admin',
        password: hashPassword(adminPassword),
        isSuperAdmin: true,
      },
    });
    console.log(`  ✓ Desktop admin user: ${admin.email}`);
  } else {
    console.log('  - Self-host admin user skipped; use the one-time setup screen');
  }

  // ── AI Providers ──
  const providerDefs = [
    { name: 'OpenAI', code: 'openai', baseUrl: 'https://api.openai.com/v1' },
    { name: 'Google Gemini', code: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    { name: 'OpenAI Compatible', code: 'openai_compatible', baseUrl: 'https://ai.paas.id' },
  ];

  for (const p of providerDefs) {
    await prisma.aiProvider.upsert({
      where: { code: p.code },
      update: {},
      create: {
        name: p.name,
        code: p.code,
        baseUrl: p.baseUrl,
        isActive: true,
      },
    });
  }
  console.log('  ✓ AI Providers: OpenAI, Gemini, OpenAI Compatible');

  // ── AI Models (idempotent — only seed if provider has no models) ──
  // Uses findFirst instead of deleteMany+createMany to avoid wiping
  // user_ai_configs.selected_model_id via ON DELETE SET NULL cascade.
  const openai = await prisma.aiProvider.findUnique({ where: { code: 'openai' } });
  const gemini = await prisma.aiProvider.findUnique({ where: { code: 'gemini' } });
  const openaiCompat = await prisma.aiProvider.findUnique({ where: { code: 'openai_compatible' } });

  if (openai) {
    const existing = await prisma.aiModel.findFirst({ where: { providerId: openai.id } });
    if (!existing) {
      await prisma.aiModel.createMany({
        data: [
          { providerId: openai.id, modelIdentifier: 'gpt-4o', displayName: 'GPT-4o', contextWindow: 128000, isActive: true },
          { providerId: openai.id, modelIdentifier: 'gpt-4o-mini', displayName: 'GPT-4o Mini', contextWindow: 128000, isActive: true },
          { providerId: openai.id, modelIdentifier: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', contextWindow: 128000, isActive: true },
        ],
      });
      console.log('  ✓ OpenAI models: GPT-4o, GPT-4o Mini, GPT-4 Turbo');
    } else {
      console.log('  - OpenAI models already exist, skipping');
    }
  }

  if (gemini) {
    const existing = await prisma.aiModel.findFirst({ where: { providerId: gemini.id } });
    if (!existing) {
      await prisma.aiModel.createMany({
        data: [
          { providerId: gemini.id, modelIdentifier: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', contextWindow: 1048576, isActive: true },
          { providerId: gemini.id, modelIdentifier: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', contextWindow: 1048576, isActive: true },
        ],
      });
      console.log('  ✓ Gemini models: Gemini 1.5 Pro, Gemini 1.5 Flash');
    } else {
      console.log('  - Gemini models already exist, skipping');
    }
  }

  if (openaiCompat) {
    const existing = await prisma.aiModel.findFirst({ where: { providerId: openaiCompat.id } });
    if (!existing) {
      await prisma.aiModel.createMany({
        data: [
          { providerId: openaiCompat.id, modelIdentifier: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', contextWindow: 128000, isActive: true },
        ],
      });
      console.log('  ✓ OpenAI Compatible models: DeepSeek V4 Flash');
    } else {
      console.log('  - OpenAI Compatible models already exist, skipping');
    }
  }

  // ── SuperAdmin AI configuration and per-view rules ──
  // A fresh database has provider catalog data, but the application still
  // needs a user-owned configuration before AI can be enabled with a real key.
  const superAdmin = await prisma.user.findFirst({
    where: { isSuperAdmin: true },
    orderBy: { createdAt: 'asc' },
  });
  if (superAdmin) {
    for (const provider of [openai, gemini, openaiCompat].filter(Boolean)) {
      const selectedModel = await prisma.aiModel.findFirst({ where: { providerId: provider!.id, isActive: true }, orderBy: { id: 'asc' } });
      await prisma.userAiConfig.upsert({
        where: { userId_providerId: { userId: superAdmin.id, providerId: provider!.id } },
        update: {},
        create: { userId: superAdmin.id, providerId: provider!.id, selectedModelId: selectedModel?.id ?? null, isEnabled: false },
      });
    }
    for (const viewType of ['erd', 'notes', 'flowchart', 'db-client']) {
      await prisma.userAiRule.upsert({
        where: { userId_viewType: { userId: superAdmin.id, viewType } },
        update: {},
        create: { userId: superAdmin.id, viewType, content: '', isEnabled: true },
      });
    }
    console.log(`  ✓ AI configurations and rules for: ${superAdmin.email}`);
  } else {
    console.log('  - AI user configuration skipped; create the SuperAdmin first, then rerun the seed');
  }

  // ── Default system prompt ──
  const defaultSystemPrompt = `You are an AI assistant for ERD Builder Pro — an integrated workspace combining Database ERD diagrams, Flowcharts, and Markdown Notes.

Key capabilities:
- DBML is strict: use exactly the dbml fence, never yaml/arduino/markdown/schema/sql, and never nest fenced blocks.
- Use uppercase portable types, explicit VARCHAR/CHAR lengths, omit [null], and quote string defaults such as [default: 'pending'].
- Name each Enum exactly {table_name}_{column_name}; use one standalone Ref per relationship with compatible FK/PK types, no inline or duplicate references.
- Preflight balanced braces/fences, matching Enum blocks, existing references, and parser-valid DBML before responding.
- When creating or modifying ERD/database schemas, provide DBML in \`\`\`dbml blocks
- If a PRD, note, plan, or documentation includes a database schema section, use DBML for that section unless SQL is explicitly requested
- Use SQL only when the user explicitly asks for SQL, migrations, DDL, queries, or seed data
- DBML should use Table blocks, [pk], [not null], [note: '...'] for column comments, sized types like VARCHAR(100) and DECIMAL(10,2) when modifiers matter, Enum blocks when needed, and standalone Ref lines for relationships
- Always write VARCHAR with an explicit maximum length; default to VARCHAR(255) when the user does not specify one. Use explicit lengths for other bounded character types such as CHAR as well.
- Every enum-typed column must reference an Enum named exactly {table_name}_{column_name}, with a matching Enum block; never use a generic enum name.
- Declare each relationship once as Ref: child.parent_id > parents.id. Never use inline [ref: ...] attributes, never omit the > direction marker, and never duplicate a relationship.
- Use [unique] for one column. For composite unique constraints use Indexes { (column_a, column_b) [unique] } inside the Table block; never output unique (column_a, column_b).
- The DBML block must contain only DBML that ERD Builder Pro can parse directly without manual repair; prose belongs outside the block.
- For flowcharts, provide JSON with nodes/edges in \`\`\`json blocks
- Be concise and direct in your responses
- Help users design databases, create flowcharts, and take notes`;

  await prisma.aiSystemPrompt.upsert({
    where: { id: 'default-simple-direct' },
    update: {
      content: defaultSystemPrompt,
      isDefault: true,
      isBuiltIn: true,
    },
    create: {
      id: 'default-simple-direct',
      name: 'Simple & Direct',
      content: defaultSystemPrompt,
      category: 'system',
      isDefault: true,
      isBuiltIn: true,
      userId: null,
    },
  });
  console.log('  ✓ Default system prompt: Simple & Direct');

  console.log('\n✅ Seed complete');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
