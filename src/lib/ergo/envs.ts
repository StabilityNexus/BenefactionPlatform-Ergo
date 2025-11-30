export const network_id: 'mainnet' | 'testnet' = 'mainnet';
export const DEFAULT_WEB_EXPLORER_URI_TX =
  network_id == 'mainnet'
    ? 'https://sigmaspace.io/en/transaction/'
    : 'https://testnet.ergoplatform.com/transactions/';
export const DEFAULT_WEB_EXPLORER_URI_ADDR =
  network_id == 'mainnet'
    ? 'https://sigmaspace.io/en/address/'
    : 'https://testnet.ergoplatform.com/addresses/';
export const DEFAULT_WEB_EXPLORER_URI_TKN =
  network_id == 'mainnet'
    ? 'https://sigmaspace.io/en/token/'
    : 'https://testnet.ergoplatform.com/tokens/';
