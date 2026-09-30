import { describe, expect, it } from 'vitest';
import { mergeLiveMessages } from './ERDComments';

const message = (id: string, threadId: string, body = id) => ({
  id, threadId, body, authorId: 'member', authorName: 'Member', createdAt: '2026-09-30T00:00:00Z',
});

describe('comment history after remote deletion', () => {
  it('clears deleted thread history and pagination', () => {
    const result = mergeLiveMessages({ messages: [message('old', 'deleted')], hasMore: true, nextCursor: { createdAt: '2026-09-30T00:00:00Z', id: 'old' } }, [], { hasMore: false, nextCursor: null }, new Set());
    expect(result).toEqual({ messages: [], hasMore: false, nextCursor: null });
  });

  it('keeps loaded history for surviving threads and applies incoming edits', () => {
    const loaded = Array.from({ length: 120 }, (_, index) => message(`message-${String(index).padStart(3, '0')}`, 'live'));
    const result = mergeLiveMessages({ messages: [...loaded, message('removed', 'deleted')], hasMore: true, nextCursor: null }, [message('message-119', 'live', 'edited')], { hasMore: false, nextCursor: null }, new Set(['live']));
    expect(result.messages).toEqual([...loaded.slice(0, -1), message('message-119', 'live', 'edited')]);
    expect(result.hasMore).toBe(true);
  });

  it('does not carry pagination from a deleted thread into its replacement', () => {
    const result = mergeLiveMessages({ messages: [message('old', 'deleted')], hasMore: true, nextCursor: null }, [message('new', 'replacement')], { hasMore: false, nextCursor: null }, new Set(['replacement']));
    expect(result).toEqual({ messages: [message('new', 'replacement')], hasMore: false, nextCursor: null });
  });
});
