'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { toast } from 'sonner';

export default function CartPage() {
  const { items, updateQuantity, removeItem, totalPrice, totalItems, isHydrated } = useCart();
  const [checkingOut, setCheckingOut] = useState(false);
  const router = useRouter();

  async function handleProceedToCheckout() {
    if (items.length === 0 || checkingOut) return;
    setCheckingOut(true);

    const successfulReservations: string[] = [];
    let checkoutFailed = false;
    let failedItemName = '';
    let failureReason = '';

    try {
      // Parallely request reservations
      const reservationPromises = items.map(async (item) => {
        const idempotencyKey = `reserve-${item.productId}-${item.warehouseId}-${Date.now()}`;
        const res = await fetch('/api/reservations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            productId: item.productId,
            warehouseId: item.warehouseId,
            quantity: item.quantity,
          }),
        });

        const data = await res.json();
        return { item, ok: res.ok, status: res.status, data };
      });

      const results = await Promise.all(reservationPromises);

      // Analyze results
      for (const res of results) {
        if (res.ok && res.data?.id) {
          successfulReservations.push(res.data.id);
        } else {
          checkoutFailed = true;
          failedItemName = res.item.productName;
          failureReason = res.data?.error || 'Insufficient stock or system error';
          break; // Stop evaluating to rollback the ones that succeeded
        }
      }

      if (checkoutFailed) {
        // ROLLBACK: Release successfully created reservations so they don't lock inventory
        if (successfulReservations.length > 0) {
          await Promise.all(
            successfulReservations.map((id) =>
              fetch(`/api/reservations/${id}/release`, { method: 'POST' })
            )
          );
        }
        toast.error(`Stock Error: "${failedItemName}" failed checkout. ${failureReason}`);
      } else {
        // Redirect to /cart/checkout with reservation IDs in query parameter
        toast.success('Inventory held! Redirecting to checkout...');
        router.push(`/cart/checkout?ids=${successfulReservations.join(',')}`);
      }
    } catch (e) {
      console.error('Checkout error:', e);
      toast.error('Network or connection error during checkout. Please try again.');
    } finally {
      setCheckingOut(false);
    }
  }

  if (!isHydrated) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-gray-500">Loading your cart…</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h2>
        <p className="text-gray-500 mb-8 max-w-md mx-auto">
          You haven't added any products to your cart yet. Explore our stock list and hold your inventory today.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all shadow-md hover:shadow-lg"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Shopping Cart</h1>
        <p className="text-sm text-gray-500">
          Review your items and warehouse locations before holding your stock reservations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Cart items list */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div
              key={`${item.productId}-${item.warehouseId}`}
              className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 flex gap-4 sm:gap-5 shadow-sm hover:shadow transition-shadow relative overflow-hidden"
            >
              {/* Product image */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-100">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                    No Image
                  </div>
                )}
              </div>

              {/* Product Info & Controls */}
              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-base sm:text-lg leading-snug truncate">
                      {item.productName}
                    </h3>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">SKU: {item.sku}</p>
                    <p className="text-xs text-blue-600 font-medium bg-blue-50/80 border border-blue-100 rounded-md px-2 py-0.5 mt-2 inline-flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      {item.warehouseName}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.productId, item.warehouseId)}
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove item"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <div className="flex justify-between items-end mt-4">
                  {/* Quantity Controls */}
                  <div className="flex items-center border border-gray-200 rounded-lg bg-gray-50/50 p-0.5 overflow-hidden">
                    <button
                      onClick={() => updateQuantity(item.productId, item.warehouseId, item.quantity - 1)}
                      className="px-2 py-1 text-gray-500 hover:text-gray-900 hover:bg-white rounded-md transition-all font-semibold select-none text-sm"
                    >
                      －
                    </button>
                    <span className="px-3 text-sm font-semibold text-gray-800 font-mono min-w-[2rem] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.warehouseId, item.quantity + 1)}
                      className="px-2 py-1 text-gray-500 hover:text-gray-900 hover:bg-white rounded-md transition-all font-semibold select-none text-sm"
                    >
                      ＋
                    </button>
                  </div>

                  {/* Pricing */}
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Total Price</p>
                    <p className="text-base sm:text-lg font-bold text-gray-900">
                      ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Order Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm sticky top-24">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-4 mb-4">
            Order Summary
          </h2>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Items Count</span>
              <span className="font-semibold text-gray-900">{totalItems}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span className="font-semibold text-gray-900">₹{totalPrice.toLocaleString('en-IN')}</span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex justify-between">
              <span className="font-semibold text-gray-900">Total Price</span>
              <span className="text-xl font-bold text-gray-900">
                ₹{totalPrice.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <button
            onClick={handleProceedToCheckout}
            disabled={checkingOut}
            className="w-full bg-blue-600 text-white py-3.5 px-6 rounded-xl font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            {checkingOut ? (
              <>
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Reserving Stock…
              </>
            ) : (
              <>
                Proceed to Checkout
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </>
            )}
          </button>
          <p className="text-[11px] text-gray-400 text-center mt-3">
            Proceeding will reserve these items in inventory for 10 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
