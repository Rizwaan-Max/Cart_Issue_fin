'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Out of stock
      </span>
    );
  if (units <= 2)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        Only {units} left
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      {units} available
    </span>
  );
}

function ProductCard({ product }: { product: Product }) {
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
    setTimeout(() => setAdded(false), 1000);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col">
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
        />
        {totalAvailable === 0 && (
          <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center">
            <span className="text-white font-semibold text-lg">Sold Out</span>
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1 gap-3">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 text-base leading-snug">{product.name}</h3>
            <StockBadge units={selectedInventory?.availableUnits ?? totalAvailable} />
          </div>
          <p className="text-xs text-gray-400 font-mono">SKU: {product.sku}</p>
          <p className="text-sm text-gray-600 mt-2 line-clamp-2">{product.description}</p>
        </div>

        <div className="mt-auto space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-gray-900">
              ₹{product.price.toLocaleString('en-IN')}
            </span>
          </div>

          {product.inventories.length > 0 ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Select Warehouse
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {product.inventories.map((inv) => (
                  <option key={inv.warehouseId} value={inv.warehouseId}>
                    {inv.warehouse.name} — {inv.availableUnits} available
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No inventory records</p>
          )}

          <button
            onClick={handleAddToCart}
            disabled={!canReserve}
            className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-150 ${
              added
                ? 'bg-emerald-600 text-white shadow-sm'
                : canReserve
                ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-sm hover:shadow'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {added ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Added!
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Products</h1>
        <p className="text-gray-500">
          Reserve an item to hold it for 10 minutes while you complete checkout.
        </p>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-gray-200" />
              <div className="p-5 space-y-3">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
                <div className="h-3 bg-gray-200 rounded w-full" />
                <div className="h-8 bg-gray-200 rounded" />
                <div className="h-10 bg-gray-200 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-6 py-4">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="text-sm text-gray-400 mb-6">
            {products.length} product{products.length !== 1 ? 's' : ''} found
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
