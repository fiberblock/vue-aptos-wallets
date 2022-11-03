export interface ChainOption {
  explorer: string;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrl: string;
}

export type ChainInfo = Record<number, ChainOption>;
