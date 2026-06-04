import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { scryptSync, randomBytes } from 'crypto';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const url = process.env.DATABASE_URL || 'file:./data.db';
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url }),
});

async function main() {
  console.log('Seeding SQLite database...');

  // ── Admin user ──
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@local.dev';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
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
    { name: 'Google Gemini', code: 'gemini', baseUrl: null },
    { name: 'OpenAI Compatible', code: 'openai_compatible', baseUrl: 'https://ai.sumopod.com/v1' },
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

  // ── AI Models (re-create per provider for determinism) ──
  const openai = await prisma.aiProvider.findUnique({ where: { code: 'openai' } });
  const gemini = await prisma.aiProvider.findUnique({ where: { code: 'gemini' } });
  const openaiCompat = await prisma.aiProvider.findUnique({ where: { code: 'openai_compatible' } });

  if (openai) {
    await prisma.aiModel.deleteMany({ where: { providerId: openai.id } });
    await prisma.aiModel.createMany({
      data: [
        { providerId: openai.id, modelIdentifier: 'gpt-4o', displayName: 'GPT-4o', contextWindow: 128000, isActive: true },
        { providerId: openai.id, modelIdentifier: 'gpt-4o-mini', displayName: 'GPT-4o Mini', contextWindow: 128000, isActive: true },
        { providerId: openai.id, modelIdentifier: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', contextWindow: 128000, isActive: true },
      ],
    });
    console.log('  ✓ OpenAI models: GPT-4o, GPT-4o Mini, GPT-4 Turbo');
  }

  if (gemini) {
    await prisma.aiModel.deleteMany({ where: { providerId: gemini.id } });
    await prisma.aiModel.createMany({
      data: [
        { providerId: gemini.id, modelIdentifier: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', contextWindow: 1048576, isActive: true },
        { providerId: gemini.id, modelIdentifier: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', contextWindow: 1048576, isActive: true },
      ],
    });
    console.log('  ✓ Gemini models: Gemini 1.5 Pro, Gemini 1.5 Flash');
  }

  if (openaiCompat) {
    await prisma.aiModel.deleteMany({ where: { providerId: openaiCompat.id } });
    await prisma.aiModel.createMany({
      data: [
        { providerId: openaiCompat.id, modelIdentifier: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', contextWindow: 128000, isActive: true },
      ],
    });
    console.log('  ✓ OpenAI Compatible models: DeepSeek V4 Flash');
  }

  // ── Default system prompt ──
  await prisma.aiSystemPrompt.upsert({
    where: { id: 'default-simple-direct' },
    update: {},
    create: {
      id: 'default-simple-direct',
      name: 'Simple & Direct',
      content: `You are an AI assistant for ERD Builder Pro — an integrated workspace combining Database ERD diagrams, Flowcharts, and Markdown Notes.

Key capabilities:
- When discussing database schemas, provide SQL DDL in \`\`\`sql blocks
- For flowcharts, provide JSON with nodes/edges in \`\`\`json blocks
- Be concise and direct in your responses
- Help users design databases, create flowcharts, and take notes`,
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
