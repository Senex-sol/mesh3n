import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, FlatList, ActivityIndicator, TouchableOpacity, PanResponder, PanResponderInstance, Animated } from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { useAuthorization } from '../utils/useAuthorization';
import { useGetNFTs } from '../components/account/account-data-access';
import { SignInFeature } from "../components/sign-in/sign-in-feature";
import { HandshakeFeature } from "../components/handshake/handshake-feature";
import { useAbly } from "../utils/AblyProvider";

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
  const LIMIT = 20; // Number of NFTs per page

  // Get NFT data
  const { data, isLoading, error } = useGetNFTs({
    address: selectedAccount?.publicKey || new PublicKey('11111111111111111111111111111111'),
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
      setDoWantNfts(prev => [...prev, nft]);
    } else {
      setDontWantNfts(prev => [...prev, nft]);
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
        onMoveShouldSetPanResponder: () => true,
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

  return (
    <View style={styles.container}>
      {!selectedAccount ? (
        <View style={styles.centerContainer}>
          <Text style={styles.centerText}>Please connect a wallet to start.</Text>
          <SignInFeature />
        </View>
      ) : Object.keys(channels).length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.centerText}>Start the handshake.</Text>
          <HandshakeFeature />
        </View>
      ) : (
        <>
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
