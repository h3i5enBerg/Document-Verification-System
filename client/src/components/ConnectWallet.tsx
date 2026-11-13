
"use client";

import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { polygonAmoy } from "wagmi/chains";

export default function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const metamask = connectors.find(
    (connector) => connector.id === "injected"
  );

  if (isConnected) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-green-400">
          ● Connected: {address?.slice(0, 6)}...
          {address?.slice(-4)}
        </span>

        {chainId !== polygonAmoy.id && (
          <button
            onClick={() =>
              switchChain({ chainId: polygonAmoy.id })
            }
            disabled={isSwitching}
            className="rounded-lg bg-yellow-600 px-4 py-2 text-sm text-white"
          >
            {isSwitching ? "Switching..." : "Switch to Amoy"}
          </button>
        )}

        <button
          onClick={() => disconnect()}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => {
          if (metamask) {
            connect({ connector: metamask });
          }
        }}
        disabled={isPending || !metamask}
        className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "Connecting..." : "Connect MetaMask"}
      </button>

      {!metamask && (
        <p className="mt-2 text-xs text-yellow-400">
          Install or enable MetaMask in your browser.
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400">
          {error.message}
        </p>
      )}
    </div>
  );
}
