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

function getProductCategories(sku: string): string[] {
  const upperSku = sku.toUpperCase();
  if (upperSku.startsWith('SONY')) {
    return ['Electronics', 'Audio', 'Headphones', 'Premium Noise Cancellation'];
  }
  if (upperSku.startsWith('APPLE')) {
    return ['Electronics', 'Audio', 'Wearables', 'Spatial Audio'];
  }
  if (upperSku.startsWith('CANON')) {
    return ['Electronics', 'Photography', 'Camera', 'Mirrorless 4K'];
  }
  if (upperSku.startsWith('SAMSUNG')) {
    return ['Electronics', 'Video', 'Television', 'QLED 4K Smart'];
  }
  if (upperSku.startsWith('DYSON')) {
    return ['Home Appliances', 'Vacuum', 'Smart Suction', 'Laser Detect'];
  }
  if (upperSku.startsWith('ASUS')) {
    return ['Electronics', 'Computers', 'Laptops', 'Gaming ROG'];
  }
  return ['Electronics', 'Premium Stock'];
}

function PanelStockBadge({ units }: { units: number }) {
  if (units === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        Out of Stock
      </span>
    );
  }
  if (units <= 2) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        Only {units} units left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      In Stock ({units} units)
    </span>
  );
}

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const found = data.find((p: Product) => p.id === params.id);
          if (found) {
            setProduct(found);
            // Default selected warehouse to the first one with stock, otherwise first warehouse
            const availableInvs = found.inventories.filter((inv: InventoryItem) => inv.availableUnits > 0);
            if (availableInvs.length > 0) {
              setSelectedWarehouseId(availableInvs[0].warehouseId);
            } else if (found.inventories.length > 0) {
              setSelectedWarehouseId(found.inventories[0].warehouseId);
            }
          } else {
            setError('Product not found');
          }
        } else {
          setError('Failed to fetch product data');
        }
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [params.id]);

  const selectedInventory = product?.inventories.find(
    (inv) => inv.warehouseId === selectedWarehouseId
  );

  const availableUnits = selectedInventory ? selectedInventory.availableUnits : 0;
  const totalUnits = selectedInventory ? selectedInventory.totalUnits : 0;
  const percent = totalUnits > 0 ? (availableUnits / totalUnits) * 100 : 0;
  const canReserve = availableInventoryCount() > 0 && selectedInventory && availableUnits > 0;

  // Reset quantity when warehouse selection changes
  useEffect(() => {
    if (selectedInventory) {
      if (selectedInventory.availableUnits > 0) {
        setQuantity(1);
      } else {
        setQuantity(0);
      }
    }
  }, [selectedWarehouseId, selectedInventory]);

  function availableInventoryCount() {
    if (!product) return 0;
    return product.inventories.reduce((sum, inv) => sum + inv.availableUnits, 0);
  }

  const handleAddToCart = () => {
    if (!product || !selectedInventory || availableUnits <= 0) return;

    addItem({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      price: product.price,
      imageUrl: product.imageUrl,
      warehouseId: selectedWarehouseId,
      warehouseName: selectedInventory.warehouse.name,
      quantity: quantity,
    });

    setAddedToCart(true);
    toast.success(`Added ${quantity} x "${product.name}" to cart!`);
    setTimeout(() => {
      setAddedToCart(false);
    }, 1500);
  };

  const handleReserveNow = async () => {
    if (!product || !selectedInventory || availableUnits <= 0 || isReserving) return;
    setIsReserving(true);

    try {
      const idempotencyKey = `reserve-direct-${product.id}-${selectedWarehouseId}-${Date.now()}`;
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: selectedWarehouseId,
          quantity: quantity,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Insufficient stock or reservation error.');
        return;
      }

      toast.success('Inventory held successfully!');
      router.push(`/checkout/${data.id}`);
    } catch (e) {
      console.error('Reservation error:', e);
      toast.error('Network or connection error. Please try again.');
    } finally {
      setIsReserving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-pulse">
        {/* Breadcrumb Skeleton */}
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-8" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Left Column Skeleton */}
          <div className="lg:col-span-7 space-y-6">
            <div className="aspect-[4/3] bg-gray-200 rounded-2xl w-full" />
            <div className="h-8 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded w-full" />
              <div className="h-3 bg-gray-200 rounded w-full" />
              <div className="h-3 bg-gray-200 rounded w-4/5" />
            </div>
            <div className="flex gap-2">
              <div className="h-6 bg-gray-200 rounded-full w-16" />
              <div className="h-6 bg-gray-200 rounded-full w-20" />
              <div className="h-6 bg-gray-200 rounded-full w-24" />
            </div>
          </div>

          {/* Right Column Skeleton */}
          <div className="lg:col-span-5 bg-white border border-gray-200 rounded-2xl p-6 h-fit space-y-6">
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-10 bg-gray-200 rounded-xl" />
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-14 bg-gray-200 rounded-xl" />
            <div className="h-12 bg-gray-200 rounded-xl" />
            <div className="h-12 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Product Not Found</h2>
          <p className="text-gray-500 mb-6">{error || 'The requested product could not be located.'}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 transition-all duration-500 ease-out transform ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      {/* Navigation Headers & Breadcrumb */}
      <div className="flex flex-col gap-2 mb-8">
        <Link href="/" className="text-sm text-blue-600 hover:underline flex items-center gap-1 font-medium w-fit">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to products
        </Link>
        <div className="flex items-center gap-2 text-xs text-gray-400 mt-1 font-medium">
          <Link href="/" className="hover:text-gray-600">Products</Link>
          <span>/</span>
          <span className="text-gray-600 font-semibold">{product.name}</span>
        </div>
      </div>

      {/* Main Grid Detail Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        
        {/* Left Side Panel - Product visuals */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm aspect-[4/3] relative bg-gray-50">
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
            />
            {availableInventoryCount() === 0 && (
              <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center">
                <span className="text-white font-bold text-xl uppercase tracking-wide px-4 py-2 border-2 border-white rounded-lg">Sold Out</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-gray-100 text-gray-500 font-mono text-xs font-semibold px-2.5 py-1 rounded-md border border-gray-250/30">
                SKU: {product.sku}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
              {product.name}
            </h1>

            <p className="text-2xl sm:text-3xl font-black text-gray-900">
              ₹{product.price.toLocaleString('en-IN')}
            </p>

            <div className="border-t border-gray-100 pt-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-2">Description</h3>
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>

            {/* Tag/Badge row showing categories pulled from SKU */}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
              {getProductCategories(product.sku).map((cat, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-50 text-gray-600 border border-gray-200/80"
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side Panel - Purchase Panel */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex justify-between items-center gap-4 border-b border-gray-100 pb-4">
              <h2 className="text-lg font-bold text-gray-900">Reserve Stock</h2>
              <PanelStockBadge units={availableUnits} />
            </div>

            {/* Warehouse Selector */}
            {product.inventories.length > 0 ? (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Select Warehouse Location
                </label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full text-sm font-semibold text-gray-800 border border-gray-200 rounded-xl px-3.5 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-shadow"
                >
                  {product.inventories.map((inv) => (
                    <option key={inv.warehouseId} value={inv.warehouseId}>
                      {inv.warehouse.name} ({inv.availableUnits} available)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No warehouse inventory records available</p>
            )}

            {/* Stock Progress Bar (available / total) */}
            {selectedInventory && selectedInventory.totalUnits > 0 && (
              <div className="space-y-2 border-t border-gray-50 pt-4">
                <div className="flex justify-between items-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <span>Warehouse Capacity</span>
                  <span className="font-mono text-gray-700">{availableUnits} / {totalUnits} Units</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      availableUnits === 0
                        ? 'bg-red-500'
                        : availableUnits <= 2
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Quantity Selector */}
            {selectedInventory && (
              <div className="flex items-center justify-between border-t border-gray-50 pt-4">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Quantity
                </span>
                <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50/50 p-1 overflow-hidden">
                  <button
                    disabled={quantity <= 1 || availableUnits === 0}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-white rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold select-none text-base"
                  >
                    －
                  </button>
                  <span className="px-4 text-sm font-bold text-gray-800 font-mono min-w-[2.5rem] text-center">
                    {quantity}
                  </span>
                  <button
                    disabled={quantity >= availableUnits || availableUnits === 0}
                    onClick={() => setQuantity((q) => Math.min(availableUnits, q + 1))}
                    className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-white rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold select-none text-base"
                  >
                    ＋
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3 pt-4 border-t border-gray-50">
              <button
                onClick={handleAddToCart}
                disabled={!canReserve || addedToCart}
                className={`w-full py-3.5 px-4 rounded-xl text-sm font-bold transition-all duration-150 flex items-center justify-center gap-2 ${
                  addedToCart
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : canReserve
                    ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-sm hover:shadow'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {addedToCart ? (
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

              <button
                onClick={handleReserveNow}
                disabled={!canReserve || isReserving}
                className={`w-full py-3.5 px-4 rounded-xl text-sm font-bold transition-all duration-150 border flex items-center justify-center gap-2 ${
                  canReserve
                    ? 'bg-white border-blue-600 text-blue-600 hover:bg-blue-50 active:scale-[0.98]'
                    : 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                }`}
              >
                {isReserving ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Holding stock…
                  </>
                ) : (
                  'Reserve Now'
                )}
              </button>

              {/* Reservation Info Note */}
              <p className="text-[11px] text-gray-400 text-center mt-3 leading-normal">
                Items are held for 10 minutes after reserving.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Inventory Table below */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm mt-10">
        <div className="px-6 py-4 border-b border-gray-150 bg-gray-50/50">
          <h3 className="font-bold text-gray-900 text-base">Inventory Status by Warehouse</h3>
          <p className="text-xs text-gray-500 mt-0.5">Real-time stock reservation levels across all fulfillment nodes</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500">
            <thead className="bg-gray-50/70 text-[10px] uppercase tracking-wider text-gray-400 font-bold border-b border-gray-100">
              <tr>
                <th className="px-6 py-3.5">Warehouse</th>
                <th className="px-6 py-3.5">Location</th>
                <th className="px-6 py-3.5 text-right">Total Stock</th>
                <th className="px-6 py-3.5 text-right">Reserved</th>
                <th className="px-6 py-3.5 text-right">Available</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {product.inventories.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50/30 transition-colors">
                  <td className="px-6 py-4 font-semibold text-gray-800">{inv.warehouse.name}</td>
                  <td className="px-6 py-4 text-gray-600">{inv.warehouse.location}</td>
                  <td className="px-6 py-4 text-right font-mono text-gray-700">{inv.totalUnits}</td>
                  <td className="px-6 py-4 text-right font-mono text-red-400">{inv.reservedUnits}</td>
                  <td className="px-6 py-4 text-right">
                    <span
                      className={`font-mono font-bold ${
                        inv.availableUnits === 0
                          ? 'text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100'
                          : inv.availableUnits <= 2
                          ? 'text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100'
                          : 'text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100'
                      }`}
                    >
                      {inv.availableUnits} Available
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
