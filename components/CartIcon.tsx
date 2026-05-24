'use client';

import React from 'react';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';

export default function CartIcon() {
  const { totalItems, isHydrated } = useCart();

  return (
    <Link
      href="/cart"
      className="relative p-2.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50/50 rounded-xl transition-all duration-200 flex items-center justify-center border border-gray-200 bg-white hover:border-blue-200 shadow-sm active:scale-95"
      aria-label="Shopping Cart"
    >
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth="2"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>

      {isHydrated && totalItems > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-bounce shadow-md border-2 border-white tabular-nums">
          {totalItems}
        </span>
      )}
    </Link>
  );
}
