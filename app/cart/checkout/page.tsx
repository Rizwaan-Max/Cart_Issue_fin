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
            stroke="var(--border)"
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
          <span className="text-[9px] text-text3 font-bold uppercase tracking-wider mt-0.5">remaining</span>
        </div>
      </div>
      {secondsLeft === 0 && (
        <span className="text-xs font-bold text-red-655 animate-pulse">Released</span>
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

  const activePendingReservations = reservations.filter((r) => r.status === 'PENDING');
  const earliestExpiry = activePendingReservations.length > 0
    ? activePendingReservations.reduce((earliest, res) => {
        const time = new Date(res.expiresAt).getTime();
        return time < earliest ? time : earliest;
      }, Infinity)
    : null;

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
      fetchReservations();
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
          delete updatedMap[res.id];
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
        clearCart();
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
      <div className="max-w-4xl mx-auto px-4 py-16 flex items-center justify-center animate-pulse">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin w-10 h-10 text-accentColor" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-text2">Retrieving held inventory details…</p>
        </div>
      </div>
    );
  }

  if (error && reservations.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-14 h-14 bg-red-100 dark:bg-red-950/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-red-800 dark:text-red-450 mb-2">Checkout Unavailable</h2>
          <p className="text-red-655 dark:text-red-400/80 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-accentColor text-white px-6 py-2.5 rounded-xl font-medium hover:bg-accentHover transition-colors shadow"
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
  const totalPriceSum = reservations.reduce((sum, res) => sum + res.product.price * res.quantity, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/cart" className="text-sm text-accentColor hover:underline flex items-center gap-1 font-semibold">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to cart
        </Link>
        <span className="text-xs text-text3 font-mono font-bold uppercase tracking-wider">
          Items reserved: {reservations.length}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Reservation Items List */}
        <div className="lg:col-span-2 space-y-4">
          {allConfirmed && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250/20 rounded-2xl p-5 flex items-center gap-3 shadow-xs animate-fade-in">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950/40 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-450" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-emerald-800 dark:text-emerald-400 text-lg">Purchase Confirmed!</p>
                <p className="text-sm text-emerald-600 dark:text-emerald-400/80">
                  Thank you! Your stock has been successfully purchased and checked out.
                </p>
              </div>
            </div>
          )}

          {allReleased && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-250/20 rounded-2xl p-5 flex items-center gap-3 shadow-xs">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-950/40 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-655 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-red-800 dark:text-red-400 text-lg">Order Cancelled or Expired</p>
                <p className="text-sm text-red-600 dark:text-red-400/80">
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
                className={`bg-surface rounded-2xl border p-4 sm:p-5 shadow-xs transition-all flex gap-4 ${
                  isItemConfirmed
                    ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/10'
                    : isItemReleased
                    ? 'border-red-200 dark:border-red-900/50 bg-red-50/5 opacity-70'
                    : 'border-border'
                }`}
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-bg flex-shrink-0 border border-border">
                  <img src={res.product.imageUrl} alt={res.product.name} className="w-full h-full object-cover" />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-bold text-text1 text-sm sm:text-base leading-tight truncate">
                        {res.product.name}
                      </h3>
                      {isItemConfirmed && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 px-2 py-0.5 rounded-full flex-shrink-0">
                          Confirmed
                        </span>
                      )}
                      {isItemReleased && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-red-700 bg-red-50 dark:bg-red-950/20 dark:text-red-400 border border-red-200 dark:border-red-900/40 px-2 py-0.5 rounded-full flex-shrink-0">
                          Released
                        </span>
                      )}
                      {res.status === 'PENDING' && !expired && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-accentColor bg-accentColor/10 border border-accentColor/25 px-2 py-0.5 rounded-full flex-shrink-0">
                          Reserved
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-text3 font-mono font-semibold uppercase tracking-wider mt-0.5">SKU: {res.product.sku}</p>
                    <p className="text-xs text-text2 mt-1">
                      Warehouse: <span className="font-bold text-text1">{res.warehouse.name}</span>
                    </p>
                  </div>

                  <div className="flex justify-between items-end mt-3 border-t border-border/60 pt-2">
                    <span className="text-xs text-text2 font-medium">
                      Qty: <span className="font-bold text-text1 font-mono">{res.quantity}</span>
                    </span>
                    <span className="text-sm font-bold text-text1 font-mono">
                      ₹{(res.product.price * res.quantity).toLocaleString('en-IN')}
                    </span>
                  </div>

                  {hasItemError && (
                    <div className="mt-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5 animate-pulse font-semibold">
                      <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{hasItemError}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sidebar Order Actions */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm sticky top-24 space-y-6">
          <h2 className="text-lg font-bold text-text1 border-b border-border pb-4">
            Payment Summary
          </h2>

          <div className="space-y-3">
            <div className="flex justify-between text-sm items-center">
              <span className="text-text2 font-medium">Total Price</span>
              <span className="text-lg font-bold text-text1 font-mono">
                ₹{totalPriceSum.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {showCountdown && earliestExpiry && (
            <div className="bg-accentColor/5 rounded-2xl p-4 border border-accentColor/20 flex flex-col items-center">
              <CountdownRing expiresAt={new Date(earliestExpiry).toISOString()} />
              <p className="text-xs text-text1 font-bold mt-3 text-center">
                Urgent Shared Reservation Expiry
              </p>
              <p className="text-[10px] text-text2 mt-1 text-center leading-normal">
                If the timer runs out, items will be released back to public inventory.
              </p>
            </div>
          )}

          {!allConfirmed && !allReleased && (
            <div className="space-y-3 pt-2">
              <button
                onClick={handleConfirmAll}
                disabled={confirming || cancelling || expired}
                className="w-full bg-emerald-600 text-white py-3.5 px-6 rounded-xl font-bold hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2 border-0 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
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
                className="w-full bg-surface text-text2 border border-border py-3 px-6 rounded-xl font-bold hover:bg-gray-100 dark:hover:bg-gray-800/80 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed border-0 outline-none focus-visible:ring-2 focus-visible:ring-accentColor cursor-pointer"
              >
                {cancelling ? 'Cancelling Reservations…' : 'Cancel All & Release'}
              </button>
            </div>
          )}

          {allConfirmed && (
            <Link
              href="/"
              className="block w-full text-center bg-emerald-600 text-white py-3.5 px-6 rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow hover:scale-[1.01] active:scale-[0.99]"
            >
              Continue Shopping
            </Link>
          )}

          {allReleased && (
            <Link
              href="/"
              className="block w-full text-center bg-accentColor text-white py-3.5 px-6 rounded-xl font-bold hover:bg-accentHover transition-colors shadow hover:scale-[1.01] active:scale-[0.99]"
            >
              Start New Order
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
