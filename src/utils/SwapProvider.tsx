import React, {
  type FC,
  type ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { PublicKey } from '@solana/web3.js';
import { useSwapEscrow } from './useSwapEscrow';
import { alertAndLog } from './alertAndLog';
import { useAbly } from "./AblyProvider";
import { useAuthorization } from "./useAuthorization";
import { EscrowModal } from '../components/EscrowModal';
import { EscrowAccountData } from './SwapEscrowClient';

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
  swapAccepted: boolean;
}

export interface TradeSlots {
  myNFTs: (NFT|null)[];
  partnerNFTs: (NFT|null)[];
}

export interface SwapProviderProps {
  children: ReactNode;
}

export interface SwapContextState {
  swapPartner: SwapPartner | null;
  setSwapPartner: (partner: SwapPartner | null) => void;
  sendSelectedNFTs: (nfts: NFT[]) => void;
  tradeSlots: TradeSlots;
  setTradeSlots: React.Dispatch<React.SetStateAction<TradeSlots>>;
  sendTradeSlots: (slots: TradeSlots) => void;
  iMadeLastSwapChange: boolean;
  swapAccepted: boolean;
  acceptSwap: () => void;
  unacceptSwap: () => void;
  isConnected: boolean;
}

export const SwapContext = createContext<SwapContextState>(
  {} as SwapContextState
);

