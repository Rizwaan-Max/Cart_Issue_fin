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

      for (const res of results) {
        if (res.ok && res.data?.id) {
          successfulReservations.push(res.data.id);
        } else {
          checkoutFailed = true;
          failedItemName = res.item.productName;
          failureReason = res.data?.error || 'Insufficient stock or system error';
          break;
        }
      }

      if (checkoutFailed) {
        if (successfulReservations.length > 0) {
          await Promise.all(
            successfulReservations.map((id) =>
              fetch(`/api/reservations/${id}/release`, { method: 'POST' })
            )
          );
        }
        toast.error(`Stock Error: "${failedItemName}" failed checkout. ${failureReason}`);
      } else {
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
          <svg className="animate-spin w-10 h-10 text-accentColor" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-text2">Loading your cart…</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-accentColor/10 text-accentColor rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-text1 mb-2">Your cart is empty</h2>
        <p className="text-text2 mb-8 max-w-md mx-auto leading-relaxed">
          You haven't added any products to your cart yet. Explore our stock list and hold your inventory today.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-accentColor text-white px-6 py-3 rounded-xl font-semibold hover:bg-accentHover hover:scale-[1.02] active:scale-[0.98] transition-all shadow-md hover:shadow-lg"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-text1 mb-1 tracking-tight">Shopping Cart</h1>
        <p className="text-sm text-text2 font-medium">
          Review your items and warehouse locations before holding your stock reservations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Cart items list */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div
              key={`${item.productId}-${item.warehouseId}`}
              className="bg-surface rounded-2xl border border-border p-4 sm:p-5 flex gap-4 sm:gap-5 shadow-xs hover:shadow-md transition-all relative overflow-hidden"
            >
              {/* Product image */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-bg flex-shrink-0 border border-border/80">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-bg text-text3 font-bold">
                    No Image
                  </div>
                )}
              </div>

              {/* Product Info & Controls */}
              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-bold text-text1 text-base sm:text-lg leading-snug truncate">
                      {item.productName}
                    </h3>
                    <p className="text-[10px] text-text3 font-mono font-semibold uppercase tracking-wider mt-0.5">SKU: {item.sku}</p>
                    <p className="text-xs text-accentColor font-bold bg-accentColor/10 border border-accentColor/25 rounded-md px-2.5 py-0.5 mt-2.5 inline-flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      {item.warehouseName}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.productId, item.warehouseId)}
                    className="p-1.5 text-text3 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors border-0 outline-none focus-visible:ring-2 focus-visible:ring-accentColor cursor-pointer"
                    title="Remove item"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <div className="flex justify-between items-end mt-4">
                  {/* Quantity Controls */}
                  <div className="flex items-center border border-border rounded-xl bg-bg p-0.5 overflow-hidden">
                    <button
                      onClick={() => updateQuantity(item.productId, item.warehouseId, item.quantity - 1)}
                      className="w-7 h-7 flex items-center justify-center text-text2 hover:text-text1 hover:bg-surface rounded-lg border-0 outline-none cursor-pointer transition-all font-semibold select-none text-sm"
                    >
                      －
                    </button>
                    <span className="px-3 text-sm font-bold text-text1 font-mono min-w-[2rem] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.warehouseId, item.quantity + 1)}
                      className="w-7 h-7 flex items-center justify-center text-text2 hover:text-text1 hover:bg-surface rounded-lg border-0 outline-none cursor-pointer transition-all font-semibold select-none text-sm"
                    >
                      ＋
                    </button>
                  </div>

                  {/* Pricing */}
                  <div className="text-right">
                    <p className="text-[10px] text-text3 font-bold uppercase tracking-wider">Total Price</p>
                    <p className="text-base sm:text-lg font-bold text-text1 font-mono">
                      ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Order Summary */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm sticky top-24 space-y-6">
          <h2 className="text-lg font-bold text-text1 border-b border-border pb-4">
            Order Summary
          </h2>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-text2 font-medium">Items Count</span>
              <span className="font-bold text-text1 font-mono">{totalItems}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text2 font-medium">Subtotal</span>
              <span className="font-bold text-text1 font-mono">₹{totalPrice.toLocaleString('en-IN')}</span>
            </div>
            <div className="border-t border-border pt-4 flex justify-between items-center">
              <span className="font-bold text-text1">Total Price</span>
              <span className="text-xl font-extrabold text-text1 font-mono">
                ₹{totalPrice.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <button
            onClick={handleProceedToCheckout}
            disabled={checkingOut}
            className="w-full bg-accentColor text-white py-3.5 px-6 rounded-xl font-bold hover:bg-accentHover hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2 border-0 outline-none focus-visible:ring-2 focus-visible:ring-accentColor"
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
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </>
            )}
          </button>
          <p className="text-[11px] text-text3 text-center leading-normal">
            Proceeding will reserve these items in inventory for 10 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
