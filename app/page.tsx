'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useCart } from '@/context/CartContext';

interface Warehouse {
  id: string;
  name: string;
  location: string;
}

interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
  warehouse: Warehouse;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  price: number;
  imageUrl: string;
  inventories: InventoryItem[];
}

function StockBadge({ units }: { units: number }) {
  if (units === 0)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-450 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 px-2.5 py-1 rounded-full shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Out of stock
      </span>
    );
  if (units <= 2)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-450 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 px-2.5 py-1 rounded-full shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        Only {units} left
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-450 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 px-2.5 py-1 rounded-full shadow-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      {units} available
    </span>
  );
}

function ProductCard({ product, index }: { product: Product; index: number }) {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const availableInventories = product.inventories.filter((inv) => inv.availableUnits > 0);

  useEffect(() => {
    if (availableInventories.length > 0 && !selectedWarehouseId) {
      setSelectedWarehouseId(availableInventories[0].warehouseId);
    }
  }, [availableInventories, selectedWarehouseId]);

  const selectedInventory = product.inventories.find(
    (inv) => inv.warehouseId === selectedWarehouseId
  );

  const canReserve = selectedInventory && selectedInventory.availableUnits > 0;
  const totalAvailable = product.inventories.reduce((sum, inv) => sum + inv.availableUnits, 0);

  function handleAddToCart() {
    if (!selectedWarehouseId || !selectedInventory) return;
    
    addItem({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      price: product.price,
      imageUrl: product.imageUrl,
      warehouseId: selectedWarehouseId,
      warehouseName: selectedInventory.warehouse.name,
      quantity: 1,
    });
    
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div
      style={{ animationDelay: `${index * 75}ms` }}
      className="animate-fade-up group relative rounded-2xl border border-border bg-surface overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col"
    >
      {/* Dynamic left accent border on hover */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-accentColor transform scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-300 rounded-l-2xl z-10" />

      <Link
        href={`/products/${product.id}`}
        className="relative aspect-[4/3] overflow-hidden bg-gray-150/10 block"
      >
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />
        {totalAvailable === 0 && (
          <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center">
            <span className="text-white font-bold text-sm uppercase tracking-wider px-3 py-1.5 border border-white rounded-lg bg-gray-900/30 backdrop-blur-xs">Sold Out</span>
          </div>
        )}
      </Link>

      <div className="p-5 flex flex-col flex-1 gap-3">
        <div>
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h3 className="font-bold text-text1 text-base leading-snug hover:text-accentColor transition-colors duration-200 line-clamp-1 flex-1">
              <Link href={`/products/${product.id}`}>
                {product.name}
              </Link>
            </h3>
            <StockBadge units={selectedInventory?.availableUnits ?? totalAvailable} />
          </div>
          <p className="text-[10px] text-text3 font-mono font-semibold uppercase tracking-wider">SKU: {product.sku}</p>
          <p className="text-sm text-text2 mt-2 line-clamp-2 min-h-[2.5rem] leading-relaxed">{product.description}</p>
        </div>

        <div className="mt-auto space-y-4 pt-2">
          <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-900/40 pt-3">
            <span className="text-[1.4rem] font-bold text-text1 font-mono tracking-tight">
              ₹{product.price.toLocaleString('en-IN')}
            </span>
          </div>

          {product.inventories.length > 0 ? (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-text3 uppercase tracking-wider">
                Select Warehouse
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full text-sm font-semibold text-text2 border border-border rounded-xl px-3 py-2.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accentColor cursor-pointer transition-shadow"
              >
                {product.inventories.map((inv) => (
                  <option key={inv.warehouseId} value={inv.warehouseId}>
                    {inv.warehouse.name} — {inv.availableUnits} available
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-text3 italic">No inventory records</p>
          )}

          <button
            onClick={handleAddToCart}
            disabled={!canReserve}
            className={`w-full py-3 px-4 rounded-xl text-sm font-bold transition-all duration-150 border-0 outline-none flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-accentColor ${
              added
                ? 'bg-emerald-600 text-white shadow-md'
                : canReserve
                ? 'bg-accentColor text-white hover:bg-accentHover hover:scale-[1.02] hover:shadow active:scale-[0.98] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] cursor-pointer'
                : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
            }`}
          >
            {added ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Added to Cart ✓
              </span>
            ) : canReserve ? (
              'Add to Cart'
            ) : (
              'Out of Stock'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
        else setError('Failed to load products');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-text1 tracking-tight mb-2">Products</h1>
        <p className="text-text2 font-medium">
          Reserve an item to hold it for 10 minutes while you complete checkout.
        </p>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface rounded-2xl border border-border overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-gray-250/20" />
              <div className="p-5 space-y-3">
                <div className="h-4 bg-gray-255/10 rounded w-3/4" />
                <div className="h-3 bg-gray-255/10 rounded w-1/2" />
                <div className="h-3 bg-gray-255/10 rounded w-full" />
                <div className="h-8 bg-gray-255/10 rounded" />
                <div className="h-10 bg-gray-255/10 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-xl px-6 py-4 font-semibold">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mb-6 flex items-center">
            <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-bold bg-surface border border-border text-text2 shadow-xs font-mono uppercase tracking-wider">
              {products.length} product{products.length !== 1 ? 's' : ''} found
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
