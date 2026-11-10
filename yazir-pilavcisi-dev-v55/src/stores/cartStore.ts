import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProductVariant, Product } from '@/types/database';

export interface CartItem {
  key: string;
  productId: string;
  variantId: string;
  productName: string;
  productSlug?: string;
  variantName: string;
  emoji: string | null;
  image_path?: string | null;
  price: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  tableToken: string | null;

  addItem: (product: Product, variant: ProductVariant) => void;
  removeItem: (key: string) => void;
  changeQty: (key: string, delta: number) => void;
  clearCart: () => void;
  setTableToken: (token: string | null) => void;

  // Computed
  total: () => number;
  count: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      tableToken: null,

      addItem: (product, variant) => {
        const key = `${product.id}_${variant.id}`;
        set((state) => {
          const existing = state.items.find((i) => i.key === key);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.key === key ? { ...i, quantity: i.quantity + 1 } : i,
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                key,
                productId: product.id,
                variantId: variant.id,
                productName: product.name,
                productSlug: product.slug || undefined,
                variantName: variant.name,
                emoji: product.emoji,
                image_path: product.image_path,
                price: variant.price,
                quantity: 1,
              },
            ],
          };
        });
      },

      removeItem: (key) => {
        set((state) => ({
          items: state.items.filter((i) => i.key !== key),
        }));
      },

      changeQty: (key, delta) => {
        set((state) => ({
          items: state.items
            .map((i) => (i.key === key ? { ...i, quantity: i.quantity + delta } : i))
            .filter((i) => i.quantity > 0),
        }));
      },

      clearCart: () => set({ items: [] }),

      setTableToken: (token) => set({ tableToken: token }),

      total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: 'yazir-cart',
      partialize: (state) => ({ items: state.items, tableToken: state.tableToken }),
    },
  ),
);
