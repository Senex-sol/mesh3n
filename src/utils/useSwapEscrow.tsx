import { useState, useEffect, useCallback } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { useConnection } from './ConnectionProvider';
import { useMobileWallet } from './useMobileWallet';
import { useAuthorization } from './useAuthorization';
import { SwapEscrowClient, InitializeArgs, DepositArgs, EscrowAccountData } from './SwapEscrowClient';
import { alertAndLog } from './alertAndLog';

export const useSwapEscrow = () => {
  const { connection } = useConnection();
  const { signAndSendTransaction } = useMobileWallet();
  const { selectedAccount } = useAuthorization();
  const [client, setClient] = useState<SwapEscrowClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize the client when connection is available
  useEffect(() => {
    if (connection) {
      setClient(new SwapEscrowClient(connection));
    }
  }, [connection]);

  // Helper function to send a transaction
  const sendTransaction = useCallback(async (transaction: Transaction): Promise<string> => {
    try {
      setLoading(true);
      setError(null);
      
      if (!signAndSendTransaction) {
        throw new Error('Wallet not connected');
      }
      
      if (!selectedAccount) {
        throw new Error('No wallet selected');
      }

      // Get the latest blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      
      // Set the fee payer to the current wallet
      if (!transaction.feePayer) {
        console.log('Setting fee payer for transaction');
        transaction.feePayer = selectedAccount.publicKey;
      }
      console.log('Sending transaction: ' + JSON.stringify(transaction));

      // Use the signAndSendTransaction function from useMobileWallet
      // Pass both required parameters: transaction and minContextSlot
      const signature = await signAndSendTransaction(transaction, lastValidBlockHeight);

      // Wait for confirmation
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      return signature;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      alertAndLog('Transaction failed', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [connection, signAndSendTransaction]);

  // Initialize a new swap escrow
  const initializeEscrow = useCallback(async (
    taker: PublicKey,
    args: InitializeArgs
  ): Promise<string | null> => {
    if (!client) {
      setError('Client not initialized');
      return null;
    }

    try {
      console.log('Initializing escrow with args: ' + JSON.stringify(args));
      // Get the current wallet's public key from the transaction
      return await client.initialize(
        taker,
        args,
        sendTransaction
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to initialize escrow: ${errorMessage}`);
      alertAndLog('Failed to initialize escrow', errorMessage);
      return null;
    }
  }, [client, sendTransaction]);

  // Deposit NFTs into the escrow
  const depositNFTs = useCallback(async (
    initializer: PublicKey,
    taker: PublicKey,
    args: DepositArgs
  ): Promise<string | null> => {
    if (!client) {
      setError('Client not initialized');
      return null;
    }

    try {
      return await client.deposit(
        initializer,
        taker,
        args,
        sendTransaction
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to deposit NFTs: ${errorMessage}`);
      alertAndLog('Failed to deposit NFTs', errorMessage);
      return null;
    }
  }, [client, sendTransaction]);

  // Complete the swap
  const completeSwap = useCallback(async (
    initializer: PublicKey,
    taker: PublicKey,
    initializerNftMints: PublicKey[],
    takerNftMints: PublicKey[]
  ): Promise<string | null> => {
    if (!client) {
      setError('Client not initialized');
      return null;
    }

    try {
      return await client.complete(
        initializer,
        taker,
        initializerNftMints,
        takerNftMints,
        sendTransaction
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to complete swap: ${errorMessage}`);
      alertAndLog('Failed to complete swap', errorMessage);
      return null;
    }
  }, [client, sendTransaction]);

  // Cancel the swap
  const cancelSwap = useCallback(async (
    initializer: PublicKey,
    taker: PublicKey
  ): Promise<string | null> => {
    if (!client) {
      setError('Client not initialized');
      return null;
    }

    try {
      return await client.cancel(
        initializer,
        taker,
        sendTransaction
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to cancel swap: ${errorMessage}`);
      alertAndLog('Failed to cancel swap', errorMessage);
      return null;
    }
  }, [client, sendTransaction]);

  // Get escrow account data
  const getEscrowAccountData = useCallback(async (
    initializer: PublicKey,
    taker: PublicKey
  ) => {
    if (!client) {
      setError('Client not initialized');
      return null;
    }

    try {
      return await client.getEscrowAccountData(initializer, taker);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      alertAndLog('Get escrow account failed', errorMessage);
      return null;
    }
  }, [client]);

  // Check if an escrow account exists for the given initializer and taker
  const checkEscrowAccount = useCallback(async (
    initializer: PublicKey,
    taker: PublicKey
  ): Promise<EscrowAccountData | null> => {
    if (!client) {
      setError('Swap escrow client not initialized');
      return null;
    }

    try {
      setLoading(true);
      setError(null);
      return await client.getEscrowAccountData(initializer, taker);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Error checking escrow account: ${errorMessage}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return {
    initializeEscrow,
    depositNFTs,
    completeSwap,
    cancelSwap,
    checkEscrowAccount,
    getEscrowAccountData,
    loading,
    error,
  };
};
