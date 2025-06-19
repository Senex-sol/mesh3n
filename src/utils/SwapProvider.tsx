import React, {
  type FC,
  type ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";
import { useAbly } from "./AblyProvider";
import { useAuthorization } from "./useAuthorization";

// Define the NFT interface based on the one in NFTGalleryScreen
interface NFTFile {
  uri: string;
  type: string;
  cdn?: string;
}

interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  animation_url?: string;
  external_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
  properties?: {
    files?: NFTFile[];
    category?: string;
  };
}

interface NFTContent {
  $schema: string;
  json_uri: string;
  files: NFTFile[];
  metadata: NFTMetadata;
  links: {
    [key: string]: string;
  };
}

export interface NFT {
  interface: string;
  id: string;
  content?: NFTContent;
  authorities: Array<{
    address: string;
    scopes: string[];
  }>;
  compression: {
    eligible: boolean;
    compressed: boolean;
    data_hash: string;
    creator_hash: string;
    asset_hash: string;
    tree: string;
    seq: number;
    leaf_id: number;
  };
  grouping: Array<{
    group_key: string;
    group_value: string;
  }>;
  royalty: {
    royalty_model: string;
    target: string;
    percent: number;
    basis_points: number;
    primary_sale_happened: boolean;
    locked: boolean;
  };
  creators: Array<{
    address: string;
    share: number;
    verified: boolean;
  }>;
  ownership: {
    frozen: boolean;
    delegated: boolean;
    delegate: string | null;
    ownership_model: string;
    owner: string;
  };
  supply: {
    print_max_supply: number;
    print_current_supply: number;
    edition_nonce: number | null;
  };
  mutable: boolean;
  burnt: boolean;
}

export interface SwapPartner {
  walletAddress: string;
  selectedNFTs: NFT[];
}

export interface SwapProviderProps {
  children: ReactNode;
}

export interface SwapContextState {
  swapPartner: SwapPartner | null;
  setSwapPartner: (partner: SwapPartner | null) => void;
  sendSelectedNFTs: (nfts: NFT[]) => void;
  isConnected: boolean;
}

export const SwapContext = createContext<SwapContextState>(
  {} as SwapContextState
);

export const SwapProvider: FC<SwapProviderProps> = ({ children }) => {
  const [swapPartner, setSwapPartner] = useState<SwapPartner | null>(null);
  const { ablyClient, getChannel, channels } = useAbly();
  const { selectedAccount } = useAuthorization();
  const [isConnected, setIsConnected] = useState(false);

  // Listen for swap partner data on the Ably channel
  useEffect(() => {
    // Check if we have an active channel
    const channelKeys = Object.keys(channels);
    if (channelKeys.length === 0 || !ablyClient) {
      setIsConnected(false);
      return;
    }

    setIsConnected(true);
    const activeChannelName = channelKeys[0]; // Use the first channel
    const channel = channels[activeChannelName];

    // Subscribe to partner wallet and NFT updates
    channel.subscribe('partner-wallet-new', (message: any) => {
      let selectedWalletAddress = selectedAccount?.publicKey.toString();
      if (selectedWalletAddress === message.data) {
        return;
      }

      console.log('Received new partner wallet:', message.data);
      
      // If we already have a partner with NFTs, update just the wallet address
      if (swapPartner && swapPartner.selectedNFTs.length > 0) {
        setSwapPartner({
          ...swapPartner,
          walletAddress: message.data
        });
      } else {
        // Otherwise create a new partner object
        setSwapPartner({
          walletAddress: message.data,
          selectedNFTs: []
        });
      }

      if (channelKeys.length === 0 || !ablyClient || !selectedAccount) {
        console.warn('Cannot respond: No active channel or wallet');
        return;
      }

      channel.publish('partner-wallet-response', selectedWalletAddress);
    });

    channel.subscribe('partner-wallet-response', (message: any) => {
      if (selectedAccount?.publicKey.toString() === message.data) {
        return;
      }

      console.log('Received partner wallet response:', message.data);
      
      // If we already have a partner with NFTs, update just the wallet address
      if (swapPartner && swapPartner.selectedNFTs.length > 0) {
        setSwapPartner({
          ...swapPartner,
          walletAddress: message.data
        });
      } else {
        // Otherwise create a new partner object
        setSwapPartner({
          walletAddress: message.data,
          selectedNFTs: []
        });
      }
    });

    channel.subscribe('partner-nfts', (message: any) => {
      if (selectedAccount?.publicKey.toString() === message.data.walletAddress) {
        return;
      }
      console.log('Received partner NFTs:', message.data);
      
      setSwapPartner({
        walletAddress: message.data.walletAddress,
        selectedNFTs: message.data.nfts
      });
    });

    if (selectedAccount && !swapPartner) {
      console.log('Publishing partner wallet:', selectedAccount.publicKey.toString());
      channel.publish('partner-wallet-new', selectedAccount.publicKey.toString());
    }

    // Clean up subscriptions when component unmounts
    return () => {
      channel.unsubscribe('partner-wallet-new');
      channel.unsubscribe('partner-wallet-response');
      channel.unsubscribe('partner-nfts');
    };
  }, [channels, ablyClient]);

  // Send selected NFTs to swap partner
  const sendSelectedNFTs = (nfts: NFT[]) => {
    const channelKeys = Object.keys(channels);
    if (channelKeys.length === 0 || !ablyClient || !selectedAccount) {
      console.warn('Cannot send NFTs: No active channel or wallet');
      return;
    }

    const activeChannelName = channelKeys[0]; // Use the first channel
    const channel = channels[activeChannelName];
    
    // Send selected NFTs
    channel.publish('partner-nfts', {nfts, walletAddress: selectedAccount?.publicKey.toString()});
    
    console.log('Sent selected NFTs to partner:', nfts.length);
  };

  return (
    <SwapContext.Provider
      value={{
        swapPartner,
        setSwapPartner,
        sendSelectedNFTs,
        isConnected
      }}
    >
      {children}
    </SwapContext.Provider>
  );
};

export function useSwap(): SwapContextState {
  return useContext(SwapContext);
}
