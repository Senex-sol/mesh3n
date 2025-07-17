import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { DepositArgs, EscrowAccountData } from '../utils/SwapEscrowClient';
import { alertAndLog } from '../utils/alertAndLog';

interface EscrowModalProps {
  selectedAccount: PublicKey | undefined;
  visible: boolean;
  onClose: () => void;
  escrowData: EscrowAccountData | null;
  depositAndCollectNFTs: (initializer: PublicKey, taker: PublicKey, args: DepositArgs) => Promise<string | null>;
  completeSwap: (initializer: PublicKey, taker: PublicKey, isInitializer: boolean, nftMints: PublicKey[]) => Promise<string | null>;
  cancelEscrow: (initializer: PublicKey, taker: PublicKey) => Promise<string | null>;
}

export const EscrowModal: React.FC<EscrowModalProps> = ({ selectedAccount, visible, onClose, escrowData, depositAndCollectNFTs, completeSwap, cancelEscrow }) => {
  const [isDepositing, setIsDepositing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  if (!escrowData) return null;

  // Format the NFT mints for display
  const formatNftMints = (mints: PublicKey[]) => {
    return mints.map(mint => mint.toString().substring(0, 8) + '...');
  };

  const isInitializer = escrowData.initializer.toString() === selectedAccount?.toString();

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Existing Escrow Found</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.scrollView}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>I'm Initializer:</Text>
              <Text style={styles.value}>{isInitializer ? 'Yes' : 'No'}</Text>
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
              <Text style={styles.label}>Initializer collected:</Text>
              <Text style={styles.value}>{escrowData.initializerCollected ? 'Yes' : 'No'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Taker deposited:</Text>
              <Text style={styles.value}>{escrowData.takerDeposited ? 'Yes' : 'No'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Taker collected:</Text>
              <Text style={styles.value}>{escrowData.takerCollected ? 'Yes' : 'No'}</Text>
            </View>
          </ScrollView>

          {((isInitializer && !escrowData.initializerDeposited) || (!isInitializer && !escrowData.takerDeposited)) && (
            <TouchableOpacity 
              style={[styles.button, (isDepositing || isCancelling) && styles.buttonDisabled]} 
              onPress={async () => {
                if (!escrowData || isDepositing || isCancelling) return;
                
                try {
                  setIsDepositing(true);
                  const signature = await depositAndCollectNFTs(
                    escrowData.initializer,
                    escrowData.taker,
                    {
                      initializerNftMints: escrowData.initializerNftMints,
                      takerNftMints: escrowData.takerNftMints,
                    }
                  );
                  
                  if (signature) {
                    alertAndLog('Escrow Deposited', `The escrow has been successfully deposited. Transaction: ${signature}`);
                    onClose();
                  } else {
                    alertAndLog('Error', 'Failed to deposit escrow');
                  }
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                  alertAndLog('Error Depositing Escrow', errorMessage);
                  console.error('Error depositing escrow:', error);
                } finally {
                  setIsDepositing(false);
                }
              }}
              disabled={isDepositing || isCancelling}
            >
              {isDepositing ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={[styles.buttonText, styles.loadingText]}>Depositing...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Deposit Escrow</Text>
              )}
            </TouchableOpacity>
          )}

          {((isInitializer && escrowData.initializerDeposited && !escrowData.takerCollected) || (!isInitializer && escrowData.takerDeposited && !escrowData.initializerCollected)) && (
            <TouchableOpacity 
              style={[styles.button, (isCollecting || isCancelling) && styles.buttonDisabled]} 
              onPress={async () => {
                if (!escrowData || isCollecting || isCancelling) return;
                
                try {
                  setIsCollecting(true);
                  const nftMints = isInitializer ? escrowData.takerNftMints : escrowData.initializerNftMints;
                  const signature = await completeSwap(
                    escrowData.initializer,
                    escrowData.taker,
                    isInitializer,
                    nftMints,
                  );
                  
                  if (signature) {
                    alertAndLog('Escrow Collected', `The escrow has been successfully collected. Transaction: ${signature}`);
                    onClose();
                  } else {
                    alertAndLog('Error', 'Failed to collect escrow');
                  }
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                  alertAndLog('Error Collecting Escrow', errorMessage);
                  console.error('Error collecting escrow:', error);
                } finally {
                  setIsCollecting(false);
                }
              }}
              disabled={isCollecting || isCancelling}
            >
              {isCollecting ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={[styles.buttonText, styles.loadingText]}>Collecting...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Collect Escrow</Text>
              )}
            </TouchableOpacity>
          )}

          {isInitializer && !escrowData.takerCollected && (
            <TouchableOpacity 
              style={[styles.button, (isDepositing || isCancelling) && styles.buttonDisabled]} 
              onPress={async () => {
                if (!escrowData || isDepositing || isCancelling) return;
                
                try {
                  setIsCancelling(true);
                  const signature = await cancelEscrow(
                    escrowData.initializer,
                    escrowData.taker
                  );
                  
                  if (signature) {
                    alertAndLog('Escrow Cancelled', `The escrow has been successfully cancelled. Transaction: ${signature}`);
                    onClose();
                  } else {
                    alertAndLog('Error', 'Failed to cancel escrow');
                  }
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                  alertAndLog('Error Cancelling Escrow', errorMessage);
                  console.error('Error cancelling escrow:', error);
                } finally {
                  setIsCancelling(false);
                }
              }}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={[styles.buttonText, styles.loadingText]}>Cancelling...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Cancel Escrow</Text>
              )}
            </TouchableOpacity>
          )}
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
  modalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
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
    backgroundColor: '#E53935', // Red color for cancel action
    borderRadius: 20,
    padding: 10,
    elevation: 2,
    marginTop: 15,
    width: '80%',
  },
  buttonDisabled: {
    backgroundColor: '#9E9E9E', // Gray when disabled
    opacity: 0.7,
  },
  buttonContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  loadingText: {
    marginLeft: 10,
  },
});
