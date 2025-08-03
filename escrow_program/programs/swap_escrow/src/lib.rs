use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use solana_program::clock::Clock;
use solana_program::pubkey::Pubkey;

declare_id!("Fup37jJN7tFaBmdwNegtCHd8Z8ruuiSL5dt3hpEfJWEW");

#[program]
pub mod swap_escrow {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        initializer_nft_count: u8,
        taker_nft_count: u8,
        escrow_bump: u8,
    ) -> Result<()> {
        // Validate NFT counts (1-3 NFTs per participant)
        require!(
            initializer_nft_count > 0 && initializer_nft_count <= 3,
            EscrowError::InvalidNftCount
        );
        require!(
            taker_nft_count > 0 && taker_nft_count <= 3,
            EscrowError::InvalidNftCount
        );

        // Initialize the escrow account
        let escrow = &mut ctx.accounts.escrow_account;
        escrow.initializer = ctx.accounts.initializer.key();
        escrow.taker = ctx.accounts.taker.key();
        escrow.initializer_nft_count = initializer_nft_count;
        escrow.taker_nft_count = taker_nft_count;
        escrow.is_initialized = true;
        escrow.initializer_deposited = false;
        escrow.taker_deposited = false;
        escrow.bump = escrow_bump;
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.timeout_in_seconds = 86400; // Default 24 hour timeout

        // Store the mint addresses for initializer's NFTs
        for i in 0..initializer_nft_count as usize {
            escrow.initializer_nft_mints[i] = ctx.remaining_accounts[i].key();
        }

        // Store the mint addresses for taker's NFTs
        for i in 0..taker_nft_count as usize {
            escrow.taker_nft_mints[i] =
                ctx.remaining_accounts[initializer_nft_count as usize + i].key();
        }

        msg!(
            "Escrow initialized between {} and {}",
            escrow.initializer,
            escrow.taker
        );
        msg!("Initializer will provide {} NFTs", initializer_nft_count);
        msg!("Taker will provide {} NFTs", taker_nft_count);

        Ok(())
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        is_initializer: bool,
        nft_index: u8,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;
        
        require!(escrow.is_initialized, EscrowError::EscrowNotInitialized);
        
        // Verify the depositor is correct
        if is_initializer {
            require!(ctx.accounts.depositor.key() == escrow.initializer, EscrowError::InvalidDepositor);
            require!(!escrow.initializer_deposited, EscrowError::AlreadyDeposited);
            require!(nft_index < escrow.initializer_nft_count, EscrowError::InvalidNftIndex);
        } else {
            require!(ctx.accounts.depositor.key() == escrow.taker, EscrowError::InvalidDepositor);
            require!(!escrow.taker_deposited, EscrowError::AlreadyDeposited);
            require!(nft_index < escrow.taker_nft_count, EscrowError::InvalidNftIndex);
        }
        
        // Get the expected mint for this NFT index
        let expected_mint = if is_initializer {
            escrow.initializer_nft_mints[nft_index as usize]
        } else {
            escrow.taker_nft_mints[nft_index as usize]
        };

        
        let token_account = &ctx.accounts.token_account;
        require!(token_account.owner == ctx.accounts.depositor.key(), EscrowError::InvalidTokenAccount);
        require!(token_account.mint == expected_mint, EscrowError::InvalidNftMint);
        require!(token_account.amount == 1, EscrowError::InvalidTokenAmount);
        
        // Verify vault account
        let vault_account = &ctx.accounts.vault_account;
        require!(vault_account.mint == expected_mint, EscrowError::InvalidNftMint);
        
        // Check if this NFT has already been deposited
        if is_initializer {
            require!(!escrow.initializer_nft_deposited[nft_index as usize], EscrowError::NftAlreadyDeposited);
        } else {
            require!(!escrow.taker_nft_deposited[nft_index as usize], EscrowError::NftAlreadyDeposited);
        }
        
        // Transfer the NFT to the vault
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.token_account.to_account_info(),
            to: ctx.accounts.vault_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, 1)?;
        
        msg!("Transferred NFT {} to escrow vault", expected_mint);
        
        // Mark this NFT as deposited
        if is_initializer {
            escrow.initializer_nft_deposited[nft_index as usize] = true;
            
            // Check if all initializer NFTs have been deposited
            let mut all_deposited = true;
            for i in 0..escrow.initializer_nft_count as usize {
                if !escrow.initializer_nft_deposited[i] {
                    all_deposited = false;
                    break;
                }
            }
            
            if all_deposited {
                escrow.initializer_deposited = true;
                msg!("Initializer has deposited all NFTs");
            }
        } else {
            escrow.taker_nft_deposited[nft_index as usize] = true;
            
            // Check if all taker NFTs have been deposited
            let mut all_deposited = true;
            for i in 0..escrow.taker_nft_count as usize {
                if !escrow.taker_nft_deposited[i] {
                    all_deposited = false;
                    break;
                }
            }
            
            if all_deposited {
                escrow.taker_deposited = true;
                msg!("Taker has deposited all NFTs");
            }
        }
        
        // Check if both parties have deposited all their NFTs
        if escrow.initializer_deposited && escrow.taker_deposited {
            msg!("All NFTs have been deposited. Escrow is ready for completion.");
        }
        
        Ok(())
    }

    pub fn complete(
        ctx: Context<Complete>,
        is_initializer: bool,
        nft_index: u8,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;
        
        // Verify the escrow is initialized
        require!(escrow.is_initialized, EscrowError::EscrowNotInitialized);
        
        // Verify both parties have deposited all their NFTs
        require!(escrow.initializer_deposited && escrow.taker_deposited, EscrowError::DepositsIncomplete);
        
        // Verify the caller is either the initializer or the taker
        let is_initializer_caller = ctx.accounts.caller.key() == escrow.initializer;
        require!(is_initializer_caller || ctx.accounts.caller.key() == escrow.taker, EscrowError::InvalidCaller);
        
        // Verify the NFT index is valid
        if is_initializer {
            require!(nft_index < escrow.taker_nft_count, EscrowError::InvalidNftIndex);
        } else {
            require!(nft_index < escrow.initializer_nft_count, EscrowError::InvalidNftIndex);
        }
        
        // Get the expected mint for this NFT
        let expected_mint = if is_initializer {
            escrow.taker_nft_mints[nft_index as usize]
        } else {
            escrow.initializer_nft_mints[nft_index as usize]
        };
        
        // Verify the mint matches
        require!(ctx.accounts.mint.key() == expected_mint, EscrowError::InvalidNftMint);
        
        // Verify the vault account is for the correct mint
        require!(ctx.accounts.vault_account.mint == expected_mint, EscrowError::InvalidNftMint);
        
        // Verify the recipient account is for the correct mint
        require!(ctx.accounts.recipient_token_account.mint == expected_mint, EscrowError::InvalidNftMint);
        
        // Check if this NFT has already been collected
        if is_initializer {
            require!(!escrow.taker_nft_collected[nft_index as usize], EscrowError::NftAlreadyCollected);
        } else {
            require!(!escrow.initializer_nft_collected[nft_index as usize], EscrowError::NftAlreadyCollected);
        }
        
        // Determine the recipient based on which NFT is being collected
        // Initializer NFTs go to taker, taker NFTs go to initializer
        let recipient_expected_owner = if is_initializer {
            escrow.initializer
        } else {
            escrow.taker
        };
        
        // Verify the recipient token account belongs to the correct party
        require!(ctx.accounts.recipient_token_account.owner == recipient_expected_owner, EscrowError::InvalidRecipient);
        
        // Transfer the NFT from the vault to the recipient
        let seeds = &[
            b"escrow",
            escrow.initializer.as_ref(),
            escrow.taker.as_ref(),
            &[escrow.bump],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.vault_account.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: escrow.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        
        token::transfer(cpi_ctx, 1)?;
        
        msg!("Transferred NFT {} from escrow vault to recipient", expected_mint);
        
        // Mark this NFT as collected
        if is_initializer {
            escrow.taker_nft_collected[nft_index as usize] = true;
        } else {
            escrow.initializer_nft_collected[nft_index as usize] = true;
        }
        
        // Check if all NFTs have been collected
        let mut all_initializer_nfts_collected = true;
        for i in 0..escrow.initializer_nft_count as usize {
            if !escrow.initializer_nft_collected[i] {
                all_initializer_nfts_collected = false;
                break;
            }
        }
        
        let mut all_taker_nfts_collected = true;
        for i in 0..escrow.taker_nft_count as usize {
            if !escrow.taker_nft_collected[i] {
                all_taker_nfts_collected = false;
                break;
            }
        }
        
        // If all NFTs have been collected, close the escrow account
        if all_initializer_nfts_collected && all_taker_nfts_collected {
            // Close the escrow account and return rent to the initializer
            ctx.accounts.close_escrow()?;
            msg!("All NFTs have been collected. Escrow completed successfully.");
        } else {
            let initializer_remaining = escrow.initializer_nft_count as usize - 
                escrow.initializer_nft_collected.iter().filter(|&&x| x).count();
            if initializer_remaining == 0 {
                escrow.initializer_collected = true;
            }

            let taker_remaining = escrow.taker_nft_count as usize - 
                escrow.taker_nft_collected.iter().filter(|&&x| x).count();
            if taker_remaining == 0 {
                escrow.taker_collected = true;
            }
            
            msg!("NFT collected. Remaining NFTs to collect: {} initializer, {} taker",
                initializer_remaining, taker_remaining);
        }
        
        Ok(())
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_account;
        
        // Verify the escrow is initialized
        require!(escrow.is_initialized, EscrowError::EscrowNotInitialized);
        
        // Verify the caller is the initializer
        require!(ctx.accounts.initializer.key() == escrow.initializer, EscrowError::InvalidCanceller);
        
        // Check if any NFTs have been deposited
        let can_cancel = !escrow.initializer_deposited && !escrow.taker_deposited;
        
        // Check if the escrow has timed out
        let current_time = Clock::get()?.unix_timestamp;
        let timeout_expired = current_time > escrow.created_at + escrow.timeout_in_seconds;
        
        require!(can_cancel || timeout_expired, EscrowError::CannotCancelAfterDeposit);
        
        if timeout_expired {
            msg!("Escrow canceled due to timeout");
        } else {
            msg!("Escrow canceled by initializer: {}", escrow.initializer);
        }
        
        // The escrow account will be closed and rent returned to the initializer
        
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(initializer_nft_count: u8, taker_nft_count: u8, escrow_bump: u8)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub taker: UncheckedAccount<'info>,
    #[account(
        init,
        payer = initializer,
        space = 8 + EscrowAccount::space(),
        seeds = [
            b"escrow".as_ref(),
            initializer.key().as_ref(),
            taker.key().as_ref(),
        ],
        bump,
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(is_initializer: bool, nft_index: u8)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(
        mut,
        constraint = escrow_account.is_initialized @ EscrowError::EscrowNotInitialized,
        constraint = (is_initializer && depositor.key() == escrow_account.initializer) ||
                   (!is_initializer && depositor.key() == escrow_account.taker) @ EscrowError::InvalidDepositor
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = token_account.owner == depositor.key() @ EscrowError::InvalidTokenAccount,
        constraint = token_account.mint == mint.key() @ EscrowError::InvalidNftMint
    )]
    pub token_account: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = mint,
        associated_token::authority = escrow_account
    )]
    pub vault_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(is_initializer: bool, nft_index: u8)]
