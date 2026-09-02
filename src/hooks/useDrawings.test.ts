import { describe, expect, it } from 'vitest';
import { mergeSavedDrawingState } from './useDrawings';
import type { Drawing } from '../types';

const drawing = (data: string): Drawing => ({
  id: 7,
  uid: 'drawing-7',
  title: 'Sketch',
  data,
  project_id: 1,
  is_deleted: false,
  created_at: '',
  updated_at: '',
});

describe('mergeSavedDrawingState', () => {
  it('updates the same drawing selected by uid', () => {
    expect(mergeSavedDrawingState([drawing('')], drawing('{"elements":[1]}'))[0].data)
      .toBe('{"elements":[1]}');
  });
});
