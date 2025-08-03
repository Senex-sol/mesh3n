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

export interface SwapStatusOverlayProps {
  visible: boolean;
  message: string;
  isLoading: boolean;
}

export interface SwapProviderProps {
  children: ReactNode;
}

export interface SwapContextState {
  doWantNfts: NFT[];
  setDoWantNfts: React.Dispatch<React.SetStateAction<NFT[]>>;
  dontWantNfts: NFT[];
  setDontWantNfts: React.Dispatch<React.SetStateAction<NFT[]>>;
  swapPartner: SwapPartner | null;
  setSwapPartner: (partner: SwapPartner | null) => void;
  sendSelectedNFTs: (nfts: NFT[]) => void;
  swapModalVisible: boolean;
  setSwapModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  tradeSlots: TradeSlots;
  setTradeSlots: React.Dispatch<React.SetStateAction<TradeSlots>>;
  sendTradeSlots: (slots: TradeSlots) => void;
  iMadeLastSwapChange: boolean;
  swapAccepted: boolean;
  acceptSwap: () => void;
  unacceptSwap: () => void;
  isConnected: boolean;
  statusOverlay: SwapStatusOverlayProps;
  setStatusOverlay: React.Dispatch<React.SetStateAction<SwapStatusOverlayProps>>;
  showConfetti: boolean;
  confettiRef: React.RefObject<any>;
}

export const SwapContext = createContext<SwapContextState>(
  {} as SwapContextState
);