export const SwapProvider: FC<SwapProviderProps> = ({ children }) => {
  const [swapPartner, setSwapPartner] = useState<SwapPartner | null>(null);
  const [tradeSlots, setTradeSlots] = useState<TradeSlots>({
    myNFTs: [null, null, null],
    partnerNFTs: [null, null, null],
  });
  const { ablyClient, getChannel, channels } = useAbly();
  const { selectedAccount } = useAuthorization();
  const [isConnected, setIsConnected] = useState(false);
  const [iMadeLastSwapChange, setIMadeLastSwapChange] = useState(false);
  const [swapAccepted, setSwapAccepted] = useState(false);
  
  const swapPartnerRef = useRef(swapPartner);
  useEffect(() => {
    swapPartnerRef.current = swapPartner;
  }, [swapPartner]);

  const tradeSlotsRef = useRef(tradeSlots);
  useEffect(() => {
    tradeSlotsRef.current = tradeSlots;
  }, [tradeSlots]);

  const selectedAccountRef = useRef(selectedAccount);
  useEffect(() => {
    selectedAccountRef.current = selectedAccount;
  }, [selectedAccount]);

  const iMadeLastSwapChangeRef = useRef(iMadeLastSwapChange);
  useEffect(() => {
    iMadeLastSwapChangeRef.current = iMadeLastSwapChange;
  }, [iMadeLastSwapChange]);

  const swapAcceptedRef = useRef(swapAccepted);
  useEffect(() => {
    swapAcceptedRef.current = swapAccepted;
  }, [swapAccepted]);
  
  // Track whether we've already subscribed to Ably events
  const hasSubscribedRef = useRef(false);
  
  // State for escrow modal
  const [escrowModalVisible, setEscrowModalVisible] = useState(false);
  const [currentEscrowData, setCurrentEscrowData] = useState<EscrowAccountData | null>(null);
  
  // Import the useSwapEscrow hook
  const { initializeEscrow, checkEscrowAccount, loading: swapEscrowLoading, error: swapEscrowError } = useSwapEscrow();

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
    
    // Only subscribe once
    if (!hasSubscribedRef.current) {
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
            selectedNFTs: [],
            swapAccepted: false
          });

          // Check if escrow account exists
          if (selectedAccountRef.current && message.data) {
            checkEscrowAccount(
              selectedAccountRef.current.publicKey,
              new PublicKey(message.data)
            ).then(escrowData => {
              if (escrowData) {
                // Store escrow data and show modal
                setCurrentEscrowData(escrowData);
                setEscrowModalVisible(true);
                
                // Also log to console for debugging
                console.log('Found existing escrow account:', escrowData);
              }
            }).catch(error => {
              console.error('Error checking escrow account:', error);
            });
          }
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
            selectedNFTs: [],
            swapAccepted: false
          });

          // Check if escrow account exists
          if (selectedAccountRef.current && message.data) {
            checkEscrowAccount(
              selectedAccountRef.current.publicKey,
              new PublicKey(message.data)
            ).then(escrowData => {
              if (escrowData) {
                // Store escrow data and show modal
                setCurrentEscrowData(escrowData);
                setEscrowModalVisible(true);
                
                // Also log to console for debugging
                console.log('Found existing escrow account:', escrowData);
              }
            }).catch(error => {
              console.error('Error checking escrow account:', error);
            });
          }
        }
      });

      channel.subscribe('partner-nfts', (message: any) => {
        if (selectedAccount?.publicKey.toString() === message.data.walletAddress) {
          return;
        }
        console.log('Received partner NFTs:', message.data);
        
        setSwapPartner({
          walletAddress: message.data.walletAddress,
          selectedNFTs: message.data.nfts,
          swapAccepted: swapPartner?.swapAccepted || false
        });
      });

      channel.subscribe('swap-accepted', (message: any) => {
        if (selectedAccountRef.current?.publicKey.toString() === message.data.walletAddress || swapPartnerRef.current?.swapAccepted) {
          return;
        }
        console.log('Received swap accepted:', message.data);
        
        setSwapPartner({
          walletAddress: message.data.walletAddress,
          selectedNFTs: swapPartnerRef.current?.selectedNFTs || [],
          swapAccepted: message.data.swapAccepted
        });

        if (message.data.swapAccepted && swapAcceptedRef.current) {
          // Both parties have accepted, check who should initialize the escrow
          if (!iMadeLastSwapChangeRef.current) {
            console.log('Partner was the last to change slots, they will initialize escrow');
            // Partner will initialize escrow
            alertAndLog('Swap Accepted', 'Waiting for partner to initialize the escrow...');
          } else {
            console.log('I was the last to change slots, initializing escrow');
            initializeSwapEscrow();
          }
        }
      });

      channel.subscribe('trade-slots', (message: any) => {
        if (selectedAccount?.publicKey.toString() === message.data.walletAddress) {
          return;
        }
        console.log('Received trade slots:', message.data);
        
        setIMadeLastSwapChange(false);
        setTradeSlots({
          myNFTs: message.data.slots.partnerNFTs,
          partnerNFTs: message.data.slots.myNFTs
        });
      });

      // Mark as subscribed
      hasSubscribedRef.current = true;
    }

    if (selectedAccount && !swapPartner) {
      console.log('Publishing partner wallet:', selectedAccount.publicKey.toString());
      channel.publish('partner-wallet-new', selectedAccount.publicKey.toString());
    }
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

  const sendTradeSlots = (slots: TradeSlots) => {
    const channelKeys = Object.keys(channels);
    if (channelKeys.length === 0 || !ablyClient || !selectedAccount) {
      console.warn('Cannot send trade slots: No active channel or wallet');
      return;
    }

    const activeChannelName = channelKeys[0]; // Use the first channel
    const channel = channels[activeChannelName];
    
    // Send trade slots
    channel.publish('trade-slots', {slots, walletAddress: selectedAccount?.publicKey.toString()});
    setIMadeLastSwapChange(true);
    
    console.log('Sent trade slots to partner:', slots);
  };

  const sendSwapAccepted = (swapAccepted: boolean) => {
    const channelKeys = Object.keys(channels);
    if (channelKeys.length === 0 || !ablyClient || !selectedAccount) {
      console.warn('Cannot send swap accepted: No active channel or wallet');
      return;
    }

    const activeChannelName = channelKeys[0]; // Use the first channel
    const channel = channels[activeChannelName];
    
    // Send swap accepted
    channel.publish('swap-accepted', {walletAddress: selectedAccount?.publicKey.toString(), swapAccepted});
    
    console.log('Sent swap accepted to partner');
  };

  const acceptSwap = () => {
    sendSwapAccepted(true);
    setSwapAccepted(true);

    if (swapPartner?.swapAccepted) {
      // Both parties have accepted, check who should initialize the escrow
      if (iMadeLastSwapChange) {
        console.log('I was the last to change slots, initializing escrow');
        initializeSwapEscrow();
      } else {
        console.log('Partner was the last to change slots, they will initialize escrow');
        alertAndLog('Swap Accepted', 'Waiting for partner to initialize the escrow...');
      }
    } else {
      console.log('Waiting for partner to accept the swap');
      alertAndLog('Swap Accepted', 'Waiting for partner to accept...');
    }
  };

  const unacceptSwap = () => {
    sendSwapAccepted(false);
    setSwapAccepted(false);
  }
  
  // Initialize the swap escrow
  const initializeSwapEscrow = useCallback(async () => {
    if (!selectedAccountRef.current || !swapPartnerRef.current?.walletAddress) {
      alertAndLog('Error', 'Missing wallet information');
      return;
    }
    
    try {
      // Filter out null values and get NFT mints
      const myNFTMints = tradeSlotsRef.current.myNFTs
        .filter((nft): nft is NFT => nft !== null)
        .map(nft => new PublicKey(nft.id));
      
      const partnerNFTMints = tradeSlotsRef.current.partnerNFTs
        .filter((nft): nft is NFT => nft !== null)
        .map(nft => new PublicKey(nft.id));
      
      if (myNFTMints.length === 0 || partnerNFTMints.length === 0) {
        alertAndLog('Error', 'Both sides must have at least one NFT selected');
        return;
      }
      
      // Create the partner's PublicKey
      const takerPublicKey = new PublicKey(swapPartnerRef.current?.walletAddress);
      
      // Initialize the escrow
      const signature = await initializeEscrow(takerPublicKey, {
        initializerPubkey: selectedAccountRef.current.publicKey,
        initializerNftCount: myNFTMints.length,
        takerNftCount: partnerNFTMints.length,
        initializerNftMints: myNFTMints,
        takerNftMints: partnerNFTMints,
        timeoutInSeconds: 3600 // 1 hour timeout
      });
      
      if (signature) {
        alertAndLog('Success', 'Escrow initialized successfully! Transaction: ' + signature);
      } else {
        alertAndLog('Error', 'Failed to initialize escrow');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alertAndLog('Failed to initialize swap escrow', errorMessage);
    }
  }, [selectedAccountRef, swapPartnerRef, tradeSlotsRef, initializeEscrow]);

  return (
    <SwapContext.Provider
      value={{
        swapPartner,
        setSwapPartner,
        sendSelectedNFTs,
        tradeSlots,
        setTradeSlots,
        sendTradeSlots,
        iMadeLastSwapChange,
        swapAccepted,
        acceptSwap,
        unacceptSwap,
        isConnected
      }}
    >
      {children}
      <EscrowModal 
        visible={escrowModalVisible}
        onClose={() => setEscrowModalVisible(false)}
        escrowData={currentEscrowData}
      />
    </SwapContext.Provider>
  );
};

export function useSwap(): SwapContextState {
  return useContext(SwapContext);
}
