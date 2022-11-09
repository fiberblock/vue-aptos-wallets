import { computed, ref, watch } from "vue";

import type {
  WalletAdapter,
  WalletName,
  NetworkInfo,
} from "../WalletAdapters/BaseAdapter";
import {
  WalletReadyState,
  AptosWalletAdapter,
  MartianWalletAdapter,
  PontemWalletAdapter,
  HippoWalletAdapter,
  FewchaWalletAdapter,
  NightlyWalletAdapter,
  SpikaWalletAdapter,
  HyperPayWalletAdapter,
  AptosSnapAdapter,
  BitkeepWalletAdapter,
  TokenPocketWalletAdapter,
  ONTOWalletAdapter,
} from "../WalletAdapters";
import type { WalletError } from "../WalletProviders";
import {
  WalletNotSelectedError,
  WalletNotReadyError,
} from "../WalletProviders";

export interface Wallet {
  adapter: WalletAdapter;
  readyState: WalletReadyState;
}

interface UseWalletsProvider {
  wallets: WalletAdapter[];
  onError?: (error: WalletError) => void;
  localStorageKey?: string;
  autoConnect: boolean;
}
const walletAdapters = [
  new PontemWalletAdapter(),
  new MartianWalletAdapter(),
  new AptosWalletAdapter(),
  new HippoWalletAdapter(),
  new FewchaWalletAdapter(),
  new NightlyWalletAdapter(),
  new SpikaWalletAdapter(),
  new HyperPayWalletAdapter(),
  new AptosSnapAdapter(),
  new BitkeepWalletAdapter(),
  new TokenPocketWalletAdapter(),
  new ONTOWalletAdapter(),
  // new BloctoWalletAdapter(),
];

const adapters = ref<WalletAdapter[]>([...walletAdapters]);

const onError = ref<((error: WalletError) => void) | undefined>(undefined);

const connecting = ref<boolean>(false);

const wallets = computed<Wallet[]>(() => {
  return adapters.value.map(
    (adpt) =>
      ({
        adapter: adpt,
        readyState: adpt.readyState,
      } as Wallet)
  );
});

export const useWallets = () => {
  // Handle the adapter's error event, and local errors
  const handleError = (error: WalletError) => {
    if (onError.value) (onError.value || console.log)(error);
    return error;
  };
  // function to connect adapter
  const connect = async (toConnectWalletName: string) => {
    // if (connecting.value || disconnecting.value || connected.value) return;
    const selectedWallet = wallets.value.find(
      (wAdapter) => wAdapter.adapter.name === toConnectWalletName
    );

    if (!selectedWallet?.adapter)
      throw handleError(new WalletNotSelectedError("Cannot find wallet"));

    if (!selectedWallet) {
      return;
    }

    if (
      !(
        selectedWallet.adapter.readyState === WalletReadyState.Installed ||
        selectedWallet.adapter.readyState === WalletReadyState.Loadable
      )
    ) {
      if (typeof window !== "undefined" && selectedWallet.adapter.url) {
        window.open(selectedWallet.adapter.url, "_blank");
      }

      throw handleError(new WalletNotReadyError("Please install wallet"));
    }

    connecting.value = true;
    try {
      await selectedWallet.adapter.connect();
      return {
        provider: selectedWallet.adapter,
        network: selectedWallet.adapter.network,
        connector: selectedWallet.adapter.name,
        connectedAccount: selectedWallet.adapter.publicAccount,
      };
    } catch (error: any) {
      // Rethrow the error, and handleError will also be called
      throw error;
    } finally {
      connecting.value = false;
    }
  };

  return {
    wallets,
    connect,
  };
};
