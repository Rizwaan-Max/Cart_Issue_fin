import { Prisma } from '@prisma/client';

export type ProductWithInventory = Prisma.ProductGetPayload<{
  include: {
    inventories: {
      include: { warehouse: true };
    };
  };
}>;

export type ReservationWithRelations = Prisma.ReservationGetPayload<{
  include: {
    product: true;
    warehouse: true;
  };
}>;

export type InventoryWithWarehouse = Prisma.InventoryGetPayload<{
  include: { warehouse: true };
}>;

export interface InventoryWithAvailable {
  id: string;
  productId: string;
  warehouseId: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
}

export interface ApiError {
  error: string;
  details?: string;
}
