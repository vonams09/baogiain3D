export interface Material {
  id: string;
  name: string;
  brand: string;
  pricePerKg: number;
  color: string;
  colorHex: string;
  category?: string;
  inStock?: boolean;
  imageUrl?: string;
  ownerId: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface SystemSettings {
  machinePowerW: number;
  electricityPriceKwh: number;
  depreciationPerHour: number;
  serviceNotes?: string;
}

export interface QuoteParams {
  materialId: string;
  hours: number;
  minutes: number;
  weightG: number;
  infillPercent: number;
  layerHeightMm: number;
  extraFee: number;
  note: string;
}

export interface CalculationResult {
  materialCost: number;
  electricityCost: number;
  depreciationCost: number;
  internalTotal: number;
  customerTotal: number;
}
