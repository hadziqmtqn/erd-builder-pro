import { describe, expect, it } from 'vitest';
import { collectPlanQuestionEntries, extractPlanQuestion, formatPlanAnswer, formatPlanFeedback, hasSubstantivePlanContent, hidePlanQuestionProtocol, isPlanAnswer, isPlanResponse, normalizePlanMarkdown, parsePlanResponse } from './plan-question-utils';

describe('plan question protocol', () => {
  it('extracts one valid question without showing its JSON to users', () => {
    const result = extractPlanQuestion(`Choose a direction first.\n\n\`\`\`plan-question\n{"id":"scope","question":"Choose scope","type":"single","options":["MVP","Full"],"recommendedOption":"MVP","allowCustom":true}\n\`\`\``);
    expect(result).toMatchObject({
      content: 'Choose a direction first.',
      question: { id: 'scope', type: 'single', recommendedOption: 'MVP', allowCustom: true },
    });
  });

  it('accepts the provider plan fence alias while keeping the protocol hidden', () => {
    const content = 'I need one decision.\n```plan\n{"id":"stack","question":"Choose stack","type":"single","options":["Laravel","Node.js"],"recommendedOption":"Laravel","allowCustom":true}\n```';
    expect(extractPlanQuestion(content)).toMatchObject({
      content: 'I need one decision.',
      question: { id: 'stack', recommendedOption: 'Laravel' },
    });
    expect(hidePlanQuestionProtocol('I need one decision.\n```plan\n{"id":"stack"')).toBe('I need one decision.');
  });

  it('renders multiple recommended options from the semicolon format', () => {
    const result = extractPlanQuestion(`\`\`\`\`kotlin
Stack ditetapkan: **Laravel + MySQL** dan **React**.

Sekarang tentukan struktur otorisasi untuk memastikan orang tua hanya melihat data anaknya dan admin mengelola sekolah:
\`\`\`plan-question
{"id":"rbac","question":"Struktur peran dan akses sistem?","type":"multiple","options":["Admin Sekolah & Operator Keuangan","Guru Kelas (Input Data Siswa)","Orang Tua/Wali Murid (Cek Pembayaran)","Pusatkan semua di tabel User single-table"],"recommendedOption":"Admin Sekolah & Operator Keuangan; Orang Tua/Wali Murid (Cek Pembayaran); Pusatkan semua di tabel User single-table","allowCustom":true}
\`\`\`

Konfirmasi role lanjut susun skema DB lengkap dan alur transaksi pembayaran.
\`\`\`\``);

    expect(result?.question.recommendedOptions).toEqual([
      'Admin Sekolah & Operator Keuangan',
      'Orang Tua/Wali Murid (Cek Pembayaran)',
      'Pusatkan semua di tabel User single-table',
    ]);
    expect(result?.content).toContain('**Laravel + MySQL**');
    expect(result?.content).not.toContain('```kotlin');
  });

  it('canonicalizes one unique provider word typo in a recommendation', () => {
    const result = extractPlanQuestion('```plan-question\n{"id":"fee_structure","question":"Bagaimana struktur biaya yang diterapkan di sistem?","type":"single","options":["Biaya tetap & terstruktur (contoh: SPP bulanan, uang seragam di awal)","Biaya fleksibel (Bendahara input manual total tagihan per siswa)","Menggabungkan keduanya - template default yang bisa dikustomisasi penuh"],"recommendedOption":"Menggabungkan keduanya - template default tapi bisa dikustomisasi penuh","allowCustom":true}\n```');
    expect(result?.question.recommendedOption).toBe('Menggabungkan keduanya - template default yang bisa dikustomisasi penuh');
    expect(result?.question.recommendedOptions).toEqual(['Menggabungkan keduanya - template default yang bisa dikustomisasi penuh']);
  });

  it('unwraps an outer markdown fence while preserving an inner DBML fence', () => {
    const content = '```markdown\n# Rencana\n\n```dbml\nTable users {\n  id BIGINT [pk]\n}\n```\n\n## Delivery\n- Build\n```';
    const normalized = normalizePlanMarkdown(content);
    expect(normalized).toContain('# Rencana');
    expect(normalized).toContain('```dbml');
    expect(normalized).toContain('## Delivery');
    expect(normalized).not.toMatch(/^```markdown/);
  });

  it('rejects batches, invalid option counts, and a recommendation outside the options', () => {
    expect(extractPlanQuestion('```plan-question\n{"questions":[]}\n```')).toBeNull();
    expect(extractPlanQuestion('```plan-question\n{"question":"x","type":"single","options":["A"],"recommendedOption":"A"}\n```')).toBeNull();
    expect(extractPlanQuestion('```plan-question\n{"question":"x","type":"single","options":["A","B"],"recommendedOption":"C"}\n```')).toBeNull();
  });

  it('marks interactive answers so historical cards stay disabled after reload', () => {
    const question = extractPlanQuestion('```plan-question\n{"question":"x","type":"multiple","options":["A","B"],"recommendedOption":"A"}\n```')?.question;
    expect(question).toBeDefined();
    const answer = formatPlanAnswer(question!, ['A'], 'Custom');
    expect(isPlanAnswer(answer)).toBe(true);
  });

  it('does not include an unselected custom input in the submitted answer', () => {
    const question = extractPlanQuestion('```plan-question\n{"question":"x","type":"single","options":["A","B"],"recommendedOption":"A"}\n```')?.question;
    expect(formatPlanAnswer(question!, ['A'], '')).toContain('Answer: A');
  });

  it('restores selected and custom answers from persisted messages', () => {
    const question = extractPlanQuestion('```plan-question\n{"question":"x","type":"multiple","options":["A","B"],"recommendedOption":"A"}\n```')?.question;
    const content = formatPlanAnswer(question!, ['A'], 'Custom details');
    expect(parsePlanResponse(content, question!)).toMatchObject({
      kind: 'answer',
      selected: ['A'],
      customAnswer: 'Custom details',
    });
  });

  it('collects all Plan questions into one ordered interview history', () => {
    const messages = [
      { id: 'q1', role: 'assistant', content: '```plan-question\n{"question":"Scope?","type":"single","options":["MVP","Full"],"recommendedOption":"MVP"}\n```' },
      { id: 'a1', role: 'user', content: '[Plan answer]\nQuestion: Scope?\nAnswer: MVP' },
      { id: 'q2', role: 'assistant', content: '```plan-question\n{"question":"Stack?","type":"single","options":["Laravel","React"],"recommendedOption":"Laravel"}\n```' },
    ] as any;
    const entries = collectPlanQuestionEntries(messages);
    expect(entries).toHaveLength(2);
    expect(entries[0].response).toMatchObject({ kind: 'answer', selected: ['MVP'] });
    expect(entries[1].response).toBeNull();
  });

  it('marks Plan feedback as answered and hides an in-progress protocol block', () => {
    const question = extractPlanQuestion('```plan-question\n{"question":"x","type":"single","options":["A","B"],"recommendedOption":"A"}\n```')?.question;
    expect(isPlanResponse(formatPlanFeedback(question!, 'not-relevant'))).toBe(true);
    expect(parsePlanResponse(formatPlanFeedback(question!, 'skip'))).toMatchObject({ kind: 'feedback', action: 'skip' });
    expect(hidePlanQuestionProtocol('Choosing now.\n```plan-question\n{"id":"scope"')).toBe('Choosing now.');
  });

  it('keeps a generated PRD visible when an AI response also asks one next question', () => {
    expect(hasSubstantivePlanContent('Choose a database direction first.')).toBe(false);
    expect(hasSubstantivePlanContent('# PRD Aplikasi SPP\n\n## Stack\n- Laravel\n- PostgreSQL\n\n## RBAC\nAdmin dan bendahara.')).toBe(true);
  });
});
