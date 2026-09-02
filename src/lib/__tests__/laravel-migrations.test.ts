import { describe, expect, it } from 'vitest';
import { laravelMigrationsToDBML } from '../laravel-migrations';
import { parseRepositorySchema } from '../repository-schema';

describe('Laravel repository migrations', () => {
  const files = [
    {
      path: 'database/migrations/2026_01_01_000000_create_users_table.php',
      content: `<?php return new class extends Migration {
        public function up(): void {
          Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('email', 180)->unique()->comment('Login address');
            $table->timestamps();
          });
        }
        public function down(): void { Schema::dropIfExists('users'); }
      };`,
    },
    {
      path: 'database/migrations/2026_01_02_000000_create_posts_table.php',
      content: `<?php return new class extends Migration {
        public function up(): void {
          Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('body')->nullable();
          });
          Schema::table('users', function (Blueprint $table) {
            $table->renameColumn('email', 'login');
            $table->softDeletes();
          });
        }
      };`,
    },
  ];

  it('builds the final schema from ordered up migrations', () => {
    const result = laravelMigrationsToDBML(files);
    expect(result.dbml).toContain('Table "users"');
    expect(result.dbml).toContain('"login" VARCHAR(180)');
    expect(result.dbml).toContain('"deleted_at" TIMESTAMP');
    expect(result.dbml).toContain('Ref: "posts"."user_id" > "users"."id" [delete: cascade]');
    expect(result.dbml).not.toContain('Table "down"');
    expect(result.warnings).toEqual([]);
  });

  it('produces ERD nodes and an FK edge', () => {
    const result = parseRepositorySchema('laravel', files);
    expect(result.nodes.map(node => node.data.name).sort()).toEqual(['posts', 'users']);
    expect(result.nodes.find(node => node.data.name === 'users')?.data.columns.map(column => column.name)).toContain('login');
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].data).toMatchObject({ on_delete: 'cascade' });
  });

  it('keeps literal enums valid and falls back for dynamic enum values', () => {
    const migration = [{
      path: 'database/migrations/001_create_people.php',
      content: `<?php public function up(): void {
        Schema::create('people', function (Blueprint $table) {
          $table->uuid();
          $table->morphs('owner');
          $table->enum('status', ['active', 'inactive']);
          $table->enum('gender', array_keys(Gender::options()));
        });
      }`,
    }];

    const result = laravelMigrationsToDBML(migration);
    expect(result.dbml).toContain('Enum people_status');
    expect(result.dbml).toContain('"status" people_status');
    expect(result.dbml).toContain('"gender" VARCHAR');
    expect(result.dbml).toContain('"uuid" UUID');
    expect(result.dbml).toContain('"owner_type" VARCHAR');
    expect(result.dbml).toContain('"owner_id" BIGINT');
    expect(result.dbml).not.toContain('Enum people_gender');
    expect(result.warnings).toContainEqual(expect.stringContaining('dynamic values'));
    expect(() => parseRepositorySchema('laravel', migration)).not.toThrow();
  });
});
