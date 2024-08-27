import React, { useState, useEffect } from 'react';
import { 
  AppBar, Toolbar, Typography, Container, Paper, Grid, Button, 
  CircularProgress, Snackbar, IconButton, Box, TextField, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle,
  Link
} from '@mui/material';
import { styled } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import {
  Keypair,
  SorobanRpc,
  TransactionBuilder,
  Asset,
  Operation,
  LiquidityPoolAsset,
  getLiquidityPoolId,
  BASE_FEE,
  Networks
} from '@stellar/stellar-sdk';

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  textAlign: 'center',
  color: theme.palette.text.secondary,
  background: '#F5EDE4',
}));

const StyledButton = styled(Button)(({ theme }) => ({
  margin: theme.spacing(1),
}));

export default function StellarLiquidityPoolUI() {
  const [loading, setLoading] = useState(false);
  const [defiKeypair, setDefiKeypair] = useState(null);
  const [traderKeypair, setTraderKeypair] = useState(null);
  const [ekoLanceAsset, setEkoLanceAsset] = useState(null);
  const [lpAsset, setLpAsset] = useState(null);
  const [liquidityPoolId, setLiquidityPoolId] = useState(null);
  const [server, setServer] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', isError: false, transactionUrl: null });

  const [createPoolDialog, setCreatePoolDialog] = useState(false);
  const [tradeDialog, setTradeDialog] = useState(false);
  const [withdrawDialog, setWithdrawDialog] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [tradeQuantity, setTradeQuantity] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  useEffect(() => {
    const setupAccounts = async () => {
      setLoading(true);
      try {
        const defi = Keypair.random();
        const trader = Keypair.random();
        setDefiKeypair(defi);
        setTraderKeypair(trader);

        await fundAccountWithFriendbot(defi.publicKey());
        await fundAccountWithFriendbot(trader.publicKey());

        const srv = new SorobanRpc.Server('https://soroban-testnet.stellar.org');
        setServer(srv);

        setSnackbar({ 
          open: true, 
          message: 'Accounts set up successfully! DeFi and Trader accounts are now funded and ready for use.', 
          isError: false 
        });
      } catch (error) {
        setSnackbar({ 
          open: true, 
          message: `Failed to set up accounts: ${error.message}`, 
          isError: true 
        });
      } finally {
        setLoading(false);
      }
    };

    setupAccounts();
  }, []);

  const fundAccountWithFriendbot = async (address) => {
    const friendbotUrl = `https://friendbot.stellar.org?addr=${address}`;
    try {
      let response = await fetch(friendbotUrl);
      if (response.ok) {
        console.log(`Account ${address} successfully funded.`);
        return true;
      } else {
        throw new Error(`Failed to fund account: ${address}`);
      }
    } catch (error) {
      console.error(`Error funding account ${address}:`, error);
      throw error;
    }
  };

  const handleCreatePool = async () => {
    setLoading(true);
    try {
      const ekoLance = new Asset(assetName, defiKeypair.publicKey());
      setEkoLanceAsset(ekoLance);

      const lp = new LiquidityPoolAsset(Asset.native(), ekoLance, 30);
      setLpAsset(lp);

      const lpId = getLiquidityPoolId('constant_product', lp).toString('hex');
      setLiquidityPoolId(lpId);

      const defiAccount = await server.getAccount(defiKeypair.publicKey());
      const lpDepositTransaction = new TransactionBuilder(
        defiAccount, {
          fee: BASE_FEE,
          networkPassphrase: Networks.TESTNET
        })
        .addOperation(Operation.changeTrust({
          asset: lpAsset
        }))
        .addOperation(Operation.liquidityPoolDeposit({
          liquidityPoolId: lpId,
          maxAmountA: '100',
          maxAmountB: '100',
          minPrice: {
            n: 1,
            d: 1
          },
          maxPrice: {
            n: 1,
            d: 1
          }
        }))
        .setTimeout(30)
        .build();
      
      lpDepositTransaction.sign(defiKeypair);
      const result = await server.sendTransaction(lpDepositTransaction);
      const transactionUrl = `https://stellar.expert/explorer/testnet/tx/${result.hash}`;
      setSnackbar({ 
        open: true, 
        message: `Liquidity pool created successfully with asset ${assetName}! Initial deposit: 100 XLM and 100 ${assetName}.`, 
        isError: false,
        transactionUrl
      });
    } catch (error) {
      setSnackbar({ 
        open: true, 
        message: `Failed to create liquidity pool: ${error.message}`, 
        isError: true 
      });
    } finally {
      setLoading(false);
      setCreatePoolDialog(false);
    }
  };

  const handleTradeAssets = async () => {
    setLoading(true);
    try {
      const traderAccount = await server.getAccount(traderKeypair.publicKey());
      const pathPaymentTransaction = new TransactionBuilder(
        traderAccount, {
          fee: BASE_FEE,
          networkPassphrase: Networks.TESTNET
        })
        .addOperation(Operation.changeTrust({
          asset: ekoLanceAsset,
          source: traderKeypair.publicKey()
        }))
        .addOperation(Operation.pathPaymentStrictReceive({
          sendAsset: Asset.native(),
          sendMax: '1000',
          destination: traderKeypair.publicKey(),
          destAsset: ekoLanceAsset,
          destAmount: tradeQuantity,
          source: traderKeypair.publicKey()
        }))
        .setTimeout(30)
        .build();
      
      pathPaymentTransaction.sign(traderKeypair);
      const result = await server.sendTransaction(pathPaymentTransaction);
      const transactionUrl = `https://stellar.expert/explorer/testnet/tx/${result.hash}`;
      setSnackbar({ 
        open: true, 
        message: `Successfully traded ${tradeQuantity} ${ekoLanceAsset.code} for XLM!`, 
        isError: false,
        transactionUrl
      });
    } catch (error) {
      setSnackbar({ 
        open: true, 
        message: `Failed to trade assets: ${error.message}`, 
        isError: true 
      });
    } finally {
      setLoading(false);
      setTradeDialog(false);
    }
  };

  const handleWithdrawFunds = async () => {
    setLoading(true);
    try {
      const defiAccount = await server.getAccount(defiKeypair.publicKey());
      const lpWithdrawTransaction = new TransactionBuilder(
        defiAccount, {
          fee: BASE_FEE,
          networkPassphrase: Networks.TESTNET
        })
        .addOperation(Operation.liquidityPoolWithdraw({
          liquidityPoolId: liquidityPoolId,
          amount: withdrawAmount,
          minAmountA: '0',
          minAmountB: '0'
        }))
        .setTimeout(30)
        .build();
      
      lpWithdrawTransaction.sign(defiKeypair);
      const result = await server.sendTransaction(lpWithdrawTransaction);
      const transactionUrl = `https://stellar.expert/explorer/testnet/tx/${result.hash}`;
      setSnackbar({ 
        open: true, 
        message: `Successfully withdrew ${withdrawAmount} shares from the liquidity pool!`, 
        isError: false,
        transactionUrl
      });
    } catch (error) {
      setSnackbar({ 
        open: true, 
        message: `Failed to withdraw funds: ${error.message}`, 
        isError: true 
      });
    } finally {
      setLoading(false);
      setWithdrawDialog(false);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Box sx={{ flexGrow: 1, bgcolor: '#E6DBCD', minHeight: '100vh' }}>
      <AppBar position="static" sx={{ bgcolor: '#8B4513' }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Stellar Liquidity Pool
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <StyledPaper elevation={3}>
          <Typography variant="h4" gutterBottom component="div" sx={{ color: '#4A3728' }}>
            Manage Your Liquidity Pool
          </Typography>
          <Grid container spacing={3} justifyContent="center">
            <Grid item xs={12} sm={4}>
              <StyledButton
                variant="contained"
                color="primary"
                startIcon={<AccountBalanceWalletIcon />}
                onClick={() => setCreatePoolDialog(true)}
                disabled={loading || !defiKeypair}
                fullWidth
              >
                Create Pool
              </StyledButton>
            </Grid>
            <Grid item xs={12} sm={4}>
              <StyledButton
                variant="contained"
                color="secondary"
                startIcon={<SwapHorizIcon />}
                onClick={() => setTradeDialog(true)}
                disabled={loading || !traderKeypair || !ekoLanceAsset}
                fullWidth
              >
                Trade Assets
              </StyledButton>
            </Grid>
            <Grid item xs={12} sm={4}>
              <StyledButton
                variant="contained"
                color="warning"
                startIcon={<AccountBalanceIcon />}
                onClick={() => setWithdrawDialog(true)}
                disabled={loading || !defiKeypair || !liquidityPoolId}
                fullWidth
              >
                Withdraw Funds
              </StyledButton>
            </Grid>
          </Grid>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <CircularProgress />
              <Typography variant="body1" sx={{ ml: 2 }}>
                Launching DeFi Application...
              </Typography>
            </Box>
          )}
        </StyledPaper>
      </Container>

      {/* Create Pool Dialog */}
      <Dialog open={createPoolDialog} onClose={() => setCreatePoolDialog(false)}>
        <DialogTitle>Create Liquidity Pool</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter the name of the asset you want to create for the liquidity pool.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="assetName"
            label="Asset Name"
            type="text"
            fullWidth
            variant="standard"
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreatePoolDialog(false)}>Cancel</Button>
          <Button onClick={handleCreatePool} disabled={!assetName}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Trade Assets Dialog */}
      <Dialog open={tradeDialog} onClose={() => setTradeDialog(false)}>
        <DialogTitle>Trade Assets</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter the quantity of assets you want to trade.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="tradeQuantity"
            label="Trade Quantity"
            type="number"
            fullWidth
            variant="standard"
            value={tradeQuantity}
            onChange={(e) => setTradeQuantity(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTradeDialog(false)}>Cancel</Button>
          <Button onClick={handleTradeAssets} disabled={!tradeQuantity}>Trade</Button>
        </DialogActions>
      </Dialog>

      {/* Withdraw Funds Dialog */}
      <Dialog open={withdrawDialog} onClose={() => setWithdrawDialog(false)}>
        <DialogTitle>Withdraw Funds</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter the amount of shares you want to withdraw from the liquidity pool.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="withdrawAmount"
            label="Withdraw Amount"
            type="number"
            fullWidth
            variant="standard"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWithdrawDialog(false)}>Cancel</Button>
          <Button onClick={handleWithdrawFunds} disabled={!withdrawAmount}>Withdraw</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        message={
          <React.Fragment>
            {snackbar.message}
            {snackbar.transactionUrl && (
              <Link
                href={snackbar.transactionUrl}
                target="_blank"
                rel="noopener"
                color="inherit"
                sx={{ display: 'block', mt: 1 }}
              >
                View Transaction
              </Link>
            )}
          </React.Fragment>
        }
        action={
          <React.Fragment>
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={handleCloseSnackbar}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </React.Fragment>
        }
        ContentProps={{
          sx: {
            backgroundColor: snackbar.isError ? '#f44336' : '#4caf50',
          },
        }}
      />
    </Box>
  );
}