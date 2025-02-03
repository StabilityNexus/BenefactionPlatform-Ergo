export const network_id: "mainnet"|"testnet" = "mainnet";
export const explorer_uri =          (network_id == "mainnet") ? "https://api.ergoplatform.com"          : "https://api-testnet.ergoplatform.com";
export const web_explorer_uri_tx =   (network_id == "mainnet") ? "https://sigmaspace.io/en/transaction/" : "https://testnet.ergoplatform.com/transactions/";
export const web_explorer_uri_addr = (network_id == "mainnet") ? "https://sigmaspace.io/en/address/"     : "https://testnet.ergoplatform.com/addresses/";
export const web_explorer_uri_tkn = (network_id == "mainnet") ? "https://sigmaspace.io/en/token/"     : "https://testnet.ergoplatform.com/tokens/";
