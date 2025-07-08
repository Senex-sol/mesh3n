import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

interface SwapStatusOverlayProps {
  visible: boolean;
  message: string;
  isLoading?: boolean;
}

export const SwapStatusOverlay: React.FC<SwapStatusOverlayProps> = ({ 
  visible, 
  message,
  isLoading = true 
}) => {
  if (!visible) return null;

  return (
    <View style={styles.overlayContainer}>
      <View style={styles.statusBox}>
        {isLoading && (
          <ActivityIndicator 
            size="large" 
            color="#2196F3" 
            style={styles.loader} 
          />
        )}
        <Text style={styles.statusMessage}>{message}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 9999, // Increased z-index to ensure it's on top of all other elements
    elevation: 9999, // For Android
  },
  statusBox: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  loader: {
    marginBottom: 15,
  },
  statusMessage: {
    fontSize: 16,
    textAlign: 'center',
    color: '#333',
    fontWeight: '500',
  },
});
