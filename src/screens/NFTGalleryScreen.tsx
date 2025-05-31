import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, View, FlatList, Image, Dimensions, ActivityIndicator } from "react-native";
import { Text, Card } from "react-native-paper";
import { useAuthorization } from "../utils/useAuthorization";
import { useGetNFTs } from "../components/account/account-data-access";
import { PublicKey } from "@solana/web3.js";

// Define types for NFT data structure
interface NFTFile {
  uri: string;
  cdn_uri?: string;
  mime?: string;
}

interface NFTMetadata {
  name: string;
  description?: string;
  symbol?: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
}

interface NFTContent {
  files?: NFTFile[];
  metadata?: NFTMetadata;
  links?: {
    image?: string;
    animation_url?: string;
    external_url?: string;
  };
}

interface NFT {
  id: string;
  content?: NFTContent;
  ownership?: {
    owner: string;
  };
}

const { width } = Dimensions.get("window");

export default function NFTGalleryScreen() {
  // Always define all hooks at the top level
  const { selectedAccount } = useAuthorization();
  const [page, setPage] = useState(1);
  const [allNfts, setAllNfts] = useState<NFT[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const LIMIT = 20; // Number of NFTs per page
  
  // Always call useGetNFTs with a valid address or a placeholder
  const { data, isLoading, error } = useGetNFTs({
    address: selectedAccount?.publicKey || ({} as PublicKey),
    page,
    limit: LIMIT
  });

  // Handle loading more NFTs - define this before any conditional returns
  const handleLoadMore = useCallback(() => {
    console.log('Loading more NFTs...');
    if (hasMore && !isLoading && !isLoadingMore && selectedAccount) {
      setIsLoadingMore(true);
      setPage(prev => prev + 1);
    }
  }, [hasMore, isLoading, isLoadingMore, selectedAccount]);
  
  // Update allNfts when data changes - define this before any conditional returns
  useEffect(() => {
    if (data?.result?.items) {
      // Filter out NFTs with blank names
      const newNfts = data.result.items.filter((nft: NFT) => {
        const name = nft?.content?.metadata?.name;
        return name !== undefined && name !== null && name.trim() !== '';
      });
      
      if (page === 1) {
        setAllNfts(newNfts);
      } else {
        setAllNfts(prev => [...prev, ...newNfts]);
      }
      
      // Check if we have more NFTs to load
      setHasMore(data.result.items.length === LIMIT);
      setIsLoadingMore(false);
    }
  }, [data, page]);
  
  // Render functions - define these before any conditional returns
  const renderNftItem = useCallback(({ item: nft, index }: { item: NFT, index: number }) => {
    const imageUri = nft?.content?.links?.image;
    const name = nft?.content?.metadata?.name || "Unnamed";
    
    return (
      <Card key={nft.id || index} style={styles.nftCard}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.nftImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderImage}>
            <Text>No Image</Text>
          </View>
        )}
        <Card.Content style={styles.cardContent}>
          <Text variant="titleMedium" numberOfLines={2} style={styles.nftName}>
            {name}
          </Text>
        </Card.Content>
      </Card>
    );
  }, []);
  
  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8 }}>Loading more NFTs...</Text>
      </View>
    );
  }, [isLoadingMore]);
  
  // Now we can have conditional rendering for different states
  if (!selectedAccount) {
    return (
      <View style={styles.container}>
        <Text variant="headlineMedium">Connect your wallet to view NFTs</Text>
      </View>
    );
  }

  if (isLoading && page === 1) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={styles.loadingText}>Loading NFTs...</Text>
      </View>
    );
  }

  if (error && page === 1) {
    return (
      <View style={styles.container}>
        <Text variant="headlineMedium">Error loading NFTs</Text>
        <Text variant="bodyLarge">{String(error)}</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <Text variant="headlineLarge" style={styles.title}>
        Your NFT Gallery
      </Text>
      
      <FlatList
        data={allNfts}
        renderItem={renderNftItem}
        keyExtractor={(item, index) => item.id || index.toString()}
        contentContainerStyle={styles.galleryContainer}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={10}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    marginBottom: 8,
    fontWeight: "bold",
  },
  subtitle: {
    marginBottom: 24,
    opacity: 0.7,
  },
  galleryContainer: {
    paddingBottom: 24,
  },
  nftCard: {
    width: "100%",
    marginBottom: 24,
    overflow: "hidden",
  },
  nftImage: {
    width: "100%",
    height: width * 0.8, // Make image height proportional to screen width
  },
  placeholderImage: {
    width: "100%",
    height: width * 0.8,
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: {
    padding: 12,
  },
  nftName: {
    textAlign: "center",
  },
  loadingText: {
    marginTop: 16,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
