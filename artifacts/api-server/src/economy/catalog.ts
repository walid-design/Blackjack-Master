export const STARTER_CHIPS = 10_000;
export const DAILY_CHIPS = 2_000;

export interface ServerChipProduct {
  sku: string;
  name: string;
  chips: number;
  bonus: number;
  priceMinor: number;
  currency: 'USD';
}

export const CHIP_PRODUCTS: readonly ServerChipProduct[] = Object.freeze([
  { sku: 'chips_12000', name: 'Starter Stack', chips: 12_000, bonus: 0, priceMinor: 199, currency: 'USD' },
  { sku: 'chips_35000', name: 'Table Regular', chips: 35_000, bonus: 5_000, priceMinor: 499, currency: 'USD' },
  { sku: 'chips_80000', name: 'High Roller', chips: 80_000, bonus: 20_000, priceMinor: 999, currency: 'USD' },
  { sku: 'chips_200000', name: 'Royal Vault', chips: 200_000, bonus: 75_000, priceMinor: 1999, currency: 'USD' },
]);

export function findChipProduct(sku: string) {
  return CHIP_PRODUCTS.find(product => product.sku === sku);
}
