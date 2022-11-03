import { ref, watch } from "vue";
import type { Types } from "aptos";

import type {
  AccountKeys,
  NetworkInfo,
  SignMessagePayload,
  WalletAdapter,
  WalletName,
  Wallet,
  WalletError,
} from "@pontem/aptos-wallet-adapter";
import {
  WalletReadyState,
  WalletNotSelectedError,
  WalletNotReadyError,
  WalletNotConnectedError,
} from "@pontem/aptos-wallet-adapter";

interface UseWalletsProvider {
  wallets: WalletAdapter[];
  onError?: (error: WalletError) => void;
  localStorageKey?: string;
  autoConnect: boolean;
}

const getWalletNameFromLocalStorage = (key: string) => {
  try {
    const value = localStorage.getItem(key);
    if (value) return JSON.parse(value);
  } catch (e: any) {
    if (typeof window !== "undefined") {
      console.error(e);
    }
  }
  return null;
};

export const useWallets = () => {
  const adapters = ref<WalletAdapter[]>([]);
  const localStorageKey = ref<string>("walletName");
  const autoConnect = ref<boolean>(false);
  const onError = ref<((error: WalletError) => void) | undefined>(undefined);

  const init = ({
    wallets = [],
    onError: onHandleError,
    localStorageKey: lsKey,
    autoConnect: autoConnection,
  }: UseWalletsProvider) => {
    adapters.value = wallets;
    if (lsKey) localStorageKey.value = lsKey;
    if (autoConnection !== undefined) autoConnect.value = autoConnection;
    if (onError.value) onError.value = onHandleError;
  };

  const setDefaultState = () => {
    wallet.value = null;
    adapter.value = null;
    account.value = null;
    connected.value = false;
    walletNetwork.value = null;
  };
  const walletName = ref<WalletName | null>(null);
  const wallet = ref<Wallet | null>(null);
  const adapter = ref<WalletAdapter | null>(null);
  const account = ref<AccountKeys | null>(null);
  const connected = ref<boolean>(false);
  const connecting = ref<boolean>(false);
  const disconnecting = ref<boolean>(false);
  const readyState = ref<WalletReadyState>(WalletReadyState.Unsupported);
  const walletNetwork = ref<NetworkInfo | null>(null);

  const wallets = ref<Wallet[]>([]);

  // When the wallets change, start listen for changes to their `readyState`
  watch(adapters, (_value, _oldValue, onCleanup) => {
    const handleReadyStateChange = (
      current: WalletAdapter,
      isReadyState: WalletReadyState
    ) => {
      const index = wallets.value.findIndex(
        (prevWallet) => prevWallet.adapter.name === current.name
      );
      if (index === -1) return wallets.value;
      const currentWallet = wallets.value[index];

      wallets.value = [
        ...wallets.value.slice(0, index),
        { adapter: currentWallet.adapter, readyState: isReadyState },
        ...wallets.value.slice(index + 1),
      ];
    };
    wallets.value = adapters.value.map((adpt) => ({
      adapter: adpt,
      readyState: adpt.readyState,
    }));
    for (const wAdapter of adapters.value) {
      wAdapter.on(
        "readyStateChange",
        (isReady) => handleReadyStateChange(wAdapter as WalletAdapter, isReady),
        wAdapter
      );
    }
    // When adapters dependency changed - cleanUp function runs before body of watcher;
    onCleanup(() => {
      for (const wAdapter of adapters.value) {
        wAdapter.off(
          "readyStateChange",
          (isReady) =>
            handleReadyStateChange(wAdapter as WalletAdapter, isReady),
          wAdapter
        );
      }
    });
  });
  const handleAddressChange = () => {
    if (!adapter.value) return;
    account.value = adapter.value.publicAccount;
  };
  const handleNetworkChange = () => {
    if (!adapter.value) return;
    walletNetwork.value = adapter.value.network;
  };
  // set or reset current wallet from localstorage
  const setWalletName = (name: WalletName | null) => {
    try {
      if (name === null) {
        localStorage.removeItem(localStorageKey.value);
        walletName.value = null;
      } else {
        localStorage.setItem(localStorageKey.value, JSON.stringify(name));
        walletName.value = name;
      }
    } catch (e: any) {
      if (typeof window !== "undefined") {
        console.error(e);
      }
    }
  };
  //Handle the adapter's connect event - add network and account listeners.
  const handleAfterConnect = () => {
    if (!adapter.value) return;
    adapter.value.on("accountChange", handleAddressChange);
    adapter.value.on("networkChange", handleNetworkChange);
    adapter.value.on("disconnect", handleDisconnect);
    adapter.value.on("error", handleError);
    adapter.value.onAccountChange();
    adapter.value.onNetworkChange();
  };

  // Handle the adapter's disconnect event
  const handleDisconnect = () => {
    setWalletName(null);
    if (!adapter.value) return;
    adapter.value.off("accountChange", handleAddressChange);
    adapter.value.off("networkChange", handleNetworkChange);
    adapter.value.off("disconnect", handleDisconnect);
    adapter.value.off("error", handleError);
    setDefaultState();
  };

  // Handle the adapter's error event, and local errors
  const handleError = (error: WalletError) => {
    if (onError.value) (onError.value || console.log)(error);
    return error;
  };
  // function to connect adapter
  const connect = async () => {
    if (connecting.value || disconnecting.value || connected.value) return;
    const selectedWallet = wallets.value.find(
      (wAdapter) => wAdapter.adapter.name === walletName.value
    );

    if (!selectedWallet?.adapter)
      throw handleError(new WalletNotSelectedError());

    if (selectedWallet) {
      wallet.value = selectedWallet;
      adapter.value = selectedWallet.adapter;
      connected.value = selectedWallet.adapter.connected;
      account.value = selectedWallet.adapter.publicAccount;
      walletNetwork.value = selectedWallet.adapter.network;
    } else {
      setDefaultState();
      return;
    }

    if (
      !(
        selectedWallet.adapter.readyState === WalletReadyState.Installed ||
        selectedWallet.adapter.readyState === WalletReadyState.Loadable
      )
    ) {
      // Clear the selected wallet
      setWalletName(null);
      if (typeof window !== "undefined" && selectedWallet.adapter.url) {
        window.open(selectedWallet.adapter.url, "_blank");
      }

      throw handleError(new WalletNotReadyError());
    }

    connecting.value = true;
    try {
      await selectedWallet.adapter.connect();
      handleAfterConnect();
    } catch (error: any) {
      // Clear the selected wallet
      setWalletName(null);
      // Rethrow the error, and handleError will also be called
      throw error;
    } finally {
      connecting.value = false;
    }
  };
  // function to disconnect adapter and clear localstorage
  const disconnect = async () => {
    if (disconnecting.value) return;
    if (!adapter.value) {
      setWalletName(null);
      return;
    }

    disconnecting.value = true;
    try {
      await adapter.value?.disconnect();
    } catch (error: any) {
      // Clear the selected wallet
      setWalletName(null);
      // Rethrow the error, and handleError will also be called
      throw error;
    } finally {
      disconnecting.value = false;
      handleDisconnect();
    }
  };

  watch([walletName, wallets, readyState], () => {
    wallets.value.forEach((item) => {
      if (walletName.value === item.adapter.name) {
        readyState.value = item.adapter.readyState;
      }
    });
  });
  // autoConnect adapter if localStorage not empty
  watch([autoConnect, localStorageKey, walletName], () => {
    walletName.value = getWalletNameFromLocalStorage(localStorageKey.value);
  });

  // If autoConnect is enabled, try to connect when the adapter changes and is ready
  watch(
    [walletName, adapter, connecting, connected, readyState, autoConnect],
    () => {
      if (
        connecting.value ||
        connected.value ||
        !walletName.value ||
        !autoConnect.value ||
        readyState.value === WalletReadyState.Unsupported
      ) {
        return;
      }
      (async function () {
        try {
          await connect();
        } catch (error: any) {
          handleError(error);
        }
      })();
    }
  );
  const signAndSubmitTransaction = async (
    transaction: Types.TransactionPayload,
    option?: any
  ) => {
    if (!adapter.value) throw handleError(new WalletNotSelectedError());
    if (!connected.value) throw handleError(new WalletNotConnectedError());
    const response = await adapter.value.signAndSubmitTransaction(
      transaction,
      option
    );
    return response;
  };

  const signTransaction = async (
    transaction: Types.TransactionPayload,
    option?: any
  ) => {
    if (!adapter.value) throw handleError(new WalletNotSelectedError());
    if (!connected.value) throw handleError(new WalletNotConnectedError());
    const response = await adapter.value.signTransaction(transaction, option);
    return response;
  };

  const signMessage = async (
    msgPayload: string | SignMessagePayload | Uint8Array
  ) => {
    if (!adapter.value) throw handleError(new WalletNotSelectedError());
    if (!connected.value) throw handleError(new WalletNotConnectedError());
    const response = await adapter.value.signMessage(msgPayload);
    return response;
  };

  return {
    init,
    wallets,
    wallet,
    account,
    connected,
    connecting,
    disconnecting,
    autoConnect,
    network: walletNetwork,
    select: setWalletName,
    connect,
    disconnect,
    signAndSubmitTransaction,
    signTransaction,
    signMessage,
  };
};
