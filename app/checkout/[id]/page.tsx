'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Reservation {
  id: string;
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
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const color =
    secondsLeft > 120 ? '#10b981' : secondsLeft > 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth="8"
          />
          <circle
            cx="64"
            cy="64"
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
          <span className="text-2xl font-bold tabular-nums" style={{ color }}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          <span className="text-[10px] text-text3 uppercase font-bold tracking-wider mt-0.5">remaining</span>
        </div>
      </div>
      {secondsLeft === 0 && (
        <span className="text-sm font-semibold text-red-650 animate-pulse">Reservation expired</span>
      )}
    </div>
  );
}

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const fetchReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/${params.id}`);
      if (res.status === 404) {
        setError('Reservation not found');
        return;
      }
      if (res.status === 410) {
        setExpired(true);
        setError('This reservation has expired. Please start a new order.');
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load reservation');
        return;
      }
      const data = await res.json();
      setReservation(data);

      if (data.status === 'RELEASED') {
        setExpired(true);
        setError('This reservation was cancelled or expired.');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  useEffect(() => {
    if (!reservation || reservation.status !== 'PENDING') return;
    const timeUntilExpiry = new Date(reservation.expiresAt).getTime() - Date.now();
    if (timeUntilExpiry <= 0) {
      setExpired(true);
      return;
    }
    const timer = setTimeout(() => {
      setExpired(true);
      setError('Your reservation has expired. Please start a new order.');
    }, timeUntilExpiry);
    return () => clearTimeout(timer);
  }, [reservation]);

  async function handleConfirm() {
    if (!reservation || confirming) return;
    setConfirming(true);
    try {
      const idempotencyKey = `confirm-${reservation.id}-${Date.now()}`;
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      const data = await res.json();

      if (res.status === 410) {
        toast.error('Reservation expired — cannot confirm');
        setExpired(true);
        setError('Your reservation has expired. Please start a new order.');
        return;
      }
      if (res.status === 409) {
        toast.error(data.error || 'Cannot confirm this reservation');
        await fetchReservation();
        return;
      }
      if (!res.ok) {
        toast.error(data.error || 'Failed to confirm purchase');
        return;
      }

      setReservation(data);
      toast.success('Purchase confirmed! Thank you for your order.');
    } catch {
      toast.error('Network error — please try again');
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancel() {
    if (!reservation || cancelling) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.status === 409) {
        toast.error(data.error || 'Cannot cancel this reservation');
        await fetchReservation();
        return;
      }
      if (!res.ok) {
        toast.error(data.error || 'Failed to cancel reservation');
        return;
      }

      setReservation(data);
      toast.info('Reservation cancelled. Stock has been released.');
      setTimeout(() => router.push('/'), 1500);
    } catch {
      toast.error('Network error — please try again');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 flex items-center justify-center animate-pulse">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin w-10 h-10 text-accentColor" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-text2">Loading reservation…</p>
        </div>
      </div>
    );
  }

  if (error && !reservation) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-red-100 dark:bg-red-950/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-red-800 dark:text-red-400 mb-2">Reservation Unavailable</h2>
          <p className="text-red-650 dark:text-red-400/80 mb-6">{error}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 bg-accentColor text-white px-6 py-2.5 rounded-xl font-medium hover:bg-accentHover transition-colors"
          >
            Browse Products
          </a>
        </div>
      </div>
    );
  }

  if (!reservation) return null;

  const isConfirmed = reservation.status === 'CONFIRMED';
  const isReleased = reservation.status === 'RELEASED';
  const isPending = reservation.status === 'PENDING' && !expired;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6">
        <a href="/" className="text-sm text-accentColor hover:underline flex items-center gap-1 font-semibold">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to products
        </a>
      </div>

      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
        
        {isConfirmed && (
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border-b border-emerald-250/20 px-6 py-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-950/40 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-emerald-800 dark:text-emerald-400">Order Confirmed</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400/80">
                Confirmed at {new Date(reservation.confirmedAt!).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {(isReleased || (expired && !isConfirmed)) && (
          <div className="bg-red-50 dark:bg-red-950/20 border-b border-red-250/20 px-6 py-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-red-100 dark:bg-red-950/40 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-650 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-red-800 dark:text-red-400">
                {isReleased ? 'Reservation Cancelled' : 'Reservation Expired'}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400/85">{error || 'Stock has been released back.'}</p>
            </div>
          </div>
        )}

        {/* Product details */}
        <div className="flex gap-5 p-6 border-b border-border">
          <div className="w-24 h-24 rounded-xl overflow-hidden bg-bg flex-shrink-0 border border-border/80">
            <img
              src={reservation.product.imageUrl}
              alt={reservation.product.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-text1 mb-1 leading-snug">{reservation.product.name}</h1>
            <p className="text-[10px] text-text3 font-mono font-semibold uppercase tracking-wider mb-2">SKU: {reservation.product.sku}</p>
            <p className="text-sm text-text2 line-clamp-2 leading-relaxed">{reservation.product.description}</p>
          </div>
        </div>

        {/* Order summary */}
        <div className="p-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-text2 font-medium">Warehouse</span>
            <span className="font-bold text-text1">
              {reservation.warehouse.name} — {reservation.warehouse.location}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text2 font-medium">Quantity</span>
            <span className="font-bold text-text1 font-mono">{reservation.quantity}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text2 font-medium">Unit Price</span>
            <span className="font-bold text-text1 font-mono">
              ₹{reservation.product.price.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="border-t border-border pt-4 flex justify-between items-center">
            <span className="font-bold text-text1">Total</span>
            <span className="text-xl font-extrabold text-text1 font-mono">
              ₹{(reservation.product.price * reservation.quantity).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Countdown + actions */}
        {isPending && (
          <div className="px-6 pb-6 space-y-6">
            <div className="bg-accentColor/5 border border-accentColor/20 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-4">
              <CountdownRing expiresAt={reservation.expiresAt} />
              <div className="text-center sm:text-left">
                <p className="font-bold text-text1 mb-1">Your item is reserved</p>
                <p className="text-sm text-text2 leading-relaxed">
                  Complete your purchase before the timer runs out. After expiry, the item will
                  be released back to inventory automatically.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleConfirm}
                disabled={confirming || cancelling}
                className="flex-1 bg-accentColor text-white py-3.5 px-6 rounded-xl font-bold hover:bg-accentHover hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed border-0 outline-none focus-visible:ring-2 focus-visible:ring-accentColor cursor-pointer"
              >
                {confirming ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Confirming…
                  </span>
                ) : (
                  'Confirm Purchase'
                )}
              </button>
              <button
                onClick={handleCancel}
                disabled={confirming || cancelling}
                className="flex-1 sm:flex-none bg-surface text-text2 border border-border py-3 px-6 rounded-xl font-bold hover:bg-gray-100 dark:hover:bg-gray-800/80 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed border-0 outline-none focus-visible:ring-2 focus-visible:ring-accentColor cursor-pointer"
              >
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {(isReleased || (expired && !isConfirmed)) && (
          <div className="px-6 pb-6">
            <a
              href="/"
              className="block w-full text-center bg-accentColor text-white py-3.5 px-6 rounded-xl font-bold hover:bg-accentHover hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              Start New Order
            </a>
          </div>
        )}

        {isConfirmed && (
          <div className="px-6 pb-6">
            <a
              href="/"
              className="block w-full text-center bg-emerald-600 text-white py-3.5 px-6 rounded-xl font-bold hover:bg-emerald-700 hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              Continue Shopping
            </a>
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-text3 mt-4 font-mono font-semibold uppercase tracking-wider">
        Reservation ID: {reservation.id}
      </p>
    </div>
  );
}
