export const network_id: "test"|"main" = "main"; // main or test
export const explorer_uri = (network_id == "main") ? "https://api.ergoplatform.com" : "https://api-testnet.ergoplatform.com";
export const web_explorer_uri_tx = "https://sigmaspace.io/en/transaction/";
export const web_explorer_uri_addr = "https://sigmaspace.io/en/address/";
