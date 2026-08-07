import { describe, expect, it } from 'vitest';
import { databaseColumnToERD, formatColumnType } from '../column-metadata';

describe('databaseColumnToERD', () => {
  it('keeps database lengths and unsigned types without treating integer precision as a display width', () => {
    const id = databaseColumnToERD({
      name: 'id', type: 'int', full_type: 'int unsigned', numeric_precision: 10, numeric_scale: 0,
    }, 'id');
    const users = databaseColumnToERD({
      name: 'users', type: 'bigint', full_type: 'bigint unsigned', numeric_precision: 20, numeric_scale: 0,
    }, 'users');
    const name = databaseColumnToERD({
      name: 'name', type: 'varchar', full_type: 'varchar(255)', max_length: 255,
    }, 'name');
    const price = databaseColumnToERD({
      name: 'price', type: 'decimal', full_type: 'decimal(10,2)', numeric_precision: 10, numeric_scale: 2,
    }, 'price');
    const unsignedPrice = databaseColumnToERD({
      name: 'unsigned_price', type: 'decimal', full_type: 'decimal(10,2) unsigned', numeric_precision: 10, numeric_scale: 2,
    }, 'unsigned_price');

    expect(id.numeric_precision).toBeNull();
    expect(users.numeric_precision).toBeNull();
    expect(formatColumnType(id.type, id.max_length, id.numeric_precision, id.numeric_scale)).toBe('INT UNSIGNED');
    expect(formatColumnType(users.type, users.max_length, users.numeric_precision, users.numeric_scale)).toBe('BIGINT UNSIGNED');
    expect(formatColumnType(name.type, name.max_length, name.numeric_precision, name.numeric_scale)).toBe('VARCHAR(255)');
    expect(formatColumnType(price.type, price.max_length, price.numeric_precision, price.numeric_scale)).toBe('DECIMAL(10,2)');
    expect(formatColumnType(unsignedPrice.type, unsignedPrice.max_length, unsignedPrice.numeric_precision, unsignedPrice.numeric_scale)).toBe('DECIMAL(10,2) UNSIGNED');
  });
});