pub struct Complete<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        constraint = escrow_account.is_initialized @ EscrowError::EscrowNotInitialized,
        constraint = (caller.key() == escrow_account.initializer || 
                   caller.key() == escrow_account.taker) @ EscrowError::InvalidCaller,
        constraint = escrow_account.initializer_deposited && escrow_account.taker_deposited @ EscrowError::DepositsIncomplete
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    /// CHECK: This is the initializer who will receive the rent refund when the escrow is closed
    #[account(mut, address = escrow_account.initializer)]
    pub initializer: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = vault_account.mint == mint.key() @ EscrowError::InvalidNftMint
    )]
    pub vault_account: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = mint,
        associated_token::authority = caller
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Complete<'info> {
    pub fn close_escrow(&self) -> Result<()> {
        // Transfer lamports from escrow account to initializer (rent return)
        let escrow_starting_lamports = self.escrow_account.to_account_info().lamports();
        **self.escrow_account.to_account_info().lamports.borrow_mut() = 0;
        **self.initializer.to_account_info().lamports.borrow_mut() += escrow_starting_lamports;
        
        // Mark the account discriminator as closed
        let escrow_account_info = self.escrow_account.to_account_info();
        let mut escrow_data = escrow_account_info.data.borrow_mut();
        escrow_data.fill(0);
        
        msg!("Escrow account closed. Rent returned to initializer: {} lamports", escrow_starting_lamports);
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(
        mut,
        constraint = escrow_account.is_initialized @ EscrowError::EscrowNotInitialized,
        constraint = initializer.key() == escrow_account.initializer @ EscrowError::InvalidCanceller,
        constraint = !escrow_account.initializer_deposited && !escrow_account.taker_deposited @ EscrowError::CannotCancelAfterDeposit,
        close = initializer
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub initializer: Signer<'info>,
}

#[account]
pub struct EscrowAccount {
    pub initializer: Pubkey,
    pub taker: Pubkey,
    pub initializer_nft_count: u8,
    pub taker_nft_count: u8,
    pub initializer_nft_mints: [Pubkey; 3],
    pub taker_nft_mints: [Pubkey; 3],
    pub initializer_nft_deposited: [bool; 3],
    pub taker_nft_deposited: [bool; 3],
    pub initializer_nft_collected: [bool; 3],
    pub taker_nft_collected: [bool; 3],
    pub initializer_deposited: bool,
    pub taker_deposited: bool,
    pub initializer_collected: bool,
    pub taker_collected: bool,
    pub is_initialized: bool,
    pub bump: u8,
    pub created_at: i64,
    pub timeout_in_seconds: i64,
}

impl EscrowAccount {
    pub fn space() -> usize {
        8 +  // discriminator
        32 + // initializer
        32 + // taker
        1 +  // initializer_nft_count
        1 +  // taker_nft_count
        (32 * 3) + // initializer_nft_mints
        (32 * 3) + // taker_nft_mints
        (1 * 3) + // initializer_nft_deposited
        (1 * 3) + // taker_nft_deposited
        (1 * 3) + // initializer_nft_collected
        (1 * 3) + // taker_nft_collected
        1 +  // initializer_deposited
        1 +  // taker_deposited
        1 +  // initializer_collected
        1 +  // taker_collected
        1 +  // is_initialized
        1 +  // bump
        8 +  // created_at
        8    // timeout_in_seconds
    }
}

#[error_code]
pub enum EscrowError {
    #[msg("NFT count must be between 1 and 3.")]
    InvalidNftCount,
    #[msg("Escrow not initialized.")]
    EscrowNotInitialized,
    #[msg("Invalid depositor.")]
    InvalidDepositor,
    #[msg("Invalid token account.")]
    InvalidTokenAccount,
    #[msg("Invalid NFT mint.")]
    InvalidNftMint,
    #[msg("Invalid token amount. Expected 1 for NFT.")]
    InvalidTokenAmount,
    #[msg("All NFTs have already been deposited.")]
    AlreadyDeposited,
    #[msg("Escrow can only be completed when all NFTs have been deposited.")]
    NotAllDeposited,
    #[msg("Only the initializer can cancel the escrow.")]
    OnlyInitializerCanCancel,
    #[msg("Cannot cancel after deposits have been made.")]
    CannotCancelAfterDeposit,
    #[msg("Escrow has timed out.")]
    EscrowTimedOut,
    #[msg("Invalid NFT index.")]
    InvalidNftIndex,
    #[msg("This NFT has already been deposited.")]
    NftAlreadyDeposited,
    #[msg("This NFT has already been collected.")]
    NftAlreadyCollected,
    #[msg("Both parties must deposit their NFTs before completion.")]
    DepositsIncomplete,
    #[msg("Only the initializer or taker can complete the escrow.")]
    InvalidCaller,
    #[msg("Invalid recipient for the NFT.")]
    InvalidRecipient,
    #[msg("Escrow can only be canceled by the initializer.")]
    InvalidCanceller,
}
