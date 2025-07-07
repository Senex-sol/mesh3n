import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { EscrowAccountData } from '../utils/SwapEscrowClient';

interface EscrowModalProps {
  visible: boolean;
  onClose: () => void;
  escrowData: EscrowAccountData | null;
}

export const EscrowModal: React.FC<EscrowModalProps> = ({ visible, onClose, escrowData }) => {
  if (!escrowData) return null;

  // Format the NFT mints for display
  const formatNftMints = (mints: PublicKey[]) => {
    return mints.map(mint => mint.toString().substring(0, 8) + '...');
  };

  // Calculate expiration time
  const createdAtMs = Number(escrowData.createdAt) * 1000;
  const timeoutMs = Number(escrowData.timeoutInSeconds) * 1000;
  const expirationDate = new Date(createdAtMs + timeoutMs);

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>Existing Escrow Found</Text>
          
          <ScrollView style={styles.scrollView}>
            <Text style={styles.sectionTitle}>Participants</Text>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Initializer:</Text>
              <Text style={styles.value}>{escrowData.initializer.toString().substring(0, 8)}...</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Taker:</Text>
              <Text style={styles.value}>{escrowData.taker.toString().substring(0, 8)}...</Text>
            </View>

            <Text style={styles.sectionTitle}>NFT Details</Text>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Initializer NFTs:</Text>
              <Text style={styles.value}>{escrowData.initializerNftCount}</Text>
            </View>
            {escrowData.initializerNftMints.length > 0 && (
              <View style={styles.mintsList}>
                {formatNftMints(escrowData.initializerNftMints).map((mint, index) => (
                  <Text key={`init-${index}`} style={styles.mintItem}>• {mint}</Text>
                ))}
              </View>
            )}
            
            <View style={styles.infoRow}>
              <Text style={styles.label}>Taker NFTs:</Text>
              <Text style={styles.value}>{escrowData.takerNftCount}</Text>
            </View>
            {escrowData.takerNftMints.length > 0 && (
              <View style={styles.mintsList}>
                {formatNftMints(escrowData.takerNftMints).map((mint, index) => (
                  <Text key={`taker-${index}`} style={styles.mintItem}>• {mint}</Text>
                ))}
              </View>
            )}

            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Initializer deposited:</Text>
              <Text style={styles.value}>{escrowData.initializerDeposited ? 'Yes' : 'No'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Taker deposited:</Text>
              <Text style={styles.value}>{escrowData.takerDeposited ? 'Yes' : 'No'}</Text>
            </View>

            <Text style={styles.sectionTitle}>Timing</Text>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Created at:</Text>
              <Text style={styles.value}>{new Date(createdAtMs).toLocaleString()}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Expires at:</Text>
              <Text style={styles.value}>{expirationDate.toLocaleString()}</Text>
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalView: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  scrollView: {
    width: '100%',
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 5,
    color: '#555',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  value: {
    fontSize: 14,
    color: '#333',
  },
  mintsList: {
    paddingLeft: 20,
    marginBottom: 10,
  },
  mintItem: {
    fontSize: 13,
    color: '#555',
    marginVertical: 2,
  },
  button: {
    backgroundColor: '#2196F3',
    borderRadius: 20,
    padding: 10,
    elevation: 2,
    marginTop: 15,
    width: '80%',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
