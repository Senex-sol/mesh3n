import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, FlatList, ActivityIndicator, TouchableOpacity, PanResponder, PanResponderInstance, Animated, Modal } from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { useAuthorization } from '../utils/useAuthorization';
import { useGetNFTs } from '../components/account/account-data-access';
import { SignInFeature } from "../components/sign-in/sign-in-feature";
import { HandshakeFeature } from "../components/handshake/handshake-feature";
import { useAbly } from "../utils/AblyProvider";
import { useSwap } from "../utils/SwapProvider";
import { SwapStatusOverlay } from '../components/SwapStatusOverlay';

// Define types for NFT data structure
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

interface NFT {
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

const { width } = Dimensions.get("window");

export default function NFTGalleryScreen() {
  // Always define all hooks at the top level
  const { selectedAccount } = useAuthorization();
  const [page, setPage] = useState(1);
  const [undecidedNfts, setUndecidedNfts] = useState<NFT[]>([]);
  const [doWantNfts, setDoWantNfts] = useState<NFT[]>([]);
  const [dontWantNfts, setDontWantNfts] = useState<NFT[]>([]);
  const [activeTab, setActiveTab] = useState<'undecided' | 'want' | 'dont-want'>('undecided');
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const { ablyClient, getChannel, channels } = useAbly();
  const { swapPartner, sendSelectedNFTs, tradeSlots, setTradeSlots, sendTradeSlots, swapAccepted, acceptSwap, unacceptSwap, isConnected, statusOverlay } = useSwap();
  const LIMIT = 20; // Number of NFTs per page

  // State for swap modal
  const [swapModalVisible, setSwapModalVisible] = useState(false);

  // Create a stable reference for NFT data fetching
  const walletAddress = swapPartner?.walletAddress;
  
  // Reset swap accepted state whenever trade slots change
  useEffect(() => {
    if (swapAccepted) {
      unacceptSwap();
    }
  }, [tradeSlots]);
  
  // Always call useGetNFTs with consistent parameters
  // Our modified hook will skip the actual fetch if using the dummy address
  const { data, isLoading, error } = useGetNFTs({
    // Use partner's wallet address if available, otherwise use dummy address
    address: walletAddress ? new PublicKey(walletAddress) : new PublicKey('11111111111111111111111111111111'),
    page,
    limit: LIMIT
  });

  // Process NFT data when it arrives
  useEffect(() => {
    if (data?.result?.items) {
      console.log('NFT data received:', data.result.items.length, 'items');
      // Filter out NFTs with blank names
      const filteredNFTs = data.result.items.filter((nft: NFT) => {
        const name = nft?.content?.metadata?.name;
        return name !== undefined && name !== null && name.trim() !== '';
      });

      console.log('Filtered NFTs:', filteredNFTs.length, 'items');
      if (filteredNFTs.length > 0) {
        if (page === 1) {
          setUndecidedNfts(filteredNFTs);
        } else {
          setUndecidedNfts((prev) => [...prev, ...filteredNFTs]);
        }
      }

      // If we got fewer NFTs than the limit, there are no more to load
      setHasMore(data.result.total === LIMIT);
    }
    setIsLoadingMore(false);
  }, [data, page]);

  // Handle loading more NFTs when scrolling to the bottom
  const handleLoadMore = () => {
    console.log('handleLoadMore called: ' + activeTab + ', ' + hasMore + ', ' + isLoadingMore + ', ' + isLoading);
    // Only load more in the undecided tab and if there are more items to load
    if (activeTab === 'undecided' && hasMore && !isLoadingMore && !isLoading) {
      console.log('Loading more NFTs, page:', page + 1);
      setIsLoadingMore(true);
      setPage(prevPage => prevPage + 1);
    }
  };

  // Function to handle swipe categorization
  const handleSwipeCategory = (nft: NFT, category: 'want' | 'dont-want') => {
    // Remove from undecided list
    setUndecidedNfts(prev => prev.filter(item => item.id !== nft.id));
    
    // Add to appropriate category
    if (category === 'want') {
      setDoWantNfts([...doWantNfts, nft]);
      sendSelectedNFTs([...doWantNfts, nft]);
    } else {
      setDontWantNfts([...dontWantNfts, nft]);
    }
  };

  // NFT Item Component for Undecided Tab with swipe functionality
  const NFTSwipeableItem = React.memo(({ item, onSwipeCategory }: { item: NFT, onSwipeCategory: (nft: NFT, category: 'want' | 'dont-want') => void }) => {
    const pan = useRef(new Animated.ValueXY()).current;
    const [panResponder, setPanResponder] = useState<PanResponderInstance>();
    
    // Get image URI from different possible sources
    const imageUri = item.content?.links?.image || 
                    item.content?.files?.[0]?.uri || 
                    item.content?.metadata?.image || 
                    'https://via.placeholder.com/300';
    
    // Initialize PanResponder on component mount
    useEffect(() => {
      const newPanResponder = PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Slightly favor horizontal movements by applying a bias factor
          // This makes the swipe detection more sensitive to horizontal movements
          const horizontalBias = 0.6; // Bias factor (lower = more horizontal bias)
          const isHorizontalSwipe = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * horizontalBias;
          // Also require a minimum movement to start handling the gesture
          const hasMinimumMovement = Math.abs(gestureState.dx) > 6; // Slightly reduced threshold
          return isHorizontalSwipe && hasMinimumMovement;
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx > 120) {
            // Swiped right - "Do Want"
            Animated.timing(pan, {
              toValue: { x: width, y: 0 },
              duration: 300,
              useNativeDriver: false,
            }).start(() => {
              onSwipeCategory(item, 'want');
            });
          } else if (gestureState.dx < -120) {
            // Swiped left - "Don't Want"
            Animated.timing(pan, {
              toValue: { x: -width, y: 0 },
              duration: 300,
              useNativeDriver: false,
            }).start(() => {
              onSwipeCategory(item, 'dont-want');
            });
          } else {
            // Return to center
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              friction: 5,
              useNativeDriver: false,
            }).start();
          }
        },
      });
      setPanResponder(newPanResponder);
    }, [item, onSwipeCategory, pan]);
    
    // Calculate background colors based on swipe direction
    const rightActionOpacity = pan.x.interpolate({
      inputRange: [0, 100],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
    
    const leftActionOpacity = pan.x.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    
    return (
      <View style={styles.swipeContainer}>
        {/* Background indicators */}
        <View style={styles.swipeBackgroundContainer}>
          <Animated.View style={[styles.swipeRightAction, { opacity: rightActionOpacity }]}>
            <Text style={styles.actionText}>Do Want</Text>
          </Animated.View>
          <Animated.View style={[styles.swipeLeftAction, { opacity: leftActionOpacity }]}>
            <Text style={styles.actionText}>Don't Want</Text>
          </Animated.View>
        </View>
        
        {/* Swipeable card */}
        <Animated.View 
          style={[styles.nftItem, { transform: [{ translateX: pan.x }] }]}
          {...(panResponder?.panHandlers || {})}
        >
          <Image 
            source={{ uri: imageUri }} 
            style={styles.nftImage} 
            resizeMode="contain"
          />
          <Text style={styles.nftName}>{item.content?.metadata?.name || 'Unnamed NFT'}</Text>
        </Animated.View>
      </View>
    );
  });

  // Static NFT Item Component for categorized tabs
  const NFTStaticItem = React.memo(({ item }: { item: NFT }) => {
    // Get image URI from different possible sources
    const imageUri = item.content?.links?.image || 
                    item.content?.files?.[0]?.uri || 
                    item.content?.metadata?.image || 
                    'https://via.placeholder.com/300';
    
    return (
      <View style={styles.nftItem}>
        <Image 
          source={{ uri: imageUri }} 
          style={styles.nftImage} 
          resizeMode="contain"
        />
        <Text style={styles.nftName}>{item.content?.metadata?.name || 'Unnamed NFT'}</Text>
      </View>
    );
  });

  // Render NFT item based on active tab
  const renderNFTItem = ({ item }: { item: NFT }) => {
    if (activeTab === 'undecided') {
      return <NFTSwipeableItem item={item} onSwipeCategory={handleSwipeCategory} />;
    } else {
      return <NFTStaticItem item={item} />;
    }
  };

  // Render footer with loading indicator for pagination
  const renderFooter = () => {
    if (!isLoadingMore || activeTab !== 'undecided') return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#2196F3" />
        <Text style={styles.footerText}>Loading more NFTs...</Text>
      </View>
    );
  };

  // Get the current NFT list based on active tab
  const getCurrentNFTs = () => {
    switch (activeTab) {
      case 'want':
        return doWantNfts;
      case 'dont-want':
        return dontWantNfts;
      case 'undecided':
      default:
        return undecidedNfts;
    }
  };

  // Render empty list message
  const renderEmptyList = () => {
    if (isLoading && page === 1) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.centerText}>Loading NFTs...</Text>
        </View>
      );
    }

    if (error && page === 1) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.centerText}>Error loading NFTs. Please try again.</Text>
        </View>
      );
    }

    return (
      <View style={styles.centerContainer}>
        <Text style={styles.centerText}>No NFTs found in this category.</Text>
      </View>
    );
  };

  // Render tab bar for switching between categories
  const renderTabBar = () => {
    return (
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'dont-want' && styles.activeTab]}
          onPress={() => setActiveTab('dont-want')}
        >
          <Text style={[styles.tabText, activeTab === 'dont-want' && styles.activeTabText]}>Don't Want ({dontWantNfts.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'undecided' && styles.activeTab]}
          onPress={() => setActiveTab('undecided')}
        >
          <Text style={[styles.tabText, activeTab === 'undecided' && styles.activeTabText]}>Undecided ({undecidedNfts.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'want' && styles.activeTab]}
          onPress={() => setActiveTab('want')}
        >
          <Text style={[styles.tabText, activeTab === 'want' && styles.activeTabText]}>Do Want ({doWantNfts.length})</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Handle selecting an NFT for swap
  const handleSelectNFT = (nft: NFT, isMyNFT: boolean) => {
    if (isMyNFT) {
      // Find the first empty slot in my row
      const emptySlotIndex = tradeSlots?.myNFTs.findIndex(item => item === null);
      if (emptySlotIndex !== -1) {
        const newSelectedNFTs = [...tradeSlots?.myNFTs];
        newSelectedNFTs[emptySlotIndex] = nft;
        setTradeSlots({
          ...tradeSlots,
          myNFTs: newSelectedNFTs
        });
        sendTradeSlots({
          ...tradeSlots,
          myNFTs: newSelectedNFTs
        });
      }
    } else {
      // Find the first empty slot in partner's row
      const emptySlotIndex = tradeSlots?.partnerNFTs.findIndex(item => item === null);
      if (emptySlotIndex !== -1) {
        const newSelectedNFTs = [...tradeSlots?.partnerNFTs];
        newSelectedNFTs[emptySlotIndex] = nft;
        setTradeSlots({
          ...tradeSlots,
          partnerNFTs: newSelectedNFTs
        });
        sendTradeSlots({
          ...tradeSlots,
          partnerNFTs: newSelectedNFTs
        });
      }
    }
  };

  // Handle removing an NFT from a swap slot
  const handleRemoveNFT = (slotIndex: number, isMyNFT: boolean) => {
    if (isMyNFT) {
      const newSelectedNFTs = [...tradeSlots?.myNFTs];
      newSelectedNFTs[slotIndex] = null;
      setTradeSlots({
        ...tradeSlots,
        myNFTs: newSelectedNFTs
      });
      sendTradeSlots({
        ...tradeSlots,
        myNFTs: newSelectedNFTs
      });
    } else {
      const newSelectedNFTs = [...tradeSlots?.partnerNFTs];
      newSelectedNFTs[slotIndex] = null;
      setTradeSlots({
        ...tradeSlots,
        partnerNFTs: newSelectedNFTs
      });
      sendTradeSlots({
        ...tradeSlots,
        partnerNFTs: newSelectedNFTs
      });
    }
  };
  
  // Check if both sides have at least one NFT in the trade slots
  const canAcceptSwap = () => {
    const hasMyNFT = tradeSlots?.myNFTs.some(nft => nft !== null);
    const hasPartnerNFT = tradeSlots?.partnerNFTs.some(nft => nft !== null);
    return hasMyNFT && hasPartnerNFT;
  };
  
  // Handle accepting the swap
  const handleAcceptSwap = () => {
    if (!canAcceptSwap()) return;
    
    acceptSwap();
  };

  // Render NFT item in the horizontal list
  const renderSwapListItem = ({ item, isMyNFT }: { item: NFT, isMyNFT: boolean }) => {
    // Check if this NFT is already in the selected slots
    const isSelected = isMyNFT
      ? tradeSlots?.myNFTs.some(nft => nft && nft.id === item.id)
      : tradeSlots?.partnerNFTs.some(nft => nft && nft.id === item.id);
    
    // Get image URI
    const imageUri = item.content?.links?.image || 
                    item.content?.files?.[0]?.uri || 
                    item.content?.metadata?.image || 
                    'https://via.placeholder.com/150';
    
    return (
      <TouchableOpacity 
        style={[styles.swapNftItem, isSelected && styles.swapNftItemSelected]}
        onPress={() => !isSelected && handleSelectNFT(item, isMyNFT)}
        disabled={isSelected}
      >
        <Image 
          source={{ uri: imageUri }}
          style={styles.swapNftImage}
          resizeMode="cover"
        />
        <Text style={styles.swapNftName} numberOfLines={1}>
          {item.content?.metadata?.name || 'Unnamed NFT'}
        </Text>
      </TouchableOpacity>
    );
  };

  // Render a slot for selected NFTs
  const renderSwapSlot = (index: number, isMySlot: boolean) => {
    const selectedNFT = isMySlot ? tradeSlots?.myNFTs[index] : tradeSlots?.partnerNFTs[index];
    
    if (selectedNFT) {
      // Get image URI
      const imageUri = selectedNFT.content?.links?.image || 
                      selectedNFT.content?.files?.[0]?.uri || 
                      selectedNFT.content?.metadata?.image || 
                      'https://via.placeholder.com/150';
      
      return (
        <View style={styles.swapSlotFilled}>
          <Image 
            source={{ uri: imageUri }}
            style={styles.swapSlotImage}
            resizeMode="cover"
          />
          <TouchableOpacity 
            style={styles.removeButton}
            onPress={() => handleRemoveNFT(index, isMySlot)}
          >
            <Text style={styles.removeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    // Empty slot
    return (
      <View style={styles.swapSlotEmpty}>
        <Text style={styles.swapSlotPlus}>+</Text>
      </View>
    );
  };

  // Render swap modal
  const renderSwapModal = () => {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={swapModalVisible}
        onRequestClose={() => setSwapModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Swap</Text>
              <TouchableOpacity onPress={() => setSwapModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {/* My NFTs horizontal list */}
            <View style={styles.swapSection}>
              <FlatList
                data={doWantNfts}
                horizontal
                renderItem={({ item }) => renderSwapListItem({ item, isMyNFT: true })}
                keyExtractor={(item) => `my-${item.id}`}
                contentContainerStyle={styles.swapListContainer}
                showsHorizontalScrollIndicator={false}
              />
            </View>
            
            {/* Center container for slots and button */}
            <View style={styles.centerSlotsContainer}>
              {/* My offer slots */}
              <View style={styles.swapSlotsSection}>
                <View style={styles.swapSlotsRow}>
                  {[0, 1, 2].map((index) => (
                    <View key={`my-slot-${index}`} style={styles.swapSlotWrapper}>
                      {renderSwapSlot(index, true)}
                    </View>
                  ))}
                </View>
              </View>
              
              {/* Confirm button */}
              <TouchableOpacity 
                style={[styles.confirmButton, (swapAccepted || !canAcceptSwap()) && styles.confirmButtonDisabled]}
                onPress={handleAcceptSwap}
                disabled={swapAccepted || !canAcceptSwap()}
              >
                {swapAccepted ? (
                  <View style={styles.checkmarkContainer}>
                    <Text style={styles.greenCheckmark}>✓</Text>
                    <Text style={swapPartner?.swapAccepted ? styles.greenCheckmark : styles.greyCheckmark}>✓</Text>
                  </View>
                ) : canAcceptSwap() ? (
                  <Text style={styles.confirmButtonText}>Accept Swap</Text>
                ) : (
                  <Text style={styles.confirmButtonText}>Choose NFTs to Swap</Text>
                )}
              </TouchableOpacity>
              
              {/* Partner's offer slots */}
              <View style={styles.swapSlotsSection}>
                <View style={styles.swapSlotsRow}>
                  {[0, 1, 2].map((index) => (
                    <View key={`partner-slot-${index}`} style={styles.swapSlotWrapper}>
                      {renderSwapSlot(index, false)}
                    </View>
                  ))}
                </View>
              </View>
            </View>
            
            {/* Partner's NFTs horizontal list */}
            <View style={[styles.swapSection, styles.partnerSwapSection]}>
              {swapPartner?.selectedNFTs && swapPartner.selectedNFTs.length > 0 ? (
                <FlatList
                  data={swapPartner.selectedNFTs}
                  horizontal
                  renderItem={({ item }) => renderSwapListItem({ item, isMyNFT: false })}
                  keyExtractor={(item) => `partner-${item.id}`}
                  contentContainerStyle={styles.swapListContainer}
                  showsHorizontalScrollIndicator={false}
                />
              ) : (
                <Text style={styles.emptyListText}>No NFTs available</Text>
              )}
            </View>


          </View>
        </View>
        <SwapStatusOverlay
          visible={statusOverlay.visible}
          message={statusOverlay.message}
          isLoading={statusOverlay.isLoading}
        />
      </Modal>
    );
  };

  // Render partner status and swap button
  const renderPartnerSection = () => {
    const hasPartnerNFTs = swapPartner?.selectedNFTs && swapPartner.selectedNFTs.length > 0;
    
    return (
      <View style={styles.partnerContainer}>
        {!hasPartnerNFTs ? (
          <View style={styles.partnerEmptyContainer}>
            <Text style={styles.partnerEmptyText}>Waiting for partner to select NFTs...</Text>
          </View>
        ) : (
          <TouchableOpacity 
            style={[styles.startSwapButton, !hasPartnerNFTs && styles.disabledButton]}
            onPress={() => setSwapModalVisible(true)}
            disabled={!hasPartnerNFTs}
          >
            <Text style={styles.startSwapButtonText}>Start Swap ({swapPartner.selectedNFTs.length} NFTs)</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderSwapModal()}
      {!selectedAccount ? (
        <View style={styles.centerContainer}>
          <Text style={styles.centerText}>Please connect a wallet to start.</Text>
          <SignInFeature />
        </View>
      ) : (!swapPartner || !swapPartner.walletAddress) ? (
        <View style={styles.centerContainer}>
          <HandshakeFeature />
        </View>
      ) : (
        <>
          {renderPartnerSection()}
          {renderTabBar()}
          <FlatList
            data={getCurrentNFTs()}
            renderItem={renderNFTItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={renderEmptyList}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={renderFooter}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '95%',
    height: '90%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#512da8',
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '80%',
    alignSelf: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#dedede',
    opacity: 0.8,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    paddingVertical: 12,
  },
  checkmarkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
  },
  greenCheckmark: {
    color: '#4CAF50',
    fontSize: 30,
    fontWeight: 'bold',
    marginRight: 8,
  },
  greyCheckmark: {
    color: '#9e9e9e',
    fontSize: 30,
    fontWeight: 'bold',
  },
  swapSection: {
    marginVertical: 10,
  },
  partnerSwapSection: {
    // No need for margin-top auto anymore
  },
  startSwapButton: {
    backgroundColor: '#512da8',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    backgroundColor: '#9e9e9e',
    opacity: 0.7,
  },
  startSwapButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  swapSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  swapListContainer: {
    paddingVertical: 5,
  },
  swapNftItem: {
    width: 100,
    marginRight: 10,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  swapNftItemSelected: {
    opacity: 0.5,
  },
  swapNftImage: {
    width: 100,
    height: 100,
    backgroundColor: '#eee',
  },
  swapNftName: {
    padding: 4,
    fontSize: 11,
    fontWeight: 'bold',
  },
  swapSlotsSection: {
    marginVertical: 10,
  },
  swapSlotsSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  swapSlotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  swapSlotWrapper: {
    width: '30%',
    aspectRatio: 1,
  },
  swapSlotEmpty: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swapSlotFilled: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  swapSlotImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#eee',
  },
  swapSlotPlus: {
    fontSize: 24,
    color: '#aaa',
  },
  removeButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyListText: {
    padding: 10,
    fontStyle: 'italic',
    color: '#999',
  },
  // Note: confirmButton and confirmButtonText are already defined above
  centerSlotsContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#f0f8ff', // Light blue background
  },
  partnerContainer: {
    paddingHorizontal: 5,
    backgroundColor: '#f0f8ff', // Light blue background
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  partnerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  partnerWallet: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  partnerListContainer: {
    paddingVertical: 10,
  },
  partnerNftItem: {
    width: 120,
    marginRight: 10,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  partnerNftImage: {
    width: 120,
    height: 120,
    backgroundColor: '#eee',
  },
  partnerNftName: {
    padding: 5,
    fontSize: 12,
    fontWeight: 'bold',
  },
  partnerEmptyContainer: {
    padding: 15,
    backgroundColor: '#f0f8ff',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  partnerEmptyText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  centerText: {
    fontSize: 18,
    marginBottom: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  listContainer: {
    padding: 10,
    flexGrow: 1,
  },
  swipeContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  swipeBackgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 10,
    overflow: 'hidden',
  },
  swipeRightAction: {
    flex: 1,
    backgroundColor: '#4CAF50', // Green for 'Do Want'
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 20,
  },
  swipeLeftAction: {
    flex: 1,
    backgroundColor: '#F44336', // Red for 'Don't Want'
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  actionText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  nftItem: {
    marginBottom: 0, // Changed from 20 since the swipeContainer has margin
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f9f9f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  nftImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#eee',
  },
  nftName: {
    padding: 10,
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  footerText: {
    marginLeft: 10,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#2196F3',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#2196F3',
    fontWeight: 'bold',
  },
});
