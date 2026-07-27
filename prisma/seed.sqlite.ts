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

  // ── Admin user ──
  const adminEmail = 'admin@local.dev';
  const adminPassword = 'admin123';
  const hashedPassword = hashPassword(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'Admin',
      password: hashedPassword,
    },
  });
  console.log(`  ✓ Admin user: ${admin.email}`);

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

  // ── Default system prompt ──
  const defaultSystemPrompt = `You are an AI assistant for ERD Builder Pro — an integrated workspace combining Database ERD diagrams, Flowcharts, and Markdown Notes.

Key capabilities:
- When creating or modifying ERD/database schemas, provide DBML in \`\`\`dbml blocks
- If a PRD, note, plan, or documentation includes a database schema section, use DBML for that section unless SQL is explicitly requested
- Use SQL only when the user explicitly asks for SQL, migrations, DDL, queries, or seed data
- DBML should use Table blocks, [pk], [not null], [note: '...'] for column comments, sized types like VARCHAR(100) and DECIMAL(10,2) when modifiers matter, Enum blocks when needed, and Ref lines for relationships
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