export const SwapProvider: FC<SwapProviderProps> = ({ children }) => {
  const [doWantNfts, setDoWantNfts] = useState<NFT[]>([]);
  const [dontWantNfts, setDontWantNfts] = useState<NFT[]>([]);
  const [swapPartner, setSwapPartner] = useState<SwapPartner | null>(null);
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [tradeSlots, setTradeSlots] = useState<TradeSlots>({
    myNFTs: [null, null, null],
    partnerNFTs: [null, null, null],
  });
  const { ablyClient, getChannel, channels } = useAbly();
  const { selectedAccount } = useAuthorization();
  const [isConnected, setIsConnected] = useState(false);
  const [iMadeLastSwapChange, setIMadeLastSwapChange] = useState(false);
  const [swapAccepted, setSwapAccepted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  
  const activeChannelRef = useRef<any | null>(null);
  const confettiRef = useRef<any>(null);
  useEffect(() => {
    if (ablyClient) {
      const channelKeys = Object.keys(channels);
      if (channelKeys.length > 0) {
        const activeChannelName = channelKeys[0];
        const channel = channels[activeChannelName];
        activeChannelRef.current = channel;
      }
    }
  }, [ablyClient, channels]);

  const doWantNftsRef = useRef(doWantNfts);
  useEffect(() => {
    doWantNftsRef.current = doWantNfts;
  }, [doWantNfts]);

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
  
  // Status overlay state
  const [statusOverlay, setStatusOverlay] = useState<SwapStatusOverlayProps>({ visible: false, message: '', isLoading: true });
  
  // Import the useSwapEscrow hook
  const { initializeEscrow, depositAndCollectNFTs, completeSwap, getEscrowAccountData, checkEscrowAccount, cancelSwap, loading: swapEscrowLoading, error: swapEscrowError } = useSwapEscrow();

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
            setStatusOverlay({
              visible: true,
              message: 'Waiting for partner to initialize the escrow...',
              isLoading: true
            });
          } else {
            console.log('I was the last to change slots, initializing escrow');
            setStatusOverlay({
              visible: true,
              message: 'Initializing escrow...',
              isLoading: true
            });
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

      channel.subscribe('escrow-initialized', (message: any) => {
        if (selectedAccount?.publicKey.toString() === message.data.walletAddress) {
          return;
        }
        console.log('Received escrow initialized:', message.data);
        
        setStatusOverlay({
          visible: true,
          message: 'Escrow initialized, depositing NFTs...',
          isLoading: true
        });

        depositAsTaker();
      });

      channel.subscribe('escrow-deposited', (message: any) => {
        if (selectedAccount?.publicKey.toString() === message.data.walletAddress) {
          return;
        }
        console.log('Received escrow deposited:', message.data);
        
        setStatusOverlay({
          visible: true,
          message: 'Escrow fully deposited, collecting NFTs...',
          isLoading: true
        });

        completeSwapEscrow(true);
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

    if (swapPartner?.swapAccepted) {
      setSwapPartner({
        ...swapPartner,
        swapAccepted: false
      });
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
        setStatusOverlay({
          visible: true,
          message: 'Waiting for partner to initialize the escrow...',
          isLoading: true
        });
      }
    } else {
      console.log('Waiting for partner to accept the swap');
      setStatusOverlay({
        visible: true,
        message: 'Waiting for partner to accept...',
        isLoading: true
      });
    }
  };

  const unacceptSwap = () => {
    sendSwapAccepted(false);
    setSwapAccepted(false);
  }

  const resetTradeData = () => {
    // Remove any NFTs listed in tradeSlots.myNFTs from the doWantNfts array
    const tradedMyNftIds = tradeSlotsRef.current.myNFTs
      .filter((nft): nft is NFT => nft !== null)
      .map(nft => nft.id);
    
    if (tradedMyNftIds.length > 0) {
      // Filter out the NFTs that were in my trade slots
      const updatedDoWantNfts = doWantNftsRef.current.filter(nft => !tradedMyNftIds.includes(nft.id));
      setDoWantNfts(updatedDoWantNfts);
    }
    
    // Remove any NFTs listed in tradeSlots.partnerNFTs from swapPartner.selectedNFTs
    if (swapPartnerRef.current && swapPartnerRef.current.selectedNFTs.length > 0) {
      const tradedPartnerNftIds = tradeSlotsRef.current.partnerNFTs
        .filter((nft): nft is NFT => nft !== null)
        .map(nft => nft.id);
      
      if (tradedPartnerNftIds.length > 0) {
        // Filter out the NFTs that were in partner's trade slots
        const updatedPartnerNfts = swapPartnerRef.current?.selectedNFTs.filter(
          nft => !tradedPartnerNftIds.includes(nft.id)
        );
        
        // Update the swap partner with filtered NFTs
        setSwapPartner({
          ...swapPartnerRef.current,
          selectedNFTs: updatedPartnerNfts
        });
      }
    }
    
    // Reset trade slots
    setTradeSlots({
      myNFTs: [null, null, null],
      partnerNFTs: [null, null, null],
    });
    
    setSwapAccepted(false);
  }
  
  // Initialize the swap escrow
  const initializeSwapEscrow = useCallback(async () => {
    if (!selectedAccountRef.current || !swapPartnerRef.current?.walletAddress) {
      setStatusOverlay({
        visible: true,
        message: 'Error: Missing account or swap partner information',
        isLoading: false
      });
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
        setStatusOverlay({
          visible: true,
          message: 'Error: Both sides must have at least one NFT selected',
          isLoading: false
        });
        return;
      }
      
      // Create the partner's PublicKey
      const takerPublicKey = new PublicKey(swapPartnerRef.current?.walletAddress);
      
      // Initialize the escrow
      const signature = await initializeEscrow(takerPublicKey, {
        initializerPubkey: selectedAccountRef.current.publicKey,
        initializerNftCount: partnerNFTMints.length,
        takerNftCount: myNFTMints.length,
        initializerNftMints: partnerNFTMints,
        takerNftMints: myNFTMints,
        timeoutInSeconds: 3600 // 1 hour timeout
      });
      
      if (signature) {
        setStatusOverlay({
          visible: true,
          message: 'Escrow initialized, NFTs deposited, waiting for partner to deposit NFTs...',
          isLoading: true
        });
        console.log('Escrow initialized with signature:', signature);

        // Send the signature to the partner
        activeChannelRef.current.publish('escrow-initialized', { signature, walletAddress: selectedAccount?.publicKey.toString() });
      } else {
        setStatusOverlay({
          visible: true,
          message: 'Error initializing escrow',
          isLoading: false
        });
        console.error('Error initializing escrow');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatusOverlay({
        visible: true,
        message: `Error initializing escrow: ${errorMessage}`,
        isLoading: false
      });
      console.error('Error initializing escrow:', error);
    }
  }, [selectedAccountRef, swapPartnerRef, tradeSlotsRef, initializeEscrow]);

  const depositAsTaker = useCallback(async () => {
    if (!selectedAccountRef.current || !swapPartnerRef.current?.walletAddress) {
      setStatusOverlay({
        visible: true,
        message: 'Error: Missing account or swap partner information',
        isLoading: false
      });
      return;
    }

    const initializerPublicKey = new PublicKey(swapPartnerRef.current?.walletAddress);
    const takerPublicKey = selectedAccountRef.current.publicKey;
    const escrowData = await getEscrowAccountData(initializerPublicKey, takerPublicKey);
    if (!escrowData) {
      setStatusOverlay({
        visible: true,
        message: 'Error: Escrow account not found',
        isLoading: false
      });
      return;
    }

    const signature = await depositAndCollectNFTs(initializerPublicKey, takerPublicKey, {
      initializerNftMints: escrowData.initializerNftMints,
      takerNftMints: escrowData.takerNftMints,
    });
    
    if (signature) {
      setStatusOverlay({
        visible: true,
        message: 'NFTs deposited and collected successfully, swap complete!',
        isLoading: false
      });
      setShowConfetti(true);
      console.log('NFTs deposited with signature:', signature);
      setTimeout(() => {
        setStatusOverlay(prev => ({
          ...prev,
          visible: false
        }));
        setShowConfetti(false);
        if (doWantNftsRef.current.length === 0 || swapPartnerRef.current?.selectedNFTs.length === 0) {
          setSwapModalVisible(false);
        }
      }, 5000);

      activeChannelRef.current.publish('escrow-deposited', { signature, walletAddress: selectedAccount?.publicKey.toString() });
      resetTradeData();

    } else {
      setStatusOverlay({
        visible: true,
        message: 'Error depositing NFTs',
        isLoading: false
      });
      console.error('Error depositing NFTs');
    }
  }, [selectedAccountRef, swapPartnerRef, tradeSlotsRef, depositAndCollectNFTs]);

  const completeSwapEscrow = useCallback(async (isInitializer: boolean) => {
    if (!selectedAccountRef.current || !swapPartnerRef.current?.walletAddress) {
      setStatusOverlay({
        visible: true,
        message: 'Error: Missing account or swap partner information',
        isLoading: false
      });
      return;
    }

    const initializerPublicKey = isInitializer ? selectedAccountRef.current.publicKey : new PublicKey(swapPartnerRef.current?.walletAddress);
    const takerPublicKey = isInitializer ? new PublicKey(swapPartnerRef.current?.walletAddress) : selectedAccountRef.current.publicKey;
    const escrowData = await getEscrowAccountData(initializerPublicKey, takerPublicKey);
    if (!escrowData) {
      console.error('Error: Escrow account not found');
      return;
    }

    const nftMints = isInitializer ? escrowData.takerNftMints : escrowData.initializerNftMints;

    const signature = await completeSwap(
      initializerPublicKey,
      takerPublicKey,
      isInitializer,
      nftMints,
    );
    
    if (signature) {
      setStatusOverlay({
        visible: true,
        message: 'NFTs collected successfully, swap complete!',
        isLoading: false
      });
      setShowConfetti(true);
      console.log('NFTs collected with signature:', signature);

      setTimeout(() => {
        setStatusOverlay(prev => ({
          ...prev,
          visible: false
        }));
        setShowConfetti(false);
      }, 5000);

      resetTradeData();

    } else {
      setStatusOverlay({
        visible: true,
        message: 'Error collecting NFTs',
        isLoading: false
      });
      console.error('Error collecting NFTs');
    }
  }, [selectedAccountRef, swapPartnerRef, tradeSlotsRef, completeSwap]);

  return (
    <SwapContext.Provider
      value={{
        doWantNfts,
        setDoWantNfts,
        dontWantNfts,
        setDontWantNfts,
        swapPartner,
        setSwapPartner,
        sendSelectedNFTs,
        swapModalVisible,
        setSwapModalVisible,
        tradeSlots,
        setTradeSlots,
        sendTradeSlots,
        iMadeLastSwapChange,
        swapAccepted,
        acceptSwap,
        unacceptSwap,
        isConnected,
        statusOverlay,
        setStatusOverlay,
        showConfetti,
        confettiRef,
      }}
    >
      {children}
      
      <EscrowModal 
        selectedAccount={selectedAccount?.publicKey}
        visible={escrowModalVisible}
        onClose={() => setEscrowModalVisible(false)}
        escrowData={currentEscrowData}
        depositAndCollectNFTs={depositAndCollectNFTs}
        completeSwap={completeSwap}
        cancelEscrow={cancelSwap}
      />
    </SwapContext.Provider>
  );
};

export function useSwap(): SwapContextState {
  return useContext(SwapContext);
}
