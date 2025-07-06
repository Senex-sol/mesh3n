import { Connection, PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Buffer } from 'buffer';

// Swap Escrow Program ID - replace with your actual deployed program ID
const SWAP_ESCROW_PROGRAM_ID = new PublicKey('Fup37jJN7tFaBmdwNegtCHd8Z8ruuiSL5dt3hpEfJWEW');

// Instruction discriminators (first 8 bytes of the sha256 hash of the instruction name)
const INSTRUCTION_DISCRIMINATORS = {
  initialize: Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]),
  deposit: Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]),
  complete: Buffer.from([59, 106, 39, 162, 48, 67, 155, 43]),
  cancel: Buffer.from([232, 27, 153, 228, 233, 118, 118, 143]),
};

/**
 * Find the escrow account PDA for a swap between initializer and taker
 */
export async function findEscrowAccount(
  initializer: PublicKey,
  taker: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('escrow'),
      initializer.toBuffer(),
      taker.toBuffer(),
    ],
    SWAP_ESCROW_PROGRAM_ID
  );
}

/**
 * Find the associated token account for a given mint and owner
 */
export async function findAssociatedTokenAccount(
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  return PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

/**
 * Interface for Initialize instruction arguments
 */
export interface InitializeArgs {
  initializerPubkey: PublicKey;
  initializerNftCount: number;
  takerNftCount: number;
  initializerNftMints: PublicKey[];
  takerNftMints: PublicKey[];
  timeoutInSeconds: number;
}

/**
 * Create an instruction to initialize a new swap escrow
 */
export async function createInitializeInstruction(
  initializer: PublicKey,
  taker: PublicKey,
  args: InitializeArgs
): Promise<TransactionInstruction> {
  // Validate NFT counts
  if (args.initializerNftCount < 1 || args.initializerNftCount > 3) {
    throw new Error('Initializer NFT count must be between 1 and 3');
  }
  if (args.takerNftCount < 1 || args.takerNftCount > 3) {
    throw new Error('Taker NFT count must be between 1 and 3');
  }
  if (args.initializerNftMints.length !== args.initializerNftCount) {
    throw new Error('Initializer NFT mints count does not match specified count');
  }
  if (args.takerNftMints.length !== args.takerNftCount) {
    throw new Error('Taker NFT mints count does not match specified count');
  }

  // Find the escrow account PDA
  const [escrowAccount, escrowBump] = await findEscrowAccount(initializer, taker);

  console.log('Escrow account: ' + escrowAccount.toBase58());

  // Create the instruction data
  // Allocate buffer with enough space: 8 bytes for discriminator + 3 bytes for counts and bump
  const data = Buffer.alloc(8 + 3);
  data.set(INSTRUCTION_DISCRIMINATORS.initialize, 0);
  data.writeUInt8(args.initializerNftCount, 8);
  data.writeUInt8(args.takerNftCount, 9);
  data.writeUInt8(escrowBump, 10);

  console.log('Instruction data: ' + data);

  // Create the accounts array
  const keys = [
    { pubkey: initializer, isSigner: true, isWritable: true },
    { pubkey: taker, isSigner: false, isWritable: false },
    { pubkey: escrowAccount, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  console.log('Accounts array: ' + keys);

  // Add the remaining accounts (NFT mints)
  for (const mint of [...args.initializerNftMints, ...args.takerNftMints]) {
    keys.push({
      pubkey: mint,
      isSigner: false,
      isWritable: false,
    });
  }

  console.log('Transaction instruction: ', {
    programId: SWAP_ESCROW_PROGRAM_ID,
    keys,
    data,
  });

  return new TransactionInstruction({
    programId: SWAP_ESCROW_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Interface for Deposit instruction arguments
 */
export interface DepositArgs {
  isInitializer: boolean;
  nftMints: PublicKey[];
}

/**
 * Create an instruction to deposit NFTs into the escrow
 */
export async function createDepositInstruction(
  depositor: PublicKey,
  initializer: PublicKey,
  taker: PublicKey,
  args: DepositArgs
): Promise<TransactionInstruction> {
  // Find the escrow account PDA
  const [escrowAccount] = await findEscrowAccount(initializer, taker);

  // Create the instruction data
  const data = Buffer.alloc(1 + 1);
  data.set(INSTRUCTION_DISCRIMINATORS.deposit);
  data.writeUInt8(args.isInitializer ? 1 : 0, 8);

  // Create the accounts array
  const keys = [
    { pubkey: depositor, isSigner: true, isWritable: true },
    { pubkey: escrowAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  // Add the remaining accounts (token accounts and vault accounts)
  for (const mint of args.nftMints) {
    // The user's token account that holds the NFT
    const tokenAccount = await findAssociatedTokenAccount(mint, depositor);
    keys.push({
      pubkey: tokenAccount,
      isSigner: false,
      isWritable: true,
    });

    // The vault account that will receive the NFT
    const vaultAccount = await findAssociatedTokenAccount(mint, escrowAccount);
    keys.push({
      pubkey: vaultAccount,
      isSigner: false,
      isWritable: true,
    });
  }

  return new TransactionInstruction({
    programId: SWAP_ESCROW_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Create an instruction to complete the swap
 */
export async function createCompleteInstruction(
  caller: PublicKey,
  initializer: PublicKey,
  taker: PublicKey,
  initializerNftMints: PublicKey[],
  takerNftMints: PublicKey[]
): Promise<TransactionInstruction> {
  // Find the escrow account PDA
  const [escrowAccount] = await findEscrowAccount(initializer, taker);

  // Create the instruction data
  const data = Buffer.alloc(1);
  data.set(INSTRUCTION_DISCRIMINATORS.complete);

  // Create the accounts array
  const keys = [
    { pubkey: caller, isSigner: true, isWritable: true },
    { pubkey: escrowAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  // Add the remaining accounts for initializer's NFTs
  for (const mint of initializerNftMints) {
    // The vault account that holds the NFT
    const vaultAccount = await findAssociatedTokenAccount(mint, escrowAccount);
    keys.push({
      pubkey: vaultAccount,
      isSigner: false,
      isWritable: true,
    });

    // The taker's token account that will receive the NFT
    const takerTokenAccount = await findAssociatedTokenAccount(mint, taker);
    keys.push({
      pubkey: takerTokenAccount,
      isSigner: false,
      isWritable: true,
    });
  }

  // Add the remaining accounts for taker's NFTs
  for (const mint of takerNftMints) {
    // The vault account that holds the NFT
    const vaultAccount = await findAssociatedTokenAccount(mint, escrowAccount);
    keys.push({
      pubkey: vaultAccount,
      isSigner: false,
      isWritable: true,
    });

    // The initializer's token account that will receive the NFT
    const initializerTokenAccount = await findAssociatedTokenAccount(mint, initializer);
    keys.push({
      pubkey: initializerTokenAccount,
      isSigner: false,
      isWritable: true,
    });
  }

  return new TransactionInstruction({
    programId: SWAP_ESCROW_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Create an instruction to cancel the swap
 */
export async function createCancelInstruction(
  initializer: PublicKey,
  taker: PublicKey
): Promise<TransactionInstruction> {
  // Find the escrow account PDA
  const [escrowAccount] = await findEscrowAccount(initializer, taker);

  // Create the instruction data
  const data = Buffer.alloc(1);
  data.set(INSTRUCTION_DISCRIMINATORS.cancel);

  // Create the accounts array
  const keys = [
    { pubkey: initializer, isSigner: true, isWritable: true },
    { pubkey: escrowAccount, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId: SWAP_ESCROW_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Define the structure of the escrow account data
 */
export interface EscrowAccountData {
  isInitialized: boolean;
  initializer: PublicKey;
  taker: PublicKey;
  initializerNftCount: number;
  takerNftCount: number;
  initializerNftMints: PublicKey[];
  takerNftMints: PublicKey[];
  initializerDeposited: boolean;
  takerDeposited: boolean;
  bump: number;
  createdAt: bigint;
  timeoutInSeconds: bigint;
}

/**
 * SwapEscrowClient class for interacting with the swap escrow program
 */
export class SwapEscrowClient {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Check if an escrow account exists for the given initializer and taker
   * @param initializer The initializer's public key
   * @param taker The taker's public key
   * @returns The escrow account data if it exists, null otherwise
   */
  async getEscrowAccountData(initializerPubkey: PublicKey, takerPubkey: PublicKey): Promise<EscrowAccountData | null> {
    try {
      // Find the escrow account PDA
      const [escrowAccount] = await findEscrowAccount(initializerPubkey, takerPubkey);
      
      console.log(`Checking escrow account: ${escrowAccount.toString()}`);
      
      // Get the account info
      const accountInfo = await this.connection.getAccountInfo(escrowAccount);
      
      // If the account doesn't exist, return null
      if (!accountInfo) {
        console.log('Escrow account does not exist');
        return null;
      }
      
      console.log('Escrow account exists, parsing data...');
      
      // Parse the account data
      const data = accountInfo.data;
      
      // Skip the 8-byte discriminator
      let offset = 8;
      
      // Read initializer public key (32 bytes)
      const initializer = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      // Read taker public key (32 bytes)
      const taker = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      // Read NFT counts (1 byte each)
      const initializerNftCount = data[offset++];
      const takerNftCount = data[offset++];
      
      // Read initializer NFT mints (32 bytes each, max 3)
      const initializerNftMints: PublicKey[] = [];
      for (let i = 0; i < 3; i++) {
        if (i < initializerNftCount) {
          initializerNftMints.push(new PublicKey(data.slice(offset, offset + 32)));
        }
        offset += 32; // Always advance offset even if we don't use the mint
      }
      
      // Read taker NFT mints (32 bytes each, max 3)
      const takerNftMints: PublicKey[] = [];
      for (let i = 0; i < 3; i++) {
        if (i < takerNftCount) {
          takerNftMints.push(new PublicKey(data.slice(offset, offset + 32)));
        }
        offset += 32; // Always advance offset even if we don't use the mint
      }
      
      // Read deposit status (1 byte each)
      const initializerDeposited = Boolean(data[offset++]);
      const takerDeposited = Boolean(data[offset++]);
      
      // Read is_initialized (1 byte)
      const isInitialized = Boolean(data[offset++]);
      
      // Read bump (1 byte)
      const bump = data[offset++];
      
      // Read created_at (8 bytes, i64)
      const createdAt = data.readBigInt64LE(offset);
      offset += 8;
      
      // Read timeout_in_seconds (8 bytes, i64)
      const timeoutInSeconds = data.readBigInt64LE(offset);
      
      return {
        isInitialized,
        initializer,
        taker,
        initializerNftCount,
        takerNftCount,
        initializerNftMints,
        takerNftMints,
        initializerDeposited,
        takerDeposited,
        bump,
        createdAt,
        timeoutInSeconds
      };
    } catch (error) {
      console.error('Error checking escrow account:', error);
      return null;
    }
  }

  /**
   * Initialize a new swap escrow
   */
  async initialize(
    taker: PublicKey,
    args: InitializeArgs,
    sendTransaction: (transaction: Transaction) => Promise<string>
  ): Promise<string> {
    // Create a transaction first
    const transaction = new Transaction();
    
    // The initializer will be set as the fee payer when the transaction is signed
    // For now, we'll use a placeholder that will be replaced during signing
    const initializer = args.initializerPubkey;
    
    const instruction = await createInitializeInstruction(initializer, taker, args);
    transaction.add(instruction);
    console.log('Sending transaction: ' + JSON.stringify(transaction));
    return await sendTransaction(transaction);
  }

  /**
   * Deposit NFTs into the escrow
   */
  async deposit(
    initializer: PublicKey,
    taker: PublicKey,
    args: DepositArgs,
    sendTransaction: (transaction: Transaction) => Promise<string>
  ): Promise<string> {
    // Create a transaction first
    const transaction = new Transaction();
    
    // The depositor will be set as the fee payer when the transaction is signed
    // We'll determine if it's the initializer or taker based on the args
    const depositor = args.isInitializer ? initializer : taker;
    
    const instruction = await createDepositInstruction(depositor, initializer, taker, args);
    transaction.add(instruction);
    return await sendTransaction(transaction);
  }

  /**
   * Complete the swap
   */
  async complete(
    initializer: PublicKey,
    taker: PublicKey,
    initializerNftMints: PublicKey[],
    takerNftMints: PublicKey[],
    sendTransaction: (transaction: Transaction) => Promise<string>
  ): Promise<string> {
    // Create a transaction first
    const transaction = new Transaction();
    
    // The caller can be either the initializer or taker
    // We'll use the taker as the default caller, but this will be replaced by the actual signer
    const caller = taker;
    
    const instruction = await createCompleteInstruction(
      caller,
      initializer,
      taker,
      initializerNftMints,
      takerNftMints
    );
    transaction.add(instruction);
    return await sendTransaction(transaction);
  }

  /**
   * Cancel the swap
   */
  async cancel(
    initializer: PublicKey,
    taker: PublicKey,
    sendTransaction: (transaction: Transaction) => Promise<string>
  ): Promise<string> {
    const instruction = await createCancelInstruction(initializer, taker);
    const transaction = new Transaction().add(instruction);
    return await sendTransaction(transaction);
  }
}
