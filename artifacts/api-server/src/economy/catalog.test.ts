import assert from 'node:assert/strict';
import test from 'node:test';
import { CHIP_PRODUCTS, findChipProduct } from './catalog.ts';

test('chip catalog has stable unique SKUs and positive prices and grants', () => {
  assert.equal(new Set(CHIP_PRODUCTS.map(product => product.sku)).size, CHIP_PRODUCTS.length);
  for (const product of CHIP_PRODUCTS) {
    assert.ok(product.priceMinor > 0);
    assert.ok(product.chips > 0);
    assert.ok(product.bonus >= 0);
  }
});

test('the server, not a browser amount, resolves the purchased chip grant', () => {
  const product = findChipProduct('chips_35000');
  assert.ok(product);
  assert.equal(product.chips + product.bonus, 40_000);
  assert.equal(findChipProduct('made-up-browser-sku'), undefined);
});
