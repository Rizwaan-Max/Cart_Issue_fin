'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { toast } from 'sonner';

interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED';
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    price: number;
    imageUrl: string;
    description: string;
  };
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
}

function CountdownRing({ expiresAt }: { expiresAt: string }) {
  const TOTAL_SECONDS = 600; // 10 minutes
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    function update() {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = secondsLeft / TOTAL_SECONDS;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const color =
    secondsLeft > 120 ? '#10b981' : secondsLeft > 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="#f3f4f6"
            strokeWidth="8"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums" style={{ color }}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">remaining</span>
        </div>
      </div>
      {secondsLeft === 0 && (
        <span className="text-xs font-semibold text-red-600">Stock released</span>
      )}
    </div>
  );
}

export default function CartCheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clearCart } = useCart();

  const idsString = searchParams.get('ids');
  const reservationIds = React.useMemo(() => {
    return idsString ? idsString.split(',') : [];
  }, [idsString]);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expired, setExpired] = useState(false);

  // Tracks error/status strings per reservation ID (e.g. status code or message)
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const fetchReservations = useCallback(async () => {
    if (reservationIds.length === 0) {
      setError('No reservations found to check out.');
      setLoading(false);
      return;
    }

    try {
      const fetched = await Promise.all(
        reservationIds.map(async (id) => {
          const res = await fetch(`/api/reservations/${id}`);
          if (res.status === 404) {
            return { id, error: 'Reservation not found' };
          }
          if (res.status === 410) {
            return { id, error: 'Reservation has expired', status: 'RELEASED' as const };
          }
          if (!res.ok) {
            return { id, error: 'Failed to fetch details' };
          }
          const data = await res.json();
          return { id, data };
        })
      );

      const itemsList: Reservation[] = [];
      const errorsMap: Record<string, string> = {};
      let hasExpiry = false;

      fetched.forEach((res) => {
        if ('error' in res) {
          errorsMap[res.id] = res.error || 'Failed to fetch details';
          if (res.status === 'RELEASED') {
            hasExpiry = true;
          }
        } else if (res.data) {
          itemsList.push(res.data);
          if (res.data.status === 'RELEASED') {
            errorsMap[res.id] = 'Expired and released';
          }
        }
      });

      setReservations(itemsList);
      setItemErrors(errorsMap);
      if (hasExpiry) {
        setExpired(true);
      }
    } catch (e) {
      console.error('Failed to fetch reservations:', e);
      setError('Network or connection error while loading checkout details.');
    } finally {
      setLoading(false);
    }
  }, [reservationIds]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  // Find the earliest expiring reservation that is still PENDING
  const activePendingReservations = reservations.filter((r) => r.status === 'PENDING');
  const earliestExpiry = activePendingReservations.length > 0
    ? activePendingReservations.reduce((earliest, res) => {
        const time = new Date(res.expiresAt).getTime();
        return time < earliest ? time : earliest;
      }, Infinity)
    : null;

  // Track expiry locally
  useEffect(() => {
    if (!earliestExpiry) return;
    const timeUntilExpiry = earliestExpiry - Date.now();

    if (timeUntilExpiry <= 0) {
      setExpired(true);
      return;
    }

    const timer = setTimeout(() => {
      setExpired(true);
      toast.error('Your stock reservations have expired.');
      fetchReservations(); // Refresh statuses
    }, timeUntilExpiry);

    return () => clearTimeout(timer);
  }, [earliestExpiry, fetchReservations]);

  async function handleConfirmAll() {
    if (reservations.length === 0 || confirming) return;
    setConfirming(true);

    try {
      const results = await Promise.all(
        reservations.map(async (res) => {
          if (res.status !== 'PENDING') return { id: res.id, ok: true, data: res };

          const idempotencyKey = `confirm-${res.id}-${Date.now()}`;
          const response = await fetch(`/api/reservations/${res.id}/confirm`, {
            method: 'POST',
            headers: { 'Idempotency-Key': idempotencyKey },
          });

          const data = await response.json();
          return {
            id: res.id,
            ok: response.ok,
            status: response.status,
            data,
          };
        })
      );

      const updatedMap = { ...itemErrors };
      const updatedReservations = [...reservations];
      let overallSuccess = true;

      results.forEach((res) => {
        if (!res) return;

        const index = updatedReservations.findIndex((r) => r.id === res.id);
        if (index === -1) return;

        if (res.ok) {
          updatedReservations[index] = res.data;
          delete updatedMap[res.id]; // Clear error if success
        } else {
          overallSuccess = false;
          updatedMap[res.id] = res.data?.error || `Confirmation failed (${res.status})`;
          if (res.status === 410 || res.status === 409) {
            updatedReservations[index] = {
              ...updatedReservations[index],
              status: 'RELEASED',
            };
          }
        }
      });

      setReservations(updatedReservations);
      setItemErrors(updatedMap);

      if (overallSuccess) {
        toast.success('All purchases confirmed! Thank you for your order.');
        clearCart(); // Clear the localStorage shopping cart on successful confirmation
      } else {
        toast.error('Some reservations could not be confirmed. Check details below.');
      }
    } catch (e) {
      console.error('Failed to confirm reservations:', e);
      toast.error('Network or connection error during confirmation.');
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancelAll() {
    if (reservations.length === 0 || cancelling) return;
    setCancelling(true);

    try {
      const results = await Promise.all(
        reservations.map(async (res) => {
          if (res.status !== 'PENDING') return { id: res.id, ok: true, data: res };

          const response = await fetch(`/api/reservations/${res.id}/release`, {
            method: 'POST',
          });

          const data = await response.json();
          return {
            id: res.id,
            ok: response.ok,
            data,
          };
        })
      );

      const updatedReservations = [...reservations];
      results.forEach((res) => {
        if (!res) return;
        const index = updatedReservations.findIndex((r) => r.id === res.id);
        if (index > -1 && res.ok) {
          updatedReservations[index] = res.data;
        }
      });

      setReservations(updatedReservations);
      toast.info('All reservations cancelled and stock released.');
      setTimeout(() => router.push('/'), 1500);
    } catch (e) {
      console.error('Failed to cancel reservations:', e);
      toast.error('Network error during cancellation.');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-gray-500">Retrieving held inventory details…</p>
        </div>
      </div>
    );
  }

  if (error && reservations.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-red-800 mb-2">Checkout Unavailable</h2>
          <p className="text-red-600 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors shadow"
          >
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  const allConfirmed = reservations.length > 0 && reservations.every((r) => r.status === 'CONFIRMED');
  const allReleased = reservations.length > 0 && reservations.every((r) => r.status === 'RELEASED');
  const showCountdown = !allConfirmed && !allReleased && earliestExpiry !== null && !expired;

  // Calculate sum of only successfully fetched and active items
  const totalPriceSum = reservations.reduce((sum, res) => sum + res.product.price * res.quantity, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/cart" className="text-sm text-blue-600 hover:underline flex items-center gap-1 font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to cart
        </Link>
        <span className="text-xs text-gray-400 font-mono">
          Items reserved: {reservations.length}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Reservation Items List */}
        <div className="lg:col-span-2 space-y-4">
          {allConfirmed && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3 shadow-sm animate-fade-in">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-emerald-800 text-lg">Purchase Confirmed!</p>
                <p className="text-sm text-emerald-600">
                  Thank you! Your stock has been successfully purchased and checked out.
                </p>
              </div>
            </div>
          )}

          {allReleased && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-red-800 text-lg">Order Cancelled or Expired</p>
                <p className="text-sm text-red-600">
                  All inventory reservations have been released back to stock.
                </p>
              </div>
            </div>
          )}

          {reservations.map((res) => {
            const hasItemError = itemErrors[res.id];
            const isItemConfirmed = res.status === 'CONFIRMED';
            const isItemReleased = res.status === 'RELEASED';

            return (
              <div
                key={res.id}
                className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-sm transition-all flex gap-4 ${
                  isItemConfirmed
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : isItemReleased
                    ? 'border-red-200 bg-red-50/10 opacity-70'
                    : 'border-gray-200'
                }`}
              >
                {/* Product image */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-100">
                  <img src={res.product.imageUrl} alt={res.product.name} className="w-full h-full object-cover" />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-tight truncate">
                        {res.product.name}
                      </h3>
                      {isItemConfirmed && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex-shrink-0">
                          Confirmed
                        </span>
                      )}
                      {isItemReleased && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex-shrink-0">
                          Released
                        </span>
                      )}
                      {res.status === 'PENDING' && !expired && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex-shrink-0">
                          Reserved
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">SKU: {res.product.sku}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Warehouse: <span className="font-semibold text-gray-700">{res.warehouse.name}</span>
                    </p>
                  </div>

                  <div className="flex justify-between items-end mt-3 border-t border-gray-50 pt-2">
                    <span className="text-xs text-gray-400">
                      Qty: <span className="font-bold text-gray-700 font-mono">{res.quantity}</span>
                    </span>
                    <span className="text-sm font-bold text-gray-900 font-mono">
                      ₹{(res.product.price * res.quantity).toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* Individual Item error warning */}
                  {hasItemError && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 flex items-center gap-1.5 animate-pulse">
                      <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium">{hasItemError}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sidebar Order Actions */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm sticky top-24">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-4 mb-4">
            Payment Summary
          </h2>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Total Price</span>
              <span className="text-lg font-bold text-gray-900 font-mono">
                ₹{totalPriceSum.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Countdown timer */}
          {showCountdown && earliestExpiry && (
            <div className="bg-blue-50/75 rounded-2xl p-4 border border-blue-100 flex flex-col items-center mb-6">
              <CountdownRing expiresAt={new Date(earliestExpiry).toISOString()} />
              <p className="text-xs text-blue-900 font-semibold mt-3 text-center">
                Urgent Shared Reservation Expiry
              </p>
              <p className="text-[10px] text-blue-700 mt-1 text-center">
                If the timer runs out, items will be released back to public inventory.
              </p>
            </div>
          )}

          {/* Actions */}
          {!allConfirmed && !allReleased && (
            <div className="space-y-3">
              <button
                onClick={handleConfirmAll}
                disabled={confirming || cancelling || expired}
                className="w-full bg-emerald-600 text-white py-3.5 px-6 rounded-xl font-semibold hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                {confirming ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Confirming Order…
                  </>
                ) : (
                  'Confirm All & Pay'
                )}
              </button>
              <button
                onClick={handleCancelAll}
                disabled={confirming || cancelling}
                className="w-full bg-white text-gray-700 border border-gray-200 py-3 px-6 rounded-xl font-semibold hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelling ? 'Cancelling Reservations…' : 'Cancel All & Release'}
              </button>
            </div>
          )}

          {allConfirmed && (
            <Link
              href="/"
              className="block w-full text-center bg-emerald-600 text-white py-3.5 px-6 rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow"
            >
              Continue Shopping
            </Link>
          )}

          {allReleased && (
            <Link
              href="/"
              className="block w-full text-center bg-blue-600 text-white py-3.5 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow"
            >
              Start New Order
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
